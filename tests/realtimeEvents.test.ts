import assert from 'node:assert/strict';
import test from 'node:test';
import { applyStageEvent, parseRealtimeMessage, roomPubNubChannels } from '../src/api/realtimeEvents.ts';
import type { CHUser } from '../src/api/types.ts';

test('parseRealtimeMessage maps channel_message', () => {
  const chat = parseRealtimeMessage({
    type: 'channel_message',
    message_id: '1',
    from_user_id: 2,
    from_name: 'Ayse',
    message: 'hi',
  });
  assert.equal(chat.kind, 'channel_message');
});

test('live aliases new_channel_message and new_channel_reaction', () => {
  const chat = parseRealtimeMessage({
    action: 'new_channel_message',
    channel: 'PG2LoOww',
    message_id: '9',
    from_user_id: 2,
    from_name: 'Ayse',
    message: 'hello',
  }, 'PG2LoOww');
  assert.equal(chat.kind, 'channel_message');
  if (chat.kind === 'channel_message') assert.equal(chat.message.message, 'hello');

  const reaction = parseRealtimeMessage({
    action: 'new_channel_reaction',
    channel: 'PG2LoOww',
    reaction: '🔥',
    action_user_profile: { name: 'Host' },
    target_user_profile: { name: 'Ayse' },
  }, 'PG2LoOww');
  assert.equal(reaction.kind, 'channel_reaction');
  if (reaction.kind === 'channel_reaction') {
    assert.equal(reaction.emoji, '🔥');
    assert.equal(reaction.fromName, 'Host');
    assert.equal(reaction.targetName, 'Ayse');
  }
});

test('live change_handraise_settings and update_user_capabilities patch the channel', () => {
  const hand = parseRealtimeMessage({
    action: 'change_handraise_settings',
    channel: 'PG2LoOww',
    is_enabled: false,
    handraise_queue_setting: 1,
    handraise_permission: 2,
  }, 'PG2LoOww');
  assert.equal(hand.kind, 'channel_patch');
  if (hand.kind === 'channel_patch') {
    assert.equal(hand.patch.is_handraise_enabled, false);
    assert.equal(hand.patch.handraise_queue_setting, 1);
    assert.equal(hand.patch.handraise_permission, 2);
  }

  const caps = parseRealtimeMessage({
    action: 'update_user_capabilities',
    channel: 'PG2LoOww',
    can_end_room: false,
    can_invite: true,
    stage_removed: true,
  }, 'PG2LoOww');
  assert.equal(caps.kind, 'channel_patch');
  if (caps.kind === 'channel_patch') {
    assert.deepEqual(caps.patch.user_capabilities, {
      can_end_room: false,
      can_invite: true,
    });
  }
});

test('live cumulative_count_update sets num_ever; call status carries on-call fields', () => {
  const count = parseRealtimeMessage({
    action: 'cumulative_count_update',
    channel: 'PG2LoOww',
    num_ever: 42,
  }, 'PG2LoOww');
  assert.equal(count.kind, 'channel_patch');
  if (count.kind === 'channel_patch') assert.equal(count.patch.num_ever, 42);

  const call = parseRealtimeMessage({
    action: 'update_speaker_call_status',
    channel: 'PG2LoOww',
    user_id: 1,
    is_on_call: true,
    audio_profile: 1,
  }, 'PG2LoOww');
  assert.equal(call.kind, 'speaker_call_status');
  if (call.kind === 'speaker_call_status') {
    assert.equal(call.userId, 1);
    assert.equal(call.isOnCall, true);
    assert.equal(call.audioProfile, 1);
  }
});

// Real Clubhouse PubNub payloads (sources: grishka/Houseclub VoiceService.java and
// seovchinnikov/clubhouse-web JoinChannel.vue): the type is in "action", users are identified by id.
const ROOM = 'PG2LoOww';
const ayse = { user_id: 501, name: 'Ayse', username: 'ayse', photo_url: null, is_speaker: false, is_moderator: false };

function stageFor(raw: Record<string, unknown>, users: CHUser[]): CHUser[] {
  const parsed = parseRealtimeMessage(raw, ROOM);
  assert.equal(parsed.kind, 'stage', JSON.stringify(parsed));
  return applyStageEvent(users, parsed as Extract<typeof parsed, { kind: 'stage' }>);
}

test('real join_channel adds the user from user_profile', () => {
  const users = stageFor({ action: 'join_channel', channel: ROOM, user_profile: ayse }, []);
  assert.deepEqual(users.map((u) => [u.user_id, u.name, !!u.is_speaker]), [[501, 'Ayse', false]]);
});

test('real leave_channel and remove_from_channel remove by user_id', () => {
  const start: CHUser[] = [{ ...ayse }, { user_id: 7, name: 'Ali', username: 'ali', photo_url: null }];
  assert.deepEqual(stageFor({ action: 'leave_channel', channel: ROOM, user_id: 501 }, start).map((u) => u.user_id), [7]);
  assert.deepEqual(stageFor({ action: 'leave_channel', channel: ROOM, user_profile: { user_id: 7 } }, start).map((u) => u.user_id), [501]);
  assert.deepEqual(stageFor({ action: 'remove_from_channel', channel: ROOM, user_id: 7 }, start).map((u) => u.user_id), [501]);
});

test('real raise_hands / unraise_hands toggle the hand by id', () => {
  const raised = stageFor({ action: 'raise_hands', channel: ROOM, user_profile: ayse }, [{ ...ayse }]);
  assert.equal(raised[0].is_hand_raised, true);
  const lowered = stageFor({ action: 'unraise_hands', channel: ROOM, user_id: 501 }, raised);
  assert.equal(lowered[0].is_hand_raised, false);
});

test('real add_speaker / remove_speaker / make_moderator update roles by id', () => {
  const two: CHUser[] = [{ ...ayse, name: 'Same Name' }, { ...ayse, user_id: 502, name: 'Same Name' }];
  const added = stageFor({ action: 'add_speaker', channel: ROOM, user_profile: { user_id: 502 } }, two);
  assert.deepEqual(added.map((u) => !!u.is_speaker), [false, true], 'must match by id, not by name');
  const mod = stageFor({ action: 'make_moderator', channel: ROOM, user_id: 502 }, added);
  assert.equal(mod[1].is_moderator, true);
  const removed = stageFor({ action: 'remove_speaker', channel: ROOM, user_id: 502 }, mod);
  assert.deepEqual([removed[1].is_speaker, removed[1].is_moderator], [false, false]);
});

test('real invite_speaker and end_channel', () => {
  const invite = parseRealtimeMessage({ action: 'invite_speaker', channel: ROOM, from_user_id: 9, from_name: 'Host' }, ROOM);
  assert.equal(invite.kind, 'stage');
  assert.equal((invite as { type: string }).type, 'invite_to_speak');
  assert.equal(parseRealtimeMessage({ action: 'end_channel', channel: ROOM }, ROOM).kind, 'room_ended');
});

test('messages for another room are ignored', () => {
  assert.equal(parseRealtimeMessage({ action: 'end_channel', channel: 'otherRoom' }, ROOM).kind, 'ignored');
});

test('roomPubNubChannels matches the official clients', () => {
  assert.deepEqual(roomPubNubChannels(ROOM, 42, false), ['users.42', `channel_user.${ROOM}.42`, `channel_all.${ROOM}`]);
  assert.deepEqual(roomPubNubChannels(ROOM, 42, true).at(-1), `channel_speakers.${ROOM}`);
});
