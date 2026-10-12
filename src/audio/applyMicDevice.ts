import { agoraVoice } from './agoraVoice';
import { audioEngine } from './audioEngine';
import type { AudioQuality } from './audioQuality';
import type { AudioDeviceLabel } from './deviceClassify';
import { micCaptureProfile, type MicCaptureProfile } from './mixerMic';

export type MicApplyKind = 'local_restart' | 'agora_set_device' | 'agora_republish';

/** True when AEC/ANS/AGC/channel constraints must be rebuilt (setDevice is not enough). */
export function micCaptureNeedsRepublish(
  previous: MicCaptureProfile,
  next: MicCaptureProfile,
): boolean {
  return (
    previous.virtual !== next.virtual
    || previous.echoCancellation !== next.echoCancellation
    || previous.noiseSuppression !== next.noiseSuppression
    || previous.autoGainControl !== next.autoGainControl
    || previous.channelCount !== next.channelCount
  );
}

export function chooseMicApplyKind(opts: {
  joinedSpeaker: boolean;
  previousProfile: MicCaptureProfile;
  nextProfile: MicCaptureProfile;
}): MicApplyKind {
  if (!opts.joinedSpeaker) return 'local_restart';
  if (micCaptureNeedsRepublish(opts.previousProfile, opts.nextProfile)) return 'agora_republish';
  return 'agora_set_device';
}

export type ApplyMicDeviceInput = {
  deviceId: string;
  label?: string;
  quality: AudioQuality;
  /** Device label/kind before the change (for profile compare). */
  previousDevice: AudioDeviceLabel | null;
};

/**
 * Single path for Settings, wizard, and hot-swap: store prefs on the engine,
 * then either restart local capture, Agora setDevice, or republish.
 */
export async function applyMicDevice(input: ApplyMicDeviceInput): Promise<MicApplyKind> {
  const previousProfile = micCaptureProfile(input.previousDevice, input.quality);
  audioEngine.storeInputDeviceId(input.deviceId, input.label);
  const nextDevice: AudioDeviceLabel | null =
    typeof input.label === 'string' && input.label
      ? { label: input.label, kind: 'audioinput' }
      : audioEngine.getInputDevice();
  const nextProfile = micCaptureProfile(nextDevice, input.quality);
  const kind = chooseMicApplyKind({
    joinedSpeaker: agoraVoice.getIsJoined() && agoraVoice.getIsSpeaker(),
    previousProfile,
    nextProfile,
  });
  switch (kind) {
    case 'local_restart':
      await audioEngine.restartMicrophone();
      break;
    case 'agora_set_device':
      await agoraVoice.setMicrophoneDevice(input.deviceId);
      break;
    case 'agora_republish':
      await agoraVoice.republish(input.quality);
      break;
    default: {
      const _exhaustive: never = kind;
      void _exhaustive;
      break;
    }
  }
  return kind;
}
