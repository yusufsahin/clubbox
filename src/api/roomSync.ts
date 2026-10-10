import { clubhouseClient } from './client';
import { createSingleFlight } from './guards';
import type { CHChannelDetail } from './types';

/**
 * Room state source. A PubNub subscriber can replace polling later by
 * implementing this same start / stop / onUpdate boundary and emitting
 * CHChannelDetail snapshots (the join response includes pubnub_token).
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
  private intervalMs: number;
  private flight = createSingleFlight();

  constructor(intervalMs = 15000) {
    this.intervalMs = intervalMs;
  }

  start(channelId: string): void {
    this.stop();
    this.channelId = channelId;
    const generation = this.generation;
    void this.poll(generation);
    this.timer = window.setInterval(() => {
      void this.poll(generation);
    }, this.intervalMs);
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
    const generation = this.generation;
    void this.poll(generation);
    this.timer = window.setInterval(() => {
      void this.poll(generation);
    }, this.intervalMs);
    return true;
  }

  onUpdate(cb: (detail: CHChannelDetail) => void): () => void {
    this.callbacks.push(cb);
    return () => {
      this.callbacks = this.callbacks.filter((listener) => listener !== cb);
    };
  }

  private async poll(generation: number): Promise<void> {
    await this.flight.run(async () => {
      const channelId = this.channelId;
      if (!channelId || generation !== this.generation) return;

      if (!clubhouseClient.supports('get_channel')) {
        if (!this.warnedUnsupported) {
          this.warnedUnsupported = true;
          console.warn('[RoomSync] Live updates unavailable in web sign-in');
        }
        return;
      }

      try {
        const detail = await clubhouseClient.getChannel(channelId);
        if (generation !== this.generation) return;
        this.callbacks.forEach((cb) => cb(detail));
      } catch (err) {
        console.warn('[RoomSync] poll failed:', err);
      }
    });
  }
}

// TODO: swap this polling source for a PubNub subscriber that implements RoomUpdateSource.
export const roomSync: RoomUpdateSource = new RoomSync();
