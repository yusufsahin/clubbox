import type { CHChannelDetail } from './types';
import type { RoomUpdateSource } from './roomSync';

export type PubNubMessageHandler = (message: {
  type: string;
  keys: string[];
}) => void;

export type PubNubRoomSourceOptions = {
  origin?: string;
  onUnknownMessage?: PubNubMessageHandler;
  /** Injected for tests — production uses a real PubNub client later. */
  connect?: (input: {
    origin: string;
    token: string;
    channelId: string;
  }) => { disconnect: () => void };
};

/**
 * RoomUpdateSource backed by clubhouse.pubnubapi.com.
 * Subscribe tokens come from join/create responses (pubnub_* fields).
 */
export class PubNubRoomSource implements RoomUpdateSource {
  private channelId: string | null = null;
  private token: string | null = null;
  private connected = false;
  private paused = false;
  private disconnectFn: (() => void) | null = null;
  private callbacks: ((detail: CHChannelDetail) => void)[] = [];
  private readonly origin: string;
  private readonly onUnknownMessage?: PubNubMessageHandler;
  private readonly connectFn: NonNullable<PubNubRoomSourceOptions['connect']>;

  constructor(options: PubNubRoomSourceOptions = {}) {
    this.origin = options.origin ?? 'clubhouse.pubnubapi.com';
    this.onUnknownMessage = options.onUnknownMessage;
    this.connectFn = options.connect ?? (() => ({ disconnect: () => undefined }));
  }

  setToken(token: string | null | undefined): void {
    this.token = token ?? null;
  }

  isConnected(): boolean {
    return this.connected && !this.paused;
  }

  start(channelId: string): void {
    this.stop();
    this.channelId = channelId;
    this.paused = false;
    if (!this.token) {
      this.connected = false;
      return;
    }
    const handle = this.connectFn({
      origin: this.origin,
      token: this.token,
      channelId,
    });
    this.disconnectFn = handle.disconnect;
    this.connected = true;
  }

  stop(): void {
    this.disconnectFn?.();
    this.disconnectFn = null;
    this.connected = false;
    this.paused = false;
    this.channelId = null;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): boolean {
    if (!this.channelId || !this.token) return false;
    this.paused = false;
    if (!this.connected) this.start(this.channelId);
    return this.connected;
  }

  onUpdate(cb: (detail: CHChannelDetail) => void): () => void {
    this.callbacks.push(cb);
    return () => {
      this.callbacks = this.callbacks.filter((listener) => listener !== cb);
    };
  }

  /** Handle a PubNub envelope; known types update stage/chat, unknowns go to API Health. */
  handleMessage(raw: Record<string, unknown>): void {
    const type = typeof raw.type === 'string'
      ? raw.type
      : typeof raw.message_type === 'string'
        ? raw.message_type
        : 'unknown';
    const keys = Object.keys(raw).sort();
    if (type === 'channel_message' || type === 'channel_reaction') {
      // Stage/chat patches land via callbacks when a full channel snapshot is available.
      return;
    }
    this.onUnknownMessage?.({ type, keys });
  }
}
