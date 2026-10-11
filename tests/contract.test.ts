import assert from 'node:assert/strict';
import test from 'node:test';
import { ClubhouseApiClient } from '../src/api/client.ts';
import { contractBodyKeys, CONTRACT_ENDPOINTS, getEndpoint } from '../src/api/registry.ts';
import { FakeTransport } from '../features/support/fakeTransport.ts';

type ContractCall = {
  /** Display name in test output. */
  name: string;
  endpoint: (typeof CONTRACT_ENDPOINTS)[number];
  call: (client: ClubhouseApiClient) => Promise<unknown>;
};

const CONTRACT_CALLS: ContractCall[] = [
  {
    name: 'create_channel',
    endpoint: 'create_channel',
    call: (client) => client.createChannel('contract-room', {
      audience: 'friends-of-friends',
      replayEnabled: false,
      chatEnabled: false,
    }),
  },
  { name: 'join_channel', endpoint: 'join_channel', call: (client) => client.joinChannel('abc123') },
  { name: 'leave_channel', endpoint: 'leave_channel', call: (client) => client.leaveChannel('abc123') },
  { name: 'active_ping', endpoint: 'active_ping', call: (client) => client.activePing('abc123') },
  { name: 'audience_reply', endpoint: 'audience_reply', call: (client) => client.raiseHand('abc123', true) },
  {
    name: 'become_speaker',
    endpoint: 'become_speaker',
    call: (client) => client.becomeSpeaker('abc123'),
  },
  {
    name: 'send_channel_message',
    endpoint: 'send_channel_message',
    call: (client) => client.sendChannelMessage('abc123', 'hello'),
  },
  {
    name: 'get_channel_messages',
    endpoint: 'get_channel_messages',
    call: (client) => client.getChannelMessages('abc123'),
  },
  { name: 'emoji_reaction', endpoint: 'emoji_reaction', call: (client) => client.emojiReaction('abc123', '🔥') },
  {
    name: 'set_channel_title',
    endpoint: 'set_channel_title',
    call: (client) => client.setChannelTitle('abc123', 'New title'),
  },
  { name: 'invite_speaker', endpoint: 'invite_speaker', call: (client) => client.inviteSpeaker('abc123', 7) },
  { name: 'uninvite_speaker', endpoint: 'uninvite_speaker', call: (client) => client.uninviteSpeaker('abc123', 7) },
  { name: 'mute_speaker', endpoint: 'mute_speaker', call: (client) => client.muteSpeaker('abc123', 7) },
  { name: 'make_moderator', endpoint: 'make_moderator', call: (client) => client.makeModerator('abc123', 7) },
  {
    name: 'block_from_channel',
    endpoint: 'block_from_channel',
    call: (client) => client.blockFromChannel('abc123', 7),
  },
  {
    name: 'reject_speaker_invite',
    endpoint: 'reject_speaker_invite',
    call: (client) => client.rejectSpeakerInvite('abc123', 7),
  },
  {
    name: 'invite_to_existing_channel',
    endpoint: 'invite_to_existing_channel',
    call: (client) => client.inviteToExistingChannel('abc123', 7),
  },
  { name: 'end_channel', endpoint: 'end_channel', call: (client) => client.endChannel('abc123') },
  {
    name: 'make_channel_public',
    endpoint: 'make_channel_public',
    call: (client) => client.makeChannelPublic('abc123'),
  },
  {
    name: 'make_channel_social',
    endpoint: 'make_channel_social',
    call: (client) => client.makeChannelSocial('abc123'),
  },
  {
    name: 'change_handraise_settings',
    endpoint: 'change_handraise_settings',
    call: (client) => client.changeHandraiseSettings('abc123', {
      isEnabled: true,
      handraisePermission: 2,
    }),
  },
  { name: 'hide_channel', endpoint: 'hide_channel', call: (client) => client.hideChannel('abc123', true) },
  { name: 'get_online_friends', endpoint: 'get_online_friends', call: (client) => client.getOnlineFriends() },
  { name: 'get_notifications', endpoint: 'get_notifications', call: (client) => client.getNotifications() },
  { name: 'get_events', endpoint: 'get_events', call: (client) => client.getEvents() },
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

for (const contract of CONTRACT_CALLS) {
  test(`contract: ${contract.name} sends ${getEndpoint(contract.endpoint).method} ${getEndpoint(contract.endpoint).path} with documented keys`, async () => {
    const entry = getEndpoint(contract.endpoint);
    const transport = new FakeTransport();
    const client = clientWith(transport);
    await contract.call(client);
    const recorded = transport.requests.find((req) => req.endpoint === contract.endpoint);
    assert.ok(recorded, `expected a request for ${contract.endpoint}`);
    assert.equal(recorded.path, entry.path);
    assert.equal(recorded.method, entry.method);
    assert.deepEqual(Object.keys(recorded.body ?? {}).sort(), contractBodyKeys(contract.endpoint));
  });
}
