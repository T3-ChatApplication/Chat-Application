import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConversationId } from '../src/models/Message.js';

test('conversation id is the same for both participants', () => {
  assert.equal(buildConversationId('b', 'a'), buildConversationId('a', 'b'));
});

test('conversation id differs for different pairs', () => {
  assert.notEqual(buildConversationId('a', 'b'), buildConversationId('a', 'c'));
});
