import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getAiNoisePreference,
  setAiNoisePreference,
  shouldEnableAiDenoiser,
} from '../src/audio/aiDenoiser.ts';

test('shouldEnableAiDenoiser requires preference and speech mode', () => {
  assert.equal(shouldEnableAiDenoiser(false, false), false);
  assert.equal(shouldEnableAiDenoiser(true, false), true);
  assert.equal(shouldEnableAiDenoiser(true, true), false);
  assert.equal(shouldEnableAiDenoiser(false, true), false);
});

test('setAiNoisePreference updates preference flag', () => {
  setAiNoisePreference(true);
  assert.equal(getAiNoisePreference(), true);
  setAiNoisePreference(false);
  assert.equal(getAiNoisePreference(), false);
});
