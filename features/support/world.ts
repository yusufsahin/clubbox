import assert from 'node:assert/strict';
import { World, setWorldConstructor, type IWorldOptions } from '@cucumber/cucumber';
import { JSDOM } from 'jsdom';
import { ClubhouseApiClient } from '../../src/api/client.ts';
import { roomControlFlags, type UserCapabilities } from '../../src/api/roomControls.ts';
import { RoomSessionController } from '../../src/api/roomSession.ts';
import { readAudioPrefs, writeAudioPrefs } from '../../src/audio/audioPrefs.ts';
import { setLanguage, type Language } from '../../src/i18n/index.ts';
import webApiRoutes from '../../electron/webApiRoutes.json' with { type: 'json' };
import { FakeAgora } from './fakeAgora.ts';
import { FakeClock } from './fakeClock.ts';
import { FakeTransport } from './fakeTransport.ts';
import { FakePubNub } from './fakePubnub.ts';
import { RealtimeRoomCoordinator } from '../../src/api/realtimeRoomCoordinator.ts';
import {
  channelHasFriendSpeaker,
  prepareHallwayChannels,
  prepareHallwayFeedRooms,
} from '../../src/hallway/hallwayDisplay.ts';
import { defaultHallwayPrefs, readHallwayPrefs, type HallwayPrefs } from '../../src/hallway/hallwayPrefs.ts';
import { SavedSearchTicker } from '../../src/hallway/savedSearchTicker.ts';
import {
  adjustZoomPercent,
  applyThemeToDocument,
  readAppPrefs,
  writeAppPrefs,
  type ThemeChoice,
} from '../../src/app/appPrefs.ts';
import {
  applyEffect,
  defaultVoiceEffectState,
  pickEffect,
  startPreview,
  type VoiceEffectState,
} from '../../src/audio/voiceEffects.ts';
import type { CHUser } from '../../src/api/types.ts';
import { clipButtonVisible, validateClipDurationSeconds } from '../../src/audio/clipRules.ts';
import { roomAudience } from '../../src/api/guards.ts';
import { t } from '../../src/i18n/index.ts';

export type ApiHealthEntry = {
  endpoint: string;
  method: string;
  status: number;
  message: string;
  bodyKeys: string[];
  time: string;
};

export type RouteOverride = {
  evidence?: string;
  disabledForSession?: boolean;
  unsupportedInstall?: boolean;
};

export type HallwayCard = {
  title: string;
  channel: string;
  clubName: string;
  replays: boolean;
  clips: boolean;
  startedAt: string;
  listeners: number;
  speakers: number;
  url: string;
  topicKey: string;
  is_nsfw?: boolean;
  friendSpeaker?: string;
  users?: Array<{ name: string; is_speaker?: boolean; follow_status?: string }>;
};

export type StudioPad = {
  name: string;
  hotkey: string;
  file?: string;
  playing: boolean;
};

function ensureDom(): JSDOM {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://clubbox.local/',
    pretendToBeVisual: true,
  });
  const g = globalThis as typeof globalThis & {
    window: Window & typeof globalThis;
    document: Document;
    localStorage: Storage;
    HTMLElement: typeof HTMLElement;
  };
  g.window = dom.window as unknown as Window & typeof globalThis;
  g.document = dom.window.document;
  g.localStorage = dom.window.localStorage;
  g.HTMLElement = dom.window.HTMLElement;
  Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true });
  return dom;
}

export function communityEndpoints(): string[] {
  return Object.entries(webApiRoutes as Record<string, { evidence?: string }>)
    .filter(([, route]) => route.evidence === 'community')
    .map(([name]) => name);
}

