import { test, before, after, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import User from '../src/models/User.js';
import { signToken, verifyToken } from '../src/utils/token.js';

process.env.JWT_SECRET = 'login-test-secret';
const password = 'Passw0rd!';
const userId = '507f1f77bcf86cd799439011';
let server, base, hash;

before(async () => {
  hash = await bcrypt.hash(password, 10);
  server = http.createServer(createApp());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}/api/auth`;
});
afterEach(() => mock.restoreAll());
after(async () => { await new Promise((resolve) => server.close(resolve)); });

function account() {
  return new User({ _id: userId, username: 'alice01', email: 'alice@example.com', passwordHash: hash });
}
function findAccount(value) {
  return mock.method(User, 'findOne', () => ({ select: (fields) => {
    assert.equal(fields, '+passwordHash');
    return Promise.resolve(value);
  } }));
}
async function request(path, body, token) {
  const res = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

test('login: correct credentials issue a JWT and return only public fields', async () => {
  const lookup = findAccount(account());
  const res = await request('/login', { email: ' ALICE@EXAMPLE.COM ', password });
  assert.equal(res.status, 200);
  assert.deepEqual(lookup.mock.calls[0].arguments[0], { email: 'alice@example.com' });
  assert.equal(verifyToken(res.data.token), userId);
  assert.deepEqual(res.data.user, { id: userId, username: 'alice01', email: 'alice@example.com' });
  assert.equal(JSON.stringify(res.data).includes('password'), false);
});

test('login: unknown email and wrong password return the same 401', async () => {
  const lookup = findAccount(null);
  const unknown = await request('/login', { email: 'unknown@example.com', password });
  lookup.mock.restore();
  findAccount(account());
  const wrong = await request('/login', { email: 'alice@example.com', password: 'WrongPass1!' });
  assert.equal(unknown.status, 401);
  assert.deepEqual(wrong, unknown);
  assert.deepEqual(wrong.data, { message: 'Invalid email or password' });
});

test('login: missing, malformed and injection credentials never reach the database', async () => {
  const lookup = mock.method(User, 'findOne', () => { throw new Error('Unexpected query'); });
  for (const body of [{}, null, { email: { $ne: null }, password },
    { email: 'alice@example.com', password: { $ne: null } }, { email: 'invalid', password },
    { email: 'alice@example.com', password: '' }]) {
    assert.equal((await request('/login', body)).status, 400);
  }
  assert.equal(lookup.mock.callCount(), 0);
});

test('me: a valid JWT restores the same public user', async () => {
  const lookup = mock.method(User, 'findById', async () => account());
  const res = await request('/me', undefined, signToken(userId));
  assert.equal(res.status, 200);
  assert.equal(lookup.mock.calls[0].arguments[0], userId);
  assert.deepEqual(res.data, { user: account().toPublic() });
});

test('me: missing, invalid, tampered, and expired tokens are rejected before lookup', async () => {
  const lookup = mock.method(User, 'findById', () => { throw new Error('Unexpected query'); });
  const expired = jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: -1 });
  for (const token of [undefined, 'invalid', signToken(userId) + 'x', expired]) {
    assert.equal((await request('/me', undefined, token)).status, 401);
  }
  assert.equal(lookup.mock.callCount(), 0);
});

test('me: a deleted user cannot restore a session', async () => {
  mock.method(User, 'findById', async () => null);
  assert.equal((await request('/me', undefined, signToken(userId))).status, 401);
});

test('registration still hashes passwords and returns the existing response contract', async () => {
  mock.method(User, 'findOne', async () => null);
  const create = mock.method(User, 'create', async (fields) => new User({ _id: userId, ...fields }));
  const res = await request('/register', { username: 'alice01', email: 'ALICE@EXAMPLE.COM', password });
  assert.equal(res.status, 201);
  const stored = create.mock.calls[0].arguments[0];
  assert.equal(stored.email, 'alice@example.com');
  assert.notEqual(stored.passwordHash, password);
  assert.ok(await bcrypt.compare(password, stored.passwordHash));
  assert.equal(verifyToken(res.data.token), userId);
  assert.deepEqual(res.data.user, account().toPublic());
});
