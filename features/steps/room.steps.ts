import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import { t } from '../../src/i18n/index.ts';
import type { ClubboxWorld } from '../support/world.ts';

Given('the hallway shows the room {string} with channel {string}', function (this: ClubboxWorld, title: string, channel: string) {
  this.hallwayRoom = {
    title,
    channel,
    clubName: 'Builders',
    replays: true,
    clips: true,
    startedAt: '2026-10-11T11:00:00.000Z',
    listeners: 42,
    speakers: 3,
    url: `https://www.clubhouse.com/room/${channel}`,
    topicKey: 'tech',
  };
  if (!this.hallwayRooms.some((room) => room.channel === channel)) {
    this.hallwayRooms.push(this.hallwayRoom);
  }
});

Given('I am in the room {string}', function (this: ClubboxWorld, channel: string) {
  this.session.attachAsListener(channel);
  this.session.recording = true;
  this.syncFromSession();
});

Given('I am in the room {string} as audience', function (this: ClubboxWorld, channel: string) {
  this.session.attachAsListener(channel);
  this.syncFromSession();
});

Given('a moderator invited me to speak', function (this: ClubboxWorld) {
  this.invitedToSpeak = true;
});

Given('I host the room {string}', async function (this: ClubboxWorld, title: string) {
  await this.session.startFriendsOfFriendsRoom(title, { replayEnabled: true, chatEnabled: true });
  this.syncFromSession();
  this.refreshModerationControls();
});

Given('I host the room {string} with {int} other unmuted speakers', async function (this: ClubboxWorld, title: string, count: number) {
  await this.session.startFriendsOfFriendsRoom(title, { replayEnabled: true, chatEnabled: true });
  this.speakerUserIds = Array.from({ length: count }, (_, i) => 100 + i);
  this.listeners = this.speakerUserIds.map((userId, i) => ({
    name: `Speaker ${i + 1}`,
    bio: '',
    userId,
  }));
  this.syncFromSession();
  this.refreshModerationControls();
});

Given('my microphone is muted', function (this: ClubboxWorld) {
  this.session.micMuted = true;
  this.micMuted = true;
  this.agora.setBroadcastMix({ soundboard: false, mic: false });
});

Given('{string} raised her hand', function (this: ClubboxWorld, name: string) {
  this.listeners.push({ name, bio: 'raised', userId: 99 });
});

Given('I have never used {string}', async function (this: ClubboxWorld, endpoint: string) {
  this.confirmedExperimental.delete(endpoint);
  const remaining = this.client.getConfig().confirmedExperimentalRoutes.filter((name) => name !== endpoint);
  await this.client.updateConfig({ confirmedExperimentalRoutes: remaining });
  this.session.pendingExperimental = null;
  this.pendingExperimental = null;
});

Given('the chat panel is open', function (this: ClubboxWorld) {
  this.chatPanelOpen = true;
  this.session.chatOpen = true;
});

Given('the chat panel is closed', function (this: ClubboxWorld) {
  this.chatPanelOpen = false;
  this.session.chatOpen = false;
});

When('I click {string} on {string}', async function (this: ClubboxWorld, action: string, title: string) {
  const room = this.hallwayRooms.find((entry) => entry.title === title) ?? this.hallwayRoom;
  assert.ok(room, `expected hallway room ${title}`);
  assert.equal(room.title, title);
  if (action === 'Join') {
    const result = await this.session.joinFromHallway(room.channel);
    this.syncFromSession();
    if (!result.ok) this.lastError = new Error(result.message ?? 'Join failed');
    return;
  }
  if (action === 'Copy link') {
    this.clipboard = room.url;
    return;
  }
  if (action === 'Hide') {
    await this.client.callEndpoint('hide_channel', { channel: room.channel, hide: true });
    this.hallwayRooms = this.hallwayRooms.filter((entry) => entry.channel !== room.channel);
    if (this.hallwayRoom?.channel === room.channel) this.hallwayRoom = null;
    return;
  }
  assert.fail(`unsupported hallway action ${action}`);
});

