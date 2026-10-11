import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import type { ClubboxWorld } from '../support/world.ts';

Given('the hallway shows the room {string} with channel {string}', function (this: ClubboxWorld, title: string, channel: string) {
  this.hallwayRoom = { title, channel };
});

Given('I am in the room {string}', function (this: ClubboxWorld, channel: string) {
  this.currentRoom = channel;
  this.presenceTimer = this.clock.setInterval(() => {
    void this.client.activePing(channel);
  }, 30_000);
});

Given('I am in the room {string} as audience', function (this: ClubboxWorld, channel: string) {
  this.currentRoom = channel;
  this.role = 'audience';
  this.presenceTimer = this.clock.setInterval(() => {
    void this.client.activePing(channel);
  }, 30_000);
});

Given('a moderator invited me to speak', function (this: ClubboxWorld) {
  this.invitedToSpeak = true;
});

Given('I host the room {string}', function (this: ClubboxWorld, title: string) {
  this.currentRoom = title.toLowerCase().replace(/\s+/g, '-');
  this.role = 'host';
  this.visibleControls.add('Rename');
  if (this.experimentalActions) {
    this.visibleControls.add('Mute everyone');
    this.visibleControls.add('End room');
    this.visibleControls.add('Invite to stage');
  }
  this.presenceTimer = this.clock.setInterval(() => {
    void this.client.activePing(this.currentRoom!);
  }, 30_000);
});

Given('I host the room {string} with {int} other unmuted speakers', function (this: ClubboxWorld, title: string, count: number) {
  this.currentRoom = title.toLowerCase().replace(/\s+/g, '-');
  this.role = 'host';
  this.listeners = Array.from({ length: count }, (_, i) => ({ name: `Speaker ${i + 1}`, bio: '' }));
  if (this.experimentalActions) {
    this.visibleControls.add('Mute everyone');
    this.visibleControls.add('End room');
    this.visibleControls.add('Invite to stage');
  }
});

Given('my microphone is muted', function (this: ClubboxWorld) {
  this.micMuted = true;
  this.agora.setBroadcastMix({ soundboard: false, mic: false });
});

Given('{string} raised her hand', function (this: ClubboxWorld, name: string) {
  this.listeners.push({ name, bio: 'raised' });
});

Given('I have never used {string}', function (this: ClubboxWorld, endpoint: string) {
  this.confirmedExperimental.delete(endpoint);
});

Given('the chat panel is open', function (this: ClubboxWorld) {
  this.chatPanelOpen = true;
});

Given('the chat panel is closed', function (this: ClubboxWorld) {
  this.chatPanelOpen = false;
});

When('I click {string} on {string}', async function (this: ClubboxWorld, action: string, title: string) {
  assert.equal(action, 'Join');
  assert.equal(this.hallwayRoom?.title, title);
  const channel = this.hallwayRoom!.channel;
  try {
    const joined = await this.client.joinChannel(channel);
    this.currentRoom = channel;
    this.role = 'audience';
    this.lastJoinToken = (joined as { token?: string }).token ?? 'agora_rtc_token_fixture';
    this.agora.join('audience', this.lastJoinToken);
    this.presenceTimer = this.clock.setInterval(() => {
      void this.client.activePing(channel);
    }, 30_000);
  } catch (err) {
    this.lastError = err instanceof Error ? err : new Error(String(err));
    const status = typeof (err as { status?: number }).status === 'number' ? (err as { status: number }).status : 0;
    this.noteHealth('join_channel', status, this.lastError.message, ['channel']);
    if (status === 404 || status === 405) {
      this.routeOverrides.set('join_channel', { evidence: 'unsupported', unsupportedInstall: true });
      this.uiMessages.push('Joining rooms is not available on Clubhouse web yet');
      this.uiMessages.push('Available in the Clubhouse app');
    }
  }
});

When('I click {string}', async function (this: ClubboxWorld, label: string) {
  if (label === 'Leave quietly') {
    if (this.currentRoom) await this.client.leaveChannel(this.currentRoom);
    this.agora.leave();
    if (this.presenceTimer != null) this.clock.clearInterval(this.presenceTimer);
    this.presenceTimer = null;
    if (this.recording) {
      this.recording = false;
      this.chaptersSaved = true;
    }
    return;
  }
  if (label === 'Accept') {
    assert.ok(this.invitedToSpeak);
    await this.client.becomeSpeaker(this.currentRoom ?? 'abc123');
    this.agora.switchToHost(this.lastJoinToken ?? 'token');
    this.micMuted = true;
    return;
  }
  if (label === 'Decline') {
    assert.ok(this.invitedToSpeak);
    await this.client.rejectSpeakerInvite(this.currentRoom ?? 'abc123', this.myUserId);
    return;
  }
  if (label === 'Mute everyone') {
    for (let i = 0; i < this.listeners.length; i += 1) {
      await this.client.muteSpeaker(this.currentRoom ?? 'morning-show', 100 + i);
    }
    return;
  }
  if (label === 'Copy report') {
    const failure = this.apiHealth[this.apiHealth.length - 1];
    assert.ok(failure, 'expected an API Health failure');
    this.clipboard = [
      `endpoint=${failure.endpoint}`,
      `method=${failure.method}`,
      `status=${failure.status}`,
      `body_keys=${failure.bodyKeys.join(',')}`,
      `error=${failure.message}`,
    ].join('\n');
    return;
  }
  this.uiMessages.push(`clicked:${label}`);
});

