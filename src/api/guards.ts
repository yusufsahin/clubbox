export type ApiErrorKind = 'auth' | 'permission' | 'unknown' | 'business' | 'timeout' | 'network' | 'rate-limit';

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

const RATE_LIMIT_STEP_MS = 60 * 1000;
const RATE_LIMIT_MAX_MS = 30 * 60 * 1000;

export function isRateLimitMessage(message: string): boolean {
  return /high usage|too many|rate limit/i.test(message);
}

/** 1 minute, then 2, 4, … capped at 30 minutes. */
export function nextBackoffMs(previousMs: number): number {
  const step = previousMs > 0 ? previousMs * 2 : RATE_LIMIT_STEP_MS;
  return Math.min(step, RATE_LIMIT_MAX_MS);
}

export function classifyHttpFailure(status: number, message: string): LiveFailure {
  if (status === 401) {
    return { kind: 'auth', message, expireSession: true };
  }
  if (status === 429 || isRateLimitMessage(message)) {
    return { kind: 'rate-limit', message: message || 'Too many requests', expireSession: false };
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

export type RoomAudience = 'public' | 'friends' | 'friends-of-friends' | 'house' | 'unknown';

const PUBLIC_AUDIENCES = new Set(['public', 'interest', 'open']);
const FRIENDS_AUDIENCES = new Set(['friends', 'friend']);
const FRIENDS_OF_FRIENDS_AUDIENCES = new Set(['friends_of_friends', 'friend_of_friend', 'social']);
const HOUSE_AUDIENCES = new Set(['house', 'social_club']);

export function roomAudience(channel: {
  privacy_settings?: { type?: unknown } | null;
}): RoomAudience {
  const raw = channel.privacy_settings?.type;
  const type = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (PUBLIC_AUDIENCES.has(type)) return 'public';
  if (FRIENDS_OF_FRIENDS_AUDIENCES.has(type)) return 'friends-of-friends';
  if (FRIENDS_AUDIENCES.has(type)) return 'friends';
  if (HOUSE_AUDIENCES.has(type)) return 'house';
  return 'unknown';
}

/** Local clips need an explicit opt-in, replays, a host clips flag, and a public room. */
export function localClipAllowed(input: {
  allowLocalRecording: boolean;
  replayEnabled: boolean;
  hostClipsEnabled: boolean;
  audience: RoomAudience;
}): boolean {
  return input.allowLocalRecording
    && input.replayEnabled
    && input.hostClipsEnabled
    && input.audience === 'public';
}

export function businessFailure(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as { success?: unknown; error_message?: unknown };
  if (record.success !== false) return null;
  return typeof record.error_message === 'string' && record.error_message.trim()
    ? record.error_message
    : 'Request failed';
}
