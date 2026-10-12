import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyRoomEvent,
  isMusicAudioProfile,
  parseRealtimeMessage,
} from '../src/api/realtimeEvents.ts';
import { overlayMuteStates } from '../src/api/remoteMute.ts';
import type { CHChannelDetail, CHUser } from '../src/api/types.ts';

const ROOM = 'PG2LoOww';

const ayse: CHUser = {
  user_id: 501,
  name: 'Ayse',
  username: 'ayse',
  photo_url: null,
  is_speaker: false,
  is_moderator: false,
};

function baseChannel(users: CHUser[]): CHChannelDetail {
  return {
    channel_id: 1,
    channel: ROOM,
    topic: 'Original title',
    is_private: false,
    users,
    num_speakers: users.filter((u) => u.is_speaker).length,
    num_all: users.length,
  };
}

function reduce(channel: CHChannelDetail, raw: Record<string, unknown>, opts?: { myUserId?: number }): CHChannelDetail {
  const parsed = parseRealtimeMessage(raw, ROOM);
  return applyRoomEvent(channel, parsed, opts).channel;
}

test('uninvite_speaker moves speaker to audience (clears mod)', () => {
  const start = baseChannel([{ ...ayse, is_speaker: true, is_moderator: true }]);
  const next = reduce(start, { action: 'uninvite_speaker', channel: ROOM, user_id: 501 });
  assert.deepEqual(
    [next.users[0].is_speaker, next.users[0].is_moderator, next.num_speakers],
    [false, false, 0],
  );
});

test('set_channel_title patches topic', () => {
  const start = baseChannel([{ ...ayse }]);
  const next = reduce(start, { action: 'set_channel_title', channel: ROOM, title: 'New title' });
  assert.equal(next.topic, 'New title');
  assert.equal(next.users.length, 1);
});

test('add_speaker / make_moderator / uninvite request profile refresh for that user', () => {
  const start = baseChannel([{ ...ayse, is_speaker: false }]);
  const add = applyRoomEvent(
    start,
    parseRealtimeMessage({ action: 'add_speaker', channel: ROOM, user_id: 501 }, ROOM),
  );
  assert.equal(add.effects.profileRefreshUserId, 501);
  const mod = applyRoomEvent(
    add.channel,
    parseRealtimeMessage({ action: 'make_moderator', channel: ROOM, user_id: 501 }, ROOM),
  );
  assert.equal(mod.effects.profileRefreshUserId, 501);
  const uninvite = applyRoomEvent(
    mod.channel,
    parseRealtimeMessage({ action: 'uninvite_speaker', channel: ROOM, user_id: 501 }, ROOM),
  );
  assert.equal(uninvite.effects.profileRefreshUserId, 501);
});

test('update_speaker_call_status stores is_on_call and audio_profile', () => {
  const start = baseChannel([{ ...ayse, is_speaker: true }]);
  const next = reduce(start, {
    action: 'update_speaker_call_status',
    channel: ROOM,
    user_id: 501,
    is_on_call: false,
    audio_profile: 'AGORA_AUDIO_PROFILE_MUSIC_STANDARD_STEREO',
  });
  assert.equal(next.users[0].is_on_call, false);
  assert.equal(next.users[0].audio_profile, 'AGORA_AUDIO_PROFILE_MUSIC_STANDARD_STEREO');
  assert.equal(isMusicAudioProfile(next.users[0].audio_profile), true);
});

test('emoji_reaction and gif_reaction parse as channel_reaction', () => {
  const emoji = parseRealtimeMessage({
    action: 'emoji_reaction',
    channel: ROOM,
    emoji: '🔥',
    action_user_profile: { name: 'Host' },
    target_user_profile: { name: 'Ayse' },
  }, ROOM);
  assert.equal(emoji.kind, 'channel_reaction');
  if (emoji.kind === 'channel_reaction') assert.equal(emoji.emoji, '🔥');

  const gif = parseRealtimeMessage({
    action: 'gif_reaction',
    channel: ROOM,
    gif_url: 'https://example.com/x.gif',
    action_user_profile: { name: 'Host' },
    target_user_profile: { name: 'Ayse' },
  }, ROOM);
  assert.equal(gif.kind, 'channel_reaction');
});

test('sequence: join → raise → add_speaker → mute overlay → uninvite → leave', () => {
  let channel = baseChannel([]);
  channel = reduce(channel, { action: 'join_channel', channel: ROOM, user_profile: ayse });
  assert.equal(channel.users.length, 1);

  channel = reduce(channel, { action: 'raise_hands', channel: ROOM, user_id: 501 });
  assert.equal(channel.users[0].is_hand_raised, true);

  channel = reduce(channel, { action: 'add_speaker', channel: ROOM, user_id: 501 });
  assert.equal(channel.users[0].is_speaker, true);
  assert.equal(channel.users[0].is_hand_raised, false);

  // Agora mute overlay (not PubNub) — same path the coordinator uses after noteMute.
  const muteMap = new Map<number, boolean>([[501, true]]);
  channel = {
    ...channel,
    users: overlayMuteStates(channel.users, muteMap),
  };
  assert.equal(channel.users[0].is_muted, true);

  channel = reduce(channel, { action: 'uninvite_speaker', channel: ROOM, user_id: 501 });
  assert.deepEqual([channel.users[0].is_speaker, channel.users[0].is_moderator], [false, false]);

  channel = reduce(channel, { action: 'leave_channel', channel: ROOM, user_id: 501 });
  assert.deepEqual(channel.users.map((u) => u.user_id), []);
  assert.equal(channel.num_all, 0);
});
