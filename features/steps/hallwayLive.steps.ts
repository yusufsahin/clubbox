import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import { prepareHallwayChannels, usableFeedTopics } from '../../src/hallway/hallwayDisplay.ts';
import { defaultHallwayPrefs, type HallwayPrefs } from '../../src/hallway/hallwayPrefs.ts';

// Uses the app's real hallway functions with the live feed shape (no topic_key on rooms).
type LiveRoom = { topic: string; channel: string; users: []; topic_key?: string };
type LiveWorld = { liveRooms: LiveRoom[]; liveTopics: { key: string; display_name: string }[]; livePrefs: HallwayPrefs };

function shown(world: LiveWorld, topicKey: string | null = null): string[] {
  return prepareHallwayChannels(world.liveRooms, world.livePrefs, topicKey).map((room) => room.topic);
}

Given('the live hallway has the rooms {string} and {string} without topic tags', function (this: LiveWorld, a: string, b: string) {
  this.liveRooms = [a, b].map((topic, i) => ({ topic, channel: `live${i}`, users: [] }));
  this.liveTopics = [];
  this.livePrefs = defaultHallwayPrefs();
});

Given('the feed offers the topics {string} and {string}', function (this: LiveWorld, a: string, b: string) {
  this.liveTopics = [a, b].map((key) => ({ key, display_name: key }));
});

Then('no topic chips are shown', function (this: LiveWorld) {
  assert.deepEqual(usableFeedTopics(this.liveRooms, this.liveTopics), []);
});

Then('selecting the topic {string} still lists {int} rooms', function (this: LiveWorld, topic: string, count: number) {
  assert.equal(shown(this, topic).length, count);
});

Given('my hallway keyword is {string}', function (this: LiveWorld, keyword: string) {
  this.livePrefs = { ...this.livePrefs, keywords: [keyword] };
});

When('I switch on the hallway option {string}', function (this: LiveWorld, label: string) {
  assert.equal(label, 'Only show rooms matching my keywords');
  this.livePrefs = { ...this.livePrefs, onlyKeywordMatches: true };
});

When('I switch the hallway option off', function (this: LiveWorld) {
  this.livePrefs = { ...this.livePrefs, onlyKeywordMatches: false };
});

Then('the hallway lists only {string}', function (this: LiveWorld, title: string) {
  assert.deepEqual(shown(this), [title]);
});

Then('the hallway lists {string} before {string}', function (this: LiveWorld, first: string, second: string) {
  const list = shown(this);
  assert.ok(list.indexOf(first) >= 0 && list.indexOf(first) < list.indexOf(second), list.join(', '));
});
