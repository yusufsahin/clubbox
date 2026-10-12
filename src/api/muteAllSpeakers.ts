/**
 * Phase 29.2 — "Mute all speakers" is mute_speaker for each other speaker (no mute_all endpoint).
 */

export type MuteAllSpeaker = {
  user_id: number;
  is_speaker?: boolean;
  is_muted?: boolean;
};

export type MuteAllResult = {
  muted: number;
  total: number;
  stoppedOnForbidden: boolean;
};

export type MuteAllDeps = {
  muteSpeaker: (userId: number) => Promise<void>;
  delayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  isForbidden?: (err: unknown) => boolean;
};

function defaultIsForbidden(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const status = (err as { status?: unknown }).status;
  return status === 403;
}

/**
 * Mute every speaker except `myUserId`, sequential with delay.
 * Stops on the first 403; earlier mutes stay counted.
 */
export async function muteAllSpeakers(
  users: MuteAllSpeaker[],
  myUserId: number | null | undefined,
  deps: MuteAllDeps,
): Promise<MuteAllResult> {
  const delayMs = typeof deps.delayMs === 'number' ? deps.delayMs : 150;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const isForbidden = deps.isForbidden ?? defaultIsForbidden;
  const targets = users.filter(
    (user) => user.is_speaker && user.user_id !== myUserId && !user.is_muted,
  );
  let muted = 0;
  for (let i = 0; i < targets.length; i += 1) {
    try {
      await deps.muteSpeaker(targets[i].user_id);
      muted += 1;
    } catch (err) {
      if (isForbidden(err)) {
        return { muted, total: targets.length, stoppedOnForbidden: true };
      }
      throw err;
    }
    if (i < targets.length - 1) await sleep(delayMs);
  }
  return { muted, total: targets.length, stoppedOnForbidden: false };
}
