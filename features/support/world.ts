import { World, setWorldConstructor, type IWorldOptions } from '@cucumber/cucumber';
import { JSDOM } from 'jsdom';
import { ClubhouseApiClient } from '../../src/api/client.ts';
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

export class ClubboxWorld extends World {
  dom: JSDOM;
  transport: FakeTransport;
  client: ClubhouseApiClient;
  clock: FakeClock;
  agora: FakeAgora;
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
  listeners: Array<{ name: string; bio: string }> = [];
  openedTarget: string | null = null;
  presenceTimer: number | null = null;
  lastError: Error | null = null;
  myUserId = 42;

  constructor(options: IWorldOptions) {
    super(options);
    this.dom = ensureDom();
    this.transport = new FakeTransport();
    this.clock = new FakeClock();
    this.agora = new FakeAgora();
    this.client = new ClubhouseApiClient({
      useSandbox: false,
      webSession: true,
      userId: this.myUserId,
      allowUnverified: true,
      transport: this.transport,
    });
  }

  setVisibility(state: DocumentVisibilityState): void {
    this.visibilityState = state;
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
