// TC-028 (NFR-14): two real server instances in one test process, joined by a message bus.
//
// The bus adapter below is built on the same ClusterAdapter base class that the Redis and MongoDB
// adapters use, so events really have to cross from one Socket.IO server to the other. Only the
// MongoDB models are replaced by stubs. Clients are plain WebSockets speaking the Socket.IO
// protocol, so socket.io-client is not needed. Redis itself is not involved: this proves the
// application logic (delivery, presence, typing, rooms) is correct when state is spread over
// instances. The Redis wiring is covered by the manual two-instance run in docs.
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { ClusterAdapterWithHeartbeat } from 'socket.io-adapter';
import { WebSocket } from 'ws'; // already installed by socket.io; Node 20 (CI) has no built-in WebSocket

process.env.JWT_SECRET = 'test-secret';
process.env.REDIS_URL = 'redis://not-used-in-this-test'; // switches the app into cluster mode
process.env.PRESENCE_GRACE_MS = '60';

const { initSocket } = await import('../src/socket/index.js');
const { onlineCount } = await import('../src/socket/presence.js');
const { signToken } = await import('../src/utils/token.js');
const { default: User } = await import('../src/models/User.js');
const { default: Room } = await import('../src/models/Room.js');
const { default: Message } = await import('../src/models/Message.js');

const ALICE = 'a'.repeat(24);
const BOB = 'b'.repeat(24);
const ROOM = 'c'.repeat(24);

// ---- a fake "Redis": every adapter publishes here and every other adapter receives it
const bus = new EventEmitter();
bus.setMaxListeners(50);
const copy = (x) => JSON.parse(JSON.stringify(x));

class BusAdapter extends ClusterAdapterWithHeartbeat {
  constructor(nsp) {
    super(nsp, {});
    this.onBusMessage = (message, from) => {
      if (from !== this && message.nsp === nsp.name) this.onMessage(message);
    };
    this.onBusResponse = (requesterUid, response, from) => {
      if (from !== this && requesterUid === this.uid) this.onResponse(response);
    };
    bus.on('message', this.onBusMessage);
    bus.on('response', this.onBusResponse);
    this.init();
  }
  async doPublish(message) {
    const m = copy(message);
    setImmediate(() => bus.emit('message', m, this));
    return '';
  }
  async doPublishResponse(requesterUid, response) {
    const r = copy(response);
    setImmediate(() => bus.emit('response', requesterUid, r, this));
  }
  close() {
    bus.off('message', this.onBusMessage);
    bus.off('response', this.onBusResponse);
    super.close();
  }
}

// ---- minimal Socket.IO client (Engine.IO v4 over the built-in WebSocket)
class Client {
  constructor(port, token) {
    this.events = [];
    this.waiters = [];
    this.acks = new Map();
    this.nextAck = 1;
    this.ready = new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`);
      this.ws.on('message', (raw) => {
        const data = String(raw);
        if (data === '2') return this.ws.send('3'); // ping -> pong
        if (data.startsWith('0')) return this.ws.send('40' + JSON.stringify({ token }));
        if (data.startsWith('40')) return resolve();
        if (data.startsWith('44')) return reject(new Error('connect refused: ' + data));
        if (data.startsWith('42')) {
          const [name, payload] = JSON.parse(data.slice(2));
          this.events.push({ name, payload });
          this.waiters = this.waiters.filter((w) => !w(this.events[this.events.length - 1]));
        } else if (data.startsWith('43')) {
          const i = data.indexOf('[');
          this.acks.get(Number(data.slice(2, i)))?.(JSON.parse(data.slice(i))[0]);
        }
      });
      this.ws.on('error', () => reject(new Error('websocket error')));
    });
  }
  emit(name, payload) {
    this.ws.send('42' + JSON.stringify([name, payload]));
  }
  emitWithAck(name, payload) {
    const id = this.nextAck++;
    return new Promise((resolve) => {
      this.acks.set(id, resolve);
      this.ws.send('42' + id + JSON.stringify([name, payload]));
    });
  }
  // Resolves with the first matching event (already received, or arriving within 2 s)
  waitFor(name, match = () => true) {
    const found = this.events.find((e) => e.name === name && match(e.payload));
    if (found) return Promise.resolve(found.payload);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${name}`)), 2000);
      this.waiters.push((e) => {
        if (e.name !== name || !match(e.payload)) return false;
        clearTimeout(timer);
        resolve(e.payload);
        return true;
      });
    });
  }
  has(name, match = () => true) {
    return this.events.some((e) => e.name === name && match(e.payload));
  }
  close() {
    this.ws.close();
  }
}

