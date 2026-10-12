import { classifyAudioDevice, type DeviceFamily, type DeviceSide } from './deviceClassify';

/** What the browser actually opened. No device id. */
export type CaptureTruth = {
  channelCount: number | null;
  sampleRate: number | null;
  echoCancellation: boolean | null;
  noiseSuppression: boolean | null;
  autoGainControl: boolean | null;
  family: DeviceFamily;
  side: DeviceSide;
};

export type CaptureSettings = {
  channelCount?: number;
  sampleRate?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  /** Present on MediaTrackSettings. Never copied into CaptureTruth or the log line. */
  deviceId?: string;
  label?: string;
};

function numberOrNull(value: number | undefined): number | null {
  return typeof value === 'number' ? value : null;
}

function flagOrNull(value: boolean | undefined): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export function captureTruthFromSettings(settings: CaptureSettings): CaptureTruth {
  const classified = classifyAudioDevice({ label: settings.label ?? '', kind: 'audioinput' });
  return {
    channelCount: numberOrNull(settings.channelCount),
    sampleRate: numberOrNull(settings.sampleRate),
    echoCancellation: flagOrNull(settings.echoCancellation),
    noiseSuppression: flagOrNull(settings.noiseSuppression),
    autoGainControl: flagOrNull(settings.autoGainControl),
    family: classified.family,
    side: classified.side,
  };
}

function flagText(value: boolean | null): string {
  if (value === null) return 'unknown';
  return value ? 'true' : 'false';
}

function numberText(value: number | null): string {
  return value == null ? 'unknown' : String(value);
}

/** One log line. The example shape is `[Clubbox] capture mic ch=2 sr=48000 aec=false ns=false agc=false family=vbcable`. */
export function formatCaptureLog(which: 'mic' | 'external', truth: CaptureTruth): string {
  return `[Clubbox] capture ${which} ch=${numberText(truth.channelCount)} sr=${numberText(truth.sampleRate)} aec=${flagText(truth.echoCancellation)} ns=${flagText(truth.noiseSuppression)} agc=${flagText(truth.autoGainControl)} family=${truth.family}`;
}

/** Virtual cables and mixers that opened mono, or at any rate other than 48 kHz. */
export function needsVirtualFormatHint(truth: CaptureTruth): boolean {
  if (truth.family === 'physical') return false;
  if (truth.channelCount === 1) return true;
  return truth.sampleRate != null && truth.sampleRate !== 48000;
}

export function showWindowsFormatHint(captures: readonly (CaptureTruth | null | undefined)[]): boolean {
  return captures.some((truth) => !!truth && needsVirtualFormatHint(truth));
}
