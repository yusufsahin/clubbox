import assert from 'node:assert/strict';
import test from 'node:test';
import {
  nextSpeakingHold,
  SPEAKING_HOLD_MS,
  SPEAKING_THRESHOLD,
} from '../src/audio/speakingRings.ts';

test('nextSpeakingHold turns on above threshold', () => {
  const { next, changed } = nextSpeakingHold(new Map(), [{ uid: '1', level: SPEAKING_THRESHOLD + 0.01 }], 1000);
  assert.equal(next.get('1')?.speaking, true);
  assert.deepEqual(changed, [{ uid: '1', speaking: true }]);
});

test('nextSpeakingHold holds speaking for holdMs after dropping below threshold', () => {
  let state = new Map();
  ({ next: state } = nextSpeakingHold(state, [{ uid: '1', level: 0.5 }], 0));
  let changed: { uid: string; speaking: boolean }[] = [];
  ({ next: state, changed } = nextSpeakingHold(state, [{ uid: '1', level: 0 }], 100));
  assert.equal(state.get('1')?.speaking, true);
  assert.deepEqual(changed, []);
  ({ next: state, changed } = nextSpeakingHold(state, [{ uid: '1', level: 0 }], 100 + SPEAKING_HOLD_MS));
  assert.equal(state.get('1')?.speaking, false);
  assert.deepEqual(changed, [{ uid: '1', speaking: false }]);
});

test('nextSpeakingHold clears ring when uid leaves the sample list', () => {
  let state = new Map();
  ({ next: state } = nextSpeakingHold(state, [{ uid: '9', level: 0.9 }], 0));
  const { changed } = nextSpeakingHold(state, [], 50);
  assert.deepEqual(changed, [{ uid: '9', speaking: false }]);
});
