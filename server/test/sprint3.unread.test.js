// Sprint-3 regression tests for unread-count helpers (FR-21, FR-22, TC-017, TC-034).
// Imports only the pure helper module, so no database driver is needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUnreadMatch, toCounts } from '../src/utils/unread.js';

test('TC-017: nothing to count gives null (no database query needed)', () => {
  assert.equal(buildUnreadMatch({ me: 'me', senders: [], roomIds: [], lastRead: new Map() }), null);
});

test('TC-017: a chat never opened counts every message from that sender', () => {
  const match = buildUnreadMatch({ me: 'me', senders: ['bob'], roomIds: [], lastRead: new Map() });
  assert.deepEqual(match, { $or: [{ sender: 'bob', receiver: 'me' }] });
});

test('TC-017: an opened chat only counts messages after the last-read time (count returns to 0)', () => {
  const at = new Date('2026-11-03T10:00:00Z');
  const match = buildUnreadMatch({ me: 'me', senders: ['bob'], roomIds: [], lastRead: new Map([['user:bob', at]]) });
  assert.deepEqual(match.$or[0].createdAt, { $gt: at });
});

test('TC-017: room branch excludes my own messages and uses the room last-read time', () => {
  const at = new Date('2026-11-03T10:00:00Z');
  const match = buildUnreadMatch({ me: 'me', senders: [], roomIds: ['r1'], lastRead: new Map([['room:r1', at]]) });
  assert.deepEqual(match.$or[0], { room: 'r1', sender: { $ne: 'me' }, createdAt: { $gt: at } });
});

test('TC-034: private chats and rooms are combined into ONE filter (one query, not one per chat)', () => {
  const match = buildUnreadMatch({ me: 'me', senders: ['a', 'b'], roomIds: ['r1', 'r2'], lastRead: new Map() });
  assert.equal(match.$or.length, 4);
});

test('TC-017: toCounts keys match the client (user:<id> / room:<id>) and skip zero rows', () => {
  const counts = toCounts([
    { sender: 'bob', n: 2 },
    { room: 'r1', sender: 'x', n: 5 },
    { sender: 'zero', n: 0 },
  ]);
  assert.deepEqual(counts, { 'user:bob': 2, 'room:r1': 5 });
  assert.deepEqual(toCounts([]), {});
});
