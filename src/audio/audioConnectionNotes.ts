import type { LoopGuard } from './loopGuard';

/** Shared connection warnings for Settings, Room details, and the setup wizard. */
export type AudioConnectionNoteKind =
  | 'loopRoom'
  | 'loopVoicemeeter'
  | 'loopStage'
  | 'doubleCable';

export type AudioConnectionNote = {
  kind: AudioConnectionNoteKind;
  /** i18n key in en.ts / tr.ts */
  messageKey:
    | 'loopRoomAudio'
    | 'loopVoicemeeterAux'
    | 'loopBlockStage'
    | 'mixerDoubleSignal';
};

export function audioConnectionNotes(input: {
  guard: LoopGuard;
  doublesMic: boolean;
}): AudioConnectionNote[] {
  const notes: AudioConnectionNote[] = [];
  if (input.guard.roomLoop) {
    notes.push({ kind: 'loopRoom', messageKey: 'loopRoomAudio' });
  }
  if (input.guard.voicemeeterAux) {
    notes.push({ kind: 'loopVoicemeeter', messageKey: 'loopVoicemeeterAux' });
  }
  if (input.guard.blockStage) {
    notes.push({ kind: 'loopStage', messageKey: 'loopBlockStage' });
  }
  if (input.doublesMic) {
    notes.push({ kind: 'doubleCable', messageKey: 'mixerDoubleSignal' });
  }
  return notes;
}