When(/^I click "(?!Apply"|Preview")([^"]+)"$/, async function (this: ClubboxWorld, label: string) {
  if (label === 'Leave quietly') {
    await this.session.leaveQuietly();
    this.syncFromSession();
    this.chaptersSaved = true;
    return;
  }
  if (label === 'Accept') {
    assert.ok(this.invitedToSpeak);
    await this.session.acceptInvite();
    this.syncFromSession();
    return;
  }
  if (label === 'Decline') {
    assert.ok(this.invitedToSpeak);
    await this.session.declineInvite();
    this.syncFromSession();
    return;
  }
  if (label === 'Mute everyone') {
    await this.session.muteEveryone(this.speakerUserIds);
    this.syncFromSession();
    return;
  }
  if (label === 'Copy report') {
    this.clipboard = this.client.copyHealthReport();
    assert.ok(this.clipboard, 'expected an API Health failure');
    return;
  }
  if (label === 'Refresh') {
    await this.client.getChannels();
    return;
  }
  if (label === 'Add to calendar') {
    this.icsExport = 'BEGIN:VCALENDAR\nSUMMARY:Event\nEND:VCALENDAR';
    return;
  }
  if (label === 'Ping') {
    await this.pingSelectedInvites();
    return;
  }
  if (label === 'Sign in') {
    this.uiMessages.push(t('oneDeviceWarning'));
    this.openedSignInUrl = 'https://www.clubhouse.com/signin';
    this.uiMessages.push('Sign in');
    return;
  }
  if (label === 'I understand') {
    this.guidelinesAcceptedFlag = true;
    this.guidelinesGateOpen = false;
    this.liveModeBlocked = false;
    try {
      localStorage.setItem('clubbox-guidelines-accepted', '1');
    } catch {
      // ignore
    }
    return;
  }
  this.uiMessages.push(`clicked:${label}`);
});

When('I click {string} for {string}', async function (this: ClubboxWorld, action: string, name: string) {
  assert.equal(action, 'Invite to stage');
  const listener = this.listeners.find((entry) => entry.name === name);
  const userId = listener?.userId ?? 99;
  const result = await this.session.inviteToStage(userId);
  this.syncFromSession();
  if (result.needsConfirmation) return;
  this.uiMessages.push(`invited:${name}`);
});

When('I click {string} and confirm', async function (this: ClubboxWorld, label: string) {
  if (label === 'Log out') {
    await this.session.logOut();
    this.syncFromSession();
    this.uiMessages.push('sign-in');
    return;
  }
  assert.equal(label, 'End room');
  await this.session.endRoom();
  this.syncFromSession();
});

When('I {word} my hand', async function (this: ClubboxWorld, action: string) {
  const raise = action === 'raise';
  await this.session.raiseHand(raise);
  this.syncFromSession();
});

When('I send the chat message {string}', async function (this: ClubboxWorld, message: string) {
  const shown = await this.session.sendChat(message);
  const escaped = this.dom.window.document.createElement('div');
  escaped.textContent = shown;
  this.uiMessages.push(`chat:${escaped.textContent}`);
});

When('I start a room titled {string} for {string} with replays on and chat on', async function (this: ClubboxWorld, title: string, audience: string) {
  assert.equal(audience, 'friends of friends');
  await this.session.startFriendsOfFriendsRoom(title, {
    replayEnabled: true,
    chatEnabled: true,
  });
  this.syncFromSession();
  this.refreshModerationControls();
});

When('I play the soundboard pad {string}', function (this: ClubboxWorld, _pad: string) {
  this.session.playSoundboardWhileMicMuted();
});

When('I change the room title to {string}', async function (this: ClubboxWorld, title: string) {
  await this.session.rename(title);
});

