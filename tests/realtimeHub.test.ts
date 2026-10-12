import assert from 'node:assert/strict';
import test from 'node:test';
import { createElectronRealtimeHub, type PubNubSubscribeParams } from '../src/api/realtimeHub.ts';

const baseParams: PubNubSubscribeParams = {
  channelId: 'room1',
  token: 'tok',
  origin: 'clubhouse.pubnubapi.com',
  uuid: '42',
};

test('subscribe stays disconnected until IPC ok', async () => {
  let resolveSub!: (value: { ok: boolean; reason?: string }) => void;
  const hub = createElectronRealtimeHub({
    pubnubSubscribe: () => new Promise((resolve) => { resolveSub = resolve; }),
  });
  const statuses: boolean[] = [];
  hub.onStatus((s) => statuses.push(s.connected));
  hub.subscribe(baseParams);
  assert.equal(hub.isConnected(), false);
  resolveSub({ ok: true });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(hub.isConnected(), true);
  assert.deepEqual(statuses, [false, true]);
});

test('subscribe failure sets reason and stays disconnected', async () => {
  const hub = createElectronRealtimeHub({
    pubnubSubscribe: async () => ({ ok: false, reason: 'missing_subscribe_key' }),
  });
  hub.subscribe(baseParams);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(hub.isConnected(), false);
  assert.equal(hub.getLastFailureReason(), 'missing_subscribe_key');
});

test('subscribe reject is caught', async () => {
  const hub = createElectronRealtimeHub({
    pubnubSubscribe: async () => { throw new Error('ipc_down'); },
  });
  hub.subscribe(baseParams);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(hub.isConnected(), false);
  assert.equal(hub.getLastFailureReason(), 'ipc_down');
});