export class ClubboxWorld extends World {
  dom: JSDOM;
  transport: FakeTransport;
  client: ClubhouseApiClient;
  clock: FakeClock;
  agora: FakeAgora;
  pubnub: FakePubNub;
  realtimeRoom: RealtimeRoomCoordinator;
  session: RoomSessionController;
  visibilityState: DocumentVisibilityState = 'visible';
  experimentalActions = false;
  requestLogging = false;
  signedIn = false;
  hallwayRoom: HallwayCard | null = null;
  hallwayRooms: HallwayCard[] = [];
  hallwayTopics: string[] = [];
  hallwayPrefs: HallwayPrefs = defaultHallwayPrefs();
  hallwayDisplayRooms: HallwayCard[] = [];
  selectedTopic: string | null = null;
  feedNextCursor: string | null = null;
  conversationsNextCursor: string | null = null;
  visibleConversationIds: string[] = [];
  replayId: string | null = null;
  replayChunkCount = 0;
  searchTabs = new Set<string>();
  currentRoom: string | null = null;
  role: 'audience' | 'host' | null = null;
  chatPanelOpen = false;
  micMuted = false;
  stageBadgeUsers: CHUser[] = [];
  invitedToSpeak = false;
  lastJoinToken: string | null = null;
  lastCreateToken: string | null = null;
  apiHealth: ApiHealthEntry[] = [];
  routeOverrides = new Map<string, RouteOverride>();
  confirmedExperimental = new Set<string>();
  pendingExperimental: string | null = null;
  clipboard = '';
  redactedLog: Array<{ endpoint: string; status: number }> = [];
  uiMessages: string[] = [];
  visibleControls = new Set<string>();
  userCapabilityOverrides: UserCapabilities = {};
  speakerMuteVisible = true;
  pendingBlockConfirm = false;
  onStageUsers: Array<{ name: string; userId: number }> = [];
  chapterLines: string[] = [];
  chaptersSaved = false;
  recording = false;
  recordingStartedAt: string | null = null;
  replaysOn = true;
  localRecordingAllowed = false;
  audienceFilter = '';
  listeners: Array<{ name: string; bio: string; userId?: number }> = [];
  speakerUserIds: number[] = [];
  openedTarget: string | null = null;
  presenceTimer: number | null = null;
  lastError: Error | null = null;
  myUserId = 42;
  clientNow = { t: Date.parse('2026-10-11T12:00:00.000Z') };
  sidebarName: string | null = null;
  openedSignInUrl: string | null = null;
  calledRecaptcha = false;
  guidelinesAcceptedFlag = true;
  guidelinesGateOpen = false;
  liveModeBlocked = false;
  profileOpen: { username: string; userId: number } | null = null;
  profileFollowing = false;
  unfollowDocumented = false;
  musicMode = false;
  speaking = false;
  lastMicConstraints: MediaTrackConstraints | null = null;
  monitorEnabled = false;
  hearOwnMic = false;
  inputDeviceLabel = '';
  outputDeviceLabel = '';
  micGainPercent = 100;
  studioPads: StudioPad[] = [
    { name: 'Applause', hotkey: '1', playing: false },
  ];
  soundboardVolume = 0.8;
  soundboardVolumeBeforeDuck: number | null = null;
  language: Language = 'en';
  openConversationId: string | null = null;
  conversationThread: unknown = null;
  pendingVoiceSegmentId: string | null = null;
  voicePlaybackRate = 1;
  usedSandboxThread = false;
  messageFilter: 'all' | 'house' | 'vm' = 'all';
  openHouseSlug: string | null = null;
  houseAdmin = false;
  houseChatReadOnly = false;
  houseThreadMessageId: string | null = null;
  icsExport = '';
  replayOpen = false;
  replayRates: number[] = [];
  replaySkipSeconds = 0;
  pingQuery = '';
  pingSelectedNames: string[] = [];
  onlineFriendsLoaded = false;
  onlineFriends: Array<{ name: string; roomTitle?: string; channel?: string; userId: number }> = [];
  savedSearch: SavedSearchTicker;
  themeChoice: ThemeChoice = 'dark';
  zoomPercent = 100;
  windowFocused = true;
  voiceEffects: VoiceEffectState = defaultVoiceEffectState();
  spatialAudioEnabled = false;
  clipButtonShown = false;
  localRecordingAllowed = false;
  roomReplaysOn = true;
  hostClipsEnabled = true;
  roomAudienceType: ReturnType<typeof roomAudience> = 'public';
  handRaised = false;
  /** BDD: join should surface web-listening-off notice (Phase 23.5 soft UX). */
  roomWebListeningDisabled = false;
  desktopNotificationsOn = false;
  windowMinimized = false;
  pendingPingRoomTitle: string | null = null;
  searchRequestsSnapshot = 0;
  composerTargets: import('../../src/api/createComposer.ts').CreateChannelTargets | null = null;
  composerAudience: import('../../src/api/createComposer.ts').CreateAudience | null = null;
  composerShowsTopicPicker = false;
  composerShowsAutoApprove = false;

