import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoom,
  listRooms,
  joinRoom,
  leaveRoom,
} from '../src/controllers/roomController.js';
import Room from '../src/models/Room.js';
import User from '../src/models/User.js';

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function mockNext() {
  return (error) => {
    throw error;
  };
}

test('createRoom rejects an empty room name', async () => {
  const req = { body: { name: '   ' }, userId: 'user123' };
  const res = mockRes();

  await createRoom(req, res, mockNext());

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /Room name/);
});

test('createRoom rejects a room name longer than 40 characters', async () => {
  const req = { body: { name: 'a'.repeat(41) }, userId: 'user123' };
  const res = mockRes();

  await createRoom(req, res, mockNext());

  assert.equal(res.statusCode, 400);
});

test('joinRoom rejects an invalid room ID', async () => {
  const req = { params: { roomId: 'invalid-id' }, userId: 'user123' };
  const res = mockRes();

  await joinRoom(req, res, mockNext());

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Invalid room ID');
});

test('leaveRoom rejects an invalid room ID', async () => {
  const req = { params: { roomId: 'invalid-id' }, userId: 'user123' };
  const res = mockRes();

  await leaveRoom(req, res, mockNext());

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'Invalid room ID');
});
