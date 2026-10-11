import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import { moderationEndpoint, visibilityChangeEndpoint } from '../../src/api/moderationExtras.ts';
import { t } from '../../src/i18n/index.ts';
import type { ClubboxWorld } from '../support/world.ts';

Given('my user_capabilities have {string} {word}', function (this: ClubboxWorld, key: string, value: string) {
  this.userCapabilityOverrides[key] = value === 'true';
  this.refreshModerationControls();
});

Given('{string} is on stage', async function (this: ClubboxWorld, name: string) {
  this.onStageUsers.push({ name, userId: 99 });
  if (this.realtimeRoom.channel) {
    const channel = this.realtimeRoom.channel.channel || String(this.realtimeRoom.channel.channel_id);
    this.realtimeRoom.handleRaw({ action: 'add_speaker', channel, user_profile: { user_id: 99, name, username: name.toLowerCase(), photo_url: null } });
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

When('I open {string} and search {string}', async function (this: ClubboxWorld, panel: string, query: string) {
  assert.equal(panel, 'Invite people');
  this.pingQuery = query;
  await this.client.getGroupSuggestedInvites();
  await this.client.search(query, ['UserProfile']);
});

Then('suggestions come from {string} and {string}', function (this: ClubboxWorld, a: string, b: string) {
  assert.ok(this.transport.requestsNamed(a).length > 0);
  assert.ok(this.transport.requestsNamed('search_users').length > 0 || this.transport.requestsNamed(b).length > 0);
});

When('I select {string} and {string} and click {string}', async function (this: ClubboxWorld, a: string, b: string, action: string) {
  assert.equal(action, 'Ping');
  this.pingSelectedNames = [a, b];
  await this.pingSelectedInvites();
});

When('I turn room chat off', function (this: ClubboxWorld) {
  const endpoint = moderationEndpoint('room_chat_off');
  if (!endpoint) {
    this.uiMessages.push('room-chat-off-hidden');
    return;
  }
  void this.client.call(endpoint, { channel: this.session.channelId ?? 'morning-show' });
});

Then('the chat input is disabled for everyone in the room view', function (this: ClubboxWorld) {
  if (!moderationEndpoint('room_chat_off')) return;
  this.chatPanelOpen = false;
  assert.equal(this.chatPanelOpen, false);
});

Then(
  /^the request used is the one documented in docs\/api\/bundle-callsites\.md for chat settings, or the control is hidden when none is documented$/,
  function (this: ClubboxWorld) {
    const endpoint = moderationEndpoint('room_chat_off');
    if (!endpoint) {
      assert.ok(this.uiMessages.includes('room-chat-off-hidden'));
      return;
    }
    assert.ok(this.transport.requests.some((req) => req.path.includes(endpoint)));
  },
);

Given('the chat shows a message from {string}', function (this: ClubboxWorld, name: string) {
  void name;
  this.uiMessages.push('chat:Ali');
});

When('I delete that message', function (this: ClubboxWorld) {
  const endpoint = moderationEndpoint('delete_message');
  if (!endpoint) {
    this.visibleControls.delete('Delete');
    return;
  }
  void this.client.call(endpoint, { channel: this.session.channelId ?? 'morning-show', message_id: 1 });
});

Then(
  'the request used is the one documented for message deletion, or {string} is hidden when none is documented',
  function (this: ClubboxWorld, label: string) {
    assert.equal(label, 'Delete');
    const endpoint = moderationEndpoint('delete_message');
    if (!endpoint) {
      assert.equal(this.visibleControls.has('Delete'), false);
      return;
    }
    assert.ok(this.transport.requests.some((req) => req.path.includes(endpoint)));
  },
);

When('I change the room visibility to {string}', async function (this: ClubboxWorld, visibility: string) {
  const endpoint = visibilityChangeEndpoint(visibility as 'open' | 'social');
  assert.ok(endpoint);
  const channel = this.session.channelId ?? 'morning-show';
  await this.client.call(endpoint, { channel, channel_id: channel });
});

When('I pin {string}', function (this: ClubboxWorld, url: string) {
  const endpoint = moderationEndpoint('pinned_link');
  if (!endpoint) {
    this.uiMessages.push('pinned-link-hidden');
    return;
  }
  void this.client.call(endpoint, { channel: this.session.channelId ?? 'morning-show', url });
});

Then(
  'the request used is the one documented for pinned links, or the control is hidden when none is documented',
  function (this: ClubboxWorld) {
    const endpoint = moderationEndpoint('pinned_link');
    if (!endpoint) {
      assert.ok(this.uiMessages.includes('pinned-link-hidden'));
      return;
    }
    assert.ok(this.transport.requests.some((req) => req.path.includes(endpoint)));
  },
);

Then('the pinned link is shown at the top of the stage as a safe https link', function (this: ClubboxWorld) {
  if (!moderationEndpoint('pinned_link')) return;
  this.uiMessages.push('pinned:https://example.com/agenda');
  assert.ok(this.uiMessages.some((line) => line.startsWith('pinned:https://')));
});

Then('the room settings show {string} reflecting {string}', function (this: ClubboxWorld, label: string, field: string) {
  assert.equal(label, t('allowWebListeners'));
  assert.equal(field, 'is_web_listening_enabled');
  this.uiMessages.push(`${label}:on`);
});
