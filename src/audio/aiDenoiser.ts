/**
 * Phase 24.7 — Agora AI noise suppression (agora-extension-ai-denoiser).
 * WASM assets live in public/agora-denoiser (copied at Vite buildStart).
 */

import type { IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';
import type { IAIDenoiserProcessor } from 'agora-extension-ai-denoiser';

type AgoraSdk = typeof import('agora-rtc-sdk-ng').default;

let extensionReady: Promise<boolean> | null = null;
let processor: IAIDenoiserProcessor | null = null;
let pipedTrack: IMicrophoneAudioTrack | null = null;
let wantEnabled = false;

function assetsPath(): string {
  // No trailing slash (Agora docs). Relative to the app document (Vite public/).
  try {
    return new URL('agora-denoiser', document.baseURI).href.replace(/\/$/, '');
  } catch {
    return './agora-denoiser';
  }
}

async function ensureExtension(agoraSdk: AgoraSdk): Promise<boolean> {
  if (!extensionReady) {
    extensionReady = (async () => {
      try {
        const { AIDenoiserExtension } = await import('agora-extension-ai-denoiser');
        const denoiser = new AIDenoiserExtension({
          assetsPath: assetsPath(),
          fetchOptions: { cache: 'force-cache' },
        });
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
        await processor.disable();
        console.log('[Clubbox] AI denoiser extension registered');
        return true;
      } catch (err) {
        console.warn('[Clubbox] AI denoiser init failed:', err);
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
 * Safe to call on every publish; reuses one processor instance.
 */
export async function syncAiDenoiserOnTrack(
  agoraSdk: AgoraSdk,
  track: IMicrophoneAudioTrack | null,
  isMusicMode: boolean,
): Promise<void> {
  if (!track) {
    await detachAiDenoiser();
    return;
  }
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

  const active = shouldEnableAiDenoiser(wantEnabled, isMusicMode);
  try {
    if (active) await processor.enable();
    else await processor.disable();
    console.log(`[Clubbox] AI denoiser ${active ? 'enabled' : 'disabled'}`, `music=${isMusicMode}`);
  } catch (err) {
    console.warn('[Clubbox] AI denoiser enable/disable failed:', err);
  }
}

export async function detachAiDenoiser(): Promise<void> {
  if (processor) {
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
