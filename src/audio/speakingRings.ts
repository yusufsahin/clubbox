/** Pure speaking-ring hold — threshold + hang time so avatar rings do not flicker. */

export type SpeakingLevel = { uid: string; level: number };

export type SpeakingHoldEntry = {
  speaking: boolean;
  /** When level last went below threshold while speaking (0 if currently above). */
  quietSince: number;
};

export type SpeakingHoldState = Map<string, SpeakingHoldEntry>;

export const SPEAKING_SAMPLE_MS = 150;
export const SPEAKING_THRESHOLD = 0.15;
export const SPEAKING_HOLD_MS = 300;

export function nextSpeakingHold(
  prev: SpeakingHoldState,
  levels: SpeakingLevel[],
  now: number,
  opts: { threshold?: number; holdMs?: number } = {},
): { next: SpeakingHoldState; changed: { uid: string; speaking: boolean }[] } {
  const threshold = opts.threshold ?? SPEAKING_THRESHOLD;
  const holdMs = opts.holdMs ?? SPEAKING_HOLD_MS;
  const next: SpeakingHoldState = new Map();
  const changed: { uid: string; speaking: boolean }[] = [];
  const seen = new Set<string>();

  for (const { uid, level } of levels) {
    const key = String(uid);
    seen.add(key);
    const prior = prev.get(key) ?? { speaking: false, quietSince: 0 };
    let speaking = prior.speaking;
    let quietSince = prior.quietSince;

    if (level > threshold) {
      speaking = true;
      quietSince = 0;
    } else if (speaking) {
      if (!quietSince) quietSince = now;
      if (now - quietSince >= holdMs) {
        speaking = false;
        quietSince = 0;
      }
    }

    next.set(key, { speaking, quietSince });
    if (speaking !== prior.speaking) {
      changed.push({ uid: key, speaking });
    }
  }

  // Drop users who left the level list (and clear their ring).
  for (const [key, prior] of prev) {
    if (seen.has(key)) continue;
    if (prior.speaking) changed.push({ uid: key, speaking: false });
  }

  return { next, changed };
}
