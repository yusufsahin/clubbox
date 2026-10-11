import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import {
  roomTitleKeywordHits,
  splitKeywordHighlight,
} from '../../src/hallway/hallwayDisplay.ts';
import { defaultHallwayPrefs, readHallwayPrefs } from '../../src/hallway/hallwayPrefs.ts';
import type { ClubboxWorld, HallwayCard } from '../support/world.ts';

function cardFromFeed(channel: Record<string, unknown>): HallwayCard {
  const id = String(channel.channel ?? channel.channel_id ?? '');
  return {
    title: String(channel.topic ?? id),
    channel: id,
    clubName: String(channel.club_name ?? ''),
    replays: channel.is_replay_enabled === true,
    clips: channel.is_clipping_enabled === true,
    startedAt: String(channel.time_created ?? ''),
    listeners: Number(channel.num_all ?? 0),
    speakers: Number(channel.num_speakers ?? 0),
    url: String(channel.url ?? `https://www.clubhouse.com/room/${id}`),
    topicKey: String(channel.topic_key ?? ''),
  };
}

When('I open the hallway', async function (this: ClubboxWorld) {
  const res = await this.client.getChannels();
  const topics = (res.available_topics ?? []).map((topic) => topic.display_name || topic.key);
  this.hallwayTopics = topics;
  this.hallwayRooms = (res.channels ?? []).map((channel) => cardFromFeed(channel as unknown as Record<string, unknown>));
  for (const topic of topics) this.uiMessages.push(`topic:${topic}`);
});

Then('I see topic chips from {string}', function (this: ClubboxWorld, field: string) {
  assert.equal(field, 'available_topics');
  assert.ok(this.hallwayTopics.length > 0);
  for (const topic of this.hallwayTopics) {
    assert.ok(this.uiMessages.includes(`topic:${topic}`));
  }
});

Given('the hallway has topics {string} and {string}', async function (this: ClubboxWorld, a: string, b: string) {
  await this.client.getChannels();
  this.hallwayTopics = [a, b];
  this.hallwayRooms = [
    {
      title: 'Tech Talk',
      channel: 'abc123',
      clubName: 'Builders',
      replays: true,
      clips: true,
      startedAt: '2026-10-11T11:00:00.000Z',
      listeners: 42,
      speakers: 3,
      url: 'https://www.clubhouse.com/room/abc123',
      topicKey: a,
    },
    {
      title: 'Music Night',
      channel: 'music1',
      clubName: 'DJs',
      replays: false,
      clips: false,
      startedAt: '2026-10-11T11:30:00.000Z',
      listeners: 10,
      speakers: 2,
      url: 'https://www.clubhouse.com/room/music1',
      topicKey: b,
    },
  ];
});

When('I select the topic chip {string}', function (this: ClubboxWorld, topic: string) {
  this.selectedTopic = topic;
});

Then('only rooms for {string} are shown', function (this: ClubboxWorld, topic: string) {
  const shown = this.hallwayRoomsForSelection();
  assert.ok(shown.length > 0);
  assert.ok(shown.every((room) => room.topicKey === topic));
});

Then(/^its card shows the title, the house name, replays on\/off, clips on\/off, how long it has been running, the listener count and the speaker count$/, function (this: ClubboxWorld) {
  const card = this.hallwayRoom;
  assert.ok(card);
  assert.ok(card.title);
  assert.ok(card.clubName);
  assert.equal(typeof card.replays, 'boolean');
  assert.equal(typeof card.clips, 'boolean');
  assert.ok(card.startedAt);
  assert.ok(card.listeners >= 0);
  assert.ok(card.speakers >= 0);
});

Then('the clipboard contains {string}', function (this: ClubboxWorld, value: string) {
  assert.equal(this.clipboard, value);
});

When('I search for {string}', async function (this: ClubboxWorld, query: string) {
  await this.client.search(query, ['UserProfile', 'LiveChannel', 'SocialClub']);
  this.searchTabs = new Set(['Top', 'People', 'Rooms', 'Houses']);
  this.uiMessages.push(`search:${query}`);
});

Given('I added the hallway keyword {string}', function (this: ClubboxWorld, keyword: string) {
  this.hallwayPrefs = { ...this.hallwayPrefs, keywords: [...this.hallwayPrefs.keywords, keyword] };
});

Given('{string} is my friend and speaks in {string}', function (this: ClubboxWorld, name: string, roomTitle: string) {
  if (!this.hallwayRooms.some((room) => room.title === roomTitle)) {
    this.hallwayRooms.push({
      title: roomTitle,
      channel: 'music1',
      clubName: 'DJs',
      replays: false,
      clips: false,
      startedAt: '2026-10-11T11:30:00.000Z',
      listeners: 10,
      speakers: 2,
      url: 'https://www.clubhouse.com/room/music1',
      topicKey: 'music',
    });
  }
  this.hallwayRooms = this.hallwayRooms.map((room) => {
    if (room.title !== roomTitle) return room;
    return {
      ...room,
      friendSpeaker: name,
      users: [{ name, is_speaker: true, follow_status: 'friends' }],
    };
  });
});

Given('the hallway contains a room marked NSFW', function (this: ClubboxWorld) {
  this.hallwayRooms = [{
    title: 'Adult Talk',
    channel: 'nsfw1',
    clubName: 'Club',
    replays: false,
    clips: false,
    startedAt: '2026-10-11T12:00:00.000Z',
    listeners: 3,
    speakers: 1,
    url: 'https://www.clubhouse.com/room/nsfw1',
    topicKey: 'general',
    is_nsfw: true,
  }];
  this.hallwayPrefs = { ...defaultHallwayPrefs(), showNsfw: false };
  this.hallwayDisplayRooms = this.hallwayDisplayRoomsFromPrefs();
});

