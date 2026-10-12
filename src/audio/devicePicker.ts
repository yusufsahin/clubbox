import type { AudioQuality } from './audioQuality';
import { classifyAudioDevice, type AudioDeviceLabel, type DeviceFamily } from './deviceClassify';

export type ListedDevice = { id: string; label: string; kind: string };

export type SetupChoice = 'mix' | 'mixer';

export type AudioSetupDraft = {
  micId: string;
  externalId: string;
  outputId: string;
  quality: AudioQuality;
};

export type InstallSummary = {
  /** VB-Cable instance numbers ("2") or "default" when the label has no N- prefix. */
  vbcable: string[];
  voicemeeter: boolean;
  voicemeeterAux: boolean;
  blackhole: boolean;
  loopback: boolean;
  physicalInputs: number;
  physicalOutputs: number;
};

function familyRank(family: DeviceFamily): number {
  switch (family) {
    case 'vbcable':
    case 'voicemeeter':
    case 'blackhole':
    case 'loopback':
      return 0;
    case 'physical':
      return 1;
    default: {
      const neverFamily: never = family;
      return neverFamily;
    }
  }
}

/** "VB-Cable 2", "Voicemeeter AUX", or null for a physical device. */
export function deviceBadge(device: AudioDeviceLabel): string | null {
  const classified = classifyAudioDevice(device);
  switch (classified.family) {
    case 'physical':
      return null;
    case 'vbcable': {
      const number = classified.instance?.replace(/-$/, '');
      return number ? `VB-Cable ${number}` : 'VB-Cable';
    }
    case 'voicemeeter':
      return classified.busHint === 'aux' ? 'Voicemeeter AUX' : 'Voicemeeter';
    case 'blackhole':
      return 'BlackHole';
    case 'loopback':
      return 'Loopback';
    default: {
      const neverFamily: never = classified.family;
      return neverFamily;
    }
  }
}

export function displayDeviceLabel(device: ListedDevice, unavailable: boolean, unavailableMark: string): string {
  const badge = deviceBadge(device);
  const base = badge ? `[${badge}] ${device.label}` : device.label;
  return unavailable && unavailableMark ? `${base} — ${unavailableMark}` : base;
}

export function compareAudioDevices(a: AudioDeviceLabel, b: AudioDeviceLabel): number {
  const rank = familyRank(classifyAudioDevice(a).family) - familyRank(classifyAudioDevice(b).family);
  if (rank !== 0) return rank;
  return a.label.localeCompare(b.label);
}

export function installedAudioSummary(devices: readonly ListedDevice[]): InstallSummary {
  const summary: InstallSummary = {
    vbcable: [],
    voicemeeter: false,
    voicemeeterAux: false,
    blackhole: false,
    loopback: false,
    physicalInputs: 0,
    physicalOutputs: 0,
  };
  for (const device of devices) {
    const classified = classifyAudioDevice(device);
    switch (classified.family) {
      case 'vbcable': {
        const name = classified.instance?.replace(/-$/, '') || 'default';
        if (!summary.vbcable.includes(name)) summary.vbcable.push(name);
        break;
      }
      case 'voicemeeter':
        summary.voicemeeter = true;
        if (classified.busHint === 'aux') summary.voicemeeterAux = true;
        break;
      case 'blackhole':
        summary.blackhole = true;
        break;
      case 'loopback':
        summary.loopback = true;
        break;
      case 'physical':
        if (device.kind === 'audiooutput') summary.physicalOutputs += 1;
        else summary.physicalInputs += 1;
        break;
      default: {
        const neverFamily: never = classified.family;
        return neverFamily;
      }
    }
  }
  summary.vbcable.sort();
  return summary;
}

function isCapture(device: ListedDevice): boolean {
  return classifyAudioDevice(device).side === 'capture';
}

function isRender(device: ListedDevice): boolean {
  return classifyAudioDevice(device).side === 'render';
}

/**
 * Suggested devices for a setup. The caller must not write them until the owner presses Apply.
 * Setup 1 keeps a physical mic and a VB-Cable capture as the external input.
 * Setup 2 uses the mixer output as the mic, leaves external off, and prefers the Aux render device.
 */
export function suggestAudioSetup(
  devices: readonly ListedDevice[],
  choice: SetupChoice,
  currentQuality: AudioQuality,
): AudioSetupDraft {
  const inputs = devices.filter((device) => device.kind === 'audioinput');
  const outputs = devices.filter((device) => device.kind === 'audiooutput');
  const physicalMic = inputs.find((device) => classifyAudioDevice(device).family === 'physical');
  const physicalOut = outputs.find((device) => classifyAudioDevice(device).family === 'physical');
  const cableCapture = inputs.find((device) => classifyAudioDevice(device).family === 'vbcable' && isCapture(device));
  const mixerMic = inputs.find((device) => {
    const classified = classifyAudioDevice(device);
    return classified.family === 'voicemeeter' && classified.busHint !== 'aux' && isCapture(device);
  }) ?? inputs.find((device) => classifyAudioDevice(device).family !== 'physical' && isCapture(device));
  const auxOut = outputs.find((device) => {
    const classified = classifyAudioDevice(device);
    return classified.family === 'voicemeeter' && classified.busHint === 'aux' && isRender(device);
  });
  switch (choice) {
    case 'mix':
      return {
        micId: physicalMic?.id ?? '',
        externalId: cableCapture?.id ?? '',
        outputId: physicalOut?.id ?? '',
        quality: currentQuality,
      };
    case 'mixer':
      return {
        micId: mixerMic?.id ?? '',
        externalId: '',
        outputId: auxOut?.id ?? physicalOut?.id ?? '',
        quality: 'music',
      };
    default: {
      const neverChoice: never = choice;
      return neverChoice;
    }
  }
}

/** Chosen device ids that are no longer in the enumerated list. Empty ids are the system default. */
export function missingChosenDevices(chosen: readonly string[], present: readonly string[]): string[] {
  const known = new Set(present);
  const missing: string[] = [];
  for (const id of chosen) {
    if (!id || id === '__system_audio__' || known.has(id) || missing.includes(id)) continue;
    missing.push(id);
  }
  return missing;
}
