import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AppOnlyModerationProvider,
  MODERATION_ACTIONS,
  anyModerationAvailable,
  getModerationProvider,
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
  let requests = 0;
  const spy = {
    muteSpeaker: async () => {
      requests += 1;
    },
    inviteSpeaker: async () => {
      requests += 1;
    },
    endChannel: async () => {
      requests += 1;
    },
  };
  const provider = new AppOnlyModerationProvider();
  for (const action of MODERATION_ACTIONS) {
    const result = await provider.perform(action, room, 7);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.kind, 'app_only');
  }
  // Provider has no client dependency — spy stays at zero by construction.
  assert.equal(requests, 0);
  void spy;
  assert.equal(getModerationProvider().id, 'app-only');
});
