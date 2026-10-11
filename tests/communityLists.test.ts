import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEventIcs, readEventsPayload, readHousesPayload } from '../src/api/communityLists.ts';

test('readHousesPayload maps social_clubs', () => {
  const houses = readHousesPayload({
    social_clubs: [{
      social_club_id: '1',
      slug: 'h1',
      name: 'Alpha House',
      description: 'Hello',
      num_members: 12,
      is_member: true,
    }],
  });
  assert.equal(houses.length, 1);
  assert.equal(houses[0].slug, 'h1');
  assert.equal(houses[0].members, 12);
});

test('readEventsPayload and ICS export', () => {
  const events = readEventsPayload({
    events: [{
      event_id: 'e1',
      name: 'Town Hall',
      time_start: '2026-10-12T18:00:00Z',
      time_end: '2026-10-12T19:00:00Z',
      url: 'https://www.clubhouse.com/event/e1',
      social_club: { name: 'Alpha' },
    }],
  });
  assert.equal(events[0].title, 'Town Hall');
  const ics = buildEventIcs(events[0]);
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, /SUMMARY:Town Hall/);
  assert.match(ics, /URL:https:\/\/www\.clubhouse\.com\/event\/e1/);
});
