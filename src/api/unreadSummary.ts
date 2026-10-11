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

/** Visible conversation ids for unread summary: unique, non-empty, capped (Task 12.1). */
export function conversationIdsForUnreadSummary(
  conversationIds: readonly string[],
  max = 10,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of conversationIds) {
    const trimmed = typeof id === 'string' ? id.trim() : '';
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= max) break;
  }
  return out;
}
