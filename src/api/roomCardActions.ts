/**
 * Role × target card menus for the live stage (Phase 28.4).
 * Host tools stay gated by RoomControlFlags (capabilities + supports).
 * Leave stage stays off: 28.0 did not verify uninvite_speaker on self (not run).
 */

export type RoomRole = 'listener' | 'speaker' | 'moderator';

export type RoomCardAction =
  | 'invite_to_stage'
  | 'mute'
  | 'move_to_audience'
  | 'make_moderator'
  | 'remove_from_room'
  | 'view_profile'
  | 'leave_stage'
  | 'leave_room';

export type RoomActionFlags = {
  canMute: boolean;
  canMakeModerator: boolean;
  canMoveToAudience: boolean;
  canInvite: boolean;
  canBlock: boolean;
  /** True only after live verification that uninvite_speaker demotes self (28.2). */
  canLeaveStage?: boolean;
};

export type RoomActionTarget = {
  isSelf: boolean;
  isSpeaker: boolean;
  isModerator: boolean;
  isMuted?: boolean;
};

export function roomActionsFor(
  role: RoomRole,
  flags: RoomActionFlags,
  target: RoomActionTarget,
): RoomCardAction[] {
  if (target.isSelf) {
    const self: RoomCardAction[] = [];
    if (target.isSpeaker && flags.canLeaveStage) self.push('leave_stage');
    self.push('leave_room');
    return self;
  }

  // Non-moderators open profiles via the avatar; no overflow menu on others.
  if (role !== 'moderator') {
    return [];
  }

  if (!target.isSpeaker) {
    const listener: RoomCardAction[] = [];
    if (flags.canInvite) listener.push('invite_to_stage');
    if (flags.canBlock) listener.push('remove_from_room');
    listener.push('view_profile');
    return listener;
  }

  const speaker: RoomCardAction[] = [];
  if (flags.canMute && !target.isMuted) speaker.push('mute');
  if (flags.canMoveToAudience) speaker.push('move_to_audience');
  if (flags.canMakeModerator && !target.isModerator) speaker.push('make_moderator');
  if (flags.canBlock) speaker.push('remove_from_room');
  return speaker;
}

export function roomRoleFor(
  me: { user_id?: number | string; is_speaker?: boolean; is_moderator?: boolean } | null | undefined,
  isModerator: boolean,
): RoomRole {
  if (isModerator) return 'moderator';
  if (me?.is_speaker) return 'speaker';
  return 'listener';
}
