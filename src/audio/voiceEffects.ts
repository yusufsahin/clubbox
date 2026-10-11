export type VoiceEffectId = 'none' | 'radio' | 'deep' | 'robot' | 'echo';

export type VoiceEffectState = {
  selected: VoiceEffectId;
  previewActive: boolean;
  applied: VoiceEffectId;
};

export function defaultVoiceEffectState(): VoiceEffectState {
  return { selected: 'none', previewActive: false, applied: 'none' };
}

export function pickEffect(state: VoiceEffectState, effect: VoiceEffectId): VoiceEffectState {
  return { ...state, selected: effect, previewActive: false };
}

export function startPreview(state: VoiceEffectState): VoiceEffectState {
  return { ...state, previewActive: state.selected !== 'none' };
}

export function applyEffect(state: VoiceEffectState): VoiceEffectState {
  return { ...state, applied: state.selected, previewActive: false };
}

/** Monitor path only — broadcast uses `applied`. */
export function monitorUsesEffect(state: VoiceEffectState): VoiceEffectId {
  return state.previewActive ? state.selected : state.applied;
}

export function broadcastUsesEffect(state: VoiceEffectState): VoiceEffectId {
  return state.applied;
}
