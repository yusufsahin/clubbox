import { audioPublishProfile, type AudioQuality } from './audioQuality.ts';

/** Agora nominal send bitrate (kbps) for the publish level — warning floor is 60%. */
export function targetSendBitrateKbps(quality: AudioQuality): number {
  switch (quality) {
    case 'normal':
      return 18; // speech_standard
    case 'high':
      return 128; // high_quality
    case 'music':
      return 128; // custom stereo encoder
    default: {
      const _never: never = quality;
      return _never;
    }
  }
}

export const LOW_BITRATE_RATIO = 0.6;
export const LOW_BITRATE_WARN_MS = 10_000;

export type LowBitrateWatch = {
  belowSinceMs: number | null;
  warn: boolean;
};

/** Track consecutive under-target bitrate; warn after warnAfterMs. */
export function nextLowBitrateWatch(
  prevBelowSinceMs: number | null,
  bitrateKbps: number,
  quality: AudioQuality,
  nowMs: number,
  opts: { ratio?: number; warnAfterMs?: number } = {},
): LowBitrateWatch {
  const ratio = opts.ratio ?? LOW_BITRATE_RATIO;
  const warnAfterMs = opts.warnAfterMs ?? LOW_BITRATE_WARN_MS;
  const floor = targetSendBitrateKbps(quality) * ratio;
  if (!(bitrateKbps >= 0) || !Number.isFinite(bitrateKbps)) {
    return { belowSinceMs: prevBelowSinceMs, warn: false };
  }
  if (bitrateKbps >= floor) return { belowSinceMs: null, warn: false };
  const since = prevBelowSinceMs ?? nowMs;
  return { belowSinceMs: since, warn: nowMs - since >= warnAfterMs };
}

export type TrackMediaSettings = {
  channelCount?: number;
  sampleRate?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
};

export function stereoFromChannelCount(channelCount: number | null | undefined): boolean | null {
  if (channelCount == null || !Number.isFinite(channelCount)) return null;
  if (channelCount >= 2) return true;
  if (channelCount === 1) return false;
  return null;
}

export function readTrackMediaSettings(track: MediaStreamTrack | null | undefined): TrackMediaSettings {
  if (!track || typeof track.getSettings !== 'function') return {};
  try {
    const s = track.getSettings();
    return {
      channelCount: typeof s.channelCount === 'number' ? s.channelCount : undefined,
      sampleRate: typeof s.sampleRate === 'number' ? s.sampleRate : undefined,
      echoCancellation: typeof s.echoCancellation === 'boolean' ? s.echoCancellation : undefined,
      noiseSuppression: typeof s.noiseSuppression === 'boolean' ? s.noiseSuppression : undefined,
      autoGainControl: typeof s.autoGainControl === 'boolean' ? s.autoGainControl : undefined,
    };
  } catch {
    return {};
  }
}

/** Parse sendBitrate from Agora getLocalAudioStats (flat or per-track map). */
export function sendBitrateFromLocalStats(stats: unknown): number {
  if (!stats || typeof stats !== 'object') return 0;
  const rec = stats as Record<string, unknown>;
  if ('sendBitrate' in rec) return Number(rec.sendBitrate) || 0;
  let max = 0;
  for (const row of Object.values(rec)) {
    if (row && typeof row === 'object' && 'sendBitrate' in row) {
      max = Math.max(max, Number((row as { sendBitrate?: number }).sendBitrate) || 0);
    }
  }
  return max;
}

export type AudioCheckSample = {
  micLevel: number;
  extrasLevel: number;
};

export type AudioCheckResult = {
  clipping: boolean;
  tooLow: boolean;
  suggestMusic: boolean;
  suggestRaiseInput: boolean;
  peakMic: number;
  peakExtras: number;
  captureLine: string;
  musicProfileOk: boolean;
};

const CLIP_LEVEL = 0.95;
const TOO_LOW_PEAK = 0.05;

/**
 * Local-only Audio check verdicts from meter samples (nothing goes to the room).
 */
export function evaluateAudioCheck(
  samples: AudioCheckSample[],
  opts: {
    quality: AudioQuality;
    externalActive: boolean;
    capture?: TrackMediaSettings;
  },
): AudioCheckResult {
  let peakMic = 0;
  let peakExtras = 0;
  let clipping = false;
  for (const sample of samples) {
    const mic = Number(sample.micLevel) || 0;
    const extras = Number(sample.extrasLevel) || 0;
    peakMic = Math.max(peakMic, mic);
    peakExtras = Math.max(peakExtras, extras);
    if (mic >= CLIP_LEVEL || extras >= CLIP_LEVEL) clipping = true;
  }
  const tooLow = samples.length > 0 && peakMic < TOO_LOW_PEAK && peakExtras < TOO_LOW_PEAK;
  const suggestMusic = opts.externalActive && opts.quality !== 'music';
  const suggestRaiseInput = tooLow;
  const profile = audioPublishProfile(opts.quality);
  const capture = opts.capture ?? {};
  const musicProfileOk = opts.quality !== 'music' || (
    capture.echoCancellation !== true
    && capture.noiseSuppression !== true
    && capture.autoGainControl !== true
  );
  const parts = [
    capture.channelCount != null ? `${capture.channelCount}ch` : null,
    capture.sampleRate != null ? `${capture.sampleRate}Hz` : null,
    `AEC=${capture.echoCancellation === true ? 'on' : capture.echoCancellation === false ? 'off' : '?'}`,
    `ANS=${capture.noiseSuppression === true ? 'on' : capture.noiseSuppression === false ? 'off' : '?'}`,
    `AGC=${capture.autoGainControl === true ? 'on' : capture.autoGainControl === false ? 'off' : '?'}`,
    `level=${profile.quality}`,
  ].filter(Boolean);
  return {
    clipping,
    tooLow,
    suggestMusic,
    suggestRaiseInput,
    peakMic,
    peakExtras,
    captureLine: parts.join(' · '),
    musicProfileOk,
  };
}

export type SendQualitySnapshot = {
  quality: AudioQuality;
  sendBitrateKbps: number;
  stereo: boolean | null;
  channelCount: number | null;
  sampleRate: number | null;
  warnLowBitrate: boolean;
  targetKbps: number;
};
