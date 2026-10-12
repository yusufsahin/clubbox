import { permissionOn } from './roomActions';

export type UserCapabilities = Record<string, boolean | undefined>;

export type RoomControlFlags = {
  canMute: boolean;
  /** Make moderator — mobile API (Phase 27). */
  canMakeModerator: boolean;
  canMoveToAudience: boolean;
  canInvite: boolean;
  canEnd: boolean;
  canMuteEveryone: boolean;
  canBlock: boolean;
  canRename: boolean;
  canHandraise: boolean;
  canReact: boolean;
  canGifReact: boolean;
  canPing: boolean;
  canChangeVisibility: boolean;
  /**
   * When false, show host moderation controls disabled with “Use the Clubhouse app to moderate”
   * (mobile Token path out of scope — owner 2026-10-12).
   */
  hostToolsCallable: boolean;
};

function capAllows(caps: UserCapabilities | undefined, key: string): boolean {
  if (!caps || !(key in caps)) return true;
  return permissionOn(caps[key]);
}

/**
 * Room chrome: show host moderation from join/create capabilities; live calls need
 * supports() (sandbox or in-scope Token). Web-session tools still gate on supports().
 */
export function roomControlFlags(
  caps: UserCapabilities | undefined,
  supports: (endpoint: string) => boolean,
): RoomControlFlags {
  const gateCap = (capKey: string) => capAllows(caps, capKey);
  const gate = (capKey: string, endpoint: string) => gateCap(capKey) && supports(endpoint);
  return {
    // Mobile host tools: visible from capabilities; disabled when !hostToolsCallable.
    canMute: gateCap('can_mute_speakers'),
    canMakeModerator: gateCap('can_remove_speakers'),
    canMoveToAudience: gateCap('can_remove_speakers'),
    canInvite: gateCap('can_invite'),
    canEnd: gateCap('can_end_room'),
    canMuteEveryone: gateCap('can_mute_speakers'),
    canBlock: gateCap('can_remove_speakers'),
    canPing: gateCap('can_invite'),
    canHandraise: gateCap('can_edit_handraise_queue'),
    // Web-session tools.
    canRename: gate('can_edit_room_title', 'set_channel_title'),
    canReact: supports('emoji_reaction'),
    canGifReact: supports('gif_reaction'),
    canChangeVisibility: supports('make_channel_public') || supports('make_channel_social'),
    hostToolsCallable: supports('mute_speaker'),
  };
}

/** Hide room / save replay — available to any participant when supported + flags allow. */
export function roomListenerActionFlags(
  channel: {
    is_replay_enabled?: boolean;
    user_capabilities?: UserCapabilities;
  } | null | undefined,
  supports: (endpoint: string) => boolean,
): { canHideRoom: boolean; canSaveReplay: boolean } {
  const caps = channel?.user_capabilities;
  const canSaveCap = !caps || !('can_save' in caps) || permissionOn(caps.can_save);
  return {
    canHideRoom: supports('hide_channel'),
    canSaveReplay: supports('save_replay')
      && channel?.is_replay_enabled === true
      && canSaveCap,
  };
}

export function readUserCapabilities(channel: { user_capabilities?: UserCapabilities } | null | undefined): UserCapabilities | undefined {
  const caps = channel?.user_capabilities;
  if (!caps || typeof caps !== 'object') return undefined;
  return caps;
}

/** True when this user is a stage moderator, or the room creator (host) when the user row is stale/missing. */
export function isChannelModerator(
  channel: { users?: Array<{ user_id?: number | string; is_moderator?: boolean }>; creator_user_profile_id?: number | string } | null | undefined,
  meId: number | string | null | undefined,
): boolean {
  if (!channel || meId == null || meId === '') return false;
  const mine = String(meId);
  if ((channel.users ?? []).some((user) => String(user.user_id) === mine && user.is_moderator === true)) {
    return true;
  }
  return channel.creator_user_profile_id != null && String(channel.creator_user_profile_id) === mine;
}

/** How listeners get on stage for this room. */
export type StageAccessMode = 'open' | 'raise' | 'invite';

/**
 * Clubhouse handraise_queue_setting: 0 open stage, 2 request-to-join, 1 invite-only.
 * When the field is missing, treat handraise-on as raise-queue; otherwise open
 * (server create default is usually 0 — matching create_channel fixtures).
 */
export function stageAccessMode(channel: {
  handraise_queue_setting?: number;
  is_handraise_enabled?: boolean;
} | null | undefined): StageAccessMode {
  if (!channel) return 'invite';
  const queue = channel.handraise_queue_setting;
  if (queue === 0) return 'open';
  if (queue === 1) return 'invite';
  if (queue === 2) return 'raise';
  if (channel.is_handraise_enabled === true) return 'raise';
  return 'open';
}

/** Room details / stage moderation selects — keep both surfaces on the same values. */
export function roomHandraiseSelectMode(channel: {
  is_handraise_enabled?: boolean;
  handraise_permission?: number;
} | null | undefined): 'off' | '1' | '2' {
  if (!channel || channel.is_handraise_enabled === false) return 'off';
  return channel.handraise_permission === 2 ? '2' : '1';
}

export function roomVisibilitySelectMode(channel: {
  is_private?: boolean;
  is_social_mode?: boolean;
} | null | undefined): 'open' | 'social' | 'other' {
  if (!channel) return 'open';
  if (channel.is_private) return 'other';
  return channel.is_social_mode ? 'social' : 'open';
}
