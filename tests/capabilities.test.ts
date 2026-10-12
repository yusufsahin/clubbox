import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canCall,
  evidenceOf,
  HOST_COMMUNITY_ENDPOINTS,
  MOBILE_HOST_ENDPOINTS,
  transportsOf,
} from '../src/api/capabilities.ts';
import { roomControlFlags } from '../src/api/roomControls.ts';

test('evidence ladder: observed/bundle always; mobile host needs link; other community needs experimental; unsupported never', () => {
  assert.equal(evidenceOf('me'), 'observed');
  assert.equal(evidenceOf('join_channel'), 'observed');
  assert.equal(evidenceOf('invite_speaker'), 'mobile-spike');
  assert.equal(evidenceOf('make_moderator'), 'mobile-spike');
  assert.equal(evidenceOf('get_events'), 'community');
  assert.equal(evidenceOf('get_social_club_members'), 'bundle');
  assert.equal(evidenceOf('delete_conversation'), 'bundle');
  assert.equal(evidenceOf('get_followers'), 'unsupported');
  assert.deepEqual(transportsOf('me'), ['web-session']);
  assert.deepEqual(transportsOf('mute_speaker'), ['mobile']);

  assert.equal(canCall('me', 'web-session'), true);
  assert.equal(canCall('join_channel', 'web-session'), true);
  assert.equal(canCall('join_channel', 'sandbox'), true);
  assert.equal(canCall('get_social_club_members', 'web-session'), true);

  // Mobile host tools need the web-session mobile link (Phase 27.0b).
  assert.equal(canCall('invite_speaker', 'web-session'), false);
  assert.equal(canCall('mute_speaker', 'web-session', { mobileLinked: true }), true);
  assert.equal(canCall('end_channel', 'web-session', { mobileLinked: true }), true);
  assert.equal(canCall('make_moderator', 'web-session', { mobileLinked: true }), true);
  assert.equal(canCall('make_moderator', 'sandbox'), true);

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

test('every remaining web host community endpoint is callable without Experimental actions', () => {
  for (const endpoint of HOST_COMMUNITY_ENDPOINTS) {
    assert.equal(
      canCall(endpoint, 'web-session', { experimentalActions: false }),
      true,
      endpoint,
    );
  }
});

test('mobile host endpoints stay callable when linked even after a prior unsupported mark', () => {
  assert.equal(
    canCall('end_channel', 'web-session', {
      experimentalActions: false,
      mobileLinked: true,
      unsupportedRoutes: { end_channel: '26.10.01' },
      appVersion: '26.10.01',
      evidenceOverrides: { end_channel: 'unsupported' },
    }),
    true,
  );
  assert.equal(
    canCall('mute_speaker', 'web-session', {
      mobileLinked: true,
      evidenceOverrides: { mute_speaker: 'unsupported' },
    }),
    true,
  );
});

test('room control flags expose mute/mod/invite/end when mobile link is on', () => {
  const flags = roomControlFlags(
    {
      can_mute_speakers: true,
      can_remove_speakers: true,
      can_invite: true,
      can_end_room: true,
    },
    (endpoint) => canCall(endpoint, 'web-session', {
      experimentalActions: false,
      mobileLinked: true,
    }),
  );
  assert.equal(flags.canMute, true);
  assert.equal(flags.canMakeModerator, true);
  assert.equal(flags.canMoveToAudience, true);
  assert.equal(flags.canBlock, true);
  assert.equal(flags.canInvite, true);
  assert.equal(flags.canEnd, true);
  assert.equal(flags.canMuteEveryone, true);
  assert.equal(flags.canPing, true);
  assert.equal(flags.canChangeVisibility, true);
  assert.equal(flags.canHandraise, true);
});

test('mobile host allow-list includes Phase 28.2–28.3 room tools', () => {
  assert.deepEqual([...MOBILE_HOST_ENDPOINTS].sort(), [
    'add_channel_link',
    'block_from_channel',
    'change_handraise_settings',
    'check_channel_link',
    'delete_channel_message',
    'disable_channel_messages',
    'disable_replay',
    'enable_channel_messages',
    'end_channel',
    'get_channel',
    'get_handraise_queue',
    'get_moderator_action_history',
    'get_suggested_speakers',
    'hide_channel',
    'invite_speaker',
    'invite_to_existing_channel',
    'make_moderator',
    'mute_speaker',
    'reject_speaker_invite',
    'remove_channel_link',
    'save_replay',
    'uninvite_speaker',
    'update_handraise_queue_setting',
    'update_nsfw_status',
  ]);
});
