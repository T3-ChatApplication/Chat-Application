// TC-028 live check: two real server processes + real Redis.
//   node scripts/cluster-check.mjs [urlA] [urlB]      (defaults: http://localhost:5000 and :5001)
// Start both instances first (see docs/testing/TC-028-cluster-mode.md). Needs no extra npm package.
// Prints one PASS/FAIL line per check and a final CLUSTER_CHECK_RESULT line to screenshot.
import { WebSocket } from 'ws';

const [A = 'http://localhost:5000', B = 'http://localhost:5001'] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = Date.now().toString(36);

async function register(base, name) {
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: `${name}${tag}`.slice(0, 20), email: `${name}${tag}@example.com`, password: 'Passw0rd!' }),
  });
  if (res.status !== 201) throw new Error(`register ${name} on ${base} -> ${res.status}`);
  return res.json(); // { token, user: { id } }
}

// Minimal Socket.IO client, websocket only (so no sticky session is needed for this check)
function connect(base, token) {
  const c = { events: [], waiters: [], acks: new Map(), n: 1 };
  c.ready = new Promise((resolve, reject) => {
    c.ws = new WebSocket(`${base.replace('http', 'ws')}/socket.io/?EIO=4&transport=websocket`);
    c.ws.on('error', reject);
    c.ws.on('message', (raw) => {
      const d = String(raw);
      if (d === '2') return c.ws.send('3');
      if (d[0] === '0') return c.ws.send('40' + JSON.stringify({ token }));
      if (d.startsWith('40')) return resolve();
      if (d.startsWith('44')) return reject(new Error('refused ' + d));
      if (d.startsWith('42')) {
        const [name, payload] = JSON.parse(d.slice(2));
        const e = { name, payload };
        c.events.push(e);
        c.waiters = c.waiters.filter((w) => !w(e));
      } else if (d.startsWith('43')) {
        const i = d.indexOf('[');
        c.acks.get(Number(d.slice(2, i)))?.(JSON.parse(d.slice(i))[0]);
      }
    });
  });
  c.send = (name, payload) =>
    new Promise((resolve) => {
      const id = c.n++;
      c.acks.set(id, resolve);
      c.ws.send('42' + id + JSON.stringify([name, payload]));
    });
  c.emit = (name, payload) => c.ws.send('42' + JSON.stringify([name, payload]));
  c.waitFor = (name, match = () => true, ms = 3000) => {
    const hit = c.events.find((e) => e.name === name && match(e.payload));
    if (hit) return Promise.resolve(hit.payload);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout: ' + name)), ms);
      c.waiters.push((e) => {
        if (e.name !== name || !match(e.payload)) return false;
        clearTimeout(t);
        resolve(e.payload);
        return true;
      });
    });
  };
  c.has = (name, match = () => true) => c.events.some((e) => e.name === name && match(e.payload));
  return c;
}

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log('PASS', name);
  } catch (err) {
    results.push({ name, ok: false, error: err.message });
    console.log('FAIL', name, '-', err.message);
  }
}
const must = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const alice = await register(A, 'ca');
const bob = await register(B, 'cb');
const aliceId = alice.user.id;
const bobId = bob.user.id;

const a = connect(A, alice.token); // Alice only on instance A
const b = connect(B, bob.token); // Bob only on instance B
await Promise.all([a.ready, b.ready]);
await sleep(300);

await check('presence: Bob (on B) sees Alice (on A) online', () =>
  b.waitFor('presence:list', (p) => p.online.includes(aliceId))
);
await check('presence: Alice (on A) is told Bob (on B) came online', () =>
  a.waitFor('presence:update', (p) => p.userId === bobId && p.online === true)
);
await check('message A -> B is delivered and marked "delivered"', async () => {
  const ack = await a.send('message:send', { to: bobId, text: 'cluster check ' + tag });
  must(ack.ok, 'ack not ok: ' + JSON.stringify(ack));
  must(ack.message.status === 'delivered', 'status was ' + ack.message.status);
  await b.waitFor('message:new', (m) => m.text === 'cluster check ' + tag);
});
await check('typing A -> B crosses instances', async () => {
  a.emit('typing', { to: bobId, isTyping: true });
  await b.waitFor('typing', (t) => t.from === aliceId && t.isTyping === true);
});
await check('second tab on B keeps Alice online after the tab on A closes', async () => {
  const a2 = connect(B, alice.token);
  await a2.ready;
  a.ws.close();
  await sleep(2500); // longer than the offline grace period
  must(!b.has('presence:update', (p) => p.userId === aliceId && p.online === false), 'Alice was shown offline');
  a2.ws.close();
  await b.waitFor('presence:update', (p) => p.userId === aliceId && p.online === false, 5000);
});
const health = await Promise.all([A, B].map((u) => fetch(`${u}/api/health`).then((r) => r.json())));
await check('both instances report the same cluster-wide online count', async () => {
  must(health[0].onlineUsers === health[1].onlineUsers, `A=${health[0].onlineUsers} B=${health[1].onlineUsers}`);
});
b.ws.close();

const failed = results.filter((r) => !r.ok).length;
console.log('CLUSTER_CHECK_RESULT ' + JSON.stringify({ instances: [A, B], passed: results.length - failed, failed }));
process.exit(failed ? 1 : 0);
