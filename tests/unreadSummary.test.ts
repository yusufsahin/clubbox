import assert from 'node:assert/strict';
import test from 'node:test';
import { readUnreadSummary } from '../src/api/unreadSummary.ts';

test('readUnreadSummary prefers unread_count', () => {
  assert.equal(readUnreadSummary({ unread_count: 3 }), 3);
  assert.equal(readUnreadSummary({ unread_conversations_count: 2 }), 2);
  assert.equal(readUnreadSummary({ count: 0 }), 0);
  assert.equal(readUnreadSummary({ success: true }), null);
  assert.equal(readUnreadSummary(null), null);
});
