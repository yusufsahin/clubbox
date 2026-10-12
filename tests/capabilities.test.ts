import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canCall,
  evidenceOf,
  HOST_COMMUNITY_ENDPOINTS,
  transportsOf,
} from '../src/api/capabilities.ts';
import { roomControlFlags } from '../src/api/roomControls.ts';

test('evidence ladder: observed/bundle always; host community always; other community needs experimental; unsupported never', () => {
  assert.equal(evidenceOf('me'), 'observed');
  assert.equal(evidenceOf('join_channel'), 'observed');
  assert.equal(evidenceOf('invite_speaker'), 'community');
  assert.equal(evidenceOf('get_events'), 'community');
  assert.equal(evidenceOf('get_social_club_members'), 'bundle');
  assert.equal(evidenceOf('delete_conversation'), 'bundle');
  assert.equal(evidenceOf('get_followers'), 'unsupported');
  assert.deepEqual(transportsOf('me'), ['web-session']);

  assert.equal(canCall('me', 'web-session'), true);
  assert.equal(canCall('join_channel', 'web-session'), true);
  assert.equal(canCall('join_channel', 'sandbox'), true);
  assert.equal(canCall('get_social_club_members', 'web-session'), true);

  // Core host tools work without Experimental actions.
  assert.equal(canCall('invite_speaker', 'web-session'), true);
  assert.equal(canCall('mute_speaker', 'web-session'), true);
  assert.equal(canCall('make_moderator', 'web-session'), true);
  assert.equal(canCall('end_channel', 'web-session'), true);

  // Speculative community reads still need the toggle.
  assert.equal(canCall('get_events', 'web-session'), false);
  assert.equal(canCall('get_events', 'web-session', { experimentalActions: true }), true);

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

test('every host community endpoint is callable without Experimental actions', () => {
  for (const endpoint of HOST_COMMUNITY_ENDPOINTS) {
    assert.equal(
      canCall(endpoint, 'web-session', { experimentalActions: false }),
      true,
      endpoint,
    );
  }
});

test('host community endpoints stay callable after a prior unsupported mark', () => {
  assert.equal(
    canCall('end_channel', 'web-session', {
      experimentalActions: false,
      unsupportedRoutes: { end_channel: '26.10.01' },
      appVersion: '26.10.01',
      evidenceOverrides: { end_channel: 'unsupported' },
    }),
    true,
  );
  assert.equal(
    canCall('mute_speaker', 'web-session', {
      evidenceOverrides: { mute_speaker: 'unsupported' },
    }),
    true,
  );
});

test('room control flags expose mute/mod/invite/end with experimental off', () => {
  const flags = roomControlFlags(
    {
      can_mute_speakers: true,
      can_remove_speakers: true,
      can_invite: true,
      can_end_room: true,
    },
    (endpoint) => canCall(endpoint, 'web-session', { experimentalActions: false }),
  );
  assert.equal(flags.canMute, true);
  assert.equal(flags.canMod, true);
  assert.equal(flags.canMoveToAudience, true);
  assert.equal(flags.canBlock, true);
  assert.equal(flags.canInvite, true);
  assert.equal(flags.canEnd, true);
  assert.equal(flags.canMuteEveryone, true);
  assert.equal(flags.canPing, true);
  assert.equal(flags.canChangeVisibility, true);
  assert.equal(flags.canHandraise, true);
});
