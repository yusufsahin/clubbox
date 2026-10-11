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
  selectedTopic: string | null = null;
  searchTabs = new Set<string>();
  currentRoom: string | null = null;
  role: 'audience' | 'host' | null = null;
  chatPanelOpen = false;
  micMuted = false;
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
    if (this.session.experimentalControlsVisible()) {
      const flags = roomControlFlags(
        this.effectiveUserCapabilities(),
        (endpoint) => this.client.supports(endpoint),
      );
      if (flags.canMuteEveryone) this.visibleControls.add('Mute everyone');
      if (flags.canEnd) this.visibleControls.add('End room');
      if (flags.canInvite) this.visibleControls.add('Invite to stage');
    } else {
      this.uiMessages.push('Available in the Clubhouse app');
    }
  }

  async chooseModeration(action: string, name: string): Promise<void> {
    const userId = this.onStageUsers.find((entry) => entry.name === name)?.userId ?? 99;
    const channel = this.session.channelId ?? 'morning-show';
    if (action === 'Make moderator') await this.client.makeModerator(channel, userId);
    else if (action === 'Move to audience') await this.client.uninviteSpeaker(channel, userId);
    else if (action === 'Block from room') await this.client.blockFromChannel(channel, userId);
    else assert.fail(`unknown moderation action ${action}`);
  }

  setVisibility(state: DocumentVisibilityState): void {
    this.visibilityState = state;
    this.session.setHidden(state === 'hidden');
    Object.defineProperty(this.dom.window.document, 'visibilityState', {
      configurable: true,
      get: () => this.visibilityState,
    });
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

  filteredHallway(): HallwayCard[] {
    if (!this.selectedTopic) return this.hallwayRooms;
    return this.hallwayRooms.filter((room) => room.topicKey === this.selectedTopic);
  }
}

setWorldConstructor(ClubboxWorld);