  constructor(options: IWorldOptions) {
    super(options);
    this.dom = ensureDom();
    this.transport = new FakeTransport();
    this.clock = new FakeClock();
    this.agora = new FakeAgora();
    this.pubnub = new FakePubNub();
    this.clientNow = { t: this.clock.now() };
    this.client = new ClubhouseApiClient({
      useSandbox: false,
      webSession: true,
      userId: this.myUserId,
      experimentalActions: false,
      requestLogging: false,
      transport: this.transport,
      now: () => this.clientNow.t,
    });
    this.realtimeRoom = new RealtimeRoomCoordinator({
      client: this.client,
      hub: this.pubnub,
      myUserId: this.myUserId,
      setInterval: (fn, ms) => this.clock.setInterval(fn, ms),
      clearInterval: (id) => this.clock.clearInterval(id),
      callbacks: {
        onUiMessage: (message) => this.uiMessages.push(message),
        onInvite: () => {
          this.invitedToSpeak = true;
          this.uiMessages.push('Accept');
          this.uiMessages.push('Decline');
        },
        onRoomEnded: () => {
          this.agora.leave();
          this.realtimeRoom.stop();
        },
        onStatus: (reconnecting) => {
          if (reconnecting) this.uiMessages.push('Reconnecting…');
        },
      },
    });
    // Same path as live: Agora mute events update room users via the coordinator.
    this.agora.onRemoteMute(({ uid, muted }) => {
      this.realtimeRoom.applyAgoraMute(uid, muted);
      this.syncFromRealtime();
    });
    this.session = new RoomSessionController({
      client: this.client,
      agora: this.agora,
      myUserId: this.myUserId,
      setInterval: (fn, ms) => this.clock.setInterval(fn, ms),
      clearInterval: (id) => this.clock.clearInterval(id),
      realtime: {
        subscribe: (channelId: string) => {
          this.pubnub.subscribe({
            channelId,
            token: 'pubnub_token_fixture',
            origin: 'clubhouse.pubnubapi.com',
            uuid: String(this.myUserId),
            heartbeat: 20,
            heartbeatInterval: 9,
          });
        },
        unsubscribe: () => this.pubnub.unsubscribe(),
      },
    });
    this.client.onAuthExpired(() => {
      this.signedIn = false;
    });
    this.unfollowDocumented = 'unfollow' in (webApiRoutes as Record<string, unknown>);
    this.savedSearch = new SavedSearchTicker({
      setInterval: (fn, ms) => this.clock.setInterval(fn, ms),
      clearInterval: (id) => this.clock.clearInterval(id),
      now: () => this.clock.now(),
      isHidden: () => this.visibilityState === 'hidden',
      onSearch: (query) => {
        void this.client.search(query, ['UserProfile', 'LiveChannel', 'SocialClub']);
      },
    });
  }

  syncFromRealtime(): void {
    this.currentRoom = this.realtimeRoom.channel?.channel ?? null;
    this.chatPanelOpen = this.realtimeRoom.chatOpen;
    this.presenceTimer = this.realtimeRoom.presenceActive ? 1 : null;
    this.invitedToSpeak = this.realtimeRoom.inviteVisible();
  }

  syncFromSession(): void {
    this.currentRoom = this.session.channelId;
    this.role = this.session.role;
    this.lastJoinToken = this.session.lastJoinToken;
    this.lastCreateToken = this.session.lastCreateToken;
    this.micMuted = this.session.micMuted;
    this.signedIn = this.session.signedIn;
    this.recording = this.session.recording;
    this.pendingExperimental = this.session.pendingExperimental;
    this.presenceTimer = this.session.presenceActive ? 1 : null;
    for (const message of this.session.uiMessages) {
      if (!this.uiMessages.includes(message)) this.uiMessages.push(message);
    }
  }

  effectiveUserCapabilities(): UserCapabilities {
    return {
      can_mute_speakers: true,
      can_end_room: true,
      can_remove_speakers: true,
      can_invite: true,
      can_edit_room_title: true,
      ...this.userCapabilityOverrides,
    };
  }

  refreshModerationControls(): void {
    this.refreshHostControls();
    const flags = roomControlFlags(
      this.effectiveUserCapabilities(),
      (endpoint) => this.client.supports(endpoint),
    );
    this.speakerMuteVisible = flags.canMute;
  }

  refreshHostControls(): void {
    this.visibleControls.delete('Mute everyone');
    this.visibleControls.delete('End room');
    this.visibleControls.delete('Invite to stage');
    this.visibleControls.add('Rename');
    const flags = roomControlFlags(
      this.effectiveUserCapabilities(),
      (endpoint) => this.client.supports(endpoint),
    );
    if (flags.canMuteEveryone) this.visibleControls.add('Mute everyone');
    if (flags.canEnd) this.visibleControls.add('End room');
    if (flags.canInvite) this.visibleControls.add('Invite to stage');
  }

  async chooseModeration(action: string, name: string): Promise<void> {
    const userId = this.onStageUsers.find((entry) => entry.name === name)?.userId ?? 99;
    const channel = this.session.channelId ?? 'morning-show';
    if (action === 'Make moderator') await this.client.makeModerator(channel, userId);
    else if (action === 'Move to audience') await this.client.moveToAudience(channel, userId);
    else if (action === 'Block from room') await this.client.blockFromChannel(channel, userId);
    else assert.fail(`unknown moderation action ${action}`);
  }

  setVisibility(state: DocumentVisibilityState): void {
    this.visibilityState = state;
    this.session.setHidden(state === 'hidden');
    this.savedSearch.setHidden(state === 'hidden');
    Object.defineProperty(this.dom.window.document, 'visibilityState', {
      configurable: true,
      get: () => this.visibilityState,
    });
  }

