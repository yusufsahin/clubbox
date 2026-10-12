/**
 * Phase 26.1 — tell virtual cables and mixers apart from physical devices.
 * Labels only; no device ids.
 */

export type DeviceFamily = 'vbcable' | 'voicemeeter' | 'blackhole' | 'loopback' | 'physical';
export type DeviceSide = 'capture' | 'render';
export type BusHint = 'main' | 'aux';

export type ClassifiedAudioDevice = {
  family: DeviceFamily;
  /** VB-Cable "N-" prefix inside the parentheses, e.g. "2-". */
  instance: string | null;
  side: DeviceSide;
  /** Voicemeeter only: AUX VAIO vs the main VAIO. */
  busHint?: BusHint;
};

export type AudioDeviceLabel = {
  label: string;
  /** MediaDeviceInfo.kind, or "capture" / "render". */
  kind: string;
};

function familyOf(label: string): DeviceFamily {
  const text = label.toLowerCase();
  if (text.includes('voicemeeter')) return 'voicemeeter';
  if (text.includes('vb-audio virtual cable')) return 'vbcable';
  if (text.includes('blackhole')) return 'blackhole';
  if (text.includes('loopback audio')) return 'loopback';
  return 'physical';
}

/** "Speakers (2- VB-Audio Virtual Cable)" → "2-". No prefix → null. */
function instanceOf(label: string): string | null {
  const match = label.match(/\((\d+-)\s/);
  return match?.[1] ?? null;
}

function sideFromKind(kind: string): DeviceSide {
  const text = kind.toLowerCase();
  if (text === 'audiooutput' || text === 'render') return 'render';
  return 'capture';
}

function vbCableSide(label: string, kind: string): DeviceSide {
  const text = label.toLowerCase();
  if (text.includes('cable output')) return 'capture';
  if (text.includes('cable input') || text.includes('cable in ') || text.includes('speakers')) return 'render';
  return sideFromKind(kind);
}

function voicemeeterSide(label: string, kind: string): DeviceSide {
  const text = label.toLowerCase();
  if (/\boutput\b/.test(text)) return 'capture';
  if (/\binput\b/.test(text)) return 'render';
  return sideFromKind(kind);
}

function sideOf(family: DeviceFamily, label: string, kind: string): DeviceSide {
  switch (family) {
    case 'vbcable':
      return vbCableSide(label, kind);
    case 'voicemeeter':
      return voicemeeterSide(label, kind);
    case 'blackhole':
    case 'loopback':
    case 'physical':
      return sideFromKind(kind);
    default: {
      const neverFamily: never = family;
      return neverFamily;
    }
  }
}

export function classifyAudioDevice(device: AudioDeviceLabel): ClassifiedAudioDevice {
  const family = familyOf(device.label);
  const classified: ClassifiedAudioDevice = {
    family,
    instance: family === 'vbcable' ? instanceOf(device.label) : null,
    side: sideOf(family, device.label, device.kind),
  };
  if (family === 'voicemeeter') {
    classified.busHint = /\baux\b/i.test(device.label) ? 'aux' : 'main';
  }
  return classified;
}

/** Same cable/mixer instance. Physical devices are never one group. Voicemeeter also splits main vs AUX. */
export function sameVirtualGroup(a: ClassifiedAudioDevice, b: ClassifiedAudioDevice): boolean {
  if (a.family === 'physical' || b.family === 'physical') return false;
  if (a.family !== b.family || a.instance !== b.instance) return false;
  if (a.family === 'voicemeeter' && a.busHint !== b.busHint) return false;
  return true;
}
