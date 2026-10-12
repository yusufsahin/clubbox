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