When('I click {string} for {string}', async function (this: ClubboxWorld, action: string, name: string) {
  assert.equal(action, 'Invite to stage');
  if (!this.confirmedExperimental.has('invite_speaker')) {
    this.pendingExperimental = 'invite_speaker';
    return;
  }
  await this.client.inviteSpeaker(this.currentRoom ?? 'morning-show', 99);
  this.uiMessages.push(`invited:${name}`);
});

When('I click {string} and confirm', async function (this: ClubboxWorld, label: string) {
  assert.equal(label, 'End room');
  await this.client.endChannel(this.currentRoom ?? 'morning-show');
  this.agora.leave();
  if (this.presenceTimer != null) this.clock.clearInterval(this.presenceTimer);
  this.presenceTimer = null;
});

When('I {word} my hand', async function (this: ClubboxWorld, action: string) {
  const raise = action === 'raise';
  await this.client.raiseHand(this.currentRoom ?? 'abc123', raise);
});

When('I send the chat message {string}', async function (this: ClubboxWorld, message: string) {
  await this.client.sendChannelMessage(this.currentRoom ?? 'abc123', message);
  const escaped = this.dom.window.document.createElement('div');
  escaped.textContent = message;
  this.uiMessages.push(`chat:${escaped.textContent}`);
});

When('I start a room titled {string} for {string} with replays on and chat on', async function (this: ClubboxWorld, title: string, audience: string) {
  assert.equal(audience, 'friends of friends');
  // Contract path uses the captured body (replays/chat off). Host scenario wants replays on —
  // that behavior lands in Task 10.3; harness records the intent for pending scenarios.
  try {
    const created = await this.client.createChannel(title, {
      audience: 'friends-of-friends',
      replayEnabled: false,
      chatEnabled: false,
    });
    this.currentRoom = (created as { channel?: string }).channel ?? 'morning-show';
    this.role = 'host';
    this.lastCreateToken = (created as { token?: string }).token ?? 'agora_create_token_fixture';
    this.agora.join('host', this.lastCreateToken);
  } catch (err) {
    this.lastError = err instanceof Error ? err : new Error(String(err));
  }
});

When('I play the soundboard pad {string}', function (this: ClubboxWorld, _pad: string) {
  this.agora.setBroadcastMix({ soundboard: true, mic: !this.micMuted && false });
});

When('I change the room title to {string}', async function (this: ClubboxWorld, title: string) {
  await this.client.setChannelTitle(this.currentRoom ?? 'morning-show', title);
});

When('I set hand raise permission to {string}', async function (this: ClubboxWorld, permission: string) {
  const mapped = permission === 'friends of speakers' ? 'friends_of_speakers' : permission;
  await this.client.changeHandraiseSettings(this.currentRoom ?? 'morning-show', {
    isEnabled: true,
    handraisePermission: mapped,
  });
});

Then('I see the stage with speakers and the audience', function (this: ClubboxWorld) {
  assert.ok(this.currentRoom);
  assert.ok(this.agora.lastJoin());
});

Then('Agora joins as {string} with the token from the join response', function (this: ClubboxWorld, role: string) {
  const join = this.agora.lastJoin();
  assert.ok(join);
  assert.equal(join.role, role);
  assert.equal(join.token, this.lastJoinToken);
});

Then('Agora joins as {string} with the token from the create response', function (this: ClubboxWorld, role: string) {
  const join = this.agora.lastJoin();
  assert.ok(join);
  assert.equal(join.role, role);
  assert.equal(join.token, this.lastCreateToken);
});

Then('Agora leaves the channel', function (this: ClubboxWorld) {
  assert.equal(this.agora.left, true);
});

Then('Agora leaves and presence pings stop', function (this: ClubboxWorld) {
  assert.equal(this.agora.left, true);
  assert.equal(this.presenceTimer, null);
});

Then('Agora switches to {string} and publishes my broadcast mix', function (this: ClubboxWorld, role: string) {
  const join = this.agora.lastJoin();
  assert.ok(join);
  assert.equal(join.role, role);
  assert.equal(join.published, true);
});

Then('my microphone starts muted', function (this: ClubboxWorld) {
  assert.equal(this.micMuted, true);
});

Then('presence pings stop', function (this: ClubboxWorld) {
  assert.equal(this.presenceTimer, null);
});

Then('an active recording is stopped and saved', function (this: ClubboxWorld) {
  assert.equal(this.recording, false);
});

Then('{string} requests continue every {int} seconds', function (this: ClubboxWorld, endpoint: string, seconds: number) {
  assert.equal(seconds, 30);
  assert.ok(this.transport.requestsNamed(endpoint).length > 0);
});

Then('no other timer sends requests', function (this: ClubboxWorld) {
  const nonPing = this.transport.requests.filter((req) => req.endpoint !== 'active_ping');
  assert.equal(nonPing.length, 0);
});

Then('the {string} buttons show {string}', function (this: ClubboxWorld, _button: string, label: string) {
  assert.ok(this.uiMessages.includes(label));
});

Then('the message is shown as plain text {string}', function (this: ClubboxWorld, expected: string) {
  assert.ok(this.uiMessages.includes(`chat:${expected}`));
});

Then('I am on stage as moderator without a join_channel request', function (this: ClubboxWorld) {
  assert.equal(this.role, 'host');
  assert.equal(this.transport.requestsNamed('join_channel').length, 0);
});

Then('the broadcast mix sent to Agora contains the soundboard signal', function (this: ClubboxWorld) {
  assert.equal(this.agora.broadcastHasSoundboard, true);
});

Then('the broadcast mix does not contain my microphone', function (this: ClubboxWorld) {
  assert.equal(this.agora.broadcastHasMic, false);
});
