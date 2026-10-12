/** Pure Agora error classification — no SDK imports. */

export type AgoraErrorClass = 'network-block' | 'auth' | 'timeout' | 'banned' | 'other';

const NETWORK_BLOCK = [
  'CAN_NOT_GET_GATEWAY_SERVER',
  'WS_ERR',
  'NETWORK_ERROR',
  'WS_ABORT',
];

const AUTH = [
  'INVALID_TOKEN',
  'INVALID_VENDOR_KEY',
  'TOKEN_EXPIRED',
  'INVALID_PARAMS',
];

const TIMEOUT = ['TIMEOUT', 'JOIN_TIMEOUT', 'OPERATION_ABORTED'];

const BANNED = ['UID_BANNED', 'CHANNEL_BANNED'];

function codeOf(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && err !== null) {
    const o = err as { code?: unknown; message?: unknown; name?: unknown };
    if (o.code != null) return String(o.code);
    if (o.name != null && String(o.name) !== 'Error') return String(o.name);
    if (o.message != null) return String(o.message);
  }
  return String(err);
}

/** Classify an Agora / join failure for reconnect / proxy / UI decisions. */
export function classifyAgoraError(err: unknown): AgoraErrorClass {
  const raw = codeOf(err).toUpperCase();
  const msg = err && typeof err === 'object' && 'message' in err
    ? String((err as { message: unknown }).message).toUpperCase()
    : '';
  const hay = `${raw} ${msg}`;
  if (BANNED.some((c) => hay.includes(c))) return 'banned';
  if (AUTH.some((c) => hay.includes(c))) return 'auth';
  if (TIMEOUT.some((c) => hay.includes(c))) return 'timeout';
  // ws close 1006 often appears only in the message
  if (NETWORK_BLOCK.some((c) => hay.includes(c)) || /\b1006\b/.test(hay)) return 'network-block';
  return 'other';
}

/** True when cloud proxy may be tried once (never after our own join timeout). */
export function shouldTryCloudProxy(err: unknown, alreadyTried: boolean): boolean {
  if (alreadyTried) return false;
  if (classifyAgoraError(err) !== 'network-block') return false;
  // Own timeout abort must not trigger proxy (hides the real gateway result).
  const hay = `${codeOf(err)} ${err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : ''}`.toUpperCase();
  if (hay.includes('JOIN_TIMEOUT') || hay.includes('OPERATION_ABORTED')) return false;
  return true;
}

/** Short user-facing reason (no tokens / app ids). */
export function formatVoiceFailureReason(err: unknown): string {
  const code = codeOf(err).trim() || 'join_failed';
  // Prefer short SDK codes over long messages.
  const short = code.split(/[\s:]/)[0] || code;
  return short.slice(0, 64);
}

export const AGORA_JOIN_MS = 20_000;

/** Phase 24.2: auto-rejoin backoff after unexpected disconnect (max 3). */
export const AGORA_REJOIN_BACKOFF_MS = [2_000, 5_000, 15_000] as const;

export type AgoraConnectionAction =
  | { type: 'show-reconnecting' }
  | { type: 'clear-reconnecting' }
  | { type: 'schedule-rejoin'; delayMs: number; attempt: number }
  | { type: 'leave-banned'; reason: string }
  | { type: 'none' };

/**
 * Pure reconnect policy for Agora connection-state-change.
 * `rejoinAttempt` is how many rejoins have already been scheduled (0…3).
 */
export function agoraConnectionPolicy(input: {
  state: string;
  reason?: string;
  rejoinAttempt: number;
}): AgoraConnectionAction {
  const state = String(input.state || '').toUpperCase();
  const reason = String(input.reason || '').toUpperCase();

  if (state === 'RECONNECTING') {
    return { type: 'show-reconnecting' };
  }
  if (state === 'CONNECTED') {
    return { type: 'clear-reconnecting' };
  }
  if (state !== 'DISCONNECTED' && state !== 'FAILED') {
    return { type: 'none' };
  }
  if (/UID_BANNED|CHANNEL_BANNED/.test(reason)) {
    const banned = reason.includes('CHANNEL') ? 'CHANNEL_BANNED' : 'UID_BANNED';
    return { type: 'leave-banned', reason: banned };
  }
  if (/LEAVE/.test(reason) || !reason) {
    return { type: 'none' };
  }
  if (input.rejoinAttempt >= AGORA_REJOIN_BACKOFF_MS.length) {
    return { type: 'none' };
  }
  const delayMs = AGORA_REJOIN_BACKOFF_MS[input.rejoinAttempt] ?? 15_000;
  return { type: 'schedule-rejoin', delayMs, attempt: input.rejoinAttempt + 1 };
}

/** SDK exception 2001: AUDIO_INPUT_LEVEL_TOO_LOW. Expected while the local mic is muted. */
export const AGORA_AUDIO_INPUT_LEVEL_TOO_LOW = 2001;

/** Warn in the console, except the expected low-input exception while self-muted. */
export function agoraExceptionLogLevel(
  code: number | string | undefined,
  selfMuted: boolean,
): 'debug' | 'warn' {
  if (selfMuted && Number(code) === AGORA_AUDIO_INPUT_LEVEL_TOO_LOW) return 'debug';
  return 'warn';
}

export type ExtrasStatsSnapshot = {
  vol: string;
  sendVol: number;
  bitrate: number;
  sending: boolean;
};

/** True when a debug extras-stats line would show a new value. */
export function extrasStatsChanged(
  previous: ExtrasStatsSnapshot | null,
  next: ExtrasStatsSnapshot,
): boolean {
  if (!previous) return true;
  return previous.vol !== next.vol
    || previous.sendVol !== next.sendVol
    || previous.bitrate !== next.bitrate
    || previous.sending !== next.sending;
}

/** Uplink/downlink 0–6 → CSS token class for the room-bar quality dot. */
export function networkQualityTone(uplink: number, downlink: number): 'good' | 'ok' | 'poor' | 'unknown' {
  const worst = Math.max(
    Number.isFinite(uplink) ? uplink : 0,
    Number.isFinite(downlink) ? downlink : 0,
  );
  if (worst <= 0) return 'unknown';
  if (worst <= 2) return 'good';
  if (worst <= 4) return 'ok';
  return 'poor';
}
