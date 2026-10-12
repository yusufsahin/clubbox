import { audioPublishProfile, type AudioQuality } from './audioQuality';
import {
  classifyAudioDevice,
  sameVirtualGroup,
  type AudioDeviceLabel,
} from './deviceClassify';

export type MicCaptureProfile = {
  virtual: boolean;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  /** Present only for a virtual line input. */
  channelCount?: 2;
  aiDenoiser: boolean;
};

export function isVirtualInput(device: AudioDeviceLabel | null | undefined): boolean {
  if (!device?.label) return false;
  return classifyAudioDevice(device).family !== 'physical';
}

/** Voice processing follows the quality level. A virtual mic is always a line input. */
export function micCaptureProfile(
  device: AudioDeviceLabel | null | undefined,
  quality: AudioQuality,
): MicCaptureProfile {
  const publish = audioPublishProfile(quality);
  if (!isVirtualInput(device)) {
    return {
      virtual: false,
      echoCancellation: publish.aec,
      noiseSuppression: publish.ans,
      autoGainControl: publish.agc,
      aiDenoiser: publish.aiDenoiserAllowed,
    };
  }
  return {
    virtual: true,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 2,
    aiDenoiser: false,
  };
}

export function micTrackConstraints(
  device: AudioDeviceLabel | null | undefined,
  quality: AudioQuality,
): MediaTrackConstraints {
  const profile = micCaptureProfile(device, quality);
  const audio: MediaTrackConstraints = {
    echoCancellation: profile.echoCancellation,
    noiseSuppression: profile.noiseSuppression,
    autoGainControl: profile.autoGainControl,
  };
  if (profile.channelCount) audio.channelCount = profile.channelCount;
  if (quality === 'music') audio.sampleRate = 48000;
  return audio;
}

/** Ask once per device id, and only while quality is not already Music. */
export function shouldPromptMixerMusic(
  device: AudioDeviceLabel | null | undefined,
  deviceId: string,
  promptedIds: readonly string[],
  quality: AudioQuality,
): boolean {
  if (quality === 'music' || !deviceId) return false;
  if (promptedIds.includes(deviceId)) return false;
  return isVirtualInput(device);
}

/** Same virtual cable or mixer bus on the mic and the external input (double signal / phasing). */
export function externalDoublesMic(
  mic: AudioDeviceLabel | null | undefined,
  external: AudioDeviceLabel | null | undefined,
): boolean {
  if (!mic?.label || !external?.label) return false;
  return sameVirtualGroup(classifyAudioDevice(mic), classifyAudioDevice(external));
}
