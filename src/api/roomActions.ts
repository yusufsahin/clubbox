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
    socialClubId?: number;
    topicIds?: number[];
    userIds?: number[];
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

export function roomHasOthers(users: { user_id: number }[], myId: number): boolean {
  return users.some((user) => user.user_id !== myId);
}

export function segmentsForMember<T>(segments: T[], hideBefore: number | null): T[] {
  if (hideBefore == null) return segments;
  return segments.slice(hideBefore);
}
