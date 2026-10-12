import type { CHChannelDetail, CHUser } from './types.ts';

/** Default room reaction pad when join does not supply emoji_reaction_options. */
export const DEFAULT_ROOM_REACTION_EMOJIS = ['👏', '❤️', '🔥', '😂'] as const;

/** Emoji list for the room reaction picker (30.5). */
export function roomReactionEmojis(channel: CHChannelDetail | null | undefined): string[] {
  const opts = channel?.emoji_reaction_options;
  if (!Array.isArray(opts) || opts.length === 0) return [...DEFAULT_ROOM_REACTION_EMOJIS];
  const out: string[] = [];
  for (const entry of opts) {
    if (typeof entry === 'string' && entry.trim()) out.push(entry.trim());
    else if (entry && typeof entry === 'object') {
      const rec = entry as { emoji?: unknown; value?: unknown };
      const raw = typeof rec.emoji === 'string' ? rec.emoji
        : typeof rec.value === 'string' ? rec.value
          : '';
      if (raw.trim()) out.push(raw.trim());
    }
  }
  return out.length ? out : [...DEFAULT_ROOM_REACTION_EMOJIS];
}

/** Crowns: hide from non-moderators when hide_moderator_indicator is set. */
export function showModeratorCrowns(
  channel: CHChannelDetail | null | undefined,
  viewerIsModerator: boolean,
): boolean {
  if (channel?.hide_moderator_indicator !== true) return true;
  return viewerIsModerator;
}

/**
 * Join / Rejoin stage CTA (become_speaker).
 * Open stage, or stage_removed + can_rejoin_stage_directly.
 */
export function canOfferJoinStage(opts: {
  channel: CHChannelDetail | null | undefined;
  isSpeaker: boolean;
  openStage: boolean;
  becomeSpeakerSupported: boolean;
}): boolean {
  if (!opts.becomeSpeakerSupported || !opts.channel || opts.isSpeaker) return false;
  if (opts.openStage) return true;
  const caps = opts.channel.user_capabilities ?? {};
  return caps.stage_removed === true && caps.can_rejoin_stage_directly === true;
}

/** Last speaker / last on stage — confirm before leave when the server asks. */
export function shouldWarnLastSpeaker(
  channel: CHChannelDetail | null | undefined,
  myUserId: number | null | undefined,
): boolean {
  if (!channel || channel.show_last_speaker_warning !== true) return false;
  if (myUserId == null) return false;
  const speakers = channel.users.filter((user) => user.is_speaker);
  if (speakers.length !== 1) return false;
  return speakers[0]?.user_id === myUserId;
}

/** Welcome toast copy from join_channel.welcome_for_user_profile (once per room). */
export function welcomeToastName(
  welcome: CHChannelDetail['welcome_for_user_profile'],
): string | null {
  if (!welcome || typeof welcome !== 'object') return null;
  if (typeof welcome.name === 'string' && welcome.name.trim()) return welcome.name.trim();
  if (typeof welcome.username === 'string' && welcome.username.trim()) return welcome.username.trim();
  return null;
}

export function myRoomRole(
  users: CHUser[],
  myUserId: number | null | undefined,
): 'moderator' | 'speaker' | 'listener' | null {
  if (myUserId == null) return null;
  const me = users.find((user) => user.user_id === myUserId);
  if (!me) return null;
  if (me.is_moderator) return 'moderator';
  if (me.is_speaker) return 'speaker';
  return 'listener';
}
