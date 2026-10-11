import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import type { ClubboxWorld } from '../support/world.ts';

Given('I am in a room where replays are on', function (this: ClubboxWorld) {
  this.replaysOn = true;
  this.currentRoom = this.currentRoom ?? 'studio-room';
});

Given('I am in a room where replays are off', function (this: ClubboxWorld) {
  this.replaysOn = false;
  this.currentRoom = this.currentRoom ?? 'studio-room';
});

Given('local recording is allowed in Settings', function (this: ClubboxWorld) {
  this.localRecordingAllowed = true;
});

Given('I started recording at {string}', function (this: ClubboxWorld, at: string) {
  assert.ok(this.replaysOn && this.localRecordingAllowed);
  this.recording = true;
  this.recordingStartedAt = at;
  this.chapterLines = ['00:00:00 Intro'];
});

Given('I am in a room with {int} listeners', function (this: ClubboxWorld, count: number) {
  this.currentRoom = this.currentRoom ?? 'studio-room';
  this.listeners = Array.from({ length: count }, (_, i) => ({
    name: i === 3 ? 'Marketing Lead' : `Listener ${i + 1}`,
    bio: i === 3 ? 'marketing ops' : `bio ${i + 1}`,
  }));
});

When('I press Ctrl+T at {string} and type {string}', function (this: ClubboxWorld, at: string, title: string) {
  assert.equal(this.recording, true);
  this.chapterLines.push(`${at} ${title}`);
  this.chapterLines.push(`(${at}) ${title}`);
});

When('I stop recording at {string}', function (this: ClubboxWorld, _at: string) {
  this.recording = false;
  this.chaptersSaved = true;
});

When('I press R', function (this: ClubboxWorld) {
  if (!this.replaysOn) {
    this.recording = false;
    this.uiMessages.push('Recording is only available in rooms with replays on');
    return;
  }
  this.recording = true;
});

When('I paste {string} into search and press Enter', function (this: ClubboxWorld, link: string) {
  try {
    const url = new URL(link);
    if (url.hostname !== 'www.clubhouse.com' && url.hostname !== 'clubhouse.com') {
      this.openedTarget = null;
      this.uiMessages.push('Only clubhouse.com links');
      return;
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'room' && parts[1]) this.openedTarget = `room "${parts[1]}"`;
    else if (parts[0]?.startsWith('@')) this.openedTarget = `profile of "${parts[0].slice(1)}"`;
    else this.openedTarget = null;
  } catch {
    this.openedTarget = null;
    this.uiMessages.push('Only clubhouse.com links');
  }
});

When('I press Ctrl+S and type {string}', function (this: ClubboxWorld, query: string) {
  this.audienceFilter = query.toLowerCase();
});

Then('a chapters file is saved next to the recording', function (this: ClubboxWorld) {
  assert.equal(this.chaptersSaved, true);
});

Then('it contains the line {string}', function (this: ClubboxWorld, line: string) {
  assert.ok(this.chapterLines.includes(line), `missing chapter line ${line}`);
});

Then('recording does not start', function (this: ClubboxWorld) {
  assert.equal(this.recording, false);
});

Then('Clubbox opens the {}', function (this: ClubboxWorld, target: string) {
  if (target.startsWith('nothing')) {
    assert.equal(this.openedTarget, null);
    assert.ok(this.uiMessages.includes('Only clubhouse.com links'));
    return;
  }
  assert.equal(this.openedTarget, target.trim());
});

Then('only listeners whose name or bio contains {string} are shown', function (this: ClubboxWorld, query: string) {
  const shown = this.listeners.filter(
    (person) => person.name.toLowerCase().includes(query.toLowerCase())
      || person.bio.toLowerCase().includes(query.toLowerCase()),
  );
  assert.ok(shown.length > 0);
  assert.ok(shown.every((person) =>
    person.name.toLowerCase().includes(this.audienceFilter)
    || person.bio.toLowerCase().includes(this.audienceFilter)));
});
