/** Read get_conversation_unread_summary (bundle) into a badge count. */
export function readUnreadSummary(payload: unknown): number | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const root = payload as Record<string, unknown>;
  for (const key of ['unread_count', 'unread_conversations_count', 'count', 'new_count', 'total']) {
    const value = root[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.floor(value);
  }
  return null;
}
