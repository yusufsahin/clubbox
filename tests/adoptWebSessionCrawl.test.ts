import assert from 'node:assert/strict';
import test from 'node:test';
import { ClubhouseApiClient } from '../src/api/client.ts';
import { MOCK_ME } from '../src/api/sandboxData.ts';

test('successful adoptWebSession requests a realtime config crawl', async () => {
  const calls: string[] = [];
  const api = {
    isElectron: true,
    ensureRealtimeConfig: async () => {
      calls.push('ensureRealtimeConfig');
      return { ok: true, hasKeys: true, reason: 'cache_hit' };
    },
  };
  (globalThis as typeof globalThis & { window: { electronAPI: typeof api } }).window = {
    electronAPI: api,
  };

  const client = new ClubhouseApiClient({
    transport: {
      async request() {
        return {
          ok: true,
          status: 200,
          body: JSON.stringify({ success: true, user_profile: MOCK_ME }),
        };
      },
    },
  });
  await client.updateConfig({ useSandbox: false, webSession: false });
  const ok = await client.adoptWebSession();
  assert.equal(ok, true);
  assert.deepEqual(calls, ['ensureRealtimeConfig']);
});
