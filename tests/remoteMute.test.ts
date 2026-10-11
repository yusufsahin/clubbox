import assert from 'node:assert/strict';
import test from 'node:test';
import { applyRemoteMute, muteFromAgoraEvent } from '../src/api/remoteMute.ts';
import type { CHUser } from '../src/api/types.ts';

const ayse: CHUser = {
  user_id: 501,
  name: 'Ayse',
  username: 'ayse',
  photo_url: null,
  is_speaker: true,
  is_muted: false,
};

test('muteFromAgoraEvent maps user-info-updated mute/unmute', () => {
  assert.equal(muteFromAgoraEvent('user-info-updated', 'mute-audio'), true);
  assert.equal(muteFromAgoraEvent('user-info-updated', 'unmute-audio'), false);
  assert.equal(muteFromAgoraEvent('user-info-updated', 'mute-video'), null);
});

test('muteFromAgoraEvent maps publish/unpublish audio', () => {
  assert.equal(muteFromAgoraEvent('user-published'), false);
  assert.equal(muteFromAgoraEvent('user-unpublished'), true);
});

test('applyRemoteMute sets is_muted by Agora uid = user_id', () => {
  const muted = applyRemoteMute([ayse], 501, true);
  assert.equal(muted[0].is_muted, true);
  const unmuted = applyRemoteMute(muted, '501', false);
  assert.equal(unmuted[0].is_muted, false);
});

test('applyRemoteMute leaves other users alone', () => {
  const other: CHUser = { ...ayse, user_id: 99, name: 'Ali', is_muted: false };
  const next = applyRemoteMute([ayse, other], 501, true);
  assert.equal(next[0].is_muted, true);
  assert.equal(next[1].is_muted, false);
});
