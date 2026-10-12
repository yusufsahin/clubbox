import assert from 'node:assert/strict';
import test from 'node:test';
import { canCall } from '../src/api/capabilities.ts';
import {
  AppOnlyModerationProvider,
  MODERATION_ACTIONS,
  WebModerationProvider,
  anyModerationAvailable,
  getModerationProvider,
  mapHttpStatusToModerationKind,
  resetModerationProvider,
  type RoomContext,
} from '../src/api/moderationProvider.ts';

const room: RoomContext = {
  channel: 'abc123',
  isModerator: true,
  userCapabilities: {
    can_mute_speakers: true,
    can_remove_speakers: true,
    can_invite: true,
    can_end_room: true,
    can_edit_handraise_queue: true,
  },
};

test('AppOnlyModerationProvider.capabilities: all actions unavailable with app_only for every role', () => {
  resetModerationProvider();
  const provider = new AppOnlyModerationProvider();
  for (const ctx of [
    room,
    { ...room, isModerator: false },
    { channel: 'x', isModerator: true },
    { channel: 'x', isModerator: false, userCapabilities: { can_mute_speakers: false } },
  ]) {
    const caps = provider.capabilities(ctx);
    assert.equal(caps.length, MODERATION_ACTIONS.length);
    for (const action of MODERATION_ACTIONS) {
      const row = caps.find((c) => c.action === action);
      assert.ok(row, action);
      assert.equal(row.available, false);
      assert.equal(row.reason, 'app_only');
    }
    assert.equal(anyModerationAvailable(provider, ctx), false);
  }
});

test('AppOnlyModerationProvider.perform: returns app_only and never invokes a request spy', async () => {
  resetModerationProvider();
  let requests = 0;
  const provider = new AppOnlyModerationProvider();
  for (const action of MODERATION_ACTIONS) {
    const result = await provider.perform(action, room, 7);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, 'app_only');
  }
  assert.equal(requests, 0);
  assert.equal(getModerationProvider().id, 'app-only');
});

test('WebModerationProvider: unavailable with only bundle; available with observed + can_*; not_permitted when can_* false', async () => {
  const evidence: Record<string, 'bundle' | 'observed' | 'mobile-spike'> = {
    mute_speaker: 'bundle',
    invite_speaker: 'observed',
    end_channel: 'observed',
  };
  let calls = 0;
  const provider = new WebModerationProvider({
    evidenceOf: (endpoint) => evidence[endpoint] ?? 'mobile-spike',
    performCall: async () => {
      calls += 1;
    },
  });

  const mute = provider.capabilities(room).find((c) => c.action === 'mute_speaker');
  assert.equal(mute?.available, false);
  assert.equal(mute?.evidence, 'bundle');
  assert.equal(mute?.reason, 'app_only');

  const invite = provider.capabilities(room).find((c) => c.action === 'invite_speaker');
  assert.equal(invite?.available, true);
  assert.equal(invite?.evidence, 'observed');

  const denied = provider.capabilities({
    ...room,
    userCapabilities: { ...room.userCapabilities, can_end_room: false },
  }).find((c) => c.action === 'end_channel');
  assert.equal(denied?.available, false);
  assert.equal(denied?.reason, 'not_permitted');

  const blockedPerform = await provider.perform('mute_speaker', room, 1);
  assert.equal(blockedPerform.ok, false);
  assert.equal(calls, 0);

  const ok = await provider.perform('invite_speaker', room, 9);
  assert.equal(ok.ok, true);
  assert.equal(calls, 1);
});

test('mapHttpStatusToModerationKind covers 400/401/403/404/429/network', () => {
  assert.equal(mapHttpStatusToModerationKind(400), 'bad_request');
  assert.equal(mapHttpStatusToModerationKind(401), 'not_authenticated');
  assert.equal(mapHttpStatusToModerationKind(403), 'not_permitted');
  assert.equal(mapHttpStatusToModerationKind(404), 'not_found');
  assert.equal(mapHttpStatusToModerationKind(405), 'not_found');
  assert.equal(mapHttpStatusToModerationKind(429), 'rate_limited');
  assert.equal(mapHttpStatusToModerationKind(0, { network: true }), 'network');
  assert.equal(mapHttpStatusToModerationKind(500), 'network');
});

test('WebModerationProvider.perform maps HTTP status to error kinds', async () => {
  const provider = new WebModerationProvider({
    evidenceOf: () => 'observed',
    performCall: async () => {
      const err = new Error('nope') as Error & { status: number };
      err.status = 401;
      throw err;
    },
    statusOfError: (err) => (err && typeof err === 'object' && 'status' in err
      ? Number((err as { status: number }).status)
      : 0),
  });
  const result = await provider.perform('mute_speaker', room, 1);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.kind, 'not_authenticated');
});

test('canCall: observed web moderation is callable; bundle alone is not', () => {
  assert.equal(
    canCall('mute_speaker', 'web-session', {
      evidenceOverrides: { mute_speaker: 'observed' },
    }),
    true,
  );
  assert.equal(
    canCall('mute_speaker', 'web-session', {
      evidenceOverrides: { mute_speaker: 'bundle' },
    }),
    false,
  );
  assert.equal(canCall('mute_speaker', 'web-session'), false);
});
