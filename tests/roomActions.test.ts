import assert from 'node:assert/strict';
import test from 'node:test';
import {
  conversationKind,
  leaveClosesRoom,
  permissionOn,
  roomHasOthers,
  segmentsForMember,
} from '../src/api/roomActions.ts';

test('archived chats stay out of house and voice-message kinds', () => {
  assert.equal(conversationKind({ is_archived: true, permanent_house_chat: true }), 'archive');
  assert.equal(conversationKind({ is_archived: false, permanent_house_chat: true }), 'house');
  assert.equal(conversationKind({ is_archived: false, permanent_house_chat: false }), 'vm');
});

test('permission buttons follow an explicit true flag', () => {
  assert.equal(permissionOn(true), true);
  assert.equal(permissionOn(false), false);
  assert.equal(permissionOn(null), false);
  assert.equal(permissionOn(undefined), false);
});

test('only the last moderator closes the room by leaving', () => {
  const users = [
    { user_id: 1, is_moderator: true },
    { user_id: 2, is_moderator: true },
    { user_id: 3, is_moderator: false },
  ];
  assert.equal(leaveClosesRoom(users, 1), false);
  assert.equal(leaveClosesRoom(users, 3), false);
  assert.equal(leaveClosesRoom([{ user_id: 1, is_moderator: true }], 1), true);
  assert.equal(roomHasOthers(users, 1), true);
  assert.equal(roomHasOthers([{ user_id: 1, is_moderator: true }], 1), false);
});

test('a member added later does not see earlier segments', () => {
  const segments = ['a', 'b', 'c'];
  assert.deepEqual(segmentsForMember(segments, null), segments);
  assert.deepEqual(segmentsForMember(segments, 2), ['c']);
  assert.deepEqual(segmentsForMember(segments, 3), []);
});