  refreshClipButtonVisibility(): void {
    this.clipButtonShown = clipButtonVisible({
      allowLocalRecording: this.localRecordingAllowed,
      replayEnabled: this.roomReplaysOn,
      hostClipsEnabled: this.hostClipsEnabled,
      audience: this.roomAudienceType,
    });
  }

  dispatchGlobalShortcut(action: string): void {
    if (action === 'mute') {
      this.micMuted = !this.micMuted;
      return;
    }
    if (action === 'raise hand') {
      this.handRaised = !this.handRaised;
      return;
    }
    if (action === 'accept invite') {
      if (this.invitedToSpeak) this.invitedToSpeak = false;
      return;
    }
    if (action === 'decline invite') {
      this.invitedToSpeak = false;
      return;
    }
    if (action === 'pad 1') {
      const pad = this.studioPads.find((entry) => entry.hotkey === '1');
      if (pad) pad.playing = true;
    }
  }

  noteHealth(endpoint: string, status: number, message: string, bodyKeys: string[] = []): void {
    this.apiHealth.push({
      endpoint,
      method: 'POST',
      status,
      message,
      bodyKeys,
      time: new Date(this.clock.now()).toISOString(),
    });
  }

  persistStudioDevices(): void {
    writeAudioPrefs({
      ...readAudioPrefs(),
      inputDeviceId: this.inputDeviceLabel,
      outputDeviceId: this.outputDeviceLabel,
      micVolume: this.micGainPercent / 100,
      monitorEnabled: this.monitorEnabled,
    });
  }

  restoreStudioDevices(): void {
    const prefs = readAudioPrefs();
    this.inputDeviceLabel = prefs.inputDeviceId;
    this.outputDeviceLabel = prefs.outputDeviceId;
    this.micGainPercent = Math.round(prefs.micVolume * 100);
    this.monitorEnabled = prefs.monitorEnabled;
  }

  persistPads(): void {
    try {
      localStorage.setItem('clubbox_bdd_pads', JSON.stringify(this.studioPads.map((pad) => ({
        name: pad.name,
        hotkey: pad.hotkey,
        file: pad.file,
      }))));
    } catch {
      // ignore
    }
  }

  restorePads(): void {
    try {
      const raw = localStorage.getItem('clubbox_bdd_pads');
      if (!raw) return;
      const parsed = JSON.parse(raw) as Array<{ name: string; hotkey: string; file?: string }>;
      this.studioPads = parsed.map((pad) => ({ ...pad, playing: false }));
    } catch {
      // ignore
    }
  }

  setLang(next: Language): void {
    this.language = next;
    setLanguage(next);
  }

  /** Same pipeline as ClubboxApp.displayedHallwayChannels (prepareHallwayChannels). */
  hallwayRoomsForSelection(): HallwayCard[] {
    const feed = this.hallwayRooms.map((room) => ({
      ...room,
      topic: room.title,
      topic_key: room.topicKey || undefined,
      users: room.users ?? [],
    }));
    return prepareHallwayChannels(feed, this.hallwayPrefs, this.selectedTopic).map((room) => ({
      title: room.title,
      channel: room.channel,
      clubName: room.clubName,
      replays: room.replays,
      clips: room.clips,
      startedAt: room.startedAt,
      listeners: room.listeners,
      speakers: room.speakers,
      url: room.url,
      topicKey: room.topic_key ?? room.topicKey ?? '',
      is_nsfw: room.is_nsfw,
      friendSpeaker: room.friendSpeaker,
      users: room.users,
    }));
  }

  conversationSegments(): Array<{ transcription?: string; text?: string }> {
    const raw = this.conversationThread as { conversation?: { segments?: unknown[] } } | null;
    const segments = raw?.conversation?.segments ?? [
      { transcription: 'hello', text: 'hello', reactions: ['❤️'] },
    ];
    return segments as Array<{ transcription?: string; text?: string }>;
  }

  async pingSelectedInvites(): Promise<void> {
    const channel = this.session.channelId ?? 'morning-show';
    const ids: Record<string, number> = { Ayse: 10, Ali: 11 };
    for (const name of this.pingSelectedNames) {
      const userId = ids[name] ?? 99;
      await this.client.inviteToExistingChannel(channel, userId);
    }
  }

  hallwayDisplayRoomsFromPrefs(): HallwayCard[] {
    const feed = this.hallwayRooms.map((room) => ({
      ...room,
      users: room.users ?? [],
    }));
    return prepareHallwayFeedRooms(feed, this.hallwayPrefs).map((room) => ({
      ...room,
      friendSpeaker: room.friendSpeaker ?? channelHasFriendSpeaker(room.users ?? [])?.name,
    }));
  }
}

setWorldConstructor(ClubboxWorld);
