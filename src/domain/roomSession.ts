/** Pure room lifecycle state machine (DESIGN §4). */

export type RoomPhase =
  | 'Idle'
  | 'Joining'
  | 'Listening'
  | 'HandRaised'
  | 'Invited'
  | 'Speaking'
  | 'Hosting'
  | 'Leaving';

export type RoomRole = 'audience' | 'speaker' | 'moderator' | 'host';

export type RoomSessionState = {
  phase: RoomPhase;
  generation: number;
  /** Set while phase is Joining — stale JOIN_OK must match this. */
  pendingGeneration: number | null;
  channelId: string | null;
  role: RoomRole | null;
  token: string | null;
  handRaised: boolean;
  inviteOpen: boolean;
  recording: boolean;
  pingActive: boolean;
  pubnubSubscribed: boolean;
  agoraJoined: boolean;
  agoraRole: 'audience' | 'host' | null;
};

export type RoomEvent =
  | { type: 'CREATE_START' }
  | { type: 'JOIN_START' }
  | { type: 'CREATE_OK'; channelId: string; token: string; generation: number }
  | { type: 'JOIN_OK'; channelId: string; token: string; generation: number }
  | { type: 'JOIN_FAIL'; generation: number }
  | { type: 'RAISE' }
  | { type: 'LOWER' }
  | { type: 'INVITED' }
  | { type: 'ACCEPT' }
  | { type: 'DECLINE'; userId: number }
  | { type: 'ROLE_CHANGED'; role: RoomRole; token?: string }
  | { type: 'LEAVE' }
  | { type: 'ENDED' }
  | { type: 'AUTH_EXPIRED' }
  | { type: 'TICK' }
  | { type: 'LEAVE_COMPLETE' };

export type ApiEffectCall =
  | { kind: 'join_channel'; channelId: string }
  | { kind: 'leave_channel'; channelId: string }
  | { kind: 'active_ping'; channelId: string }
  | { kind: 'audience_reply'; channelId: string; raise: boolean }
  | { kind: 'become_speaker'; channelId: string }
  | { kind: 'reject_speaker_invite'; channelId: string; userId: number }
  | { kind: 'create_channel'; title: string }
  | { kind: 'end_channel'; channelId: string };

export type RoomEffect =
  | { type: 'agoraJoin'; role: 'audience' | 'host'; token: string }
  | { type: 'agoraRole'; role: 'audience' | 'host'; token: string }
  | { type: 'agoraLeave' }
  | { type: 'pubnubSubscribe'; channelId: string }
  | { type: 'pubnubUnsubscribe' }
  | { type: 'pingStart'; channelId: string }
  | { type: 'pingStop' }
  | { type: 'recordingStopSave' }
  | { type: 'api'; call: ApiEffectCall };

export type RoomTransition = {
  state: RoomSessionState;
  effects: RoomEffect[];
};

export function initialRoomSessionState(): RoomSessionState {
  return {
    phase: 'Idle',
    generation: 0,
    pendingGeneration: null,
    channelId: null,
    role: null,
    token: null,
    handRaised: false,
    inviteOpen: false,
    recording: false,
    pingActive: false,
    pubnubSubscribed: false,
    agoraJoined: false,
    agoraRole: null,
  };
}

/** Join-generation guards (formerly guards.ts room session helpers). */
export function beginJoinGeneration(state: RoomSessionState): { state: RoomSessionState; generation: number } {
  const generation = state.generation + 1;
  return {
    state: {
      ...state,
      generation,
      pendingGeneration: generation,
      phase: 'Joining',
      channelId: null,
      role: null,
      token: null,
      handRaised: false,
      inviteOpen: false,
      agoraJoined: false,
      agoraRole: null,
    },
    generation,
  };
}

export function commitJoinGeneration(
  state: RoomSessionState,
  generation: number,
  channelId: string,
  token: string,
  role: RoomRole,
): RoomSessionState | null {
  if (state.pendingGeneration !== generation || state.generation !== generation) return null;
  return {
    ...state,
    pendingGeneration: null,
    phase: role === 'host' ? 'Hosting' : 'Listening',
    channelId,
    token,
    role,
    handRaised: false,
    inviteOpen: false,
  };
}

export function finishLeaveGeneration(state: RoomSessionState): RoomSessionState {
  return {
    ...initialRoomSessionState(),
    generation: state.generation + 1,
  };
}

function leaveEffects(state: RoomSessionState): RoomEffect[] {
  const effects: RoomEffect[] = [
    { type: 'pingStop' },
    { type: 'pubnubUnsubscribe' },
    { type: 'agoraLeave' },
  ];
  if (state.recording) effects.push({ type: 'recordingStopSave' });
  if (state.channelId) {
    effects.push({ type: 'api', call: { kind: 'leave_channel', channelId: state.channelId } });
  }
  return effects;
}

function enterRoomEffects(
  channelId: string,
  token: string,
  role: 'audience' | 'host',
): RoomEffect[] {
  return [
    { type: 'agoraJoin', role, token },
    { type: 'pubnubSubscribe', channelId },
    { type: 'pingStart', channelId },
  ];
}

