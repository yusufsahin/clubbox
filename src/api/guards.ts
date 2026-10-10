export type ApiErrorKind = 'auth' | 'permission' | 'unknown' | 'business' | 'timeout' | 'network';

export interface LiveFailure {
  kind: ApiErrorKind;
  message: string;
  expireSession: boolean;
}

export interface RoomSession {
  generation: number;
  inRoom: boolean;
  publishing: boolean;
  recording: boolean;
  inviteOpen: boolean;
}

export function emptyRoomSession(): RoomSession {
  return { generation: 0, inRoom: false, publishing: false, recording: false, inviteOpen: false };
}

export function beginJoin(session: RoomSession): { session: RoomSession; generation: number } {
  const generation = session.generation + 1;
  return {
    session: { ...session, generation, inRoom: false, publishing: false },
    generation,
  };
}

export function commitJoin(session: RoomSession, generation: number): RoomSession | null {
  if (session.generation !== generation) return null;
  return { ...session, inRoom: true, publishing: false, inviteOpen: false };
}

export function finishLeave(session: RoomSession): RoomSession {
  return {
    generation: session.generation + 1,
    inRoom: false,
    publishing: false,
    recording: false,
    inviteOpen: false,
  };
}

export function roleSyncDecision(failures: number, matches: boolean): 'reset' | 'sync' | 'give-up' {
  if (matches) return 'reset';
  if (failures >= 2) return 'give-up';
  return 'sync';
}

export function createSingleFlight() {
  let running = false;
  return {
    async run(task: () => Promise<void>): Promise<boolean> {
      if (running) return false;
      running = true;
      try {
        await task();
        return true;
      } finally {
        running = false;
      }
    },
  };
}

export function classifyHttpFailure(status: number, message: string): LiveFailure {
  if (status === 401) {
    return { kind: 'auth', message, expireSession: true };
  }
  if (status === 403) {
    const permission = /permission|not allowed|forbidden/i.test(message);
    return {
      kind: permission ? 'permission' : 'unknown',
      message: message || 'Forbidden',
      expireSession: false,
    };
  }
  return { kind: 'network', message, expireSession: false };
}

export function businessFailure(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as { success?: unknown; error_message?: unknown };
  if (record.success !== false) return null;
  return typeof record.error_message === 'string' && record.error_message.trim()
    ? record.error_message
    : 'Request failed';
}
