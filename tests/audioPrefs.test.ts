import assert from 'node:assert/strict';
import test from 'node:test';
import { readAudioPrefs, writeAudioPrefs, type AudioPrefs } from '../src/audio/audioPrefs.ts';

function installMemoryStorage(): void {
  const store = new Map<string, string>();
  const memory = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    key() {
      return null;
    },
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: memory, configurable: true });
}

test('audioPrefs round-trips applied voice effect and spatial flag', () => {
  installMemoryStorage();
  const prefs: AudioPrefs = {
    inputDeviceId: '',
    outputDeviceId: '',
    micVolume: 0.8,
    monitorEnabled: true,
    spatialAudioEnabled: true,
    voiceEffectApplied: 'radio',
    remoteVolumes: {},
    externalDeviceId: 'vb-cable',
    externalVolume: 0.6,
    externalMonitor: true,
    externalDuck: true,
    externalDuckDb: -12,
    externalCopyrightSeen: true,
  };
  writeAudioPrefs(prefs);
  const next = readAudioPrefs();
  assert.equal(next.voiceEffectApplied, 'radio');
  assert.equal(next.spatialAudioEnabled, true);
  assert.equal(next.monitorEnabled, true);
  assert.equal(next.micVolume, 0.8);
  assert.equal(next.externalDeviceId, 'vb-cable');
  assert.equal(next.externalVolume, 0.6);
  assert.equal(next.externalMonitor, true);
  assert.equal(next.externalCopyrightSeen, true);
});
