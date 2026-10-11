import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCreateChannelBody, privacyKeyForAudience } from '../src/api/createComposer.ts';
import { contractBodyKeys, getEndpoint } from '../src/api/registry.ts';

const CREATE_KEYS = [
  'is_chat_enabled', 'is_private', 'is_public_room', 'is_replay_enabled', 'is_social_mode',
  'privacy_level', 'source', 'topic', 'topic_ids', 'user_ids',
] as const;

test('create body keys match contract for each privacy level', () => {
  for (const audience of ['public', 'social', 'friends', 'friends-of-friends', 'closed'] as const) {
    const body = buildCreateChannelBody('Room title', { audience, replayEnabled: true, chatEnabled: true });
    assert.deepEqual(Object.keys(body).sort(), [...CREATE_KEYS].sort());
    assert.equal(body.privacy_level, privacyKeyForAudience(audience));
  }
});

test('contract registry builds create_channel for each privacy audience', () => {
  const entry = getEndpoint('create_channel');
  assert.ok(entry.buildRequest);
  for (const audience of ['public', 'social', 'friends', 'friends-of-friends', 'closed'] as const) {
    const body = entry.buildRequest!({
      topic: 'contract-room',
      audience,
      replayEnabled: true,
      chatEnabled: true,
    });
    assert.deepEqual(Object.keys(body).sort(), contractBodyKeys('create_channel'));
  }
});
