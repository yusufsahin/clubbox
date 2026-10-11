import { World, setWorldConstructor, type IWorldOptions } from '@cucumber/cucumber';
import { JSDOM } from 'jsdom';
import { ClubhouseApiClient } from '../../src/api/client.ts';
import { RoomSessionController } from '../../src/api/roomSession.ts';
import webApiRoutes from '../../electron/webApiRoutes.json' with { type: 'json' };
import { FakeAgora } from './fakeAgora.ts';
import { FakeClock } from './fakeClock.ts';
import { FakeTransport } from './fakeTransport.ts';

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
  session: RoomSessionController;
  visibilityState: DocumentVisibilityState = 'visible';
  experimentalActions = false;
  requestLogging = false;
  signedIn = false;
  hallwayRoom: { title: string; channel: string } | null = null;
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

  constructor(options: IWorldOptions) {
    super(options);
    this.dom = ensureDom();
    this.transport = new FakeTransport();
    this.clock = new FakeClock();
    this.agora = new FakeAgora();
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
    this.session = new RoomSessionController({
      client: this.client,
      agora: this.agora,
      myUserId: this.myUserId,
      setInterval: (fn, ms) => this.clock.setInterval(fn, ms),
      clearInterval: (id) => this.clock.clearInterval(id),
    });
    this.client.onAuthExpired(() => {
      this.signedIn = false;
    });
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

  refreshHostControls(): void {
    this.visibleControls.delete('Mute everyone');
    this.visibleControls.delete('End room');
    this.visibleControls.delete('Invite to stage');
    this.visibleControls.add('Rename');
    if (this.session.experimentalControlsVisible()) {
      this.visibleControls.add('Mute everyone');
      this.visibleControls.add('End room');
      this.visibleControls.add('Invite to stage');
    } else {
      this.uiMessages.push('Available in the Clubhouse app');
    }
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
}

setWorldConstructor(ClubboxWorld);
