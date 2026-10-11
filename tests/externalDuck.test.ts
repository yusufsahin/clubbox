import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_DUCK_DB,
  DUCK_ATTACK_MS,
  DUCK_RELEASE_MS,
  duckGainFromDb,
  initialDuckState,
  stepDuckEnvelope,
  systemAudioCaptureAllowed,
} from '../src/audio/externalDuck.ts';
import { externalInputConstraints } from '../src/audio/externalConstraints.ts';
import { planExternalRouting } from '../src/audio/externalRouting.ts';

test('duckGainFromDb maps -12 dB to about half linear gain', () => {
  const g = duckGainFromDb(DEFAULT_DUCK_DB);
  assert.ok(g > 0.24 && g < 0.26);
  assert.equal(duckGainFromDb(0), 1);
  assert.equal(duckGainFromDb(-24), duckGainFromDb(-30));
});

test('attack reaches duck level within 100 ms of speaking', () => {
  let state = initialDuckState(0);
  state = stepDuckEnvelope(state, 0, true, -12);
  state = stepDuckEnvelope(state, DUCK_ATTACK_MS, true, -12);
  const target = duckGainFromDb(-12);
  assert.ok(Math.abs(state.multiplier - target) < 0.02, `got ${state.multiplier}`);
  assert.ok(DUCK_ATTACK_MS <= 100);
});

test('release returns to open gain about 500 ms after silence', () => {
  let state = initialDuckState(0);
  state = stepDuckEnvelope(state, 0, true, -12);
  state = stepDuckEnvelope(state, DUCK_ATTACK_MS, true, -12);
  state = stepDuckEnvelope(state, DUCK_ATTACK_MS, false, -12);
  state = stepDuckEnvelope(state, DUCK_ATTACK_MS + DUCK_RELEASE_MS, false, -12);
  assert.ok(Math.abs(state.multiplier - 1) < 0.02, `got ${state.multiplier}`);
  assert.ok(DUCK_RELEASE_MS >= 450 && DUCK_RELEASE_MS <= 550);
});

test('system audio is only allowed when Clubbox output differs from the default', () => {
  assert.equal(systemAudioCaptureAllowed('headphones-1', 'speakers-default'), true);
  assert.equal(systemAudioCaptureAllowed('speakers-default', 'speakers-default'), false);
  assert.equal(systemAudioCaptureAllowed('default', 'speakers-default'), false);
  assert.equal(systemAudioCaptureAllowed('', 'speakers-default'), false);
});

test('external input constraints disable voice processing and prefer stereo', () => {
  const c = externalInputConstraints('vb-cable');
  assert.equal(c.echoCancellation, false);
  assert.equal(c.noiseSuppression, false);
  assert.equal(c.autoGainControl, false);
  assert.equal(c.channelCount, 2);
  assert.deepEqual(c.deviceId, { exact: 'vb-cable' });
});

test('external routing mixes to broadcast + record, not monitor by default', () => {
  const plan = planExternalRouting({ active: true, muted: false, monitor: false, volume: 0.7 });
  assert.equal(plan.toBroadcast, true);
  assert.equal(plan.toRecord, true);
  assert.equal(plan.toMonitor, false);
  assert.equal(plan.silencedByMicMute, false);
  assert.equal(plan.openGain, 0.7);
});

test('mic mute does not silence external open gain in the plan', () => {
  const plan = planExternalRouting({ active: true, muted: false, monitor: true, volume: 1 });
  assert.equal(plan.silencedByMicMute, false);
  assert.equal(plan.toMonitor, true);
  assert.equal(plan.openGain, 1);
});

test('external mute zeros open gain without dropping broadcast wiring', () => {
  const plan = planExternalRouting({ active: true, muted: true, monitor: false, volume: 1 });
  assert.equal(plan.toBroadcast, true);
  assert.equal(plan.openGain, 0);
});
