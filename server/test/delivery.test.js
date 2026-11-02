import { test, before, after, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import Message from '../src/models/Message.js';
import { deliverOfflineMessages } from '../src/socket/delivery.js';
import { signToken } from '../src/utils/token.js';

process.env.JWT_SECRET = 'offline-test-secret';
const userA = '507f1f77bcf86cd799439011';
const userB = '507f1f77bcf86cd799439022';
let server, base;

before(async () => {
  server = http.createServer(createApp());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}/api/messages`;
});

afterEach(() => mock.restoreAll());
after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function fakeSocket(userId) {
  const emitted = [];
  return {
    userId,
    emit(event, payload) {
      emitted.push({ event, payload });
    },
    emitted,
  };
}

function fakeIO() {
  const rooms = new Map();
  return {
    to(target) {
      return {
        emit(event, payload) {
          if (!rooms.has(target)) rooms.set(target, []);
          rooms.get(target).push({ event, payload });
        },
      };
    },
    rooms,
  };
}

test('deliverOfflineMessages delivers queued messages to recipient and updates status', async () => {
  const queuedDocs = [
    {
      _id: 'msg1',
      conversationId: `${userA}_${userB}`,
      sender: userA,
      receiver: userB,
      text: 'Offline test 001',
      createdAt: new Date(),
      toPublic() {
        return {
          id: 'msg1',
          conversationId: `${userA}_${userB}`,
          sender: userA,
          receiver: userB,
          text: 'Offline test 001',
          delivered: false,
          status: 'sent',
          createdAt: this.createdAt,
        };
      },
    },
  ];

  mock.method(Message, 'find', () => ({
    sort: () => Promise.resolve(queuedDocs),
  }));

  let updatedQuery = null;
  let updatePayload = null;
  mock.method(Message, 'updateMany', async (query, update) => {
    updatedQuery = query;
    updatePayload = update;
    return { modifiedCount: 1 };
  });

  const socket = fakeSocket(userB);
  const io = fakeIO();

  const delivered = await deliverOfflineMessages(io, socket);

  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].text, 'Offline test 001');
  assert.equal(delivered[0].delivered, true);
  assert.equal(delivered[0].status, 'delivered');

  // Verify database update
  assert.deepEqual(updatedQuery, { _id: { $in: ['msg1'] } });
  assert.equal(updatePayload.$set.delivered, true);
  assert.equal(updatePayload.$set.status, 'delivered');

  // Verify recipient socket events
  const offlineEvent = socket.emitted.find((e) => e.event === 'message:offline');
  assert.ok(offlineEvent, 'message:offline event should be emitted');
  assert.equal(offlineEvent.payload.messages.length, 1);
  assert.equal(offlineEvent.payload.messages[0].text, 'Offline test 001');

  const newEvent = socket.emitted.find((e) => e.event === 'message:new');
  assert.ok(newEvent, 'message:new event should also be emitted for standard listeners');
  assert.equal(newEvent.payload.text, 'Offline test 001');

  // Verify sender notification
  const senderMessages = io.rooms.get(`user:${userA}`);
  assert.ok(senderMessages, 'Sender should be notified of delivery');
  assert.equal(senderMessages[0].event, 'message:delivered');
  assert.deepEqual(senderMessages[0].payload.messageIds, ['msg1']);
});

test('deliverOfflineMessages returns empty array when no queued messages exist', async () => {
  mock.method(Message, 'find', () => ({
    sort: () => Promise.resolve([]),
  }));
  const updateSpy = mock.method(Message, 'updateMany', async () => ({ modifiedCount: 0 }));

  const socket = fakeSocket(userB);
  const io = fakeIO();

  const delivered = await deliverOfflineMessages(io, socket);

  assert.deepEqual(delivered, []);
  assert.equal(updateSpy.mock.callCount(), 0);
  assert.equal(socket.emitted.length, 0);
});

test('GET /api/messages/offline returns queued messages for authenticated user', async () => {
  mock.method(Message, 'find', (query) => {
    assert.equal(query.receiver, userB);
    assert.equal(query.delivered, false);
    return {
      sort: () =>
        Promise.resolve([
          {
            _id: 'msg1',
            toPublic: () => ({ id: 'msg1', text: 'queued msg', delivered: false, status: 'sent' }),
          },
        ]),
    };
  });

  const res = await fetch(`${base}/offline`, {
    headers: { Authorization: `Bearer ${signToken(userB)}` },
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data, {
    messages: [{ id: 'msg1', text: 'queued msg', delivered: false, status: 'sent' }],
  });
});

test('POST /api/messages/offline/ack marks queued messages as delivered', async () => {
  mock.method(Message, 'updateMany', async (query, update) => {
    assert.equal(query.receiver, userB);
    assert.equal(query.delivered, false);
    assert.equal(update.$set.delivered, true);
    assert.equal(update.$set.status, 'delivered');
    return { modifiedCount: 2 };
  });

  const res = await fetch(`${base}/offline/ack`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${signToken(userB)}` },
  });

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.deepEqual(data, { ok: true, deliveredCount: 2 });
});

test('GET /api/messages/offline rejects unauthenticated requests', async () => {
  const res = await fetch(`${base}/offline`);
  assert.equal(res.status, 401);
});

test('Message model: default delivery state is undelivered (sent)', () => {
  const msg = new Message({
    conversationId: `${userA}_${userB}`,
    sender: userA,
    receiver: userB,
    text: 'Offline test 001',
  });

  assert.equal(msg.delivered, false);
  assert.equal(msg.status, 'sent');
  assert.equal(msg.deliveredAt, null);

  const pub = msg.toPublic();
  assert.equal(pub.delivered, false);
  assert.equal(pub.status, 'sent');
  assert.equal(pub.text, 'Offline test 001');
});

test('Message model: toPublic reflects delivered status when updated', () => {
  const now = new Date();
  const msg = new Message({
    conversationId: `${userA}_${userB}`,
    sender: userA,
    receiver: userB,
    text: 'Offline test 001',
    delivered: true,
    status: 'delivered',
    deliveredAt: now,
  });

  assert.equal(msg.delivered, true);
  assert.equal(msg.status, 'delivered');

  const pub = msg.toPublic();
  assert.equal(pub.delivered, true);
  assert.equal(pub.status, 'delivered');
  assert.deepEqual(pub.deliveredAt, now);
});
