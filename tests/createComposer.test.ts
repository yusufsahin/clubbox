import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaults, type CreateChannelTargets } from '../src/api/createComposer.ts';

test('createDefaults turns replays on when the capability says they are available (Help Center default)', () => {
  const targets: CreateChannelTargets = {
    channel_capabilities: {
      public: { is_replay_available: true },
      friend_of_friend: { is_replay_available: false },
    },
    channel_chat_default_on: true,
  };
  assert.deepEqual(createDefaults(targets, 'public'), { replayEnabled: true, chatEnabled: true });
  assert.deepEqual(createDefaults(targets, 'friends-of-friends'), { replayEnabled: false, chatEnabled: true });
});
