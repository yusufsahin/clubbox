import { relationshipFromStatus } from '../api/relationship.ts';
import type { CHUser } from '../api/types.ts';
import type { HallwayPrefs } from './hallwayPrefs.ts';

export type HallwaySpeaker = Pick<CHUser, 'name' | 'is_speaker' | 'follow_status'>;

export type HallwayFeedRoom = {
  title: string;
  channel: string;
  users: HallwaySpeaker[];
  is_nsfw?: boolean;
};

export function speakerIsFriend(user: HallwaySpeaker): boolean {
  if (!user.is_speaker) return false;
  if (relationshipFromStatus(user.follow_status) === 'friends') return true;
  // Until capture maps follow_status strings, BDD and sandbox may set this literal marker.
  return user.follow_status === 'friends';
}

export function channelHasFriendSpeaker(users: HallwaySpeaker[]): CHUser | null {
  for (const user of users) {
    if (speakerIsFriend(user)) return user as CHUser;
  }
  return null;
}

export function sortHallwayRooms<T extends { users: HallwaySpeaker[] }>(rooms: T[]): T[] {
  return [...rooms].sort((a, b) => {
    const aFriend = channelHasFriendSpeaker(a.users) ? 1 : 0;
    const bFriend = channelHasFriendSpeaker(b.users) ? 1 : 0;
    return bFriend - aFriend;
  });
}

export function filterNsfwHallwayRooms<T extends { is_nsfw?: boolean }>(rooms: T[], prefs: HallwayPrefs): T[] {
  if (prefs.showNsfw) return rooms;
  return rooms.filter((room) => room.is_nsfw !== true);
}

export function titleMatchesKeyword(title: string, keyword: string): boolean {
  return title.toLowerCase().includes(keyword.trim().toLowerCase());
}

export function roomTitleKeywordHits(title: string, keywords: string[]): string[] {
  return keywords.filter((keyword) => keyword.trim() && titleMatchesKeyword(title, keyword));
}

export function splitKeywordHighlight(title: string, keyword: string): Array<{ text: string; hit: boolean }> {
  const k = keyword.trim();
  if (!k) return [{ text: title, hit: false }];
  const lower = title.toLowerCase();
  const needle = k.toLowerCase();
  const parts: Array<{ text: string; hit: boolean }> = [];
  let cursor = 0;
  while (cursor < title.length) {
    const idx = lower.indexOf(needle, cursor);
    if (idx < 0) {
      parts.push({ text: title.slice(cursor), hit: false });
      break;
    }
    if (idx > cursor) parts.push({ text: title.slice(cursor, idx), hit: false });
    parts.push({ text: title.slice(idx, idx + needle.length), hit: true });
    cursor = idx + needle.length;
  }
  return parts.filter((part) => part.text.length > 0);
}

export function filterHallwayByTopic<T extends { topic_key?: string }>(channels: T[], topicKey: string | null): T[] {
  if (!topicKey) return channels;
  return channels.filter((channel) => channel.topic_key === topicKey);
}

/**
 * Topics a chip can actually filter by. The live web feed sends available_topics, but its rooms carry
 * logging_context.topic_key = null, so a chip for an untagged topic would empty the hallway.
 */
export function usableFeedTopics<T extends { key: string }>(channels: { topic_key?: string }[], topics: T[]): T[] {
  const tagged = new Set(channels.map((channel) => channel.topic_key).filter((key): key is string => !!key));
  return topics.filter((topic) => tagged.has(topic.key));
}

function keywordMatches(title: string | undefined, keywords: string[]): boolean {
  return roomTitleKeywordHits(title ?? '', keywords).length > 0;
}

/** Keyword rooms first (stable), or only keyword rooms when onlyKeywordMatches is on and keywords exist. */
export function applyHallwayKeywords<T extends { topic?: string }>(rooms: T[], prefs: HallwayPrefs): T[] {
  const keywords = prefs.keywords.filter((keyword) => keyword.trim());
  if (keywords.length === 0) return rooms;
  const matching = rooms.filter((room) => keywordMatches(room.topic, keywords));
  if (prefs.onlyKeywordMatches) return matching;
  return [...matching, ...rooms.filter((room) => !keywordMatches(room.topic, keywords))];
}

