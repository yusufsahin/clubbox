import assert from 'node:assert/strict';
import test from 'node:test';
import {
  agoraExtrasProfile,
  agoraMicProfile,
  agoraPublishTracks,
  extrasNeedRepublish,
  keepMicMuteOnRepublish,
} from '../src/audio/agoraPublishPlan.ts';

test('Agora publish list is mic plus extras, extras optional', () => {
  assert.deepEqual(agoraPublishTracks('mic', 'vb-cable'), ['mic', 'vb-cable']);
  assert.deepEqual(agoraPublishTracks('mic', null), ['mic']);
  assert.deepEqual(agoraPublishTracks(null, 'vb-cable'), ['vb-cable']);
});

test('music mode drops voice processing and uses stereo encoder', () => {
  assert.deepEqual(agoraMicProfile(false), {
    encoderConfig: 'speech_standard',
    AEC: true,
    ANS: true,
    AGC: true,
  });
  assert.deepEqual(agoraMicProfile(true), {
    encoderConfig: 'high_quality_stereo',
    AEC: false,
    ANS: false,
    AGC: false,
  });
  assert.equal(agoraExtrasProfile(false).encoderConfig, 'music_standard');
  assert.equal(agoraExtrasProfile(true).encoderConfig, 'high_quality_stereo');
  assert.equal(agoraExtrasProfile(true).AEC, false);
});

test('music-mode republish keeps a user mute; first join may clear it', () => {
  assert.equal(keepMicMuteOnRepublish(true, true), true);
  assert.equal(keepMicMuteOnRepublish(true, false), false);
  assert.equal(keepMicMuteOnRepublish(false, true), false);
});

test('extras republish when music mode changes on the same cable', () => {
  assert.equal(extrasNeedRepublish({
    haveTrack: true,
    deviceId: 'cable',
    publishedDeviceId: 'cable',
    musicMode: true,
    publishedMusicMode: false,
  }), true);
  assert.equal(extrasNeedRepublish({
    haveTrack: true,
    deviceId: 'cable',
    publishedDeviceId: 'cable',
    musicMode: true,
    publishedMusicMode: true,
  }), false);
});
