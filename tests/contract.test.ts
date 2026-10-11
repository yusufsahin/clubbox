import assert from 'node:assert/strict';
import test from 'node:test';
import { ClubhouseApiClient } from '../src/api/client.ts';
import { FakeTransport } from '../features/support/fakeTransport.ts';

type Contract = {
  name: string;
  endpoint: string;
  method: string;
  path: string;
  keys: string[];
  call: (client: ClubhouseApiClient) => Promise<unknown>;
};

/** Documented bodies from PRD §2 + docs/api/bundle-callsites.md (web_listener_* excluded). */
const CONTRACTS: Contract[] = [
  {
    name: 'create_channel',
    endpoint: 'create_channel',
    method: 'POST',
    path: '/web_api/create_channel',
    keys: [
      'is_chat_enabled', 'is_public_room', 'is_replay_enabled', 'is_private', 'is_social_mode',
      'user_ids', 'topic_ids', 'source', 'topic', 'privacy_level',
    ],
    call: (client) => client.createChannel('contract-room', {
      audience: 'friends-of-friends',
      replayEnabled: false,
      chatEnabled: false,
    }),
  },
  {
    name: 'join_channel',
    endpoint: 'join_channel',
    method: 'POST',
    path: '/web_api/join_channel',
    keys: ['channel'],
    call: (client) => client.joinChannel('abc123'),
  },
  {
    name: 'leave_channel',
    endpoint: 'leave_channel',
    method: 'POST',
    path: '/web_api/leave_channel',
    keys: ['channel'],
    call: (client) => client.leaveChannel('abc123'),
  },
  {
    name: 'active_ping',
    endpoint: 'active_ping',
    method: 'POST',
    path: '/web_api/active_ping',
    keys: ['channel'],
    call: (client) => client.activePing('abc123'),
  },
  {
    name: 'audience_reply',
    endpoint: 'audience_reply',
    method: 'POST',
    path: '/web_api/audience_reply',
    keys: ['channel', 'raise_hands', 'unraise_hands'],
    call: (client) => client.raiseHand('abc123', true),
  },
  {
    name: 'become_speaker',
    endpoint: 'accept_speaker_invite',
    method: 'POST',
    path: '/web_api/become_speaker',
    keys: ['channel'],
    call: (client) => client.becomeSpeaker('abc123'),
  },
  {
    name: 'send_channel_message',
    endpoint: 'send_channel_message',
    method: 'POST',
    path: '/web_api/send_channel_message',
    keys: ['channel', 'message'],
    call: (client) => client.sendChannelMessage('abc123', 'hello'),
  },
  {
    name: 'get_channel_messages',
    endpoint: 'get_channel_messages',
    method: 'GET',
    path: '/web_api/get_channel_messages',
    keys: ['channel'],
    call: (client) => client.getChannelMessages('abc123'),
  },
  {
    name: 'emoji_reaction',
    endpoint: 'emoji_reaction',
    method: 'POST',
    path: '/web_api/emoji_reaction',
    keys: ['channel', 'emoji'],
    call: (client) => client.emojiReaction('abc123', '🔥'),
  },
  {
    name: 'set_channel_title',
    endpoint: 'set_channel_title',
    method: 'POST',
    path: '/web_api/set_channel_title',
    keys: ['channel', 'title'],
    call: (client) => client.setChannelTitle('abc123', 'New title'),
  },
  {
    name: 'invite_speaker',
    endpoint: 'invite_speaker',
    method: 'POST',
    path: '/web_api/invite_speaker',
    keys: ['channel', 'user_id'],
    call: (client) => client.inviteSpeaker('abc123', 7),
  },
  {
    name: 'uninvite_speaker',
    endpoint: 'uninvite_speaker',
    method: 'POST',
    path: '/web_api/uninvite_speaker',
    keys: ['channel', 'user_id'],
    call: (client) => client.uninviteSpeaker('abc123', 7),
  },
  {
    name: 'mute_speaker',
    endpoint: 'mute_speaker',
    method: 'POST',
    path: '/web_api/mute_speaker',
    keys: ['channel', 'user_id'],
    call: (client) => client.muteSpeaker('abc123', 7),
  },
  {
    name: 'make_moderator',
    endpoint: 'make_moderator',
    method: 'POST',
    path: '/web_api/make_moderator',
    keys: ['channel', 'user_id'],
    call: (client) => client.makeModerator('abc123', 7),
  },
  {
    name: 'block_from_channel',
    endpoint: 'block_from_channel',
    method: 'POST',
    path: '/web_api/block_from_channel',
    keys: ['channel', 'user_id'],
    call: (client) => client.blockFromChannel('abc123', 7),
  },
  {
    name: 'reject_speaker_invite',
    endpoint: 'reject_speaker_invite',
    method: 'POST',
    path: '/web_api/reject_speaker_invite',
    keys: ['channel', 'user_id'],
    call: (client) => client.rejectSpeakerInvite('abc123', 7),
  },
  {
    name: 'invite_to_existing_channel',
    endpoint: 'invite_to_existing_channel',
    method: 'POST',
    path: '/web_api/invite_to_existing_channel',
    keys: ['channel', 'user_id'],
    call: (client) => client.inviteToExistingChannel('abc123', 7),
  },
  {
    name: 'end_channel',
    endpoint: 'end_channel',
    method: 'POST',
    path: '/web_api/end_channel',
    keys: ['channel', 'channel_id'],
    call: (client) => client.endChannel('abc123'),
  },
  {
    name: 'make_channel_public',
    endpoint: 'make_channel_public',
    method: 'POST',
    path: '/web_api/make_channel_public',
    keys: ['channel', 'channel_id'],
    call: (client) => client.makeChannelPublic('abc123'),
  },
  {
    name: 'make_channel_social',
    endpoint: 'make_channel_social',
    method: 'POST',
    path: '/web_api/make_channel_social',
    keys: ['channel', 'channel_id'],
    call: (client) => client.makeChannelSocial('abc123'),
  },
  {
    name: 'change_handraise_settings',
    endpoint: 'change_handraise_settings',
    method: 'POST',
    path: '/web_api/change_handraise_settings',
    keys: ['channel', 'is_enabled', 'handraise_permission'],
    call: (client) => client.changeHandraiseSettings('abc123', {
      isEnabled: true,
      handraisePermission: 'friends_of_speakers',
    }),
  },
  {
    name: 'hide_channel',
    endpoint: 'hide_channel',
    method: 'POST',
    path: '/web_api/hide_channel',
    keys: ['channel', 'hide'],
    call: (client) => client.hideChannel('abc123', true),
  },
  {
    name: 'get_online_friends',
    endpoint: 'get_online_friends',
    method: 'POST',
    path: '/web_api/get_online_friends',
    keys: [],
    call: (client) => client.getOnlineFriends(),
  },
  {
    name: 'get_notifications',
    endpoint: 'get_notifications',
    method: 'GET',
    path: '/web_api/get_notifications',
    keys: ['page_size', 'page'],
    call: (client) => client.getNotifications(),
  },
  {
    name: 'get_events',
    endpoint: 'get_events',
    method: 'GET',
    path: '/web_api/get_events',
    keys: ['is_filtered', 'page_size', 'page'],
    call: (client) => client.getEvents(),
  },
];

function clientWith(transport: FakeTransport): ClubhouseApiClient {
  return new ClubhouseApiClient({
    useSandbox: false,
    webSession: true,
    userId: 42,
    allowUnverified: true,
    transport,
  });
}

for (const contract of CONTRACTS) {
  test(`contract: ${contract.name} sends ${contract.method} ${contract.path} with documented keys`, async () => {
    const transport = new FakeTransport();
    const client = clientWith(transport);
    await contract.call(client);
    const recorded = transport.requests.find((req) => req.endpoint === contract.endpoint);
    assert.ok(recorded, `expected a request for ${contract.endpoint}`);
    assert.equal(recorded.path, contract.path);
    assert.equal(recorded.method, contract.method);
    assert.deepEqual(Object.keys(recorded.body ?? {}).sort(), [...contract.keys].sort());
  });
}
