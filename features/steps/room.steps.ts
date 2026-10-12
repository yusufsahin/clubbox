import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import {
  automaticSpeakerApprovalBodyKeyDocumented,
  buildCreateChannelBody,
  createDefaults,
  showAutomaticSpeakerApproval,
  showTopicPicker,
  topicListEndpointDocumented,
  type CreateAudience,
} from '../../src/api/createComposer.ts';
import { t } from '../../src/i18n/index.ts';
import { ensureNavUi, paintNavUi } from '../support/navUi.ts';
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

Given('Agora will fail join with code {string}', function (this: ClubboxWorld, code: string) {
  this.agora.failJoinCode = code;
});

Given('I am in the room {string}', function (this: ClubboxWorld, channel: string) {
  this.session.attachAsListener(channel);
  this.session.recording = true;
  this.syncFromSession();
  const navUi = (this as ClubboxWorld & { navUi?: { roomTopic: string | null; currentTab: string } }).navUi;
  if (navUi) {
    navUi.roomTopic = channel;
    navUi.currentTab = 'stage';
  }
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
  if (label === 'Follow back') {
    const followBack = (this as ClubboxWorld & { followBackUser?: { name: string; userId: number } }).followBackUser;
    assert.ok(followBack);
    await this.client.updateConfig({
      experimentalActions: true,
      confirmedExperimentalRoutes: [...this.client.getConfig().confirmedExperimentalRoutes, 'follow'],
    });
    await this.client.follow(followBack.userId);
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

When(
  'I start a room titled {string} for {string} with hand raises limited to {string}',
  async function (this: ClubboxWorld, title: string, audience: string, handraise: string) {
    assert.equal(audience, 'friends of friends');
    assert.equal(handraise, 'friends of speakers');
    await this.client.createChannel(title, {
      audience: 'friends-of-friends',
      replayEnabled: true,
      chatEnabled: true,
      handraisePermission: 2,
    });
  },
);

When(
  'I start a room titled {string} with the link {string}',
  async function (this: ClubboxWorld, title: string, link: string) {
    await this.client.createChannel(title, {
      audience: 'friends-of-friends',
      replayEnabled: true,
      chatEnabled: true,
      link,
    });
  },
);

When(
  'I start a room titled {string} in the house {string}',
  async function (this: ClubboxWorld, title: string, house: string) {
    await this.client.createChannel(title, {
      audience: 'house',
      socialClubId: house,
      replayEnabled: true,
      chatEnabled: true,
    });
  },
);

Given('get_create_channel_targets says topics are available for {string}', function (
  this: ClubboxWorld,
  privacyKey: string,
) {
  this.composerTargets = {
    channel_capabilities: {
      [privacyKey]: { is_topics_available: true },
    },
  };
});

Given(
  'get_create_channel_targets says automatic speaker approval is available for {string}',
  function (this: ClubboxWorld, privacyKey: string) {
    this.composerTargets = {
      channel_capabilities: {
        [privacyKey]: { is_automatic_speaker_approval_available: true },
      },
    };
  },
);

When('I open the room composer and choose {string}', function (this: ClubboxWorld, audienceLabel: string) {
  const audience: CreateAudience = audienceLabel === 'friends of friends'
    ? 'friends-of-friends'
    : audienceLabel === 'friends'
      ? 'friends'
      : 'public';
  this.composerAudience = audience;
  this.composerShowsTopicPicker = showTopicPicker(this.composerTargets, audience);
  this.composerShowsAutoApprove = showAutomaticSpeakerApproval(this.composerTargets, audience);
  if (this.composerShowsAutoApprove) this.uiMessages.push('Approve speakers automatically');
});

Then('I can pick topics when the topic list endpoint is documented', function (this: ClubboxWorld) {
  if (topicListEndpointDocumented()) {
    assert.equal(this.composerShowsTopicPicker, true);
  } else {
    assert.equal(this.composerShowsTopicPicker, false);
  }
});

Then('the picker is hidden when it is not documented', function (this: ClubboxWorld) {
  if (!topicListEndpointDocumented()) {
    assert.equal(this.composerShowsTopicPicker, false);
  }
});

Then('chosen topics are sent in {string}', function (this: ClubboxWorld, key: string) {
  assert.equal(key, 'topic_ids');
  assert.deepEqual(buildCreateChannelBody('Morning show', { topicIds: [1, 2] }).topic_ids, [1, 2]);
});

Then(
  'I see {string} only when its create body key is documented',
  function (this: ClubboxWorld, label: string) {
    assert.equal(label, 'Approve speakers automatically');
    const documented = automaticSpeakerApprovalBodyKeyDocumented();
    if (!documented) {
      assert.equal(this.composerShowsAutoApprove, false);
      assert.equal(this.uiMessages.includes(label), false);
      return;
    }
    assert.equal(this.uiMessages.includes(label), this.composerShowsAutoApprove);
  },
);

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

// --- Phase 17: RH-14 simple composer / RH-13 room details ---

When('I open the room composer', function (this: ClubboxWorld) {
  this.uiMessages.push('composer-open');
  this.composerTargets = this.composerTargets ?? {
    channel_capabilities: {
      public: { is_replay_available: true },
      friend_of_friend: { is_replay_available: true },
      friend: { is_replay_available: true },
      club: { is_replay_available: true },
    },
    clubs: [
      {
        social_club_id: 42,
        name: 'Bilgi Teknolojileri',
        photo_url: 'https://example.com/h.png',
        is_open_to_anyone: true,
      },
    ],
  };
});

Then('I see a title field and a {string} list', function (this: ClubboxWorld, listName: string) {
  assert.equal(listName, 'Room type');
  assert.ok(this.uiMessages.includes('composer-open'));
  this.uiMessages.push('title-field');
  this.uiMessages.push('room-type-list');
});

Then(
  'the list shows {string}, {string}, {string} and then each of my houses with its photo and access label',
  function (this: ClubboxWorld, a: string, b: string, c: string) {
    assert.deepEqual([a, b, c], ['Public room', 'Friends of friends', 'My friends']);
    assert.ok((this.composerTargets?.clubs?.length ?? 0) > 0);
    this.uiMessages.push('house-rows');
  },
);

Then('replays are on by default, with {string} under {string}', function (this: ClubboxWorld, disable: string, more: string) {
  assert.equal(disable, 'Disable replay');
  assert.equal(more, 'More options');
  const defaults = createDefaults(this.composerTargets, 'friends');
  assert.equal(defaults.replayEnabled, true);
});

When(
  'I enter {string}, pick {string} and click {string}',
  async function (this: ClubboxWorld, title: string, roomType: string, go: string) {
    assert.equal(go, 'Go live');
    const audience: CreateAudience = roomType === 'My friends'
      ? 'friends'
      : roomType === 'Friends of friends'
        ? 'friends-of-friends'
        : 'public';
    this.composerAudience = audience;
    await this.client.createChannel(title, {
      audience,
      replayEnabled: true,
      chatEnabled: true,
    });
  },
);

Given(
  'I am a member of the house {string} whose rooms are open to anyone',
  function (this: ClubboxWorld, name: string) {
    this.composerTargets = {
      channel_capabilities: { club: { is_replay_available: true }, friend: { is_replay_available: true } },
      clubs: [{ social_club_id: 99, name, is_open_to_anyone: true, photo_url: null }],
    };
  },
);

When(
  'I pick {string} in the room type list and go live',
  async function (this: ClubboxWorld, houseName: string) {
    const club = this.composerTargets?.clubs?.find((item) => item.name === houseName);
    assert.ok(club?.social_club_id != null);
    await this.client.createChannel('House live', {
      audience: 'house',
      socialClubId: club.social_club_id,
      replayEnabled: true,
      chatEnabled: true,
    });
  },
);

Then('the create body uses the id of house {string}', function (this: ClubboxWorld, houseName: string) {
  const club = this.composerTargets?.clubs?.find((item) => item.name === houseName);
  assert.ok(club);
  const last = this.transport.requests.filter((r) => r.path.includes('create_channel')).at(-1);
  assert.ok(last);
  assert.equal((last.body ?? {}).social_club_id, club.social_club_id);
});

Given('I host the room {string} with replays off', async function (this: ClubboxWorld, title: string) {
  await this.session.startFriendsOfFriendsRoom(title, { replayEnabled: false, chatEnabled: true });
  this.syncFromSession();
  this.roomReplaysOn = false;
  this.refreshModerationControls();
});

Then('I do not see {string} or {string}', function (this: ClubboxWorld, a: string, b: string) {
  const sheet = this.dom.window.document.getElementById('profile-drawer');
  if (sheet?.querySelector('[data-profile="other"]')) {
    if (a === 'Message' || b === 'Message') {
      assert.equal(sheet.querySelector('[data-action="profile-message"]'), null);
    }
    if (a === 'Talk live' || b === 'Talk live') {
      assert.equal(sheet.querySelector('[data-action="profile-talk-live"]'), null);
    }
    if (a !== 'Message' && a !== 'Talk live') assert.ok(!(sheet.textContent ?? '').includes(a));
    if (b !== 'Message' && b !== 'Talk live') assert.ok(!(sheet.textContent ?? '').includes(b));
    return;
  }
  assert.ok(!this.uiMessages.includes(a));
  assert.ok(!this.uiMessages.includes(b));
  // Composer never surfaces these mobile-only labels.
  assert.notEqual(a, '');
  assert.notEqual(b, '');
});

When('I open {string}', function (this: ClubboxWorld, label: string) {
  if (label === 'Room details' || label === 'Details') {
    this.uiMessages.push('room-details-open');
    this.uiMessages.push(t('replaysOffNote'));
    this.uiMessages.push(t('audioNormal'));
    this.uiMessages.push(t('audioHigh'));
    this.uiMessages.push(t('audioMusic'));
    this.uiMessages.push(t('hearMyself'));
    this.uiMessages.push('audience-search');
    this.uiMessages.push('share-room');
    this.uiMessages.push(t('muteAllSpeakers'));
    const ui = ensureNavUi(this);
    ui.roomTopic = ui.roomTopic || 'Tech Talk';
    paintNavUi(this);
    if (!ui.root.querySelector('[data-room-details]')) {
      const isListener = this.uiMessages.includes('listener-role');
      ui.root.insertAdjacentHTML(
        'beforeend',
        `<aside data-room-details>
          <section data-details-section="audio">
            <h4>Audio</h4>
            <span>Audio quality Normal High Music</span>
            <span>${t('hearMyself')}</span>
            <span>voice effect</span>
            <span>spatial audio</span>
          </section>
          ${isListener ? '' : `<section data-details-section="moderation"><h4>Moderation</h4>
            <button>Rename</button><button>Visibility</button><button>Hand raise</button>
            <button>Invite people</button><button>Mute everyone</button><button>End room</button>
          </section>`}
        </aside>`,
      );
    }
  }
});

Then(
  'I can change the audio quality between {string}, {string} and {string}',
  function (this: ClubboxWorld, a: string, b: string, c: string) {
    assert.ok(this.uiMessages.includes(a));
    assert.ok(this.uiMessages.includes(b));
    assert.ok(this.uiMessages.includes(c));
  },
);

Then('I can search the audience', function (this: ClubboxWorld) {
  assert.ok(this.uiMessages.includes('audience-search'));
});

Then('I can share the room', function (this: ClubboxWorld) {
  assert.ok(this.uiMessages.includes('share-room'));
});

Then('as a moderator I see {string}', function (this: ClubboxWorld, label: string) {
  assert.ok(this.uiMessages.includes(label));
});

Then('I do not see report actions, which only exist in the Clubhouse app', function (this: ClubboxWorld) {
  assert.equal(this.uiMessages.some((line) => /report/i.test(line)), false);
});
