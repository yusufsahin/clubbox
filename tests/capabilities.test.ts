import assert from 'node:assert/strict';
import test from 'node:test';
import { canCall, evidenceOf, transportsOf } from '../src/api/capabilities.ts';

test('evidence ladder: observed and bundle are callable; community needs experimental; unsupported and in-bundle never', () => {
  assert.equal(evidenceOf('me'), 'observed');
  assert.equal(evidenceOf('join_channel'), 'observed');
  assert.equal(evidenceOf('invite_speaker'), 'community');
  assert.equal(evidenceOf('get_social_club_members'), 'bundle');
  assert.equal(evidenceOf('delete_conversation'), 'bundle');
  assert.equal(evidenceOf('get_followers'), 'unsupported');
  assert.deepEqual(transportsOf('me'), ['web-session']);

  assert.equal(canCall('me', 'web-session'), true);
  assert.equal(canCall('join_channel', 'web-session'), true);
  assert.equal(canCall('join_channel', 'sandbox'), true);
  assert.equal(canCall('get_social_club_members', 'web-session'), true);

  assert.equal(canCall('invite_speaker', 'web-session'), false);
  assert.equal(canCall('invite_speaker', 'web-session', { experimentalActions: true }), true);

  assert.equal(canCall('get_followers', 'web-session', { experimentalActions: true }), false);
  assert.equal(canCall('get_social_club_members', 'web-session', { experimentalActions: true }), true);
  assert.equal(canCall('delete_conversation', 'web-session'), true);
});

test('local unsupported overrides for the current app version block calls', () => {
  assert.equal(
    canCall('set_channel_title', 'web-session', {
      unsupportedRoutes: { set_channel_title: '26.10.01' },
      appVersion: '26.10.01',
    }),
    false,
  );
  assert.equal(
    canCall('set_channel_title', 'web-session', {
      unsupportedRoutes: { set_channel_title: '26.10.01' },
      appVersion: '26.11.01',
    }),
    true,
  );
});

test('session-disabled endpoints stay blocked until restart', () => {
  assert.equal(
    canCall('emoji_reaction', 'web-session', { sessionDisabled: ['emoji_reaction'] }),
    false,
  );
});
