import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterNsfwHallwayRooms,
  roomTitleKeywordHits,
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