/** privacy_settings.type: web enum ChannelPrivacyLevel (dm, friend, friend_of_friend, house) plus public from get_feed_v3. Legacy app types (social, closed) map to other. */
export const HALLWAY_PRIVACIES = ['public', 'friend', 'friend_of_friend', 'house', 'dm'] as const;
export type HallwayPrivacy = (typeof HALLWAY_PRIVACIES)[number] | 'other';
type PrivacyRoom = { privacy_settings?: { type?: string } };

export function hallwayRoomPrivacy(room: PrivacyRoom): HallwayPrivacy {
  const raw = room.privacy_settings?.type;
  // Sandbox / older captures used the plural form; web enum is friend_of_friend.
  const type = raw === 'friends_of_friends' ? 'friend_of_friend' : raw;
  return (HALLWAY_PRIVACIES as readonly string[]).includes(type ?? '') ? (type as HallwayPrivacy) : 'other';
}

/** Chip order for the hallway UI (All is separate). dm/other stay out of the chip row. */
export const HALLWAY_PRIVACY_CHIP_ORDER = ['public', 'friend_of_friend', 'friend', 'house'] as const;
export type HallwayPrivacyChip = (typeof HALLWAY_PRIVACY_CHIP_ORDER)[number];

export type PrivacyChip = { privacy: HallwayPrivacyChip | null; count: number };

/** Chips with counts; hide zero-count chips unless that type is selected. */
export function visiblePrivacyChips(
  counts: Record<HallwayPrivacy, number>,
  selected: HallwayPrivacy | null,
): PrivacyChip[] {
  const total = (Object.values(counts) as number[]).reduce((sum, n) => sum + n, 0);
  const chips: PrivacyChip[] = [{ privacy: null, count: total }];
  for (const privacy of HALLWAY_PRIVACY_CHIP_ORDER) {
    const count = counts[privacy];
    if (count === 0 && selected !== privacy) continue;
    chips.push({ privacy, count });
  }
  return chips;
}

/** Keep auto-paging a sparse privacy filter until we have enough rooms or hit the feed page cap. */
export function shouldAutoLoadMorePrivacy(input: {
  privacy: HallwayPrivacy | null;
  countOfType: number;
  hasNextCursor: boolean;
  pagesLoaded: number;
  minCount?: number;
  maxPages?: number;
}): boolean {
  if (!input.privacy) return false;
  const minCount = input.minCount ?? 5;
  const maxPages = input.maxPages ?? 8;
  if (input.countOfType >= minCount) return false;
  if (!input.hasNextCursor) return false;
  if (input.pagesLoaded >= maxPages) return false;
  return true;
}

export function hallwayPrivacyCounts(rooms: PrivacyRoom[]): Record<HallwayPrivacy, number> {
  const counts: Record<HallwayPrivacy, number> = { house: 0, public: 0, friend_of_friend: 0, friend: 0, dm: 0, other: 0 };
  for (const room of rooms) counts[hallwayRoomPrivacy(room)] += 1;
  return counts;
}

export function prepareHallwayChannels<T extends { topic?: string; topic_key?: string; is_nsfw?: boolean; users: HallwaySpeaker[] } & PrivacyRoom>(
  channels: T[],
  prefs: HallwayPrefs,
  topicKey: string | null = null,
  privacy: HallwayPrivacy | null = null,
): T[] {
  const usableKey = topicKey && channels.some((channel) => channel.topic_key === topicKey) ? topicKey : null;
  const byPrivacy = privacy ? channels.filter((channel) => hallwayRoomPrivacy(channel) === privacy) : channels;
  const visible = filterNsfwHallwayRooms(filterHallwayByTopic(byPrivacy, usableKey), prefs);
  return sortHallwayRooms(applyHallwayKeywords(visible, prefs));
}

export function prepareHallwayFeedRooms<T extends HallwayFeedRoom>(rooms: T[], prefs: HallwayPrefs): T[] {
  return sortHallwayRooms(filterNsfwHallwayRooms(rooms, prefs));
}
