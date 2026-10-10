const AUDIO_PREFS_KEY = 'clubbox_audio';

export interface AudioPrefs {
  inputDeviceId: string;
  outputDeviceId: string;
  micVolume: number;
  monitorEnabled: boolean;
  remoteVolumes: Record<string, number>;
}

const DEFAULT_PREFS: AudioPrefs = {
  inputDeviceId: '',
  outputDeviceId: '',
  micVolume: 1,
  monitorEnabled: false,
  remoteVolumes: {},
};

function clampVolume(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(0, Math.min(1, number));
}

export function readAudioPrefs(): AudioPrefs {
  try {
    const raw = localStorage.getItem(AUDIO_PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS, remoteVolumes: {} };
    const parsed = JSON.parse(raw) as Partial<AudioPrefs>;
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
      remoteVolumes,
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
