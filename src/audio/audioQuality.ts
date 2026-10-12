/** Design D publish levels. Music is a custom encoder, not high_quality_stereo (192 kbps). */
export type AudioQuality = 'normal' | 'high' | 'music';

export type AudioEncoderSetting =
  | 'speech_standard'
  | 'high_quality'
  | { sampleRate: 48000; stereo: true; bitrate: 128 };

export interface AudioPublishProfile {
  quality: AudioQuality;
  encoder: AudioEncoderSetting;
  aec: boolean;
  ans: boolean;
  agc: boolean;
  /** False only in music — the preference may still be off at the other levels. */
  aiDenoiserAllowed: boolean;
}

const MUSIC_ENCODER = { sampleRate: 48000, stereo: true, bitrate: 128 } as const;

export function isAudioQuality(value: unknown): value is AudioQuality {
  return value === 'normal' || value === 'high' || value === 'music';
}

export function audioPublishProfile(quality: AudioQuality): AudioPublishProfile {
  switch (quality) {
    case 'normal':
      return {
        quality,
        encoder: 'speech_standard',
        aec: true,
        ans: true,
        agc: true,
        aiDenoiserAllowed: true,
      };
    case 'high':
      return {
        quality,
        encoder: 'high_quality',
        aec: true,
        ans: true,
        agc: true,
        aiDenoiserAllowed: true,
      };
    case 'music':
      return {
        quality,
        encoder: MUSIC_ENCODER,
        aec: false,
        ans: false,
        agc: false,
        aiDenoiserAllowed: false,
      };
    default: {
      const neverQuality: never = quality;
      return neverQuality;
    }
  }
}
