import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterHallwayByTopic,
  hallwayPrivacyCounts,
  hallwayRoomPrivacy,
  filterNsfwHallwayRooms,
  prepareHallwayChannels,
  roomTitleKeywordHits,
  shouldAutoLoadMorePrivacy,
  usableFeedTopics,
  sortHallwayRooms,
  splitKeywordHighlight,
  visiblePrivacyChips,
} from '../src/hallway/hallwayDisplay.ts';

test('sortHallwayRooms lists friend-speaker rooms first', () => {
  const sorted = sortHallwayRooms([
    { title: 'Tech Talk', users: [{ name: 'Pat', is_speaker: true, follow_status: 'none' }] },
    { title: 'Music Night', users: [{ name: 'Ayse', is_speaker: true, follow_status: 'friends' }] },
  ]);
  assert.equal(sorted[0].title, 'Music Night');
});

test('filterNsfwHallwayRooms hides NSFW unless enabled', () => {
  const rooms = [
    { title: 'Safe', is_nsfw: false },
    { title: 'Adult', is_nsfw: true },
  ];
  assert.deepEqual(filterNsfwHallwayRooms(rooms, { keywords: [], showNsfw: false }).map((r) => r.title), ['Safe']);
  assert.equal(filterNsfwHallwayRooms(rooms, { keywords: [], showNsfw: true }).length, 2);
});

test('keyword highlight helpers', () => {
  assert.deepEqual(roomTitleKeywordHits('Tech Talk Live', ['tech', 'jazz']), ['tech']);
  assert.deepEqual(splitKeywordHighlight('Tech Talk', 'tech'), [
    { text: 'Tech', hit: true },
    { text: ' Talk', hit: false },
  ]);
});

test('usableFeedTopics hides topics no loaded room is tagged with', () => {
  // Live get_feed_v3 rooms carry logging_context.topic_key = null, so no chip can filter anything.
  const live = [{ topic: 'A' }, { topic: 'B', topic_key: undefined }];
  const topics = [{ key: 'tech', display_name: 'Tech' }, { key: 'sports', display_name: 'Sports' }];
  assert.deepEqual(usableFeedTopics(live, topics), []);
  const tagged = [{ topic: 'A', topic_key: 'tech' }];
  assert.deepEqual(usableFeedTopics(tagged, topics).map((t) => t.key), ['tech']);
});

test('prepareHallwayChannels ignores a selected topic that no room carries', () => {
  const live = [{ topic: 'A', users: [] }, { topic: 'B', users: [] }];
  const prefs = { keywords: [], showNsfw: false, onlyKeywordMatches: false, savedSearchColumns: [], selectedPrivacy: null };
  assert.equal(prepareHallwayChannels(live, prefs, 'tech').length, 2);
});

test('keyword rooms come first and can be the only rooms shown', () => {
  const rooms = [
    { topic: 'Morning coffee', users: [] },
    { topic: 'Tech Talk Live', users: [] },
    { topic: 'Jazz night', users: [] },
  ];
  const base = { keywords: ['tech', 'JAZZ'], showNsfw: false, savedSearchColumns: [], selectedPrivacy: null };
  assert.deepEqual(
    prepareHallwayChannels(rooms, { ...base, onlyKeywordMatches: false }).map((r) => r.topic),
    ['Tech Talk Live', 'Jazz night', 'Morning coffee'],
  );
  assert.deepEqual(
    prepareHallwayChannels(rooms, { ...base, onlyKeywordMatches: true }).map((r) => r.topic),
    ['Tech Talk Live', 'Jazz night'],
  );
  assert.equal(prepareHallwayChannels(rooms, { ...base, keywords: [], onlyKeywordMatches: true }).length, 3);
});

test('filterHallwayByTopic keeps matching topic_key or all when unset', () => {
  const rooms = [
    { topic: 'A', topic_key: 'tech' },
    { topic: 'B', topic_key: 'business' },
    { topic: 'C' },
  ];
  assert.equal(filterHallwayByTopic(rooms, null).length, 3);
  assert.deepEqual(filterHallwayByTopic(rooms, 'tech').map((r) => r.topic), ['A']);
});

