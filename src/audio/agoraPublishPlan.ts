/** Which local Agora tracks to publish. Mic stays on the SDK capture path. */

export function agoraPublishTracks<T>(mic: T | null, extras: T | null): T[] {
  const tracks: T[] = [];
  if (mic) tracks.push(mic);
  if (extras) tracks.push(extras);
  return tracks;
}

export type AgoraCaptureProfile = {
  encoderConfig: 'speech_standard' | 'music_standard' | 'high_quality_stereo';
  AEC: boolean;
  ANS: boolean;
  AGC: boolean;
};

/** Voice track: music mode must drop AEC/ANS/AGC or Agora still sounds like a phone call. */
export function agoraMicProfile(isMusicMode: boolean): AgoraCaptureProfile {
  if (isMusicMode) {
    return { encoderConfig: 'high_quality_stereo', AEC: false, ANS: false, AGC: false };
  }
  return { encoderConfig: 'speech_standard', AEC: true, ANS: true, AGC: true };
}

/** VB-Cable extras never use voice processing. Stereo encoder only in music mode. */
export function agoraExtrasProfile(isMusicMode: boolean): AgoraCaptureProfile {
  return {
    encoderConfig: isMusicMode ? 'high_quality_stereo' : 'music_standard',
    AEC: false,
    ANS: false,
    AGC: false,
  };
}

export function extrasNeedRepublish(input: {
  haveTrack: boolean;
  deviceId: string;
  publishedDeviceId: string;
  musicMode: boolean;
  publishedMusicMode: boolean;
}): boolean {
  if (!input.haveTrack) return true;
  if (input.deviceId !== input.publishedDeviceId) return true;
  return input.musicMode !== input.publishedMusicMode;
}
