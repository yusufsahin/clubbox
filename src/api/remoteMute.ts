import type { CHUser } from './types.ts';

/** Map Agora mute-related events to is_muted. null = ignore (e.g. video-only). */
export function muteFromAgoraEvent(
  kind: 'user-info-updated' | 'user-published' | 'user-unpublished',
  detail?: string,
): boolean | null {
  if (kind === 'user-published') return false;
  if (kind === 'user-unpublished') return true;
  if (kind === 'user-info-updated') {
    if (detail === 'mute-audio') return true;
    if (detail === 'unmute-audio') return false;
  }
  return null;
}

/** Set is_muted for the Clubhouse user whose user_id equals the Agora uid. */
export function applyRemoteMute(users: CHUser[], uid: number | string, muted: boolean): CHUser[] {
  const id = Number(uid);
  if (!Number.isFinite(id)) return users;
  let changed = false;
  const next = users.map((user) => {
    if (user.user_id !== id) return user;
    if (user.is_muted === muted) return user;
    changed = true;
    return { ...user, is_muted: muted };
  });
  return changed ? next : users;
}

/** Own mic button → stage badge. Agora does not emit user-info-updated for the local user. */
export function applySelfMute(users: CHUser[], userId: number, muted: boolean): CHUser[] {
  return applyRemoteMute(users, userId, muted);
}

/** Re-apply Agora and self mute flags after a room snapshot replaces users. */
export function overlayMuteStates(users: CHUser[], states: ReadonlyMap<number, boolean>): CHUser[] {
  let changed = false;
  const next = users.map((user) => {
    if (!states.has(user.user_id)) return user;
    const muted = states.get(user.user_id) === true;
    if (user.is_muted === muted) return user;
    changed = true;
    return { ...user, is_muted: muted };
  });
  return changed ? next : users;
}

/**
 * Queue a mute apply that reads the latest desired state when it runs.
 * A captured boolean from click time loses a faster second click.
 */
export function chainLatestMute(
  previous: Promise<void>,
  readMuted: () => boolean,
  apply: (muted: boolean) => Promise<void>,
): Promise<void> {
  return previous.then(() => apply(readMuted()));
}
