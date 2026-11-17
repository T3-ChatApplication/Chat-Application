// Sprint-3 regression tests for Express middleware, using plain mock req/res objects
// (no express, no network, no database), so they run anywhere with `npm test`.
import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeInput } from '../src/middleware/sanitizeInput.js';
import { rateLimit } from '../src/middleware/rateLimit.js';
import { notFound, errorHandler } from '../src/middleware/errorHandler.js';

afterEach(() => mock.restoreAll());

function mockRes() {
  return {
    statusCode: 200, body: null, headers: {},
    status(c) { this.statusCode = c; return this; },
    json(p) { this.body = p; return this; },
    set(k, v) { this.headers[k] = v; return this; },
  };
}

// ---- NFR-8 / TC-021: injection stripping middleware ---------------------------------------------
test('TC-021: sanitizeInput strips $operators from body and query, then calls next', () => {
  const req = { body: { email: { $ne: null }, ok: 'x' }, query: { id: { $gt: '' }, page: '1' } };
  let called = 0;
  sanitizeInput(req, mockRes(), () => { called += 1; });
  assert.deepEqual(req.body, { email: {}, ok: 'x' });
  assert.deepEqual(req.query, { id: {}, page: '1' });
  assert.equal(called, 1);
});

test('TC-021: sanitizeInput tolerates a missing body / query', () => {
  const req = {};
  let called = false;
  sanitizeInput(req, mockRes(), () => { called = true; });
  assert.equal(called, true);
});

// ---- Rate limiting (Sprint 2: performance/security) ---------------------------------------------
test('rateLimit: allows up to the limit, then answers 429 with Retry-After', () => {
  const mw = rateLimit({ limit: 2, windowMs: 60_000, message: 'slow down' });
  const results = [];
  for (let i = 0; i < 3; i++) {
    const res = mockRes();
    let passed = false;
    mw({ ip: '1.2.3.4' }, res, () => { passed = true; });
    results.push({ passed, status: res.statusCode, res });
  }
  assert.deepEqual(results.map((r) => r.passed), [true, true, false]);
  assert.equal(results[2].status, 429);
  assert.deepEqual(results[2].res.body, { message: 'slow down' });
  assert.ok(Number(results[2].res.headers['Retry-After']) >= 1);
  assert.equal(results[0].res.headers['X-RateLimit-Remaining'], '1');
  assert.equal(results[2].res.headers['X-RateLimit-Remaining'], '0');
});

test('rateLimit: limits are counted per IP address', () => {
  const mw = rateLimit({ limit: 1, windowMs: 60_000 });
  const hit = (ip) => { const r = mockRes(); let ok = false; mw({ ip }, r, () => { ok = true; }); return ok; };
  assert.equal(hit('10.0.0.1'), true);
  assert.equal(hit('10.0.0.1'), false);
  assert.equal(hit('10.0.0.2'), true);
});

test('rateLimit: default message is used when none is given', () => {
  const mw = rateLimit({ limit: 0, windowMs: 60_000 });
  const res = mockRes();
  mw({ ip: 'x' }, res, () => {});
  assert.equal(res.body.message, 'Too many requests, please slow down');
});

// ---- Error handling -----------------------------------------------------------------------------
test('notFound: 404 JSON naming the method and URL', () => {
  const res = mockRes();
  notFound({ method: 'GET', originalUrl: '/api/nope' }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.body.message, 'Route not found: GET /api/nope');
});

test('errorHandler: uses err.status and message, defaults to 500', () => {
  mock.method(console, 'error', () => {});
  const a = mockRes();
  errorHandler({ status: 409, message: 'dup' }, {}, a, () => {});
  assert.equal(a.statusCode, 409);
  assert.equal(a.body.message, 'dup');
  const b = mockRes();
  errorHandler({}, {}, b, () => {});
  assert.equal(b.statusCode, 500);
  assert.equal(b.body.message, 'Server error');
});

test('rateLimit: expired windows are pruned by the background timer, so counts start fresh', () => {
  mock.timers.enable({ apis: ['setInterval', 'Date'] });
  try {
    const mw = rateLimit({ limit: 1, windowMs: 1000 });
    const hit = () => { let ok = false; mw({ ip: 'p' }, mockRes(), () => { ok = true; }); return ok; };
    assert.equal(hit(), true);
    assert.equal(hit(), false);
    mock.timers.tick(1500); // window ends, the prune timer fires
    assert.equal(hit(), true);
  } finally {
    mock.timers.reset();
  }
});
