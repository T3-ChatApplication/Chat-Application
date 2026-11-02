import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerTyping } from '../src/socket/typing.js';

const ROOM = 'b'.repeat(24);
const OTHER = 'c'.repeat(24);

// Minimal stand-in for a Socket.IO socket: records what would be emitted
function fakeSocket(userId, joinedRooms = []) {
  const handlers = {};
  const sent = [];
  const socket = {
    userId,
    rooms: new Set(joinedRooms),
    on(event, fn) {
      handlers[event] = fn;
    },
    to(target) {
      return { emit: (event, payload) => sent.push({ target, event, payload }) };
    },
  };
  registerTyping(null, socket);
  return { socket, sent, typing: handlers.typing };
}

test('one-to-one typing is sent to the other user only', () => {
  const { sent, typing } = fakeSocket('alice');
  typing({ to: OTHER, isTyping: true });
  assert.deepEqual(sent, [
    { target: `user:${OTHER}`, event: 'typing', payload: { from: 'alice', isTyping: true } },
  ]);
});

test('stopped typing is passed on too', () => {
  const { sent, typing } = fakeSocket('alice');
  typing({ to: OTHER, isTyping: false });
  assert.equal(sent[0].payload.isTyping, false);
});

test('room typing reaches the room and names the room', () => {
  const { sent, typing } = fakeSocket('alice', [`room:${ROOM}`]);
  typing({ room: ROOM, isTyping: true });
  assert.deepEqual(sent, [
    {
      target: `room:${ROOM}`,
      event: 'typing',
      payload: { from: 'alice', isTyping: true, room: ROOM },
    },
  ]);
});

test('typing into a room you have not joined is ignored', () => {
  const { sent, typing } = fakeSocket('alice', []);
  typing({ room: ROOM, isTyping: true });
  assert.equal(sent.length, 0);
});

test('malformed payloads are ignored', () => {
  const { sent, typing } = fakeSocket('alice', [`room:${ROOM}`]);
  typing(null);
  typing('hello');
  typing({ to: OTHER });
  typing({ to: OTHER, isTyping: 'yes' });
  typing({ to: 'not-an-id', isTyping: true });
  typing({ room: 'not-an-id', isTyping: true });
  typing({ to: { $ne: null }, isTyping: true });
  assert.equal(sent.length, 0);
});

test('the sender id comes from the socket, not from the payload', () => {
  const { sent, typing } = fakeSocket('alice');
  typing({ to: OTHER, isTyping: true, from: 'mallory' });
  assert.equal(sent[0].payload.from, 'alice');
});
