import type { CHUser } from './types.ts';

/** Speakers without an Agora remote for this long get the not-connected style (30.4). */
export const AGORA_PRESENCE_THRESHOLD_MS = 10_000;

export type AgoraPresenceState = {
  agoraJoined: boolean;
  joinedAtMs: number | null;
  present: Set<number>;
  /** First time we saw this speaker uid absent while Agora is joined. */
  absentSince: Map<number, number>;
};

export function createAgoraPresenceState(): AgoraPresenceState {
  return {
    agoraJoined: false,
    joinedAtMs: null,
    present: new Set(),
    absentSince: new Map(),
  };
}

export function presenceSetJoined(state: AgoraPresenceState, nowMs: number): AgoraPresenceState {
  return {
    agoraJoined: true,
    joinedAtMs: nowMs,
    present: new Set(state.present),
    absentSince: new Map(),
  };
}

export function presenceSetLeft(_state: AgoraPresenceState = createAgoraPresenceState()): AgoraPresenceState {
  return createAgoraPresenceState();
}

/**
 * Sync Agora remote uids and start/stop absence timers for current speakers.
 */
export function presenceSyncPresent(
  state: AgoraPresenceState,
  presentUids: Iterable<number>,
  speakerIds: Iterable<number>,
  nowMs: number,
): AgoraPresenceState {
  if (!state.agoraJoined) return state;
  const present = new Set<number>();
  for (const raw of presentUids) {
    const uid = Number(raw);
    if (Number.isFinite(uid) && uid > 0) present.add(uid);
  }
  const speakers = new Set<number>();
  for (const raw of speakerIds) {
    const uid = Number(raw);
    if (Number.isFinite(uid) && uid > 0) speakers.add(uid);
  }
  const absentSince = new Map(state.absentSince);
  for (const uid of present) absentSince.delete(uid);
  for (const uid of speakers) {
    if (present.has(uid)) continue;
    if (!absentSince.has(uid)) absentSince.set(uid, nowMs);
  }
  for (const uid of [...absentSince.keys()]) {
    if (!speakers.has(uid)) absentSince.delete(uid);
  }
  return {
    ...state,
    present,
    absentSince,
  };
}

export type OverlayAgoraPresenceOpts = {
  myUserId?: number | null;
  thresholdMs?: number;
};

/**
 * Overlay Agora presence onto stage users: missing remotes past the threshold →
 * `is_on_call: false`; present remotes clear that style.
 */
export function overlayAgoraPresence(
  users: CHUser[],
  state: AgoraPresenceState,
  nowMs: number,
  opts: OverlayAgoraPresenceOpts = {},
): CHUser[] {
  if (!state.agoraJoined) return users;
  const threshold = opts.thresholdMs ?? AGORA_PRESENCE_THRESHOLD_MS;
  const myId = opts.myUserId ?? null;
  let changed = false;
  const next = users.map((user) => {
    if (!user.is_speaker) return user;
    const present = state.present.has(user.user_id)
      || (myId != null && user.user_id === myId);
    if (present) {
      if (user.is_on_call === false) {
        changed = true;
        return { ...user, is_on_call: true };
      }
      return user;
    }
    const since = state.absentSince.get(user.user_id) ?? state.joinedAtMs;
    if (since == null || nowMs - since < threshold) return user;
    if (user.is_on_call === false) return user;
    changed = true;
    return { ...user, is_on_call: false };
  });
  return changed ? next : users;
}
