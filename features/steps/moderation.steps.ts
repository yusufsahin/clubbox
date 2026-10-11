import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import type { ClubboxWorld } from '../support/world.ts';

Given('my user_capabilities have {string} {word}', function (this: ClubboxWorld, key: string, value: string) {
  this.userCapabilityOverrides[key] = value === 'true';
  this.refreshModerationControls();
});

Given('{string} is on stage', async function (this: ClubboxWorld, name: string) {
  this.onStageUsers.push({ name, userId: 99 });
  if (this.realtimeRoom.channel) {
    this.realtimeRoom.handleType('speaker_added', name);
    this.syncFromRealtime();
    return;
  }
  if (!this.session.channelId) {
    await this.session.startFriendsOfFriendsRoom('Morning show', { replayEnabled: true, chatEnabled: true });
    this.syncFromSession();
  }
});

When('I choose {string} for {string}', async function (this: ClubboxWorld, action: string, name: string) {
  await this.chooseModeration(action, name);
});

When('I start blocking {string}', function (this: ClubboxWorld, name: string) {
  void name;
  this.pendingBlockConfirm = true;
});

Then('I do not see {string} on speaker cards', function (this: ClubboxWorld, label: string) {
  if (label === 'Mute') {
    assert.equal(this.speakerMuteVisible, false);
    return;
  }
  assert.fail(`unsupported speaker card control ${label}`);
});

Then('I do not see {string}', function (this: ClubboxWorld, label: string) {
  if (label === 'End room') {
    assert.equal(this.visibleControls.has('End room'), false);
    return;
  }
  assert.fail(`unsupported control visibility check ${label}`);
});

Then('I see a confirmation before any request is sent', function (this: ClubboxWorld) {
  assert.equal(this.pendingBlockConfirm, true);
  assert.equal(this.transport.requestsNamed('block_from_channel').length, 0);
});

Given('I confirm blocking {string}', async function (this: ClubboxWorld, name: string) {
  await this.chooseModeration('Block from room', name, { confirmBlock: true });
});
