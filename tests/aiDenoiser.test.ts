import assert from 'node:assert/strict';
import test from 'node:test';
import type { IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import type { IAIDenoiserProcessor } from 'agora-extension-ai-denoiser';
import {
  getAiNoisePreference,
  resetAiDenoiserForTests,
  setAiDenoiserLoaderForTests,
  setAiDenoiserUnavailableHandlerForTests,
  setAiNoisePreference,
  shouldEnableAiDenoiser,
  syncAiDenoiserOnTrack,
} from '../src/audio/aiDenoiser.ts';

test('shouldEnableAiDenoiser requires preference and speech mode', () => {
  assert.equal(shouldEnableAiDenoiser(false, false), false);
  assert.equal(shouldEnableAiDenoiser(true, false), true);
  assert.equal(shouldEnableAiDenoiser(true, true), false);
  assert.equal(shouldEnableAiDenoiser(false, true), false);
});

test('setAiNoisePreference updates preference flag', () => {
  setAiNoisePreference(true);
  assert.equal(getAiNoisePreference(), true);
  setAiNoisePreference(false);
  assert.equal(getAiNoisePreference(), false);
});

type FakeProcessor = IAIDenoiserProcessor & { piped: boolean };

function fakeProcessor(calls: string[]): FakeProcessor {
  const processor = {
    piped: false,
    on() {},
    async enable() {
      if (!processor.piped) throw new Error('Processor is not be piped, you might call pipe() first');
      calls.push('enable');
    },
    async disable() {
      if (!processor.piped) throw new Error('Processor is not be piped, you might call pipe() first');
      calls.push('disable');
    },
  };
  return processor as unknown as FakeProcessor;
}

function fakeTrack(calls: string[]): IMicrophoneAudioTrack {
  const track = {
    processorDestination: {},
    unpipe() {},
    pipe(dest: { piped?: boolean; enable?: () => Promise<void> }) {
      if (typeof dest?.enable === 'function') {
        dest.piped = true;
        calls.push('pipe');
      }
      return track;
    },
  };
  return track as unknown as IMicrophoneAudioTrack;
}

function fakeSdk(): { registerExtensions: (exts: unknown[]) => void; registered: unknown[] } {
  const registered: unknown[] = [];
  return {
    registered,
    registerExtensions(exts: unknown[]) {
      registered.push(...exts);
    },
  };
}

test('denoiser stays unloaded while the setting is off', async () => {
  resetAiDenoiserForTests();
  const calls: string[] = [];
  const sdk = fakeSdk();
  let loaded = false;
  setAiDenoiserLoaderForTests(async () => {
    loaded = true;
    return {
      checkCompatibility: () => true,
      onloaderror: null,
      createProcessor: () => fakeProcessor(calls),
    };
  });
  const lines: string[] = [];
  const log = console.log;
  const warn = console.warn;
  console.log = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
  console.warn = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
  try {
    setAiNoisePreference(false);
    await syncAiDenoiserOnTrack(sdk as never, fakeTrack(calls), false);
    assert.equal(loaded, false);
    assert.equal(sdk.registered.length, 0);
    assert.deepEqual(calls, []);
    assert.equal(lines.some((line) => line.includes('AI denoiser')), false);
  } finally {
    console.log = log;
    console.warn = warn;
    resetAiDenoiserForTests();
  }
});

test('enable and disable run only after the processor is piped', async () => {
  resetAiDenoiserForTests();
  const calls: string[] = [];
  const track = fakeTrack(calls);
  setAiDenoiserLoaderForTests(async () => ({
    checkCompatibility: () => true,
    onloaderror: null,
    createProcessor: () => fakeProcessor(calls),
  }));
  try {
    setAiNoisePreference(true);
    await syncAiDenoiserOnTrack(fakeSdk() as never, track, false);
    setAiNoisePreference(false);
    await syncAiDenoiserOnTrack(fakeSdk() as never, track, false);
    assert.deepEqual(calls, ['pipe', 'enable', 'disable']);
  } finally {
    resetAiDenoiserForTests();
  }
});

test('a failed init can be retried and toasts once', async () => {
  resetAiDenoiserForTests();
  const calls: string[] = [];
  let fail = true;
  let toasts = 0;
  setAiDenoiserUnavailableHandlerForTests(() => { toasts += 1; });
  setAiDenoiserLoaderForTests(async () => {
    if (fail) throw new Error('wasm');
    return {
      checkCompatibility: () => true,
      onloaderror: null,
      createProcessor: () => fakeProcessor(calls),
    };
  });
  const sdk = fakeSdk();
  const track = fakeTrack(calls);
  try {
    setAiNoisePreference(true);
    await syncAiDenoiserOnTrack(sdk as never, track, false);
    await syncAiDenoiserOnTrack(sdk as never, track, false);
    assert.equal(toasts, 1);
    assert.deepEqual(calls, []);
    fail = false;
    await syncAiDenoiserOnTrack(sdk as never, track, false);
    assert.equal(toasts, 1);
    assert.deepEqual(calls, ['pipe', 'enable']);
  } finally {
    resetAiDenoiserForTests();
  }
});
