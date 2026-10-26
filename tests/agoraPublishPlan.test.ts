import assert from 'node:assert/strict';
import test from 'node:test';
import { agoraPublishTracks } from '../src/audio/agoraPublishPlan.ts';

test('Agora publish list is mic plus extras, extras optional', () => {
  assert.deepEqual(agoraPublishTracks('mic', 'vb-cable'), ['mic', 'vb-cable']);
  assert.deepEqual(agoraPublishTracks('mic', null), ['mic']);
  assert.deepEqual(agoraPublishTracks(null, 'vb-cable'), ['vb-cable']);
});