// ---- two instances
const servers = [];
const clients = [];
const open = async (instance, userId) => {
  const c = new Client(servers[instance].port, signToken(userId));
  clients.push(c);
  await c.ready;
  return c;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let seq = 0;
let roomMembers;

before(async () => {
  roomMembers = [ALICE, BOB];
  mock.method(User, 'exists', async () => ({ _id: 1 }));
  mock.method(Room, 'exists', async (q) => (roomMembers.includes(String(q.members)) ? { _id: 1 } : null));
  mock.method(Room, 'find', (q) => ({
    select: () => ({ lean: async () => (roomMembers.includes(String(q.members)) ? [{ _id: ROOM }] : []) }),
  }));
  mock.method(Message, 'create', async (doc) => {
    const saved = { ...doc, _id: String(++seq).padStart(24, '0'), createdAt: new Date().toISOString() };
    saved.status = doc.status || 'sent';
    return {
      toPublic: () => ({
        id: saved._id,
        conversationId: saved.conversationId,
        sender: String(saved.sender),
        text: saved.text,
        status: saved.status,
        createdAt: saved.createdAt,
        ...(saved.receiver ? { receiver: String(saved.receiver) } : {}),
        ...(saved.room ? { room: String(saved.room) } : {}),
      }),
    };
  });
  mock.method(Message, 'find', () => ({ sort: () => ({ limit: async () => [] }) }));

  for (let i = 0; i < 2; i += 1) {
    const httpServer = http.createServer();
    const io = initSocket(httpServer);
    io.adapter(BusAdapter);
    await new Promise((r) => httpServer.listen(0, '127.0.0.1', r));
    servers.push({ io, httpServer, port: httpServer.address().port });
  }
  await sleep(100); // let the two instances see each other (heartbeat)
});

after(async () => {
  clients.forEach((c) => c.close());
  await sleep(50);
  for (const s of servers) {
    s.io.close();
    s.httpServer.closeAllConnections?.();
  }
  mock.restoreAll();
});

test('private message from instance A reaches a receiver on instance B, marked delivered', async () => {
  const alice = await open(0, ALICE);
  const bob = await open(1, BOB);
  const ack = await alice.emitWithAck('message:send', { to: BOB, text: 'hello across nodes' });
  assert.equal(ack.ok, true);
  // Bob is connected only to instance B, yet instance A saw him as online
  assert.equal(ack.message.status, 'delivered');
  const got = await bob.waitFor('message:new', (m) => m.text === 'hello across nodes');
  assert.equal(got.sender, ALICE);
  await alice.waitFor('message:new', (m) => m.text === 'hello across nodes'); // sender's own tab too
  alice.close();
  bob.close();
  await sleep(150);
});

test('a receiver who is on no instance is marked sent', async () => {
  const alice = await open(0, ALICE);
  const ack = await alice.emitWithAck('message:send', { to: BOB, text: 'nobody home' });
  assert.equal(ack.ok, true);
  assert.equal(ack.message.status, 'sent');
  alice.close();
  await sleep(150);
});

test('presence is shared: the list and the updates cover users on the other instance', async () => {
  const alice = await open(0, ALICE);
  const bob = await open(1, BOB);
  const list = await bob.waitFor('presence:list');
  assert.ok(list.online.includes(ALICE), 'Bob (instance B) sees Alice (instance A) in the list');
  await alice.waitFor('presence:update', (p) => p.userId === BOB && p.online === true);
  assert.equal(await onlineCount(servers[0].io), 2);
  assert.equal(await onlineCount(servers[1].io), 2);
  bob.close();
  await alice.waitFor('presence:update', (p) => p.userId === BOB && p.online === false);
  assert.equal(await onlineCount(servers[0].io), 1);
  alice.close();
  await sleep(150);
});

test('a user with one tab on each instance stays online until the last tab closes', async () => {
  const watcher = await open(0, BOB);
  const tabA = await open(0, ALICE);
  const tabB = await open(1, ALICE);
  await watcher.waitFor('presence:update', (p) => p.userId === ALICE && p.online === true);

  tabA.close();
  await sleep(300); // longer than the grace period
  assert.equal(
    watcher.has('presence:update', (p) => p.userId === ALICE && p.online === false),
    false,
    'still online through the tab on instance B'
  );

  tabB.close();
  await watcher.waitFor('presence:update', (p) => p.userId === ALICE && p.online === false);
  watcher.close();
  await sleep(150);
});

test('typing from instance A is shown to a user on instance B', async () => {
  const alice = await open(0, ALICE);
  const bob = await open(1, BOB);
  alice.emit('typing', { to: BOB, isTyping: true });
  const t = await bob.waitFor('typing');
  assert.deepEqual(t, { from: ALICE, isTyping: true });
  alice.close();
  bob.close();
  await sleep(150);
});

test('a room message from instance A reaches a member on instance B, not a non-member', async () => {
  const alice = await open(0, ALICE);
  const bob = await open(1, BOB);
  const outsider = await open(1, 'd'.repeat(24)); // not a room member, so joins no room
  const ack = await alice.emitWithAck('message:send', { room: ROOM, text: 'hello room' });
  assert.equal(ack.ok, true);
  await bob.waitFor('message:new', (m) => m.text === 'hello room' && m.room === ROOM);
  await sleep(200);
  assert.equal(outsider.has('message:new'), false, 'a non-member on instance B gets nothing');
  const refused = await outsider.emitWithAck('message:send', { room: ROOM, text: 'let me in' });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /not a member/);
  alice.close();
  bob.close();
  outsider.close();
  await sleep(150);
});
