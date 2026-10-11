import assert from 'node:assert/strict';
import test from 'node:test';
import {
  beginJoinGeneration,
  commitJoinGeneration,
  finishLeaveGeneration,
  initialRoomSessionState,
  nextRoomSession,
  type RoomEvent,
  type RoomPhase,
  type RoomSessionState,
} from '../src/domain/roomSession.ts';

function apply(state: RoomSessionState, event: RoomEvent) {
  return nextRoomSession(state, event);
}

test('stale join ok is ignored when generation advanced', () => {
  let state = initialRoomSessionState();
  const first = beginJoinGeneration(state);
  state = first.state;
  const second = beginJoinGeneration(state);
  state = second.state;
  const stale = apply(state, {
    type: 'JOIN_OK',
    channelId: 'old',
    token: 't1',
    generation: first.generation,
  });
  assert.equal(stale.state.channelId, null);
  assert.equal(stale.effects.length, 0);
  const ok = apply(state, {
    type: 'JOIN_OK',
    channelId: 'new',
    token: 't2',
    generation: second.generation,
  });
  assert.equal(ok.state.channelId, 'new');
  assert.ok(ok.effects.some((e) => e.type === 'agoraJoin'));
});

test('leave always emits stop effects even if api fails later', () => {
  let state: RoomSessionState = {
    ...initialRoomSessionState(),
    phase: 'Listening',
    generation: 2,
    channelId: 'abc',
    role: 'audience',
    token: 'tok',
    recording: true,
    pingActive: true,
    pubnubSubscribed: true,
    agoraJoined: true,
    agoraRole: 'audience',
  };
  const left = apply(state, { type: 'LEAVE' });
  assert.equal(left.state.phase, 'Leaving');
  assert.ok(left.effects.some((e) => e.type === 'pingStop'));
  assert.ok(left.effects.some((e) => e.type === 'recordingStopSave'));
  assert.ok(left.effects.some((e) => e.type === 'agoraLeave'));
  const done = apply(left.state, { type: 'LEAVE_COMPLETE' });
  assert.equal(done.state.phase, 'Idle');
  assert.equal(done.state.generation, 3);
});

type Case = {
  name: string;
  from: RoomPhase;
  event: RoomEvent;
  to: RoomPhase | 'same';
  effectTypes?: string[];
};

const listening: RoomSessionState = {
  ...initialRoomSessionState(),
  phase: 'Listening',
  generation: 1,
  channelId: 'ch1',
  role: 'audience',
  token: 'tok',
  agoraJoined: true,
  agoraRole: 'audience',
  pingActive: true,
};

const cases: Case[] = [
  { name: 'raise hand', from: 'Listening', event: { type: 'RAISE' }, to: 'HandRaised', effectTypes: ['api'] },
  { name: 'lower hand', from: 'HandRaised', event: { type: 'LOWER' }, to: 'Listening', effectTypes: ['api'] },
  { name: 'invite', from: 'Listening', event: { type: 'INVITED' }, to: 'Invited' },
  { name: 'accept invite', from: 'Invited', event: { type: 'ACCEPT' }, to: 'Speaking', effectTypes: ['api', 'agoraRole'] },
  {
    name: 'decline invite',
    from: 'Invited',
    event: { type: 'DECLINE', userId: 9 },
    to: 'Listening',
    effectTypes: ['api'],
  },
  { name: 'room ended', from: 'Hosting', event: { type: 'ENDED' }, to: 'Leaving', effectTypes: ['pingStop'] },
  { name: 'auth expired', from: 'Speaking', event: { type: 'AUTH_EXPIRED' }, to: 'Leaving' },
  { name: 'tick pings', from: 'Listening', event: { type: 'TICK' }, to: 'same', effectTypes: ['api'] },
];

for (const row of cases) {
  test(`transition: ${row.name}`, () => {
    let state = { ...listening, phase: row.from };
    if (row.from === 'HandRaised') state = { ...state, handRaised: true };
    if (row.from === 'Invited') state = { ...state, inviteOpen: true };
    if (row.from === 'Hosting') state = { ...state, phase: 'Hosting', role: 'host', agoraRole: 'host' };
    if (row.from === 'Speaking') state = { ...state, phase: 'Speaking', role: 'speaker', agoraRole: 'host' };
    const result = apply(state, row.event);
    if (row.to === 'same') {
      assert.equal(result.state.phase, state.phase);
    } else {
      assert.equal(result.state.phase, row.to);
    }
    if (row.effectTypes) {
      for (const kind of row.effectTypes) {
        assert.ok(result.effects.some((e) => e.type === kind || (kind === 'api' && e.type === 'api')), row.name);
      }
    }
  });
}

test('commitJoinGeneration rejects wrong generation after leave', () => {
  let compact = initialRoomSessionState();
  const begun = beginJoinGeneration(compact);
  compact = finishLeaveGeneration(begun.state);
  assert.equal(commitJoinGeneration(compact, begun.generation, 'x', 't', 'audience'), null);
});
