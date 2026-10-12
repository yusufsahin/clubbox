import assert from 'node:assert/strict';
import test from 'node:test';
import { AGORA_PRESENCE_THRESHOLD_MS } from '../src/api/agoraPresence.ts';
import { RealtimeRoomCoordinator } from '../src/api/realtimeRoomCoordinator.ts';
import type { RealtimeHub } from '../src/api/realtimeHub.ts';
import type { ClubhouseApiClient } from '../src/api/client.ts';
import type { CHChannelDetail, CHUser } from '../src/api/types.ts';

function stubHub(): RealtimeHub {
  return {
    subscribe() {},
    unsubscribe() {},
    resubscribe() {},
    isConnected() {
      return false;
    },
    getStatus() {
      return { connected: false, reconnecting: false };
    },
    getLastSubscribe() {
      return null;
    },
    onMessage() {
      return () => undefined;
    },
    onStatus() {
      return () => undefined;
    },
    getLastFailureReason() {
      return null;
    },
  };
}

function stubClient(): ClubhouseApiClient {
  return {
    evidence: () => 'unsupported',
    supports: () => false,
    activePing: async () => ({ success: true }),
    getChannelMessages: async () => ({ messages: [] }),
  } as unknown as ClubhouseApiClient;
}

const speaker: CHUser = {
  user_id: 501,
  name: 'Ayse',
  username: 'ayse',
  photo_url: null,
  is_speaker: true,
};

const detail: CHChannelDetail = {
  channel: 'ch-1',
  channel_id: 1,
  topic: 'Test',
  is_private: false,
  users: [speaker],
  num_speakers: 1,
  num_all: 1,
};

test('coordinator Agora presence marks speaker not-connected after 10s and clears on remote', () => {
  let now = 1_000;
  const timers: Array<() => void> = [];
  const updates: CHChannelDetail[] = [];

  const coord = new RealtimeRoomCoordinator({
    client: stubClient(),
    hub: stubHub(),
    myUserId: 42,
    now: () => now,
    setInterval: (fn) => {
      timers.push(fn);
      return timers.length;
    },
    clearInterval: () => undefined,
    callbacks: {
      onChannelUpdate: (next) => {
        updates.push(next);
      },
    },
  });
  coord.channel = { ...detail, users: [...detail.users] };

  coord.setAgoraJoined(true);
  coord.syncAgoraRemotes([]);
  assert.equal(coord.channel?.users[0]?.is_on_call, undefined);

  now = 1_000 + AGORA_PRESENCE_THRESHOLD_MS;
  assert.ok(timers.length >= 1);
  timers[0]!();
  assert.equal(coord.channel?.users[0]?.is_on_call, false);
  assert.ok(updates.some((u) => u.users[0]?.is_on_call === false));

  coord.syncAgoraRemotes([501]);
  assert.equal(coord.channel?.users[0]?.is_on_call, true);

  coord.dispose();
});
