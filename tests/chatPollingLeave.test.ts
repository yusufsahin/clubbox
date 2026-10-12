import assert from 'node:assert/strict';
import test from 'node:test';
import { beginJoin, commitJoin, finishLeave, type RoomSession } from '../src/api/guards.ts';

/** Mirrors syncChatPolling's leave-safe gate (roomSession.inRoom). */
function chatPollingAllowed(input: {
  hasChannel: boolean;
  inRoom: boolean;
  pollsPaused: boolean;
  chatOpen: boolean;
  chatEnabled: boolean;
  shouldPollChat: boolean;
}): boolean {
  return input.hasChannel
    && input.inRoom
    && !input.pollsPaused
    && input.chatOpen
    && input.chatEnabled
    && input.shouldPollChat;
}

test('finishLeave clears inRoom so PubNub reconnect cannot restart chat poll', () => {
  let session: RoomSession = { generation: 0, inRoom: false, publishing: false, recording: false, inviteOpen: false };
  const begun = beginJoin(session);
  session = begun.session;
  const committed = commitJoin(session, begun.generation);
  assert.ok(committed);
  session = committed;
  assert.equal(session.inRoom, true);

  session = finishLeave(session);
  assert.equal(session.inRoom, false);

  assert.equal(
    chatPollingAllowed({
      hasChannel: true,
      inRoom: session.inRoom,
      pollsPaused: false,
      chatOpen: true,
      chatEnabled: true,
      shouldPollChat: true,
    }),
    false,
  );
});

test('chat poll stays armed while still in the room', () => {
  assert.equal(
    chatPollingAllowed({
      hasChannel: true,
      inRoom: true,
      pollsPaused: false,
      chatOpen: true,
      chatEnabled: true,
      shouldPollChat: true,
    }),
    true,
  );
});
