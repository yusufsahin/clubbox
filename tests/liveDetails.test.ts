import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLiveDetails } from '../src/api/liveDetails.ts';
import type { CHChannelDetail } from '../src/api/types.ts';

function base(partial: Partial<CHChannelDetail> = {}): CHChannelDetail {
  return {
    channel_id: 1,
    channel: 'abc123',
    topic: 'Test room',
    is_private: false,
    num_speakers: 2,
    num_all: 10,
    users: [],
    ...partial,
  };
}

test('buildLiveDetails returns null without a channel', () => {
  assert.equal(buildLiveDetails(null), null);
  assert.equal(buildLiveDetails({ ...base(), channel: '' }), null);
});

test('buildLiveDetails hides rows for missing fields', () => {
  const model = buildLiveDetails(base({
    is_replay_enabled: true,
    is_chat_enabled: false,
    num_shares: undefined,
    num_clips: undefined,
    language: undefined,
  }));
  assert.ok(model);
  assert.equal(model!.liveRows.some((r) => r.key === 'shares'), false);
  assert.equal(model!.liveRows.some((r) => r.key === 'clips'), false);
  assert.equal(model!.roomRows.some((r) => r.key === 'language'), false);
  assert.equal(model!.roomRows.find((r) => r.key === 'title')?.value, 'Test room');
  assert.equal(model!.stateRows.find((r) => r.key === 'replay')?.value, 'on');
  assert.equal(model!.stateRows.find((r) => r.key === 'chat')?.value, 'off');
  assert.equal(model!.audioRows.length, 0);
  assert.equal(model!.moderationNoteKey, 'hostToolsAppOnly');
});

test('buildLiveDetails prefers live cumulative over channel num_ever', () => {
  const model = buildLiveDetails(base({ num_ever: 5, num_shares: 3 }), { numEver: 99 });
  assert.ok(model);
  assert.equal(model!.liveRows.find((r) => r.key === 'cumulative')?.value, '99');
  assert.equal(model!.liveRows.find((r) => r.key === 'shares')?.value, '3');
});

test('buildLiveDetails lists only true can_* capabilities', () => {
  const model = buildLiveDetails(base({
    user_capabilities: {
      can_end_room: true,
      can_invite: false,
      can_mute_speakers: true,
      stage_removed: true as unknown as boolean,
    },
  }));
  assert.ok(model);
  assert.deepEqual(
    model!.capabilityRows.map((r) => r.value).sort(),
    ['end_room', 'mute_speakers'],
  );
  assert.equal(model!.serverRows.find((r) => r.key === 'stage_removed')?.value, 'on');
});

test('buildLiveDetails uses handraise_queue_options label when present', () => {
  const model = buildLiveDetails(base({
    handraise_queue_setting: 2,
    handraise_queue_options: [
      { value: 0, label: 'Open' },
      { value: 2, label: 'Everyone' },
    ],
  }));
  assert.equal(model!.stateRows.find((r) => r.key === 'handraise')?.value, 'Everyone');
});

test('buildLiveDetails me role and audio rows when provided', () => {
  const model = buildLiveDetails(base({
    users: [
      { user_id: 9, name: 'Me', username: 'me', photo_url: null, is_speaker: true, is_moderator: true },
    ],
  }), {
    myUserId: 9,
    audio: {
      qualityLevel: 'music',
      sendBitrateKbps: 128,
      stereo: true,
      networkTone: 'good',
    },
  });
  assert.ok(model);
  assert.equal(model!.meRows.find((r) => r.key === 'role')?.value, 'moderator');
  assert.equal(model!.audioRows.find((r) => r.key === 'quality')?.value, 'music');
  assert.equal(model!.audioRows.find((r) => r.key === 'bitrate')?.value, '128 kbps');
  assert.equal(model!.audioRows.find((r) => r.key === 'stereo')?.value, 'stereo');
  assert.equal(model!.audioRows.find((r) => r.key === 'network')?.value, 'good');
});

test('buildLiveDetails shows VB-Cable check summary when provided', () => {
  const model = buildLiveDetails(base(), {
    audio: { vbCableCheckSummary: '4/5 pass' },
  });
  assert.ok(model);
  assert.equal(model!.audioRows.find((r) => r.key === 'vb_cable')?.value, '4/5 pass');
});

test('buildLiveDetails server flag rows when present', () => {
  const model = buildLiveDetails(base({
    show_last_speaker_warning: true,
    hide_moderator_indicator: false,
    emoji_reaction_options: ['👍', '🎉'],
    welcome_for_user_profile: { name: 'Ayse', user_id: 1 },
    user_capabilities: { can_rejoin_stage_directly: true },
  }));
  assert.ok(model);
  assert.equal(model!.serverRows.find((r) => r.key === 'last_speaker_warning')?.value, 'on');
  assert.equal(model!.serverRows.find((r) => r.key === 'hide_crowns')?.value, 'off');
  assert.equal(model!.serverRows.find((r) => r.key === 'emoji_options')?.value, '👍 🎉');
  assert.equal(model!.serverRows.find((r) => r.key === 'welcome')?.value, 'Ayse');
  assert.equal(model!.serverRows.find((r) => r.key === 'can_rejoin')?.value, 'on');
});
