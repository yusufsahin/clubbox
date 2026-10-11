import type { PubNubSubscribeParams, RealtimeHubStatus } from '../api/realtimeHub.ts';
import type { ShortcutMap } from '../shortcuts.ts';

export type ElectronAPI = {
  isElectron: boolean;
  forceSandbox?: boolean;
  getGlobalShortcuts: () => Promise<ShortcutMap | null>;
  setGlobalShortcuts: (shortcuts: ShortcutMap) => Promise<{ ok: boolean; failed: string[] }>;
  onGlobalShortcut: (callback: (action: string) => void) => void;
  setZoomFactor?: (factor: number) => Promise<unknown> | unknown;
  openOfficialSignIn?: () => Promise<{ ok: boolean }>;
  closeOfficialSignIn?: () => Promise<{ ok: boolean }>;
  onWebSessionMaybe?: (callback: () => void) => void;
  onAgoraAppId?: (callback: (appId: string) => void) => () => void;
  pubnubSubscribe?: (params: PubNubSubscribeParams) => Promise<{ ok: boolean }>;
  pubnubResubscribe?: () => Promise<{ ok: boolean }>;
  pubnubUnsubscribe?: () => Promise<{ ok: boolean }>;
  onPubNubMessage?: (callback: (message: Record<string, unknown>) => void) => () => void;
  onPubNubStatus?: (callback: (status: RealtimeHubStatus) => void) => () => void;
  clearWebSession?: () => Promise<{ ok: boolean }>;
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
