import { relationshipFromStatus } from '../api/relationship.ts';
import type { CHChannel, CHUser } from '../api/types.ts';
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

export function prepareHallwayChannels(channels: CHChannel[], prefs: HallwayPrefs): CHChannel[] {
  return sortHallwayRooms(filterNsfwHallwayRooms(channels, prefs));
}

export function prepareHallwayFeedRooms<T extends HallwayFeedRoom>(rooms: T[], prefs: HallwayPrefs): T[] {
  return sortHallwayRooms(filterNsfwHallwayRooms(rooms, prefs));
}
