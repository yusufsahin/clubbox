import type { CHChannel, FeedTopic } from './types';

export const FEED_MAX_PAGES = 8;

export type FeedPage = {
  channels?: CHChannel[];
  available_topics?: FeedTopic[];
  next_cursor?: string | null;
};

/** Deduplicate rooms by channel hash (or channel_id). Keeps first occurrence. */
export function mergeFeedChannels(pages: Array<CHChannel[] | undefined>): CHChannel[] {
  const seen = new Set<string>();
  const out: CHChannel[] = [];
  for (const page of pages) {
    if (!page) continue;
    for (const channel of page) {
      const key = (typeof channel.channel === 'string' && channel.channel)
        || String(channel.channel_id ?? '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(channel);
    }
  }
  return out;
}

export function nextFeedCursor(page: FeedPage, previous?: string | null): string | null {
  const next = typeof page.next_cursor === 'string' && page.next_cursor.length > 0
    ? page.next_cursor
    : null;
  if (!next || next === previous) return null;
  return next;
}
