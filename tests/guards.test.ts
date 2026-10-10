import assert from 'node:assert/strict';
import test from 'node:test';
import {
  beginJoin,
  businessFailure,
  classifyHttpFailure,
  commitJoin,
  createSingleFlight,
  emptyRoomSession,
  finishLeave,
  localClipAllowed,
  nextBackoffMs,
  roleSyncDecision,
  roomAudience,
} from '../src/api/guards.ts';

test('HTTP 200 success false is a business error and 403 does not expire the session', () => {
  assert.equal(businessFailure({ success: false, error_message: 'Room is full' }), 'Room is full');
  assert.equal(businessFailure({ success: false }), 'Request failed');
  assert.equal(businessFailure({ success: true }), null);

  const permission = classifyHttpFailure(403, 'You do not have permission');
  assert.equal(permission.kind, 'permission');
  assert.equal(permission.expireSession, false);

  const unknown = classifyHttpFailure(403, 'nope');
  assert.equal(unknown.kind, 'unknown');
  assert.equal(unknown.expireSession, false);

  const auth = classifyHttpFailure(401, 'Unauthorized');
  assert.equal(auth.kind, 'auth');
  assert.equal(auth.expireSession, true);
});

test('429 and high-usage responses back off instead of looking like a network error', () => {
  const limited = classifyHttpFailure(429, 'slow down');
  assert.equal(limited.kind, 'rate-limit');
  assert.equal(limited.expireSession, false);

  const usage = classifyHttpFailure(200, 'high usage error');
  assert.equal(usage.kind, 'rate-limit');
  assert.equal(classifyHttpFailure(200, 'Too many requests right now').kind, 'rate-limit');
  assert.equal(classifyHttpFailure(200, 'rate limit reached').kind, 'rate-limit');
  assert.equal(classifyHttpFailure(500, 'Room is full').kind, 'network');

  assert.equal(nextBackoffMs(0), 60_000);
  assert.equal(nextBackoffMs(60_000), 120_000);
  assert.equal(nextBackoffMs(120_000), 240_000);
  assert.equal(nextBackoffMs(16 * 60_000), 30 * 60_000);
  assert.equal(nextBackoffMs(30 * 60_000), 30 * 60_000);
});

test('local clips follow the public-room audience, not the old private flag', () => {
  assert.equal(roomAudience({ privacy_settings: { type: 'house' } }), 'house');
  assert.equal(roomAudience({ privacy_settings: { type: 'friends_of_friends' } }), 'friends-of-friends');
  assert.equal(roomAudience({ privacy_settings: { type: 'public' } }), 'public');
  assert.equal(roomAudience({}), 'unknown');

  const allowed = {
    allowLocalRecording: true,
    replayEnabled: true,
    hostClipsEnabled: true,
    audience: 'public' as const,
  };
  assert.equal(localClipAllowed(allowed), true);
  assert.equal(localClipAllowed({ ...allowed, allowLocalRecording: false }), false);
  assert.equal(localClipAllowed({ ...allowed, replayEnabled: false }), false);
  assert.equal(localClipAllowed({ ...allowed, hostClipsEnabled: false }), false);
  assert.equal(localClipAllowed({ ...allowed, audience: 'house' }), false);
  assert.equal(localClipAllowed({ ...allowed, audience: 'friends' }), false);
});

test('an older join cannot replace the room left by a newer action', async () => {
  let session = emptyRoomSession();
  const first = beginJoin(session);
  session = first.session;
  const second = beginJoin(session);
  session = second.session;
  assert.equal(commitJoin(session, first.generation), null);
  const committed = commitJoin(session, second.generation);
  assert.equal(committed?.inRoom, true);

  let left = { generation: 4, inRoom: true, publishing: true, recording: true, inviteOpen: true };
  try {
    throw new Error('leave failed');
  } catch {
    left = finishLeave(left);
  }
  assert.equal(left.inRoom, false);
  assert.equal(left.publishing, false);
  assert.equal(left.recording, false);
  assert.equal(left.inviteOpen, false);
  assert.equal(commitJoin(left, 4), null);

  const flight = createSingleFlight();
  let release = () => {};
  const firstPoll = flight.run(() => new Promise<void>((resolve) => {
    release = resolve;
  }));
  assert.equal(await flight.run(async () => {}), false);
  release();
  assert.equal(await firstPoll, true);

  assert.equal(roleSyncDecision(0, true), 'reset');
  assert.equal(roleSyncDecision(0, false), 'sync');
  assert.equal(roleSyncDecision(1, false), 'sync');
  assert.equal(roleSyncDecision(2, false), 'give-up');
});
