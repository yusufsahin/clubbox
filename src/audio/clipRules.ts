import { localClipAllowed, type RoomAudience } from '../api/guards.ts';

export const CLIP_MIN_SECONDS = 5;
export const CLIP_MAX_SECONDS = 55;

export function clipButtonVisible(input: {
  allowLocalRecording: boolean;
  replayEnabled: boolean;
  hostClipsEnabled: boolean;
  audience: RoomAudience;
}): boolean {
  return localClipAllowed(input);
}

export function validateClipDurationSeconds(seconds: number): string | null {
  if (!Number.isFinite(seconds)) return 'invalid';
  if (seconds < CLIP_MIN_SECONDS) return 'too_short';
  if (seconds > CLIP_MAX_SECONDS) return 'too_long';
  return null;
}
