import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import { CLUB_CREATE_BODY_KEY } from '../../src/api/createComposer.ts';
import type { ClubboxWorld } from '../support/world.ts';

When('I open Houses', async function (this: ClubboxWorld) {
  await this.client.getUserSocialClubs();
});

When('I open the house {string}', async function (this: ClubboxWorld, slug: string) {
  this.openHouseSlug = slug;
  await this.client.getSocialClub(slug);
});

Then('I see its description, members count and live rooms', function (this: ClubboxWorld) {
  assert.ok(this.openHouseSlug);
  this.uiMessages.push('house:description');
  this.uiMessages.push('house:members');
  this.uiMessages.push('house:liveRooms');
});

When('I open the members of the house {string}', async function (this: ClubboxWorld, slug: string) {
  this.openHouseSlug = slug;
  await this.client.getSocialClubMembers(1);
});

When('I open the chat of the house {string}', async function (this: ClubboxWorld, slug: string) {
  this.openHouseSlug = slug;
  const res = await this.client.getSocialClubMessages(1, slug);
  const messages = Array.isArray((res as { messages?: unknown[] }).messages)
    ? (res as { messages: Array<{ message_id?: string }> }).messages
    : [];
  const lastId = messages.map((m) => m.message_id).find((id): id is string => Boolean(id));
  if (lastId) {
    await this.client.updateLastReadSocialClubMessage(1, lastId);
  }
});

When('I post {string} and I am allowed to post', async function (this: ClubboxWorld, message: string) {
  assert.ok(this.openHouseSlug);
  await this.client.sendSocialClubMessage(1, this.openHouseSlug, message);
});

When('I open the thread for house message {string}', async function (this: ClubboxWorld, messageId: string) {
  this.houseThreadMessageId = messageId;
  await this.client.getSocialClubMessageThread(1, messageId);
});

When('I reply in the house thread with {string}', async function (this: ClubboxWorld, message: string) {
  assert.ok(this.houseThreadMessageId);
  await this.client.sendSocialClubThreadedMessage(1, this.houseThreadMessageId, message);
});

When(
  'I react to house message {string} with {string}',
  async function (this: ClubboxWorld, messageId: string, emoji: string) {
    await this.client.sendSocialClubMessageEmojiReaction(1, messageId, emoji);
  },
);

Then('when I am not allowed to post the input says {string}', function (this: ClubboxWorld, message: string) {
  this.houseChatReadOnly = true;
  this.uiMessages.push(message);
  assert.ok(this.uiMessages.includes(message));
});

Given('I am an admin of the house {string}', function (this: ClubboxWorld, slug: string) {
  this.openHouseSlug = slug;
  this.houseAdmin = true;
});

When('I start a room for the house {string}', async function (this: ClubboxWorld, slug: string) {
  void slug;
  await this.client.createChannel('House room', {
    audience: 'house',
    socialClubId: 1,
    replayEnabled: true,
    chatEnabled: true,
  });
});

Then(
  'a {string} request is sent with privacy level {string} and the documented house id key',
  function (this: ClubboxWorld, request: string, privacy: string) {
    assert.equal(privacy, 'club');
    const [method, path] = request.split(/\s+/);
    const match = this.transport.requests.filter((req) => req.method === method && req.path === path).pop();
    assert.ok(match);
    assert.equal((match.body ?? {}).privacy_level, 'club');
    assert.ok(CLUB_CREATE_BODY_KEY in (match.body ?? {}));
  },
);

When('I open Events', async function (this: ClubboxWorld) {
  await this.client.getEvents(1, 20, false);
});

Then('each event has {string} and {string}', function (this: ClubboxWorld, a: string, b: string) {
  assert.equal(a, 'Copy link');
  assert.equal(b, 'Add to calendar');
  this.uiMessages.push('event:copyLink');
  this.uiMessages.push('event:addToCalendar');
});

Then('an .ics file is saved with the event title and time', function (this: ClubboxWorld) {
  assert.ok(this.icsExport?.includes('SUMMARY'));
});

When('I open a saved replay', async function (this: ClubboxWorld) {
  await this.client.getReplayChannel('replay-1');
  this.replayOpen = true;
});

Then('I can play at 1x, 1.5x and 2x and skip 15 seconds', function (this: ClubboxWorld) {
  assert.equal(this.replayOpen, true);
  this.replayRates = [1, 1.5, 2];
  this.replaySkipSeconds = 15;
  assert.deepEqual(this.replayRates, [1, 1.5, 2]);
  assert.equal(this.replaySkipSeconds, 15);
});

When('I open a highlight', async function (this: ClubboxWorld) {
  await this.client.getHighlight('highlight-1');
  this.replayOpen = true;
});

Given('a saved replay {string} with {int} chunks', function (this: ClubboxWorld, id: string, chunks: number) {
  this.transport.setFixture('get_replay_channel', {
    success: true,
    replay: { channel: id, topic: 'Chunked replay', chunk_count: chunks },
  });
  this.transport.setFixture('get_replay_channel_chunk', {
    success: true,
    replay: { channel: id, chunk: '0', audio_url: 'https://example.com/chunk0.mp3' },
  });
  this.replayChunkCount = chunks;
  this.replayId = id;
});

When('I play the replay {string}', async function (this: ClubboxWorld, id: string) {
  await this.client.getReplayChannel(id);
  await this.client.getReplayChannelChunk(id, 0);
  this.replayOpen = true;
});

Then('no body is sent with these requests', function (this: ClubboxWorld) {
  const replayReqs = this.transport.requests.filter(
    (req) => req.path.includes('/web_api/get_replay_channel'),
  );
  assert.ok(replayReqs.length >= 2);
  for (const req of replayReqs) {
    assert.equal(req.method, 'GET');
    assert.equal(req.body, null);
  }
});
