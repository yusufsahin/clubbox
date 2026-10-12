import assert from 'node:assert/strict';
import test from 'node:test';
import { applyRemoteMute, applySelfMute, chainLatestMute, muteFromAgoraEvent, overlayMuteStates } from '../src/api/remoteMute.ts';
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

const me: CHUser = {
  user_id: 42,
  name: 'Me',
  username: 'me',
  photo_url: null,
  is_speaker: true,
  is_muted: false,
};

test('applySelfMute sets my badge from the mic button', () => {
  const muted = applySelfMute([me], 42, true);
  assert.equal(muted[0].is_muted, true);
  assert.equal(me.is_muted, false);
  const again = applySelfMute(muted, 42, true);
  assert.equal(again, muted);
});

test('overlay keeps an Agora mute after a snapshot clears is_muted', () => {
  const states = new Map<number, boolean>([[501, true]]);
  const snapshot: CHUser[] = [{ ...ayse, is_muted: false }, { ...me, is_muted: false }];
  const overlaid = overlayMuteStates(snapshot, states);
  assert.equal(overlaid[0].is_muted, true);
  assert.equal(overlaid[1].is_muted, false);
  assert.equal(overlayMuteStates(overlaid, states), overlaid);
});

test('rapid mute toggles apply the last requested state', async () => {
  let desired = false;
  const applied: boolean[] = [];
  let release: (() => void) | null = null;
  let chain: Promise<void> = new Promise((resolve) => {
    release = resolve;
  });
  const apply = async (muted: boolean) => {
    applied.push(muted);
  };

  desired = true;
  chain = chainLatestMute(chain, () => desired, apply);
  desired = false;
  chain = chainLatestMute(chain, () => desired, apply);
  desired = true;
  chain = chainLatestMute(chain, () => desired, apply);

  assert.deepEqual(applied, []);
  release?.();
  await chain;
  assert.deepEqual(applied, [true, true, true]);
});
