import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canOfferJoinStage,
  roomReactionEmojis,
  shouldWarnLastSpeaker,
  showModeratorCrowns,
  welcomeToastName,
} from '../src/api/roomServerFlags.ts';
import type { CHChannelDetail } from '../src/api/types.ts';

const base: CHChannelDetail = {
  channel_id: 1,
  channel: 'r1',
  topic: 'T',
  is_private: false,
  num_speakers: 1,
  num_all: 1,
  users: [{ user_id: 5, name: 'Solo', username: 'solo', photo_url: null, is_speaker: true }],
};

test('roomReactionEmojis uses join options or defaults', () => {
  assert.deepEqual(roomReactionEmojis(null).slice(0, 2), ['👏', '❤️']);
  assert.deepEqual(roomReactionEmojis({ ...base, emoji_reaction_options: ['✨', '💯'] }), ['✨', '💯']);
});

test('showModeratorCrowns respects hide_moderator_indicator', () => {
  assert.equal(showModeratorCrowns(base, false), true);
  assert.equal(showModeratorCrowns({ ...base, hide_moderator_indicator: true }, false), false);
  assert.equal(showModeratorCrowns({ ...base, hide_moderator_indicator: true }, true), true);
});

test('canOfferJoinStage allows open stage and rejoin gate', () => {
  assert.equal(canOfferJoinStage({
    channel: base,
    isSpeaker: false,
    openStage: true,
    becomeSpeakerSupported: true,
  }), true);
  assert.equal(canOfferJoinStage({
    channel: {
      ...base,
      user_capabilities: { stage_removed: true, can_rejoin_stage_directly: true },
    },
    isSpeaker: false,
    openStage: false,
    becomeSpeakerSupported: true,
  }), true);
  assert.equal(canOfferJoinStage({
    channel: base,
    isSpeaker: false,
    openStage: false,
    becomeSpeakerSupported: true,
  }), false);
});

test('shouldWarnLastSpeaker only when flag and sole speaker', () => {
  assert.equal(shouldWarnLastSpeaker({ ...base, show_last_speaker_warning: true }, 5), true);
  assert.equal(shouldWarnLastSpeaker({ ...base, show_last_speaker_warning: true }, 9), false);
  assert.equal(shouldWarnLastSpeaker(base, 5), false);
});

test('welcomeToastName reads name or username', () => {
  assert.equal(welcomeToastName({ name: 'Ayse' }), 'Ayse');
  assert.equal(welcomeToastName({ username: 'ayse' }), 'ayse');
  assert.equal(welcomeToastName(null), null);
});
