// Sprint-3 regression tests (Deliverable 3). Dependency-free: only node:test and project utilities.
// Each test name carries the Test Case id it gives automated evidence for (see docs/test-reports).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRegister, validateLogin, validateRoom, validateMessage,
  isObjectId, isConversationKey, MAX_MESSAGE_LENGTH,
} from '../src/utils/validators.js';
import { sanitizeText, sanitizeLine, stripMongoOperators } from '../src/utils/sanitize.js';

const ID = 'a'.repeat(24);
const good = { username: 'alice01', email: 'alice01@example.com', password: 'Passw0rd!' };

// ---- TC-002 password boundary (FR-2) ----------------------------------------------------------
test('TC-002: 7-character password is rejected', () => {
  const errors = validateRegister({ ...good, password: 'Pass123' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /at least 8/);
});

test('TC-002: 8-character password is accepted', () => {
  assert.deepEqual(validateRegister({ ...good, password: 'Pass123!' }), []);
});

test('TC-002: 72-byte password is accepted, 73-byte is rejected (bcrypt limit)', () => {
  assert.deepEqual(validateRegister({ ...good, password: 'a'.repeat(72) }), []);
  assert.equal(validateRegister({ ...good, password: 'a'.repeat(73) }).length, 1);
});

test('TC-002: multi-byte password is measured in UTF-8 bytes, not characters', () => {
  // 37 two-byte characters = 74 bytes > 72, although only 37 characters long
  assert.equal(validateRegister({ ...good, password: 'é'.repeat(37) }).length, 1);
});

test('TC-002: non-string password is rejected', () => {
  assert.equal(validateRegister({ ...good, password: 12345678 }).length, 1);
});

// ---- TC-001 registration validation (FR-1) ----------------------------------------------------
test('TC-001: valid registration payload has no errors', () => {
  assert.deepEqual(validateRegister(good), []);
});

test('TC-001: username length 2 / 3 / 30 / 31 boundaries', () => {
  assert.equal(validateRegister({ ...good, username: 'ab' }).length, 1);
  assert.deepEqual(validateRegister({ ...good, username: 'abc' }), []);
  assert.deepEqual(validateRegister({ ...good, username: 'a'.repeat(30) }), []);
  assert.equal(validateRegister({ ...good, username: 'a'.repeat(31) }).length, 1);
});

test('TC-001: username with illegal characters is rejected', () => {
  const errors = validateRegister({ ...good, username: 'bad name!' });
  assert.match(errors[0], /letters, numbers and underscores/);
});

test('TC-001: malformed or over-long email is rejected', () => {
  for (const email of ['plain', 'a@b', '@x.com', 'a b@x.com', `${'a'.repeat(250)}@x.com`, undefined]) {
    assert.equal(validateRegister({ ...good, email }).length, 1, `email ${String(email).slice(0, 20)}`);
  }
});

test('TC-001: missing / null / non-object body gives errors instead of throwing', () => {
  assert.equal(validateRegister().length, 3);
  assert.equal(validateRegister(null).length, 3);
  assert.equal(validateRegister('text').length, 3);
});

// ---- TC-003 login validation (FR-3) -----------------------------------------------------------
test('TC-003: login needs a valid email and a non-empty password', () => {
  assert.deepEqual(validateLogin({ email: 'a@b.co', password: 'x' }), []);
  assert.equal(validateLogin({ email: 'nope', password: 'x' }).length, 1);
  assert.equal(validateLogin({ email: 'a@b.co', password: '' }).length, 1);
  assert.equal(validateLogin({ email: 'a@b.co', password: 'a'.repeat(73) }).length, 1);
  assert.equal(validateLogin().length, 2);
  assert.equal(validateLogin(null).length, 2);
});

// ---- TC-009 room name validation (FR-10) ------------------------------------------------------
test('TC-009: room names: allowed, too short, too long, illegal characters', () => {
  assert.deepEqual(validateRoom({ name: 'SE_TestRoom' }), []);
  assert.deepEqual(validateRoom({ name: '  SE   Test  ' }), []);
  assert.equal(validateRoom({ name: 'a' }).length, 1);
  assert.equal(validateRoom({ name: 'a'.repeat(41) }).length, 1);
  assert.match(validateRoom({ name: '<b>room</b>' })[0], /may only contain/);
  assert.equal(validateRoom(undefined).length, 1);
  assert.equal(validateRoom(null).length, 1);
});

// ---- TC-021 XSS / injection (NFR-8) -----------------------------------------------------------
test('TC-021: XSS payload is kept as literal text (client renders text, never HTML)', () => {
  assert.equal(sanitizeText('<script>alert(1)</script>'), '<script>alert(1)</script>');
});

test('TC-021: XSS payload in a room name is rejected', () => {
  assert.equal(validateRoom({ name: '<script>alert(1)</script>' }).length, 1);
});

test("TC-021: SQL-style payload ' OR '1'='1 in username is rejected, in login is only data", () => {
  assert.equal(validateRegister({ ...good, username: "' OR '1'='1" }).length, 1);
  assert.deepEqual(validateLogin({ email: "x@y.co", password: "' OR '1'='1" }), []);
});

test('TC-021: NoSQL operator objects are stripped from request data', () => {
  assert.deepEqual(stripMongoOperators({ email: { $ne: null }, password: { $gt: '' } }), { email: {}, password: {} });
  assert.deepEqual(stripMongoOperators({ 'a.b': 1, ok: 2 }), { ok: 2 });
});

test('TC-021: prototype-pollution keys are removed', () => {
  const dirty = JSON.parse('{"__proto__":{"admin":true},"constructor":1,"prototype":2,"name":"x"}');
  assert.deepEqual(stripMongoOperators(dirty), { name: 'x' });
  assert.equal({}.admin, undefined);
});

test('TC-021: operators inside arrays and nested objects are stripped; primitives untouched', () => {
  assert.deepEqual(stripMongoOperators([{ $or: 1, a: 1 }, 5, 'x', null]), [{ a: 1 }, 5, 'x', null]);
  assert.equal(stripMongoOperators('text'), 'text');
  assert.equal(stripMongoOperators(null), null);
});

test('TC-021: very deep objects and arrays are cut off instead of recursing forever', () => {
  let deepObj = { v: 1 };
  let deepArr = [1];
  for (let i = 0; i < 30; i++) { deepObj = { n: deepObj }; deepArr = [deepArr]; }
  const o = stripMongoOperators(deepObj);
  const a = stripMongoOperators(deepArr);
  assert.ok(JSON.stringify(o).length < JSON.stringify(deepObj).length);
  assert.ok(JSON.stringify(a).length < JSON.stringify(deepArr).length);
});

test('TC-021: sanitizeLine collapses whitespace to one line; sanitizeText ignores non-strings', () => {
  assert.equal(sanitizeLine('a \n\t b'), 'a b');
  assert.equal(sanitizeText(42), '');
  assert.equal(sanitizeText('‍‌️'), '');
});

// ---- TC-005 / TC-017 message validation helpers ------------------------------------------------
test('TC-005: message must target exactly one of user or room, with a valid id', () => {
  assert.deepEqual(validateMessage({ to: ID, text: 'Hello Bob' }), []);
  assert.deepEqual(validateMessage({ room: ID, text: 'Hi all' }), []);
  assert.match(validateMessage({ to: ID, room: ID, text: 'x' })[0], /either a user or a room/);
  assert.match(validateMessage({ to: 'zzz', text: 'x' })[0], /Receiver id/);
  assert.match(validateMessage({ room: 'zzz', text: 'x' })[0], /Room id/);
});

test('TC-016: message length boundary is 2000 characters', () => {
  assert.deepEqual(validateMessage({ to: ID, text: 'a'.repeat(MAX_MESSAGE_LENGTH) }), []);
  assert.match(validateMessage({ to: ID, text: 'a'.repeat(MAX_MESSAGE_LENGTH + 1) })[0], /exceed/);
  assert.match(validateMessage({ to: ID, text: '   ' })[0], /empty/);
  assert.equal(validateMessage(undefined).length, 2);
});

test('TC-016/TC-017: id and conversation-key helpers', () => {
  assert.equal(isObjectId(ID), true);
  assert.equal(isObjectId('xyz'), false);
  assert.equal(isObjectId(123), false);
  assert.equal(isConversationKey(`user:${ID}`), true);
  assert.equal(isConversationKey(`room:${ID}`), true);
  assert.equal(isConversationKey(`group:${ID}`), false);
  assert.equal(isConversationKey(null), false);
});

// ---- TC-032 control / invisible / bidirectional characters --------------------------------------
test('TC-032: control characters are removed, tab and newline are kept', () => {
  assert.equal(sanitizeText('a\u0000b\u0007c\td\ne'), 'abc\td\ne');
});

test('TC-032: zero-width and bidirectional override characters are removed', () => {
  assert.equal(sanitizeText('ad​min‮evil'), 'adminevil');
});

test('TC-032: three or more line breaks collapse to one blank line; CRLF becomes LF', () => {
  assert.equal(sanitizeText('a\r\nb\n\n\n\nc'), 'a\nb\n\nc');
});

test('TC-032: emoji with joiners survive, joiners alone are treated as empty', () => {
  assert.equal(sanitizeText('👨‍👩‍👧'), '👨‍👩‍👧');
  assert.equal(sanitizeText('‍'), '');
});
