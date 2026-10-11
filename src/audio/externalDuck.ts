/** Auto-duck envelope for external audio under the mic (ST-11). */

export const DUCK_ATTACK_MS = 80;
export const DUCK_RELEASE_MS = 500;
export const DEFAULT_DUCK_DB = -12;
/** Normalized mic level above which we treat the user as speaking. */
export const VOICE_DUCK_THRESHOLD = 0.12;

/** Linear gain multiplier for a duck amount in dB (0 … -24). */
export function duckGainFromDb(duckDb: number): number {
  const db = Math.max(-24, Math.min(0, duckDb));
  return 10 ** (db / 20);
}

export type DuckEnvelopeState = {
  /** Current linear gain applied on top of the user's open volume. */
  multiplier: number;
  speaking: boolean;
  sinceMs: number;
  /** Multiplier at the start of the current attack/release phase. */
  startMultiplier: number;
};

export function initialDuckState(nowMs = 0): DuckEnvelopeState {
  return { multiplier: 1, speaking: false, sinceMs: nowMs, startMultiplier: 1 };
}

/**
 * Advance the duck envelope. When speaking, ramps to duckGain over ~80 ms;
 * when quiet, ramps back to 1 over ~500 ms.
 */
export function stepDuckEnvelope(
  prev: DuckEnvelopeState,
  nowMs: number,
  speaking: boolean,
  duckDb: number = DEFAULT_DUCK_DB,
): DuckEnvelopeState {
  const target = speaking ? duckGainFromDb(duckDb) : 1;
  let sinceMs = prev.sinceMs;
  let startMultiplier = prev.startMultiplier;
  if (speaking !== prev.speaking) {
    sinceMs = nowMs;
    startMultiplier = prev.multiplier;
  }
  const elapsed = Math.max(0, nowMs - sinceMs);
  const duration = speaking ? DUCK_ATTACK_MS : DUCK_RELEASE_MS;
  const t = duration <= 0 ? 1 : Math.min(1, elapsed / duration);
  const multiplier = startMultiplier + (target - startMultiplier) * t;
  return { multiplier, speaking, sinceMs, startMultiplier };
}

/** True when Clubbox output is not the system default — required for loopback without echo. */
export function systemAudioCaptureAllowed(
  clubboxOutputId: string,
  defaultOutputId: string,
): boolean {
  const out = clubboxOutputId.trim();
  const def = defaultOutputId.trim();
  if (!out || !def) return false;
  if (out === 'default' || out === 'communications') return false;
  return out !== def;
}
