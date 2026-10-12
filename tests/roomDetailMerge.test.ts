import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeRoomDetailFields } from '../src/api/roomDetailMerge.ts';
import {
  roomHandraiseSelectMode,
  roomVisibilitySelectMode,
} from '../src/api/roomControls.ts';
import type { CHChannelDetail } from '../src/api/types.ts';

function baseChannel(overrides: Partial<CHChannelDetail> = {}): CHChannelDetail {
  return {
    channel_id: 1,
    channel: 'abc',
    topic: 'T',
    is_private: false,
    num_speakers: 1,
    num_all: 3,
    users: [{ user_id: 1, name: 'A', username: 'a', photo_url: null }],
    ...overrides,
  };
}

test('mergeRoomDetailFields keeps handraise and capability patches', () => {
  const current = baseChannel({
    is_handraise_enabled: true,
    handraise_permission: 1,
    user_capabilities: { can_invite: true },
  });
  mergeRoomDetailFields(current, baseChannel({
    is_handraise_enabled: false,
    handraise_queue_setting: 1,
    handraise_permission: 2,
    num_all: 99,
    user_capabilities: { can_end_room: false },
    users: current.users,
  }));
  assert.equal(current.is_handraise_enabled, false);
  assert.equal(current.handraise_queue_setting, 1);
  assert.equal(current.handraise_permission, 2);
  assert.equal(current.num_all, 99);
  assert.deepEqual(current.user_capabilities, { can_invite: true, can_end_room: false });
});

test('room select modes match stage and details', () => {
  assert.equal(roomHandraiseSelectMode({ is_handraise_enabled: false }), 'off');
  assert.equal(roomHandraiseSelectMode({ is_handraise_enabled: true, handraise_permission: 2 }), '2');
  assert.equal(roomHandraiseSelectMode({ is_handraise_enabled: true, handraise_permission: 1 }), '1');
  assert.equal(roomVisibilitySelectMode({ is_private: true }), 'other');
  assert.equal(roomVisibilitySelectMode({ is_social_mode: true }), 'social');
  assert.equal(roomVisibilitySelectMode({}), 'open');
});
