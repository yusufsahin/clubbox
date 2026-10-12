import type { CHChannelDetail } from './types.ts';

export type RoomStateSyncOptions = {
  fetchChannel: (channelId: string) => Promise<CHChannelDetail>;
  /** When false, pulls are skipped (PubNub-only). Default true. */
  isSupported?: () => boolean;
  intervalMs?: number;
  hostActionDelayMs?: number;
};

/**
 * Authoritative room roster via mobile get_channel (Task 28.1).
 * Failures are silent — PubNub / join snapshot remain the live path.
 */
export class RoomStateSync {
  private timer: ReturnType<typeof setInterval> | null = null;
  private hostTimer: ReturnType<typeof setTimeout> | null = null;
  private channelId: string | null = null;
  private generation = 0;
  private callbacks: ((detail: CHChannelDetail) => void)[] = [];
  private readonly fetchChannel: (channelId: string) => Promise<CHChannelDetail>;
  private readonly isSupported: () => boolean;
  private readonly intervalMs: number;
  private readonly hostActionDelayMs: number;

  constructor(options: RoomStateSyncOptions) {
    this.fetchChannel = options.fetchChannel;
    this.isSupported = options.isSupported ?? (() => true);
    this.intervalMs = options.intervalMs ?? 30_000;
    this.hostActionDelayMs = options.hostActionDelayMs ?? 1_000;
  }

  start(channelId: string): void {
    this.stop();
    this.channelId = channelId;
    void this.pull();
    this.timer = setInterval(() => {
      void this.pull();
    }, this.intervalMs);
  }

  stop(): void {
    this.generation += 1;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.hostTimer !== null) {
      clearTimeout(this.hostTimer);
      this.hostTimer = null;
    }
    this.channelId = null;
  }

  pause(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.hostTimer !== null) {
      clearTimeout(this.hostTimer);
      this.hostTimer = null;
    }
  }

  resume(): boolean {
    if (!this.channelId || this.timer !== null) return false;
    void this.pull();
    this.timer = setInterval(() => {
      void this.pull();
    }, this.intervalMs);
    return true;
  }

  onUpdate(cb: (detail: CHChannelDetail) => void): () => void {
    this.callbacks.push(cb);
    return () => {
      this.callbacks = this.callbacks.filter((listener) => listener !== cb);
    };
  }

  /** ~1 s after mute / invite / end / etc. (debounced). */
  scheduleAfterHostAction(): void {
    if (!this.channelId) return;
    if (this.hostTimer !== null) clearTimeout(this.hostTimer);
    const generation = this.generation;
    const channelId = this.channelId;
    this.hostTimer = setTimeout(() => {
      this.hostTimer = null;
      if (this.generation !== generation || this.channelId !== channelId) return;
      void this.pull();
    }, this.hostActionDelayMs);
  }

  private async pull(): Promise<void> {
    const channelId = this.channelId;
    if (!channelId || !this.isSupported()) return;
    const generation = this.generation;
    try {
      const detail = await this.fetchChannel(channelId);
      if (this.generation !== generation || this.channelId !== channelId) return;
      for (const cb of this.callbacks) cb(detail);
    } catch {
      // Auth / network — keep PubNub path; no scary toast (Task 28.1).
    }
  }
}
