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
  roleSyncDecision,
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
