/** getUserMedia constraints for the external audio channel (ST-11). */

export function externalInputConstraints(deviceId: string): MediaTrackConstraints {
  const audio: MediaTrackConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 2,
  };
  if (deviceId) audio.deviceId = { exact: deviceId };
  return audio;
}

export const SYSTEM_AUDIO_DEVICE_ID = '__system_audio__';
