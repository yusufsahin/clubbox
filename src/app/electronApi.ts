import type { PubNubSubscribeParams, RealtimeHubStatus } from '../api/realtimeHub.ts';
import type { ShortcutMap } from '../shortcuts.ts';

export type ElectronAPI = {
  isElectron: boolean;
  platform?: string;
  forceSandbox?: boolean;
  getGlobalShortcuts: () => Promise<ShortcutMap | null>;
  setGlobalShortcuts: (shortcuts: ShortcutMap) => Promise<{ ok: boolean; failed: string[] }>;
  onGlobalShortcut: (callback: (action: string) => void) => void;
  setZoomFactor?: (factor: number) => Promise<unknown> | unknown;
  openOfficialSignIn?: (bounds?: { x: number; y: number; width: number; height: number }) => Promise<{ ok: boolean }>;
  closeOfficialSignIn?: () => Promise<{ ok: boolean }>;
  showEmbeddedSignIn?: (bounds?: { x: number; y: number; width: number; height: number }) => Promise<{ ok: boolean }>;
  hideEmbeddedSignIn?: () => Promise<{ ok: boolean }>;
  setEmbeddedSignInBounds?: (bounds?: { x: number; y: number; width: number; height: number }) => Promise<{ ok: boolean }>;
  hasWebSession?: () => Promise<{ ok: boolean; hasSession?: boolean; authReady?: boolean }>;
  /** Phase 27 — always app-only (403); moderation is Clubhouse-app only. */
  mobileCall?: (
    endpoint: string,
    body?: Record<string, unknown>,
  ) => Promise<{ ok: boolean; status: number; body: string; appOnly?: boolean }>;
  /** Phase 28.0 — only when main started with CLUBBOX_PROBE_MOBILE=1. */
  mobileProbeReadOnly?: (channel?: string) => Promise<{
    ok: boolean;
    channel?: string;
    results?: Array<{ endpoint: string; status: number; shape: string }>;
    reason?: string;
  }>;
  mobileProbeMutate?: (payload: {
    endpoint: string;
    confirm: string;
    channel?: string;
    link?: string;
    userId?: number;
  }) => Promise<{ ok: boolean; results?: unknown; reason?: string; confirmHint?: string }>;
  onWebSessionMaybe?: (callback: () => void) => void;
  onSignInProgress?: (callback: (payload: { step?: string }) => void) => () => void;
  onAgoraAppId?: (callback: (appId: string) => void) => () => void;
  pubnubSubscribe?: (params: PubNubSubscribeParams) => Promise<{ ok: boolean; reason?: string }>;
  pubnubResubscribe?: () => Promise<{ ok: boolean }>;
  pubnubUnsubscribe?: () => Promise<{ ok: boolean }>;
  ensureRealtimeConfig?: () => Promise<{ ok: boolean; reason?: string; hasKeys?: boolean }>;
  connectionStatus?: () => Promise<{
    ok: boolean;
    webSession?: boolean;
    realtimeKeys?: boolean;
    pubnubConnected?: boolean;
    agoraAppIdPresent?: boolean;
    agoraJoined?: boolean;
  }>;
  onPubNubMessage?: (callback: (message: Record<string, unknown>) => void) => () => void;
  onPubNubStatus?: (callback: (status: RealtimeHubStatus) => void) => () => void;
  onRealtimeConfig?: (callback: (payload: { hasKeys?: boolean; reason?: string | null }) => void) => () => void;
  /** Phase 30.2 — watch-list hit when clubhouse.com web_api gains a moderation route. */
  onModerationWebDiscovered?: (callback: (payload: { endpoints?: string[]; buildId?: string }) => void) => () => void;
  clearWebSession?: () => Promise<{ ok: boolean }>;
  micAccessStatus?: () => Promise<{ ok: boolean; status?: string }>;
  openMicrophoneSettings?: () => Promise<{ ok: boolean; reason?: string }>;
  /** Dev A/B: open clubhouse.com/room/<channel> with Agora WS shape logging. */
  openAgoraAbRoom?: (channel: string) => Promise<{ ok: boolean; reason?: string; reused?: boolean }>;
  /** Phase 24.6: quit/close/suspend/resume lifecycle for Agora leave/rejoin. */
  onAgoraLifecycle?: (callback: (payload: { reason?: string }) => void | Promise<void>) => () => void;
  /** Channel id only. `left` clears main's room marker so it does not send a second leave_channel. */
  reportRoomPresence?: (payload: { channel?: string; left?: boolean }) => void;
  setNativeThemeSource?: (source: 'system' | 'light' | 'dark') => Promise<{ ok: boolean }>;
  appendApiLog?: (record: {
    endpoint: string;
    status: number;
    ok?: boolean;
    bodyKeys?: string[];
    error?: string;
    kind?: string;
    appVersion?: string;
    timestamp?: string;
  }) => Promise<{ ok: boolean }>;
  runApiTriage?: () => Promise<{
    ok: boolean;
    promotions?: string[];
    failures?: Array<{ endpoint: string; status: number; error?: string; bodyKeys?: string[] }>;
  }>;
};

export function electronAPI(): ElectronAPI | null {
  return (window as Window & { electronAPI?: ElectronAPI }).electronAPI ?? null;
}
