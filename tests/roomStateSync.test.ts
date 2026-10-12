import assert from 'node:assert/strict';
import test from 'node:test';
import { RoomStateSync } from '../src/api/roomStateSync.ts';
import type { CHChannelDetail } from '../src/api/types.ts';

function detail(channel: string): CHChannelDetail {
  return {
    channel_id: 1,
    channel,
    topic: 'T',
    is_private: false,
    num_speakers: 0,
    num_all: 0,
    users: [],
  };
}

test('RoomStateSync pulls on start and notifies listeners', async () => {
  const calls: string[] = [];
  const sync = new RoomStateSync({
    fetchChannel: async (id) => {
      calls.push(id);
      return detail(id);
    },
    intervalMs: 60_000,
  });
  const seen: string[] = [];
  sync.onUpdate((d) => seen.push(d.channel));
  sync.start('room-a');
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(calls, ['room-a']);
  assert.deepEqual(seen, ['room-a']);
  sync.stop();
});

test('RoomStateSync swallows fetch errors', async () => {
  const sync = new RoomStateSync({
    fetchChannel: async () => {
      throw new Error('401');
    },
    intervalMs: 60_000,
  });
  let notified = false;
  sync.onUpdate(() => {
    notified = true;
  });
  sync.start('room-b');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(notified, false);
  sync.stop();
});

test('scheduleAfterHostAction debounces a pull', async () => {
  let pulls = 0;
  const sync = new RoomStateSync({
    fetchChannel: async (id) => {
      pulls += 1;
      return detail(id);
    },
    intervalMs: 60_000,
    hostActionDelayMs: 30,
  });
  sync.start('room-c');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(pulls, 1);
  sync.scheduleAfterHostAction();
  sync.scheduleAfterHostAction();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(pulls, 2);
  sync.stop();
});

test('RoomStateSync skips when unsupported', async () => {
  let pulls = 0;
  const sync = new RoomStateSync({
    fetchChannel: async (id) => {
      pulls += 1;
      return detail(id);
    },
    isSupported: () => false,
    intervalMs: 60_000,
  });
  sync.start('room-d');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(pulls, 0);
  sync.stop();
});
