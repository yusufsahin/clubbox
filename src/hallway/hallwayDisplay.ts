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

export function prepareHallwayChannels<T extends { topic?: string; topic_key?: string; is_nsfw?: boolean; users: HallwaySpeaker[] }>(
  channels: T[],
  prefs: HallwayPrefs,
  topicKey: string | null = null,
): T[] {
  const usableKey = topicKey && channels.some((channel) => channel.topic_key === topicKey) ? topicKey : null;
  const visible = filterNsfwHallwayRooms(filterHallwayByTopic(channels, usableKey), prefs);
  return sortHallwayRooms(applyHallwayKeywords(visible, prefs));
}

export function prepareHallwayFeedRooms<T extends HallwayFeedRoom>(rooms: T[], prefs: HallwayPrefs): T[] {
  return sortHallwayRooms(filterNsfwHallwayRooms(rooms, prefs));
}
