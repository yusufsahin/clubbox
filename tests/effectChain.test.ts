import assert from 'node:assert/strict';
import test from 'node:test';
import { panForUid } from '../src/audio/effectChain.ts';
import {
  applyEffect,
  broadcastUsesEffect,
  defaultVoiceEffectState,
  monitorUsesEffect,
  pickEffect,
  startPreview,
} from '../src/audio/voiceEffects.ts';

test('panForUid is stable and within stereo range', () => {
  const a = panForUid('42');
  const b = panForUid('42');
  const c = panForUid('99');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(a >= -0.85 && a <= 0.85);
  assert.ok(c >= -0.85 && c <= 0.85);
});

test('voice effect preview stays off the broadcast path until Apply', () => {
  let state = defaultVoiceEffectState();
  state = pickEffect(state, 'radio');
  state = startPreview(state);
  assert.equal(monitorUsesEffect(state), 'radio');
  assert.equal(broadcastUsesEffect(state), 'none');
  state = applyEffect(state);
  assert.equal(broadcastUsesEffect(state), 'radio');
  assert.equal(monitorUsesEffect(state), 'radio');
});
