import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateAudioCheck,
  LOW_BITRATE_WARN_MS,
  nextLowBitrateWatch,
  sendBitrateFromLocalStats,
  stereoFromChannelCount,
  targetSendBitrateKbps,
} from '../src/audio/sendQuality.ts';

test('targetSendBitrateKbps matches publish levels', () => {
  assert.equal(targetSendBitrateKbps('normal'), 18);
  assert.equal(targetSendBitrateKbps('high'), 128);
  assert.equal(targetSendBitrateKbps('music'), 128);
});

test('nextLowBitrateWatch warns after 10s below 60% of target', () => {
  const floor = targetSendBitrateKbps('music') * 0.6;
  let watch = nextLowBitrateWatch(null, floor - 1, 'music', 1_000);
  assert.equal(watch.warn, false);
  assert.equal(watch.belowSinceMs, 1_000);
  watch = nextLowBitrateWatch(watch.belowSinceMs, floor - 1, 'music', 1_000 + LOW_BITRATE_WARN_MS);
  assert.equal(watch.warn, true);
  watch = nextLowBitrateWatch(watch.belowSinceMs, floor + 10, 'music', 20_000);
  assert.deepEqual(watch, { belowSinceMs: null, warn: false });
});

test('sendBitrateFromLocalStats reads flat and map shapes', () => {
  assert.equal(sendBitrateFromLocalStats({ sendBitrate: 64000 }), 64000);
  assert.equal(sendBitrateFromLocalStats({ a: { sendBitrate: 1000 }, b: { sendBitrate: 5000 } }), 5000);
  assert.equal(sendBitrateFromLocalStats(null), 0);
});

test('stereoFromChannelCount', () => {
  assert.equal(stereoFromChannelCount(2), true);
  assert.equal(stereoFromChannelCount(1), false);
  assert.equal(stereoFromChannelCount(null), null);
});

test('evaluateAudioCheck detects clip, low, and music suggestion', () => {
  const clip = evaluateAudioCheck([{ micLevel: 0.99, extrasLevel: 0 }], {
    quality: 'normal',
    externalActive: true,
  });
  assert.equal(clip.clipping, true);
  assert.equal(clip.suggestMusic, true);

  const low = evaluateAudioCheck(
    Array.from({ length: 5 }, () => ({ micLevel: 0.01, extrasLevel: 0 })),
    { quality: 'music', externalActive: false },
  );
  assert.equal(low.tooLow, true);
  assert.equal(low.suggestRaiseInput, true);
  assert.equal(low.suggestMusic, false);

  const musicOk = evaluateAudioCheck([{ micLevel: 0.3, extrasLevel: 0.2 }], {
    quality: 'music',
    externalActive: true,
    capture: {
      channelCount: 2,
      sampleRate: 48000,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  assert.equal(musicOk.musicProfileOk, true);
  assert.match(musicOk.captureLine, /2ch/);
  assert.match(musicOk.captureLine, /AEC=off/);
});