export function nextRoomSession(state: RoomSessionState, event: RoomEvent): RoomTransition {
  const noEffects = (s: RoomSessionState): RoomTransition => ({ state: s, effects: [] });

  switch (event.type) {
    case 'CREATE_START': {
      if (state.phase !== 'Idle') return noEffects(state);
      const begun = beginJoinGeneration(state);
      return { state: begun.state, effects: [] };
    }
    case 'JOIN_START': {
      if (state.phase !== 'Idle') return noEffects(state);
      const begun = beginJoinGeneration(state);
      return { state: begun.state, effects: [] };
    }
    case 'CREATE_OK': {
      if (state.phase !== 'Joining' || state.pendingGeneration !== event.generation) {
        return noEffects(state);
      }
      const committed = commitJoinGeneration(state, event.generation, event.channelId, event.token, 'host');
      if (!committed) return noEffects(state);
      return {
        state: {
          ...committed,
          agoraJoined: true,
          agoraRole: 'host',
          pingActive: true,
          pubnubSubscribed: true,
        },
        effects: enterRoomEffects(event.channelId, event.token, 'host'),
      };
    }
    case 'JOIN_OK': {
      if (state.phase !== 'Joining' || state.pendingGeneration !== event.generation) {
        return noEffects(state);
      }
      const committed = commitJoinGeneration(state, event.generation, event.channelId, event.token, 'audience');
      if (!committed) return noEffects(state);
      return {
        state: {
          ...committed,
          agoraJoined: true,
          agoraRole: 'audience',
          pingActive: true,
          pubnubSubscribed: true,
        },
        effects: enterRoomEffects(event.channelId, event.token, 'audience'),
      };
    }
    case 'JOIN_FAIL': {
      if (state.pendingGeneration !== event.generation) return noEffects(state);
      return {
        state: finishLeaveGeneration(state),
        effects: [],
      };
    }
    case 'RAISE': {
      if (state.phase !== 'Listening' || !state.channelId) return noEffects(state);
      return {
        state: { ...state, phase: 'HandRaised', handRaised: true },
        effects: [{ type: 'api', call: { kind: 'audience_reply', channelId: state.channelId, raise: true } }],
      };
    }
    case 'LOWER': {
      if (!state.channelId || state.phase === 'Idle' || state.phase === 'Joining' || state.phase === 'Leaving') {
        return noEffects(state);
      }
      return {
        state: { ...state, phase: 'Listening', handRaised: false },
        effects: [{ type: 'api', call: { kind: 'audience_reply', channelId: state.channelId, raise: false } }],
      };
    }
    case 'INVITED': {
      if (state.phase !== 'Listening' && state.phase !== 'HandRaised') return noEffects(state);
      return {
        state: { ...state, phase: 'Invited', inviteOpen: true },
        effects: [],
      };
    }
    case 'ACCEPT': {
      if (state.phase !== 'Invited' || !state.channelId) return noEffects(state);
      const token = event.type === 'ACCEPT' ? state.token ?? '' : '';
      return {
        state: {
          ...state,
          phase: 'Speaking',
          role: 'speaker',
          inviteOpen: false,
          handRaised: false,
          agoraRole: 'host',
        },
        effects: [
          { type: 'api', call: { kind: 'become_speaker', channelId: state.channelId } },
          { type: 'agoraRole', role: 'host', token },
        ],
      };
    }
    case 'DECLINE': {
      if (state.phase !== 'Invited' || !state.channelId) return noEffects(state);
      return {
        state: {
          ...state,
          phase: state.handRaised ? 'HandRaised' : 'Listening',
          inviteOpen: false,
        },
        effects: [{
          type: 'api',
          call: { kind: 'reject_speaker_invite', channelId: state.channelId, userId: event.userId },
        }],
      };
    }
    case 'ROLE_CHANGED': {
      if (state.phase === 'Idle' || state.phase === 'Joining' || state.phase === 'Leaving') {
        return noEffects(state);
      }
      const token = event.token ?? state.token ?? '';
      const phase: RoomPhase =
        event.role === 'host' ? 'Hosting'
          : event.role === 'speaker' ? 'Speaking'
            : state.handRaised ? 'HandRaised' : 'Listening';
      const agoraRole: 'audience' | 'host' =
        event.role === 'host' || event.role === 'speaker' || event.role === 'moderator' ? 'host' : 'audience';
      const effects: RoomEffect[] = [];
      if (agoraRole !== state.agoraRole) {
        effects.push({ type: 'agoraRole', role: agoraRole, token });
      }
      return {
        state: { ...state, phase, role: event.role, agoraRole },
        effects,
      };
    }
    case 'LEAVE':
    case 'ENDED':
    case 'AUTH_EXPIRED': {
      if (state.phase === 'Idle') return noEffects(state);
      return {
        state: { ...state, phase: 'Leaving', pendingGeneration: null },
        effects: leaveEffects(state),
      };
    }
    case 'LEAVE_COMPLETE': {
      return { state: finishLeaveGeneration(state), effects: [] };
    }
    case 'TICK': {
      if (!state.pingActive || !state.channelId || state.phase === 'Idle' || state.phase === 'Leaving') {
        return noEffects(state);
      }
      return {
        state,
        effects: [{ type: 'api', call: { kind: 'active_ping', channelId: state.channelId } }],
      };
    }
    default:
      return noEffects(state);
  }
}
