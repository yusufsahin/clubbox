import {
  classifyAudioDevice,
  sameVirtualGroup,
  type AudioDeviceLabel,
  type ClassifiedAudioDevice,
} from './deviceClassify';

export type LoopGuard = {
  /** Output shares a virtual group with the mic or the external input. */
  roomLoop: boolean;
  /** Voicemeeter main Output (B1) into the main VAIO input. AUX output is clear. */
  voicemeeterAux: boolean;
  /** Same VB-Cable instance is both the render device and a capture. Stage join stays off. */
  blockStage: boolean;
};

function classified(device: AudioDeviceLabel | null | undefined): ClassifiedAudioDevice | null {
  if (!device?.label) return null;
  return classifyAudioDevice(device);
}

export function loopGuard(input: {
  mic?: AudioDeviceLabel | null;
  external?: AudioDeviceLabel | null;
  output?: AudioDeviceLabel | null;
}): LoopGuard {
  const mic = classified(input.mic);
  const external = classified(input.external);
  const output = classified(input.output);
  if (!output || output.family === 'physical') {
    return { roomLoop: false, voicemeeterAux: false, blockStage: false };
  }
  const captures = [mic, external].filter((device): device is ClassifiedAudioDevice => device !== null);
  const loopWith = captures.filter((device) => sameVirtualGroup(device, output));
  const voicemeeterAux = mic?.family === 'voicemeeter'
    && mic.side === 'capture'
    && mic.busHint === 'main'
    && output.family === 'voicemeeter'
    && output.side === 'render'
    && output.busHint === 'main';
  return {
    roomLoop: loopWith.length > 0,
    voicemeeterAux,
    blockStage: loopWith.some((device) => device.family === 'vbcable'),
  };
}
