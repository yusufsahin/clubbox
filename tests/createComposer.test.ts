import assert from 'node:assert/strict';
import test from 'node:test';
import {
  automaticSpeakerApprovalBodyKeyDocumented,
  buildCreateChannelBody,
  createDefaults,
  showAutomaticSpeakerApproval,
  showTopicPicker,
  topicListEndpointDocumented,
  type CreateChannelTargets,
} from '../src/api/createComposer.ts';

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

test('DX-1 topic picker stays hidden until a topic list endpoint is bound', () => {
  const targets: CreateChannelTargets = {
    channel_capabilities: { public: { is_topics_available: true } },
  };
  assert.equal(topicListEndpointDocumented({}), false);
  assert.equal(showTopicPicker(targets, 'public', {}), false);
  assert.equal(
    showTopicPicker(targets, 'public', { get_topics: { path: '/web_api/get_topics' } }),
    true,
  );
  assert.deepEqual(buildCreateChannelBody('Morning', { topicIds: [7, 8] }).topic_ids, [7, 8]);
});

test('DX-3 auto-approve toggle stays hidden until a create body key is documented', () => {
  const targets: CreateChannelTargets = {
    channel_capabilities: {
      friend_of_friend: { is_automatic_speaker_approval_available: true },
    },
  };
  assert.equal(automaticSpeakerApprovalBodyKeyDocumented([]), false);
  assert.equal(showAutomaticSpeakerApproval(targets, 'friends-of-friends'), false);
  assert.equal(automaticSpeakerApprovalBodyKeyDocumented(['is_automatic_speaker_approval']), true);
});
