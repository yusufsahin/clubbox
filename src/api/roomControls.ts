import { permissionOn } from './roomActions';

export type UserCapabilities = Record<string, boolean | undefined>;

export type RoomControlFlags = {
  canMute: boolean;
  canMod: boolean;
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
};

function capAllows(caps: UserCapabilities | undefined, key: string): boolean {
  if (!caps || !(key in caps)) return true;
  return permissionOn(caps[key]);
}

/** Room chrome: capability from the join/create response AND canCall() for the endpoint. */
export function roomControlFlags(
  caps: UserCapabilities | undefined,
  supports: (endpoint: string) => boolean,
): RoomControlFlags {
  const gate = (capKey: string, endpoint: string) => capAllows(caps, capKey) && supports(endpoint);
  return {
    canMute: gate('can_mute_speakers', 'mute_speaker'),
    canMod: gate('can_remove_speakers', 'make_moderator'),
    canMoveToAudience: gate('can_remove_speakers', 'uninvite_speaker'),
    canInvite: gate('can_invite', 'invite_speaker'),
    canEnd: gate('can_end_room', 'end_channel'),
    canMuteEveryone: gate('can_mute_speakers', 'mute_speaker'),
    canBlock: gate('can_remove_speakers', 'block_from_channel'),
    canRename: gate('can_edit_room_title', 'set_channel_title'),
    canHandraise: gate('can_edit_handraise_queue', 'change_handraise_settings'),
    canReact: supports('emoji_reaction'),
    canGifReact: supports('gif_reaction'),
    canPing: supports('invite_to_existing_channel'),
    canChangeVisibility: supports('make_channel_public') || supports('make_channel_social'),
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