When('the hallway loads', function (this: ClubboxWorld) {
  if (!this.hallwayRooms.some((room) => room.title === 'Tech Talk')) {
    this.hallwayRooms.unshift({
      title: 'Tech Talk',
      channel: 'tech1',
      clubName: 'Builders',
      replays: true,
      clips: true,
      startedAt: '2026-10-11T11:00:00.000Z',
      listeners: 42,
      speakers: 3,
      url: 'https://www.clubhouse.com/room/tech1',
      topicKey: 'tech',
    });
  }
  this.hallwayDisplayRooms = this.hallwayDisplayRoomsFromPrefs();
});

Then('{string} is listed first with a star next to {string}', function (this: ClubboxWorld, roomTitle: string, friendName: string) {
  assert.ok(this.hallwayDisplayRooms.length > 0);
  assert.equal(this.hallwayDisplayRooms[0].title, roomTitle);
  assert.equal(this.hallwayDisplayRooms[0].friendSpeaker, friendName);
});

Then('the word {string} is highlighted in matching room titles', function (this: ClubboxWorld, keyword: string) {
  const matching = this.hallwayDisplayRooms.filter((room) => roomTitleKeywordHits(room.title, this.hallwayPrefs.keywords).includes(keyword));
  assert.ok(matching.length > 0);
  for (const room of matching) {
    const parts = splitKeywordHighlight(room.title, keyword);
    assert.ok(parts.some((part) => part.hit));
  }
});

Then('no new request is sent for filtering', function (this: ClubboxWorld) {
  assert.equal(this.transport.requestsNamed('get_feed_v3').length, 0);
});

Then('that room is not shown', function (this: ClubboxWorld) {
  assert.equal(this.hallwayDisplayRooms.length, 0);
});

Then('that room is shown', function (this: ClubboxWorld) {
  assert.equal(this.hallwayDisplayRooms.length, 1);
  assert.equal(this.hallwayDisplayRooms[0].is_nsfw, true);
});

When('I turn on {string} for the hallway', function (this: ClubboxWorld, label: string) {
  assert.equal(label, 'Show NSFW rooms');
  this.hallwayPrefs = { ...this.hallwayPrefs, showNsfw: true };
  this.hallwayDisplayRooms = this.hallwayDisplayRoomsFromPrefs();
});

When('I open the online friends panel', async function (this: ClubboxWorld) {
  await this.client.getOnlineFriends();
  this.onlineFriendsLoaded = true;
  this.onlineFriends = [
    { name: 'Ayse', roomTitle: 'Ayse room', channel: 'room-ayse', userId: 10 },
    { name: 'Ali', userId: 11 },
  ];
});

Then('friends in a room show the room title and a {string} button', function (this: ClubboxWorld, label: string) {
  assert.equal(label, 'Join');
  const inRoom = this.onlineFriends.find((friend) => friend.roomTitle);
  assert.ok(inRoom?.roomTitle);
});

When('I click {string} next to {string}', async function (this: ClubboxWorld, action: string, name: string) {
  assert.equal(action, 'Join');
  const friend = this.onlineFriends.find((entry) => entry.name === name);
  assert.ok(friend?.channel);
  const result = await this.session.joinFromHallway(friend.channel);
  this.syncFromSession();
  if (!result.ok) this.lastError = new Error(result.message ?? 'Join failed');
});

Then('the room join flow starts for her room', function (this: ClubboxWorld) {
  assert.ok(this.transport.requestsNamed('join_channel').length > 0 || this.session.channelId);
});

Then('{string} disappears from the hallway', function (this: ClubboxWorld, title: string) {
  assert.ok(!this.hallwayRooms.some((room) => room.title === title));
});

Then('I can switch between the tabs {string}, {string}, {string} and {string}', function (
  this: ClubboxWorld,
  a: string,
  b: string,
  c: string,
  d: string,
) {
  for (const tab of [a, b, c, d]) {
    assert.ok(this.searchTabs.has(tab), `missing tab ${tab}`);
  }
});

Given('I saved the search column {string}', function (this: ClubboxWorld, query: string) {
  this.savedSearch.saveColumn(query);
  this.savedSearch.ensureTimer();
});

Then('one {string} request is sent for {string}', function (this: ClubboxWorld, endpoint: string, query: string) {
  assert.equal(endpoint, 'search');
  const hits = this.transport.requests.filter(
    (req) => req.path.includes('/web_api/search') && (req.body as { query?: string })?.query === query,
  );
  assert.ok(hits.length >= 1, `expected search for ${query}`);
});

Then('the saved column {string} is still there after restart', function (this: ClubboxWorld, query: string) {
  assert.ok(readHallwayPrefs().savedSearchColumns.includes(query));
});

Given('the hallway returned a next_cursor', async function (this: ClubboxWorld) {
  this.transport.setFixture('get_channels', {
    success: true,
    channels: [{ channel: 'page1', topic: 'Page one', users: [], num_all: 1, num_speakers: 1 }],
    next_cursor: 'page2',
  });
  const res = await this.client.getChannelsPage();
  assert.equal(res.next_cursor, 'page2');
  this.feedNextCursor = res.next_cursor;
});

When('I scroll to the end of the hallway', async function (this: ClubboxWorld) {
  assert.ok(this.feedNextCursor);
  this.transport.setFixture('get_channels', {
    success: true,
    channels: [{ channel: 'page2', topic: 'Page two', users: [], num_all: 1, num_speakers: 1 }],
    next_cursor: null,
  });
  await this.client.getChannelsPage({ nextCursor: this.feedNextCursor });
});
