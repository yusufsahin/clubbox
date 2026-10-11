import type { CHChannelDetail } from './types';

/**
 * Room state source. PubNub (PubNubRoomSource) replaces get_channel polling on web.
 */
export interface RoomUpdateSource {
  start(channelId: string): void;
  stop(): void;
  pause(): void;
  resume(): boolean;
  onUpdate(cb: (detail: CHChannelDetail) => void): () => void;
}

export class RoomSync implements RoomUpdateSource {
  private timer: number | null = null;
  private channelId: string | null = null;
  private generation = 0;
  private warnedUnsupported = false;
  private callbacks: ((detail: CHChannelDetail) => void)[] = [];

  start(channelId: string): void {
    this.stop();
    this.channelId = channelId;
    void this.poll();
    this.timer = window.setInterval(() => {
      void this.poll();
    }, 15_000);
  }

  stop(): void {
    this.generation += 1;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.channelId = null;
  }

  pause(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  resume(): boolean {
    if (!this.channelId || this.timer !== null) return false;
    void this.poll();
    this.timer = window.setInterval(() => {
      void this.poll();
    }, 15_000);
    return true;
  }

  onUpdate(cb: (detail: CHChannelDetail) => void): () => void {
    this.callbacks.push(cb);
    return () => {
      this.callbacks = this.callbacks.filter((listener) => listener !== cb);
    };
  }

  private async poll(): Promise<void> {
    if (!this.warnedUnsupported) {
      this.warnedUnsupported = true;
      console.warn('[RoomSync] Stage polling disabled; use PubNub realtime');
    }
  }
}

/** Legacy hook — prefer PubNubRoomSource. Kept for pause/resume wiring only. */
export const roomSync: RoomUpdateSource = new RoomSync();
