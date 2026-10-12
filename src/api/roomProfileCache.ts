import type { CHUser } from './types.ts';

/** Stage event types that should refresh a cached get_profile (30.4). */
const PROFILE_REFRESH_STAGE = new Set([
  'speaker_added',
  'speaker_removed',
  'moderator_added',
]);

/**
 * User id to re-fetch via get_profile, or null when the event does not require it.
 * Accepts a parsed realtime event (structural — avoids a cycle with realtimeEvents).
 */
export function profileRefreshUserId(event: {
  kind: string;
  type?: string;
  userId?: number | null;
}): number | null {
  if (event.kind !== 'stage') return null;
  if (!event.type || !PROFILE_REFRESH_STAGE.has(event.type)) return null;
  const id = event.userId;
  if (id == null || !Number.isFinite(id) || id <= 0) return null;
  return id;
}

/** In-memory get_profile cache for one room session. */
export class RoomProfileCache {
  private readonly byId = new Map<number, CHUser>();

  get(userId: number): CHUser | undefined {
    return this.byId.get(userId);
  }

  set(userId: number, profile: CHUser): void {
    if (!Number.isFinite(userId) || userId <= 0) return;
    this.byId.set(userId, profile);
  }

  /** Drop one user so the next open re-fetches (role event while drawer closed). */
  invalidate(userId: number): void {
    this.byId.delete(userId);
  }

  clear(): void {
    this.byId.clear();
  }

  get size(): number {
    return this.byId.size;
  }
}
