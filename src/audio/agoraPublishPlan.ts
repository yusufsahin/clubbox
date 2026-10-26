/** Which local Agora tracks to publish. Mic stays on the SDK capture path. */

export function agoraPublishTracks<T>(mic: T | null, extras: T | null): T[] {
  const tracks: T[] = [];
  if (mic) tracks.push(mic);
  if (extras) tracks.push(extras);
  return tracks;
}
