import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRegister, validateLogin } from '../src/utils/validators.js';

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
