import type { CHChannelDetail, CHChatMessage } from './types';
import type { RoomUpdateSource } from './roomSync';
import { RealtimeRoomCoordinator } from './realtimeRoomCoordinator.ts';
import type { RealtimeHub } from './realtimeHub.ts';
import { createElectronRealtimeHub } from './realtimeHub.ts';
import { clubhouseClient } from './client';

export type PubNubMessageHandler = (message: {
  type: string;
  keys: string[];
}) => void;

export type PubNubRoomSourceOptions = {
  origin?: string;
  onUnknownMessage?: PubNubMessageHandler;
  hub?: RealtimeHub;
  myUserId?: number;
  onChatMessage?: (message: CHChatMessage) => void;
  onReaction?: (emoji: string, targetName: string) => void;
  onReconnecting?: (reconnecting: boolean) => void;
  onRoomEnded?: () => void;
};

function electronHub(): RealtimeHub | null {
  const api = (globalThis as typeof globalThis & { electronAPI?: unknown }).electronAPI as
    | Parameters<typeof createElectronRealtimeHub>[0]
    | undefined;
  if (!api?.pubnubSubscribe) return null;
  return createElectronRealtimeHub(api);
}

/**
 * RoomUpdateSource backed by PubNub (DESIGN §5.1).
 */
export class PubNubRoomSource implements RoomUpdateSource {
  private channelId: string | null = null;
  private token: string | null = null;
  private paused = false;
  private callbacks: ((detail: CHChannelDetail) => void)[] = [];
  private readonly origin: string;
  private readonly onUnknownMessage?: PubNubMessageHandler;
  private readonly hub: RealtimeHub;
  private coordinator: RealtimeRoomCoordinator | null = null;
  private channelSnapshot: CHChannelDetail | null = null;

  constructor(options: PubNubRoomSourceOptions = {}) {
    this.origin = options.origin ?? 'clubhouse.pubnubapi.com';
    this.onUnknownMessage = options.onUnknownMessage;
    this.hub = options.hub ?? electronHub() ?? createElectronRealtimeHub(null);
    const myUserId = options.myUserId ?? clubhouseClient.getCurrentUserId() ?? 0;
    this.coordinator = new RealtimeRoomCoordinator({
      client: clubhouseClient,
      hub: this.hub,
      myUserId,
      callbacks: {
        onChannelUpdate: (detail) => {
          this.channelSnapshot = detail;
          if (!this.paused) this.callbacks.forEach((cb) => cb(detail));
        },
        onUnknown: (type, keys) => this.onUnknownMessage?.({ type, keys }),
        onChatMessage: (message) => options.onChatMessage?.(message),
        onReaction: (emoji, target) => options.onReaction?.(emoji, target),
        onStatus: (reconnecting) => options.onReconnecting?.(reconnecting),
        onRoomEnded: () => options.onRoomEnded?.(),
      },
    });
  }

  setChannel(detail: CHChannelDetail | null): void {
    this.channelSnapshot = detail;
    if (this.coordinator) this.coordinator.channel = detail;
  }

  setToken(token: string | null | undefined): void {
    this.token = token ?? null;
  }

  setChatOpen(open: boolean): void {
    this.coordinator?.setChatOpen(open);
  }

  isConnected(): boolean {
    return !!this.token && this.hub.isConnected() && !this.paused;
  }

  getLastFailureReason(): string | null {
    return this.hub.getLastFailureReason?.() ?? null;
  }

  async resubscribe(): Promise<void> {
    await this.coordinator?.refresh();
  }

  start(channelId: string): void {
    this.channelId = channelId;
    this.paused = false;
    if (!this.channelSnapshot || !this.coordinator) {
      return;
    }
    // Enter even without a PubNub token so active_ping still runs (subscribe is gated in enter).
    const detail = {
      ...this.channelSnapshot,
      pubnub_token: this.token ?? this.channelSnapshot.pubnub_token ?? '',
      pubnub_origin: this.channelSnapshot.pubnub_origin ?? this.origin,
    };
    void this.coordinator.enter(detail);
  }

  stop(): void {
    this.coordinator?.stop();
    this.channelId = null;
    this.token = null;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): boolean {
    if (!this.channelId || !this.token) return false;
    this.paused = false;
    if (!this.hub.isConnected() && this.channelSnapshot) {
      this.start(this.channelId);
    }
    return this.isConnected();
  }

  onUpdate(cb: (detail: CHChannelDetail) => void): () => void {
    this.callbacks.push(cb);
    return () => {
      this.callbacks = this.callbacks.filter((listener) => listener !== cb);
    };
  }

  /** Handle a PubNub envelope (tests / IPC bridge). */
  handleMessage(raw: Record<string, unknown>): void {
    this.coordinator?.handleRaw(raw);
  }

  /** Agora remote mute → same channel snapshot / onUpdate path as PubNub stage events. */
  applyAgoraMute(uid: number | string, muted: boolean): void {
    this.coordinator?.applyAgoraMute(uid, muted);
  }

  shouldPollChat(): boolean {
    return this.coordinator?.shouldPollChat() ?? false;
  }
}
