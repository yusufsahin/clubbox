import { isAudioQuality, type AudioQuality } from './audioQuality';

const AUDIO_PREFS_KEY = 'clubbox_audio';

export type StoredVoiceEffect = 'none' | 'radio' | 'deep' | 'robot' | 'echo';

export interface AudioPrefs {
  inputDeviceId: string;
  outputDeviceId: string;
  micVolume: number;
  monitorEnabled: boolean;
  spatialAudioEnabled: boolean;
  voiceEffectApplied: StoredVoiceEffect;
  remoteVolumes: Record<string, number>;
  externalDeviceId: string;
  externalVolume: number;
  externalMonitor: boolean;
  externalDuck: boolean;
  externalDuckDb: number;
  externalCopyrightSeen: boolean;
  /** Agora AI noise suppression (Phase 24.7); off by default; forced off in music mode. */
  aiNoiseSuppression: boolean;
  /** Design D level. Replaces the old music-mode boolean. */
  audioQuality: AudioQuality;
}

const DEFAULT_PREFS: AudioPrefs = {
  inputDeviceId: '',
  outputDeviceId: '',
  micVolume: 1,
  monitorEnabled: false,
  spatialAudioEnabled: false,
  voiceEffectApplied: 'none',
  remoteVolumes: {},
  externalDeviceId: '',
  externalVolume: 0.8,
  externalMonitor: false,
  externalDuck: true,
  externalDuckDb: -12,
  externalCopyrightSeen: false,
  aiNoiseSuppression: false,
  audioQuality: 'normal',
};

function readAudioQuality(parsed: {
  audioQuality?: unknown;
  musicMode?: unknown;
  isMusicMode?: unknown;
}): AudioQuality {
  if (isAudioQuality(parsed.audioQuality)) return parsed.audioQuality;
  if (parsed.musicMode === true || parsed.isMusicMode === true) return 'music';
  return 'normal';
}

function readVoiceEffect(value: unknown): StoredVoiceEffect {
  if (value === 'radio' || value === 'deep' || value === 'robot' || value === 'echo' || value === 'none') {
    return value;
  }
  return 'none';
}

function clampVolume(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(0, Math.min(1, number));
}

function clampDuckDb(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return -12;
  return Math.max(-24, Math.min(0, number));
}

export function readAudioPrefs(): AudioPrefs {
  try {
    const raw = localStorage.getItem(AUDIO_PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS, remoteVolumes: {} };
    const parsed = JSON.parse(raw) as Partial<AudioPrefs> & {
      musicMode?: unknown;
      isMusicMode?: unknown;
    };
    const remoteVolumes: Record<string, number> = {};
    if (parsed.remoteVolumes && typeof parsed.remoteVolumes === 'object') {
      for (const [uid, volume] of Object.entries(parsed.remoteVolumes)) {
        remoteVolumes[uid] = clampVolume(volume);
      }
    }
    return {
      inputDeviceId: typeof parsed.inputDeviceId === 'string' ? parsed.inputDeviceId : '',
      outputDeviceId: typeof parsed.outputDeviceId === 'string' ? parsed.outputDeviceId : '',
      micVolume: clampVolume(parsed.micVolume),
      monitorEnabled: parsed.monitorEnabled === true,
      spatialAudioEnabled: parsed.spatialAudioEnabled === true,
      voiceEffectApplied: readVoiceEffect(parsed.voiceEffectApplied),
      remoteVolumes,
      externalDeviceId: typeof parsed.externalDeviceId === 'string' ? parsed.externalDeviceId : '',
      externalVolume: clampVolume(parsed.externalVolume ?? DEFAULT_PREFS.externalVolume),
      externalMonitor: parsed.externalMonitor === true,
      externalDuck: parsed.externalDuck !== false,
      externalDuckDb: clampDuckDb(parsed.externalDuckDb ?? DEFAULT_PREFS.externalDuckDb),
      externalCopyrightSeen: parsed.externalCopyrightSeen === true,
      aiNoiseSuppression: parsed.aiNoiseSuppression === true,
      audioQuality: readAudioQuality(parsed),
    };
  } catch {
    return { ...DEFAULT_PREFS, remoteVolumes: {} };
  }
}

export function writeAudioPrefs(next: AudioPrefs): void {
  try {
    localStorage.setItem(AUDIO_PREFS_KEY, JSON.stringify(next));
  } catch {
    // Private mode or a full quota should not break the mixer.
  }
}