// Shapes from get_feed_v3 captures: privacy_settings.type is house / public / friend_of_friend (friend never seen on web).
const privacyRoom = (channel: string, type?: string) => ({
  channel,
  topic: channel,
  users: [],
  ...(type ? { privacy_settings: { type, display_text: 'x', tooltip_text: 'y' } } : {}),
});

test('hallwayRoomPrivacy reads privacy_settings.type and treats unknown values as other', () => {
  assert.equal(hallwayRoomPrivacy(privacyRoom('a', 'house')), 'house');
  assert.equal(hallwayRoomPrivacy(privacyRoom('b', 'public')), 'public');
  assert.equal(hallwayRoomPrivacy(privacyRoom('c', 'friend_of_friend')), 'friend_of_friend');
  assert.equal(hallwayRoomPrivacy(privacyRoom('d', 'friend')), 'friend');
  assert.equal(hallwayRoomPrivacy(privacyRoom('g', 'dm')), 'dm');
  assert.equal(hallwayRoomPrivacy(privacyRoom('e', 'social')), 'other');
  assert.equal(hallwayRoomPrivacy(privacyRoom('h', 'closed')), 'other');
  assert.equal(hallwayRoomPrivacy(privacyRoom('f')), 'other');
});

test('hallwayPrivacyCounts counts every privacy so chips can show what the feed holds', () => {
  const rooms = [privacyRoom('a', 'house'), privacyRoom('b', 'house'), privacyRoom('c', 'public'), privacyRoom('d', 'friend_of_friend')];
  assert.deepEqual(hallwayPrivacyCounts(rooms), { house: 2, public: 1, friend_of_friend: 1, friend: 0, dm: 0, other: 0 });
});

test('prepareHallwayChannels keeps only the chosen privacy, and all rooms when none is chosen', () => {
  const rooms = [privacyRoom('a', 'house'), privacyRoom('b', 'public'), privacyRoom('c', 'friend_of_friend'), privacyRoom('d', 'public')];
  const prefs = { keywords: [], showNsfw: false, onlyKeywordMatches: false, selectedPrivacy: null } as never;
  assert.deepEqual(prepareHallwayChannels(rooms, prefs, null, 'public').map((r) => r.channel), ['b', 'd']);
  assert.deepEqual(prepareHallwayChannels(rooms, prefs, null, 'friend_of_friend').map((r) => r.channel), ['c']);
  assert.deepEqual(prepareHallwayChannels(rooms, prefs, null, 'friend').map((r) => r.channel), []);
  assert.equal(prepareHallwayChannels(rooms, prefs).length, 4);
});

test('visiblePrivacyChips hides zero counts except the selected type', () => {
  const counts = hallwayPrivacyCounts([
    privacyRoom('a', 'house'), privacyRoom('b', 'house'), privacyRoom('c', 'public'), privacyRoom('d', 'friend_of_friend'),
  ]);
  assert.deepEqual(
    visiblePrivacyChips(counts, null).map((chip) => [chip.privacy, chip.count]),
    [[null, 4], ['public', 1], ['friend_of_friend', 1], ['house', 2]],
  );
  assert.ok(visiblePrivacyChips(counts, 'friend').some((chip) => chip.privacy === 'friend' && chip.count === 0));
});

test('shouldAutoLoadMorePrivacy only runs for a selected sparse type under the page cap', () => {
  assert.equal(shouldAutoLoadMorePrivacy({
    privacy: 'public', countOfType: 1, hasNextCursor: true, pagesLoaded: 1,
  }), true);
  assert.equal(shouldAutoLoadMorePrivacy({
    privacy: null, countOfType: 1, hasNextCursor: true, pagesLoaded: 1,
  }), false);
  assert.equal(shouldAutoLoadMorePrivacy({
    privacy: 'public', countOfType: 5, hasNextCursor: true, pagesLoaded: 2,
  }), false);
  assert.equal(shouldAutoLoadMorePrivacy({
    privacy: 'public', countOfType: 1, hasNextCursor: true, pagesLoaded: 8,
  }), false);
});

test('hallwayRoomPrivacy accepts the sandbox friends_of_friends alias', () => {
  assert.equal(hallwayRoomPrivacy(privacyRoom('x', 'friends_of_friends')), 'friend_of_friend');
});
