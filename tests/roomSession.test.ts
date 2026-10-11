import assert from 'node:assert/strict';
import test from 'node:test';
import { ClubhouseApiClient } from '../src/api/client.ts';
import { FakeTransport } from '../features/support/fakeTransport.ts';
import { FakeAgora } from '../features/support/fakeAgora.ts';
import { RoomSessionController } from '../src/api/roomSession.ts';
import { createChannelBody } from '../src/api/roomActions.ts';

function harness() {
  const transport = new FakeTransport();
  const agora = new FakeAgora();
  const client = new ClubhouseApiClient({
    useSandbox: false,
    webSession: true,
    userId: 42,
    experimentalActions: true,
    transport,
  });
  let nextTimer = 1;
  const timers = new Map<number, () => void>();
  const session = new RoomSessionController({
    client,
    agora,
    myUserId: 42,
    setInterval: (fn) => {
      const id = nextTimer++;
      timers.set(id, fn);
      return id;
    },
    clearInterval: (id) => {
      timers.delete(id);
    },
  });
  return { transport, agora, client, session, timers };
}

test('friends-of-friends create body allows replays and chat on with documented keys', () => {
  const body = createChannelBody('Morning show', {
    audience: 'friends-of-friends',
    replayEnabled: true,
    chatEnabled: true,
  });
  assert.ok(body);
  assert.equal(body.is_replay_enabled, true);
  assert.equal(body.is_chat_enabled, true);
  assert.equal(body.privacy_level, 'friend_of_friend');
  assert.deepEqual(
    Object.keys(body).sort(),
    [
      'is_chat_enabled', 'is_private', 'is_public_room', 'is_replay_enabled', 'is_social_mode',
      'privacy_level', 'source', 'topic', 'topic_ids', 'user_ids',
    ].sort(),
  );
});

test('join from hallway sends join_channel and joins Agora as audience', async () => {
  const { transport, agora, session } = harness();
  const result = await session.joinFromHallway('abc123');
  assert.equal(result.ok, true);
  assert.equal(transport.requests[0]?.endpoint, 'join_channel');
  assert.equal(agora.lastJoin()?.role, 'audience');
  assert.ok(session.presenceActive);
  assert.ok(session.realtimeConnected);
});

test('join 404 marks unsupported and returns the hallway message', async () => {
  const { transport, client, session } = harness();
  transport.willAnswer('join_channel', 404, 1);
  const result = await session.joinFromHallway('abc123');
  assert.equal(result.ok, false);
  assert.equal(result.message, 'Joining rooms is not available on Clubhouse web yet');
  assert.equal(client.effectiveEvidence('join_channel'), 'unsupported');
});

test('presence pings every 30s and keeps realtime while hidden', async () => {
  const { transport, session } = harness();
  await session.joinFromHallway('abc123');
  transport.clearRequests();
  session.tickPresence();
  assert.equal(transport.requestsNamed('active_ping').length, 1);
  session.setHidden(true);
  session.tickPresence();
  assert.equal(transport.requestsNamed('active_ping').length, 2);
  assert.equal(session.realtimeConnected, true);
  const nonPing = transport.requests.filter((req) => req.endpoint !== 'active_ping' && req.endpoint !== 'join_channel');
  assert.equal(nonPing.length, 0);
});

test('leave quietly leaves Agora, stops presence, and saves recording', async () => {
  const { agora, session } = harness();
  await session.joinFromHallway('abc123');
  session.recording = true;
  await session.leaveQuietly();
  assert.equal(agora.left, true);
  assert.equal(session.presenceActive, false);
  assert.equal(session.recording, false);
  assert.equal(session.realtimeConnected, false);
});

test('host create joins Agora as host without join_channel', async () => {
  const { transport, agora, session } = harness();
  const result = await session.startFriendsOfFriendsRoom('Morning show', {
    replayEnabled: true,
    chatEnabled: true,
  });
  assert.equal(result.ok, true);
  assert.equal(transport.requestsNamed('join_channel').length, 0);
  assert.equal(transport.requestsNamed('create_channel').length, 1);
  assert.equal((transport.requestsNamed('create_channel')[0].body as { is_replay_enabled: boolean }).is_replay_enabled, true);
  assert.equal(agora.lastJoin()?.role, 'host');
});

test('first experimental invite asks for confirmation', async () => {
  const { transport, client, session } = harness();
  await session.startFriendsOfFriendsRoom('Morning show', { replayEnabled: true, chatEnabled: true });
  await client.updateConfig({ experimentalActions: true, confirmedExperimentalRoutes: [] });
  const first = await session.inviteToStage(7);
  assert.equal(first.needsConfirmation, true);
  assert.equal(transport.requestsNamed('invite_speaker').length, 0);
  client.confirmExperimental('invite_speaker');
  const second = await session.inviteToStage(7);
  assert.equal(second.ok, true);
  assert.equal(transport.requestsNamed('invite_speaker').length, 1);
});

test('log out leaves the room, clears identity flag, and stops timers', async () => {
  const { session } = harness();
  await session.joinFromHallway('abc123');
  await session.logOut();
  assert.equal(session.signedIn, false);
  assert.equal(session.presenceActive, false);
  assert.equal(session.cookiesCleared, true);
});