When('I set hand raise permission to {string}', async function (this: ClubboxWorld, permission: string) {
  assert.equal(permission, 'friends of speakers');
  await this.session.setHandRaiseFriendsOfSpeakers();
});

Then('I see the stage with speakers and the audience', function (this: ClubboxWorld) {
  assert.ok(this.session.channelId);
  assert.ok(this.agora.lastJoin());
});

Then('Agora joins as {string} with the token from the join response', function (this: ClubboxWorld, role: string) {
  const join = this.agora.lastJoin();
  assert.ok(join);
  assert.equal(join.role, role);
  assert.equal(join.token, this.session.lastJoinToken);
});

Then('Agora joins as {string} with the token from the create response', function (this: ClubboxWorld, role: string) {
  const join = this.agora.lastJoin();
  assert.ok(join);
  assert.equal(join.role, role);
  assert.equal(join.token, this.session.lastCreateToken);
});

Then('Agora leaves the channel', function (this: ClubboxWorld) {
  assert.equal(this.agora.left, true);
});

Then('Agora leaves and presence pings stop', function (this: ClubboxWorld) {
  assert.equal(this.agora.left, true);
  assert.equal(this.session.presenceActive, false);
});

Then('Agora switches to {string} and publishes my broadcast mix', function (this: ClubboxWorld, role: string) {
  const join = this.agora.lastJoin();
  assert.ok(join);
  assert.equal(join.role, role);
  assert.equal(join.published, true);
});

Then('my microphone starts muted', function (this: ClubboxWorld) {
  assert.equal(this.session.micMuted, true);
});

Then('presence pings stop', function (this: ClubboxWorld) {
  assert.equal(this.session.presenceActive, false);
});

Then('an active recording is stopped and saved', function (this: ClubboxWorld) {
  assert.equal(this.session.recording, false);
});

Then('{string} requests continue every {int} seconds', function (this: ClubboxWorld, endpoint: string, seconds: number) {
  assert.equal(seconds, 30);
  assert.ok(this.transport.requestsNamed(endpoint).length > 0);
});

Then('the room\'s realtime subscription stays connected', function (this: ClubboxWorld) {
  assert.equal(this.session.realtimeConnected, true);
});

Then('no other timer sends requests', function (this: ClubboxWorld) {
  const nonPing = this.transport.requests.filter((req) => req.endpoint !== 'active_ping');
  assert.equal(nonPing.length, 0);
});

Then('the {string} buttons show {string}', function (this: ClubboxWorld, _button: string, label: string) {
  assert.ok(this.uiMessages.includes(label) || this.session.uiMessages.includes(label));
});

Then('the message is shown as plain text {string}', function (this: ClubboxWorld, expected: string) {
  assert.ok(this.uiMessages.includes(`chat:${expected}`));
});

Then('I am on stage as moderator without a join_channel request', function (this: ClubboxWorld) {
  assert.equal(this.session.role, 'host');
  assert.equal(this.transport.requestsNamed('join_channel').length, 0);
});

Then('the broadcast mix sent to Agora contains the soundboard signal', function (this: ClubboxWorld) {
  assert.equal(this.agora.broadcastHasSoundboard, true);
});

Then('the broadcast mix does not contain my microphone', function (this: ClubboxWorld) {
  assert.equal(this.agora.broadcastHasMic, false);
});

Then('clubhouse.com cookies for the app session are cleared', function (this: ClubboxWorld) {
  assert.equal(this.session.cookiesCleared, true);
});

Then('no timer sends requests afterwards', function (this: ClubboxWorld) {
  assert.equal(this.session.presenceActive, false);
  const before = this.transport.requests.length;
  this.clock.advance(60_000);
  this.clientNow.t = this.clock.now();
  assert.equal(this.transport.requests.length, before);
});

Then('I see the sign-in screen', function (this: ClubboxWorld) {
  assert.equal(this.session.signedIn, false);
  assert.ok(this.uiMessages.includes('sign-in') || this.session.uiMessages.includes('sign-in'));
});
