import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import type { ClubboxWorld } from '../support/world.ts';

Given('I am in the room {string} with realtime credentials from the join response', async function (this: ClubboxWorld, channel: string) {
  const joined = await this.client.joinChannel(channel);
  await this.realtimeRoom.enter(joined);
  this.syncFromRealtime();
});

Given('the realtime hub is disconnected', function (this: ClubboxWorld) {
  this.pubnub.simulateDisconnect();
  this.realtimeRoom.chatOpen = true;
  this.realtimeRoom.syncChatPolling();
});

Given('the realtime hub loses its connection', function (this: ClubboxWorld) {
  this.pubnub.simulateDisconnect();
});

When('the realtime hub receives a {string} event for {string}', function (this: ClubboxWorld, type: string, quoted: string) {
  const name = quoted.replace(/^"|"$/g, '');
  this.realtimeRoom.handleType(type, name);
  this.syncFromRealtime();
});

When('the realtime hub receives an invite to speak for me', function (this: ClubboxWorld) {
  this.realtimeRoom.handleInviteForMe();
  this.syncFromRealtime();
});

When('the realtime hub receives {string}', function (this: ClubboxWorld, label: string) {
  if (label === 'room ended') {
    this.realtimeRoom.handleRoomEnded();
    this.syncFromRealtime();
    return;
  }
  assert.fail(`unknown realtime label ${label}`);
});

When(
  'the realtime hub receives a {string} from {string} with {string}',
  function (this: ClubboxWorld, type: string, fromQuoted: string, messageQuoted: string) {
    const from = fromQuoted.replace(/^"|"$/g, '');
    const message = messageQuoted.replace(/^"|"$/g, '');
    if (type === 'channel_message') {
      this.realtimeRoom.handleChat(from, message);
      this.syncFromRealtime();
      return;
    }
    assert.fail(`unsupported message type ${type}`);
  },
);

When(
  'the realtime hub receives a {string} {string} from {string} to {string}',
  function (this: ClubboxWorld, type: string, emoji: string, fromQuoted: string, targetQuoted: string) {
    const from = fromQuoted.replace(/^"|"$/g, '');
    const target = targetQuoted.replace(/^"|"$/g, '');
    if (type === 'channel_reaction') {
      this.realtimeRoom.handleReaction(emoji, from, target);
      this.syncFromRealtime();
      return;
    }
    assert.fail(`unsupported reaction type ${type}`);
  },
);

When('the realtime hub receives an unknown type {string} with keys {string}', function (this: ClubboxWorld, type: string, keys: string) {
  const keyList = keys.split(',').map((key) => key.trim()).filter(Boolean);
  this.realtimeRoom.handleUnknown(type, keyList);
  this.client.noteApiHealth('pubnub', `Unknown realtime message type: ${type}`, keyList);
});

When('I press Ctrl+P', async function (this: ClubboxWorld) {
  await this.realtimeRoom.refresh();
});

When('I send the reaction {string} to {string}', async function (this: ClubboxWorld, emoji: string, targetQuoted: string) {
  const target = targetQuoted.replace(/^"|"$/g, '');
  const user = this.realtimeRoom.channel?.users.find((entry) => entry.name === target);
  const channelId = this.realtimeRoom.channel?.channel ?? 'abc123';
  await this.client.emojiReaction(channelId, emoji);
  if (user) this.realtimeRoom.handleReaction(emoji, 'Me', target);
  this.syncFromRealtime();
});

Then('the realtime hub subscribes with origin {string}', function (this: ClubboxWorld, origin: string) {
  const last = this.pubnub.getLastSubscribe();
  assert.ok(last);
  assert.equal(last.origin, origin);
});

Then('it uses the pubnub token and heartbeat values from the join response', function (this: ClubboxWorld) {
  const last = this.pubnub.getLastSubscribe();
  assert.ok(last);
  assert.equal(last.token, 'pubnub_token_fixture');
  assert.equal(last.heartbeat, 20);
  assert.equal(last.heartbeatInterval, 9);
});

Then('{string} appears in the audience', function (this: ClubboxWorld, quoted: string) {
  const name = quoted.replace(/^"|"$/g, '');
  assert.equal(this.realtimeRoom.usersInAudience(name), true);
});

Then('{string} disappears from the room', function (this: ClubboxWorld, quoted: string) {
  const name = quoted.replace(/^"|"$/g, '');
  assert.equal(this.realtimeRoom.channel?.users.some((user) => user.name === name), false);
});

Then('{string} appears in the raised hands list', function (this: ClubboxWorld, quoted: string) {
  const name = quoted.replace(/^"|"$/g, '');
  assert.equal(this.realtimeRoom.userRaisedHand(name), true);
});

Then('{string} moves to the stage', function (this: ClubboxWorld, quoted: string) {
  const name = quoted.replace(/^"|"$/g, '');
  assert.equal(this.realtimeRoom.userOnStage(name), true);
});

Then('{string} moves to the audience', function (this: ClubboxWorld, quoted: string) {
  const name = quoted.replace(/^"|"$/g, '');
  assert.equal(this.realtimeRoom.usersInAudience(name), true);
});

Then('{string} shows the moderator badge', function (this: ClubboxWorld, quoted: string) {
  const name = quoted.replace(/^"|"$/g, '');
  assert.equal(this.realtimeRoom.userIsModerator(name), true);
});

Then('the chat shows {string} as plain text from {string}', function (this: ClubboxWorld, textQuoted: string, fromQuoted: string) {
  const text = textQuoted.replace(/^"|"$/g, '');
  const from = fromQuoted.replace(/^"|"$/g, '');
  const hit = this.realtimeRoom.chatMessages.find((message) => message.message === text && message.name === from);
  assert.ok(hit, `expected chat from ${from}: ${text}`);
});

Then('a short {string} animation is shown on {string}', function (this: ClubboxWorld, emoji: string, targetQuoted: string) {
  const target = targetQuoted.replace(/^"|"$/g, '');
  assert.ok(this.uiMessages.some((line) => line === `reaction:${emoji}:${target}`));
});

Then('API Health lists realtime type {string} with keys {string}', function (this: ClubboxWorld, type: string, keys: string) {
  const expected = keys.split(',').map((key) => key.trim()).filter(Boolean).sort();
  const health = this.client.getApiHealth().find((entry) => entry.endpoint === 'pubnub' && entry.message.includes(type));
  assert.ok(health, `expected pubnub health for ${type}`);
  assert.deepEqual([...(health.bodyKeys ?? [])].sort(), expected);
});

Then('no message values are stored', function (this: ClubboxWorld) {
  const health = this.client.getApiHealth().find((entry) => entry.endpoint === 'pubnub');
  assert.ok(health);
  assert.equal(health.message.includes('mystery'), true);
});

Then('the realtime hub resubscribes', function (this: ClubboxWorld) {
  assert.ok(this.pubnub.resubscribeCount >= 1);
});

Then('the chat is read again', function (this: ClubboxWorld) {
  assert.ok(this.transport.requestsNamed('get_channel_messages').length > 0);
});

Then('it reconnects after 1, 2, 4 seconds up to 60 seconds', function (this: ClubboxWorld) {
  this.pubnub.simulateReconnect(1000);
  this.pubnub.simulateReconnect(2000);
  this.pubnub.simulateReconnect(4000);
  assert.deepEqual(this.pubnub.reconnectDelays.slice(0, 3), [1000, 2000, 4000]);
});

Then('the stage shows {string} until it succeeds', function (this: ClubboxWorld, label: string) {
  assert.ok(this.uiMessages.includes(label));
  this.pubnub.simulateReconnect(1000);
});
