import type { CHChannelDetail } from './types';
import { clubhouseClient } from './client';
import { RoomStateSync } from './roomStateSync';

/**
 * Room state source. PubNub (PubNubRoomSource) is the realtime path;
 * RoomStateSync optionally refreshes via mobile get_channel (Task 28.1).
 */
export interface RoomUpdateSource {
  start(channelId: string): void;
  stop(): void;
  pause(): void;
  resume(): boolean;
  onUpdate(cb: (detail: CHChannelDetail) => void): () => void;
  /** Optional — RoomStateSync refreshes ~1 s after host moderation. */
  scheduleAfterHostAction?(): void;
}

/** Legacy name — backed by RoomStateSync (get_channel when supported). */
export const roomSync: RoomUpdateSource = new RoomStateSync({
  fetchChannel: (channelId) => clubhouseClient.getChannel(channelId),
  isSupported: () => clubhouseClient.supports('get_channel'),
});
