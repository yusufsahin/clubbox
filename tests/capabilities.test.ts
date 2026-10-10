import assert from 'node:assert/strict';
import test from 'node:test';
import { canCall, evidenceOf, transportsOf } from '../src/api/capabilities.ts';

test('configured routes stay separate from observed proof', () => {
  assert.equal(evidenceOf('me'), 'observed');
  assert.equal(evidenceOf('join_channel'), 'configured-unverified');
  assert.equal(evidenceOf('get_channel'), 'unsupported');
  assert.equal(evidenceOf('unfollow'), 'unsupported');
  assert.deepEqual(transportsOf('me'), ['web-session']);
  assert.deepEqual(transportsOf('get_channel'), []);

  assert.equal(canCall('join_channel', 'sandbox'), true);
  assert.equal(evidenceOf('join_channel') === 'observed', false);

  assert.equal(canCall('me', 'web-session'), true);
  assert.equal(canCall('join_channel', 'web-session'), false);
  assert.equal(canCall('join_channel', 'web-session', { allowUnverified: true }), true);
  assert.equal(canCall('get_profile', 'web-session'), true);
  assert.equal(canCall('get_channel', 'web-session', { allowUnverified: true }), false);

  assert.equal(canCall('me', 'mobile-token'), false);
  assert.equal(canCall('join_channel', 'mobile-token', { allowUnverified: true }), false);
});
