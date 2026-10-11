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
