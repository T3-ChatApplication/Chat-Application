import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRegister,
  validateLogin,
  validateMessage,
  validateRoom,
  isObjectId,
} from '../src/utils/validators.js';

test('register: accepts valid input', () => {
  const errors = validateRegister({ username: 'neel_k', email: 'a@b.com', password: 'password123' });
  assert.deepEqual(errors, []);
});

test('register: rejects short username, bad email and short password', () => {
  const errors = validateRegister({ username: 'ab', email: 'nope', password: '123' });
  assert.equal(errors.length, 3);
});

test('register: rejects username with special characters', () => {
  const errors = validateRegister({ username: 'bad name!', email: 'a@b.com', password: 'password123' });
  assert.equal(errors.length, 1);
});

test('register: handles missing body', () => {
  assert.ok(validateRegister().length > 0);
});

test('login: requires email and password', () => {
  assert.equal(validateLogin({ email: 'a@b.com', password: 'x' }).length, 0);
  assert.equal(validateLogin({ email: '', password: '' }).length, 2);
});

test('room: accepts normal names and rejects bad ones', () => {
  assert.deepEqual(validateRoom({ name: 'General' }), []);
  assert.deepEqual(validateRoom({ name: 'Project team-1' }), []);
  assert.ok(validateRoom({ name: 'a' }).length > 0);
  assert.ok(validateRoom({ name: 'x'.repeat(41) }).length > 0);
  assert.ok(validateRoom({ name: '<script>' }).length > 0);
  assert.ok(validateRoom({ name: 42 }).length > 0);
  assert.ok(validateRoom(null).length > 0);
  assert.ok(validateRoom().length > 0);
});

test('isObjectId: only accepts 24-character hex strings', () => {
  assert.equal(isObjectId('a'.repeat(24)), true);
  assert.equal(isObjectId('A1b2c3d4e5f6a1b2c3d4e5f6'), true);
  assert.equal(isObjectId('a'.repeat(23)), false);
  assert.equal(isObjectId('g'.repeat(24)), false);
  assert.equal(isObjectId({ $ne: null }), false);
  assert.equal(isObjectId(undefined), false);
});

test('message: goes to a user or a room, not both and not neither', () => {
  const id = 'a'.repeat(24);
  assert.equal(validateMessage({ room: id, text: 'hello everyone' }).length, 0);
  assert.ok(validateMessage({ room: 'bad', text: 'hi' }).length > 0);
  assert.ok(validateMessage({ to: id, room: id, text: 'hi' }).length > 0);
  assert.ok(validateMessage({ text: 'hi' }).length > 0);
  assert.ok(validateMessage(null).length > 0);
  assert.ok(validateMessage('text').length > 0);
});

test('message: validates receiver id and text', () => {
  const id = 'a'.repeat(24);
  assert.equal(validateMessage({ to: id, text: 'hello' }).length, 0);
  assert.ok(validateMessage({ to: 'bad', text: 'hello' }).length > 0);
  assert.ok(validateMessage({ to: id, text: '   ' }).length > 0);
  assert.ok(validateMessage({ to: id, text: 'x'.repeat(2001) }).length > 0);
});
