import assert from 'node:assert/strict';
import test from 'node:test';
import { isChannelModerator, roomControlFlags, stageAccessMode } from '../src/api/roomControls.ts';
import { getEndpoint } from '../src/api/registry.ts';

test('stageAccessMode maps handraise_queue_setting to open / raise / invite', () => {
  assert.equal(stageAccessMode({ handraise_queue_setting: 0 }), 'open');
  assert.equal(stageAccessMode({ handraise_queue_setting: 2, is_handraise_enabled: true }), 'raise');
  assert.equal(stageAccessMode({ handraise_queue_setting: 1 }), 'invite');
  assert.equal(stageAccessMode({ is_handraise_enabled: true }), 'raise');
  assert.equal(stageAccessMode({ is_handraise_enabled: false }), 'open');
});

test('isChannelModerator treats the room creator as host when the user row is missing', () => {
  assert.equal(
    isChannelModerator({ creator_user_profile_id: 9, users: [] }, 9),
    true,
  );
  assert.equal(
    isChannelModerator({
      creator_user_profile_id: 1,
      users: [{ user_id: 2, is_moderator: true }],
    }, 2),
    true,
  );
  assert.equal(
    isChannelModerator({
      creator_user_profile_id: 1,
      users: [{ user_id: 2, is_moderator: false }],
    }, 2),
    false,
  );
});

test('roomControlFlags gates handraise, rename, and emoji by capability + support', () => {
  const all = roomControlFlags(
    { can_edit_handraise_queue: true, can_edit_room_title: true },
    (endpoint) => [
      'change_handraise_settings',
      'set_channel_title',
      'emoji_reaction',
      'gif_reaction',
      'invite_to_existing_channel',
      'make_channel_public',
    ].includes(endpoint),
  );
  assert.equal(all.canHandraise, true);
  assert.equal(all.canRename, true);
  assert.equal(all.canReact, true);
  assert.equal(all.canGifReact, true);
  assert.equal(all.canPing, true);
  assert.equal(all.canChangeVisibility, true);

  const blocked = roomControlFlags(
    { can_edit_handraise_queue: false, can_edit_room_title: false },
    () => true,
  );
  assert.equal(blocked.canHandraise, false);
  assert.equal(blocked.canRename, false);
});

test('change_handraise_settings body uses community numeric permission', () => {
  const build = getEndpoint('change_handraise_settings').buildRequest;
  assert.ok(build);
  assert.deepEqual(build({
    channel: 'abc123',
    isEnabled: true,
    handraisePermission: 2,
  }), {
    channel: 'abc123',
    is_enabled: true,
    handraise_permission: 2,
  });
});
