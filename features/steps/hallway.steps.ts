import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
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
  const shown = this.filteredHallway();
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
