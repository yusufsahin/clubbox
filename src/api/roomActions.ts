export type ConversationKind = 'archive' | 'house' | 'vm';

export function conversationKind(row: { is_archived: boolean; permanent_house_chat: boolean }): ConversationKind {
  if (row.is_archived) return 'archive';
  if (row.permanent_house_chat) return 'house';
  return 'vm';
}

export function permissionOn(value: unknown): boolean {
  return value === true;
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
