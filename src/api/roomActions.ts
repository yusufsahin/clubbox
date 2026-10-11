import type { CreateAudience } from './createComposer';
import { buildCreateChannelBody } from './createComposer';

export type ConversationKind = 'archive' | 'house' | 'vm';

export function conversationKind(row: { is_archived: boolean; permanent_house_chat: boolean }): ConversationKind {
  if (row.is_archived) return 'archive';
  if (row.permanent_house_chat) return 'house';
  return 'vm';
}

export function permissionOn(value: unknown): boolean {
  return value === true;
}

/** Documented create_channel body for any privacy level allowed by the composer. */
export function createChannelBody(
  topic: string,
  options: {
    audience?: CreateAudience | string;
    replayEnabled?: boolean;
    chatEnabled?: boolean;
    socialClubId?: number | string;
    topicIds?: number[];
    userIds?: number[];
    handraisePermission?: number;
    link?: string;
  },
): Record<string, unknown> {
  const audience = normalizeAudience(options.audience);
  return buildCreateChannelBody(topic, {
    audience,
    replayEnabled: options.replayEnabled,
    chatEnabled: options.chatEnabled,
    socialClubId: options.socialClubId,
    topicIds: options.topicIds,
    userIds: options.userIds,
    handraisePermission: options.handraisePermission,
    link: options.link,
  });
}

function normalizeAudience(raw: CreateAudience | string | undefined): CreateAudience {
  if (raw === 'friends' || raw === 'friends-of-friends' || raw === 'house' || raw === 'public'
    || raw === 'social' || raw === 'closed') {
    return raw;
  }
  return 'public';
}

/** @deprecated Use createChannelBody — kept for tests that assert the original capture defaults. */
export function capturedCreateBody(
  topic: string,
  options: { audience?: string; replayEnabled?: boolean; chatEnabled?: boolean },
): Record<string, unknown> | null {
  if (options.replayEnabled !== false) return null;
  if (options.chatEnabled !== false) return null;
  if (options.audience !== 'friends-of-friends') return null;
  return createChannelBody(topic, options);
}

export function leaveClosesRoom(
  users: { user_id: number; is_moderator?: boolean }[],
  myId: number,
): boolean {
  const me = users.find((user) => user.user_id === myId);
  if (!me?.is_moderator) return false;
  return !users.some((user) => user.user_id !== myId && user.is_moderator);
}

/**
 * How Leave quietly talks to the server.
 * Sole-moderator leave may try end_channel first, but must never skip leave_channel
 * when end is unavailable or fails — otherwise Clubhouse keeps the user in the room.
 */
export type LeaveServerPlan =
  | { action: 'end_then_local' }
  | { action: 'leave' }
  | { action: 'leave_after_end_failed' };

export function planLeaveServer(options: {
  wantEnd: boolean;
  endSupported: boolean;
}): LeaveServerPlan {
  if (options.wantEnd && options.endSupported) return { action: 'end_then_local' };
  if (options.wantEnd && !options.endSupported) return { action: 'leave' };
  return { action: 'leave' };
}

export function roomHasOthers(users: { user_id: number }[], myId: number): boolean {
  return users.some((user) => user.user_id !== myId);
}

export function segmentsForMember<T>(segments: T[], hideBefore: number | null): T[] {
  if (hideBefore == null) return segments;
  return segments.slice(hideBefore);
}
