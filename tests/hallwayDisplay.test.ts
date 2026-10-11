import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterHallwayByTopic,
  filterNsfwHallwayRooms,
  prepareHallwayChannels,
  roomTitleKeywordHits,
  usableFeedTopics,
  sortHallwayRooms,
  splitKeywordHighlight,
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
  const prefs = { keywords: [], showNsfw: false, onlyKeywordMatches: false, savedSearchColumns: [] };
  assert.equal(prepareHallwayChannels(live, prefs, 'tech').length, 2);
});

test('keyword rooms come first and can be the only rooms shown', () => {
  const rooms = [
    { topic: 'Morning coffee', users: [] },
    { topic: 'Tech Talk Live', users: [] },
    { topic: 'Jazz night', users: [] },
  ];
  const base = { keywords: ['tech', 'JAZZ'], showNsfw: false, savedSearchColumns: [] };
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
