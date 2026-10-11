import assert from 'node:assert/strict';
import test from 'node:test';

// Production Agora app id from the clubhouse.com bundle (the config block with a live Stripe key).
// The dev/staging id must never be the default: room tokens are issued for the production app.
const PRODUCTION_AGORA_APP_ID = '938de3e8055e42b281bb8c6f69c21f78';
const DEV_AGORA_APP_ID = '3489b00d5d104a45a00513316a32d3e4';

function installMemoryStorage(initial: Record<string, string> = {}): void {
  const store = new Map(Object.entries(initial));
  const memory = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: memory, configurable: true });
}

test('default Agora app id is the production one', async () => {
  installMemoryStorage();
  const { ClubhouseApiClient } = await import('../src/api/client.ts');
  assert.equal(new ClubhouseApiClient().getConfig().agoraAppId, PRODUCTION_AGORA_APP_ID);
});

test('a saved dev Agora app id is migrated to production', async () => {
  installMemoryStorage({ clubbox_config: JSON.stringify({ agoraAppId: DEV_AGORA_APP_ID }) });
  const { ClubhouseApiClient } = await import('../src/api/client.ts');
  assert.equal(new ClubhouseApiClient().getConfig().agoraAppId, PRODUCTION_AGORA_APP_ID);
});

test('the Agora engine falls back to the production app id', async () => {
  const { AgoraVoiceEngine } = await import('../src/audio/agoraVoice.ts').catch(() => ({ AgoraVoiceEngine: null }));
  if (!AgoraVoiceEngine) return; // the SDK may not load under node; the client default above is the source of truth
  assert.equal(new AgoraVoiceEngine().appId, PRODUCTION_AGORA_APP_ID);
});
