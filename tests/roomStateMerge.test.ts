import assert from 'node:assert/strict';
import test from 'node:test';
import { mapChannelUser, mergeRoomState } from '../src/api/roomStateMerge.ts';
import type { CHChannelDetail } from '../src/api/types.ts';

function base(overrides: Partial<CHChannelDetail> = {}): CHChannelDetail {
  return {
    channel_id: 1,
    channel: 'abc',
    topic: 'Live',
    is_private: false,
    num_speakers: 1,
    num_all: 2,
    users: [
      {
        user_id: 1,
        name: 'Host',
        username: 'host',
        photo_url: null,
        is_moderator: true,
        is_speaker: true,
        is_muted: false,
      },
      {
        user_id: 2,
        name: 'Listener',
        username: 'listen',
        photo_url: null,
        is_speaker: false,
        is_muted: true,
      },
    ],
    token: 'agora-token',
    pubnub_token: 'pn-token',
    ...overrides,
  };
}

test('mapChannelUser maps role and mute flags', () => {
  const user = mapChannelUser({
    user_id: 9,
    name: 'Ada',
    username: 'ada',
    photo_url: 'https://example.com/a.jpg',
    is_moderator: true,
    is_speaker: true,
    is_muted: true,
    is_hand_raised: true,
  });
  assert.deepEqual(user, {
    user_id: 9,
    name: 'Ada',
    username: 'ada',
    photo_url: 'https://example.com/a.jpg',
    is_moderator: true,
    is_speaker: true,
    is_muted: true,
    is_hand_raised: true,
  });
});

test('mapChannelUser rejects rows without user_id', () => {
  assert.equal(mapChannelUser({ name: 'x' }), null);
  assert.equal(mapChannelUser(null), null);
});

test('mergeRoomState prefers snapshot roster and roles', () => {
  const current = base({
    users: [
      {
        user_id: 2,
        name: 'Stale',
        username: 'listen',
        photo_url: null,
        is_speaker: true,
        is_moderator: true,
        is_muted: false,
        is_speaking: true,
      },
    ],
  });
  const snapshot = base({
    num_all: 3,
    users: [
      {
        user_id: 2,
        name: 'Listener',
        username: 'listen',
        photo_url: null,
        is_speaker: false,
        is_moderator: false,
        is_muted: true,
        is_hand_raised: true,
      },
      {
        user_id: 3,
        name: 'New',
        username: 'new',
        photo_url: null,
        is_speaker: true,
      },
    ],
    user_capabilities: { can_mute_speakers: true },
  });
  const merged = mergeRoomState(current, snapshot);
  assert.equal(merged.num_all, 3);
  assert.equal(merged.users.length, 2);
  assert.equal(merged.users[0]?.is_speaker, false);
  assert.equal(merged.users[0]?.is_moderator, false);
  assert.equal(merged.users[0]?.is_muted, true);
  assert.equal(merged.users[0]?.is_hand_raised, true);
  assert.equal(merged.users[0]?.is_speaking, true); // kept from current
  assert.equal(merged.users[1]?.user_id, 3);
  assert.deepEqual(merged.user_capabilities, { can_mute_speakers: true });
});

test('mergeRoomState keeps tokens when snapshot omits them', () => {
  const current = base();
  const snapshot = base({
    token: undefined,
    pubnub_token: '',
    users: current.users,
  });
  const merged = mergeRoomState(current, snapshot);
  assert.equal(merged.token, 'agora-token');
  assert.equal(merged.pubnub_token, 'pn-token');
});
