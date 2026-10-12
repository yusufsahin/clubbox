/**
 * Phase 24.7 / 25.3 — Agora AI noise suppression (agora-extension-ai-denoiser).
 * WASM assets live in public/agora-denoiser (copied at Vite buildStart).
 * The extension package is imported only on the first enable so a join with the
 * setting off does not register it or load WASM.
 */

import type { IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import type { IAIDenoiserProcessor } from 'agora-extension-ai-denoiser';
import { t } from '../i18n/index.ts';
import { showToast } from '../ui/components/toast.ts';

type AgoraSdk = typeof import('agora-rtc-sdk-ng').default;

type DenoiserExtensionLike = {
  checkCompatibility: () => boolean;
  onloaderror?: (() => void | Promise<void>) | null;
  createProcessor: () => IAIDenoiserProcessor;
};

type DenoiserLoader = () => Promise<DenoiserExtensionLike>;

let extensionReady: Promise<boolean> | null = null;
let processor: IAIDenoiserProcessor | null = null;
let pipedTrack: IMicrophoneAudioTrack | null = null;
let wantEnabled = false;
let unavailableNoted = false;
let unavailableHandler: (() => void) | null = null;

function assetsPath(): string {
  // No trailing slash (Agora docs). Relative to the app document (Vite public/).
  try {
    return new URL('agora-denoiser', document.baseURI).href.replace(/\/$/, '');
  } catch {
    return './agora-denoiser';
  }
}

async function defaultLoadExtension(): Promise<DenoiserExtensionLike> {
  const { AIDenoiserExtension } = await import('agora-extension-ai-denoiser');
  return new AIDenoiserExtension({
    assetsPath: assetsPath(),
    fetchOptions: { cache: 'force-cache' },
  });
}

let loadExtension: DenoiserLoader = defaultLoadExtension;

function noteUnavailable(): void {
  if (unavailableNoted) return;
  unavailableNoted = true;
  if (unavailableHandler) {
    unavailableHandler();
    return;
  }
  if (typeof document === 'undefined') return;
  showToast(t('aiNoiseSuppressionUnavailable'), '🔇');
}

async function ensureExtension(agoraSdk: AgoraSdk): Promise<boolean> {
  if (!extensionReady) {
    extensionReady = (async () => {
      try {
        const denoiser = await loadExtension();
        if (!denoiser.checkCompatibility()) {
          console.warn('[Clubbox] AI denoiser unsupported in this browser');
          return false;
        }
        denoiser.onloaderror = () => {
          console.warn('[Clubbox] AI denoiser WASM failed to load');
        };
        agoraSdk.registerExtensions([denoiser]);
        processor = denoiser.createProcessor();
        processor.on('pipeerror', (err: Error) => {
          console.warn('[Clubbox] AI denoiser pipeerror:', err?.message || err);
        });
        processor.on('overload', () => {
          console.warn('[Clubbox] AI denoiser overload');
        });
        unavailableNoted = false;
        console.log('[Clubbox] AI denoiser extension registered');
        return true;
      } catch (err) {
        console.warn('[Clubbox] AI denoiser init failed:', err);
        extensionReady = null;
        processor = null;
        noteUnavailable();
        return false;
      }
    })();
  }
  return extensionReady;
}

/** Preferred on/off from Settings (music mode may force off). */
export function setAiNoisePreference(enabled: boolean): void {
  wantEnabled = enabled === true;
}

export function getAiNoisePreference(): boolean {
  return wantEnabled;
}

/** Pure gate: Settings on and not music mode. */
export function shouldEnableAiDenoiser(preferred: boolean, isMusicMode: boolean): boolean {
  return preferred === true && isMusicMode !== true;
}

/**
 * Pipe processor onto the live mic track. Enable only when preferred and not music mode.
 * With the setting off and nothing piped, returns before register/WASM/pipe.
 * enable/disable run only after track.pipe(processor).pipe(processorDestination).
 */
export async function syncAiDenoiserOnTrack(
  agoraSdk: AgoraSdk,
  track: IMicrophoneAudioTrack | null,
  isMusicMode: boolean,
): Promise<void> {
  const active = shouldEnableAiDenoiser(wantEnabled, isMusicMode);
  if (!track) {
    await detachAiDenoiser();
    return;
  }
  if (!active && !pipedTrack) return;

  const ok = await ensureExtension(agoraSdk);
  if (!ok || !processor) return;

  if (pipedTrack !== track) {
    try {
      if (pipedTrack) {
        pipedTrack.unpipe();
        pipedTrack.pipe(pipedTrack.processorDestination);
      }
    } catch {
      // previous track may already be closed
    }
    try {
      track.unpipe();
      track.pipe(processor).pipe(track.processorDestination);
      pipedTrack = track;
    } catch (err) {
      console.warn('[Clubbox] AI denoiser pipe failed:', err);
      pipedTrack = null;
      return;
    }
  }

  try {
    if (active) await processor.enable();
    else await processor.disable();
    console.log(`[Clubbox] AI denoiser ${active ? 'enabled' : 'disabled'}`, `music=${isMusicMode}`);
  } catch (err) {
    console.warn('[Clubbox] AI denoiser enable/disable failed:', err);
  }
}

export async function detachAiDenoiser(): Promise<void> {
  if (processor && pipedTrack) {
    try {
      await processor.disable();
    } catch {
      // ignore
    }
  }
  if (pipedTrack) {
    try {
      pipedTrack.unpipe();
      pipedTrack.pipe(pipedTrack.processorDestination);
    } catch {
      // ignore
    }
    pipedTrack = null;
  }
}

/** Test seam: replace the dynamic import. Pass null to restore the real loader. */
export function setAiDenoiserLoaderForTests(loader: DenoiserLoader | null): void {
  loadExtension = loader ?? defaultLoadExtension;
  extensionReady = null;
  processor = null;
  pipedTrack = null;
  unavailableNoted = false;
}

/** Test seam: count the one "Noise suppression unavailable" toast. */
export function setAiDenoiserUnavailableHandlerForTests(handler: (() => void) | null): void {
  unavailableHandler = handler;
}

export function resetAiDenoiserForTests(): void {
  extensionReady = null;
  processor = null;
  pipedTrack = null;
  wantEnabled = false;
  unavailableNoted = false;
  unavailableHandler = null;
  loadExtension = defaultLoadExtension;
}
