import assert from 'node:assert/strict';
import test from 'node:test';
import { conversationIdsForUnreadSummary, readUnreadSummary } from '../src/api/unreadSummary.ts';

test('readUnreadSummary prefers unread_count', () => {
  assert.equal(readUnreadSummary({ unread_count: 3 }), 3);
  assert.equal(readUnreadSummary({ unread_conversations_count: 2 }), 2);
  assert.equal(readUnreadSummary({ count: 0 }), 0);
  assert.equal(readUnreadSummary({ success: true }), null);
  assert.equal(readUnreadSummary(null), null);
});

test('conversationIdsForUnreadSummary dedupes and caps at 10', () => {
  assert.deepEqual(conversationIdsForUnreadSummary(['c1', '', 'c1', 'c2']), ['c1', 'c2']);
  const many = Array.from({ length: 15 }, (_, i) => `c${i}`);
  assert.equal(conversationIdsForUnreadSummary(many).length, 10);
  assert.deepEqual(conversationIdsForUnreadSummary(many).slice(0, 3), ['c0', 'c1', 'c2']);
});
