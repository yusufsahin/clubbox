/** Music & external audio setup (clubbox-app 2.2–2.4.1 wizard). */

export type AudioSetupKind = 'clubbox-mix' | 'mixer-as-mic';

export type AudioDeviceOption = { id: string; label: string };

export type AudioSetupDraft = {
  kind: AudioSetupKind;
  micId: string;
  externalId: string;
  speakerId: string;
};

export type AudioSetupBlock =
  | 'same-cable-mic-external'
  | 'speakers-on-cable'
  | 'mixer-needs-external-off'
  | 'clubbox-mix-needs-external';

export type CableCheckId = 'cable-found' | 'signal' | 'format' | 'loop-guard' | 'send-path';

export type CableCheckStep = {
  id: CableCheckId;
  ok: boolean;
  warn: boolean;
};

export function looksLikeVirtualCable(label: string): boolean {
  return /vb-?audio|cable output|cable input|voicemeeter|blackhole|loopback/i.test(label);
}

export function defaultAudioSetupDraft(input: {
  micId?: string;
  externalId?: string;
  speakerId?: string;
}): AudioSetupDraft {
  return {
    kind: 'clubbox-mix',
    micId: input.micId ?? '',
    externalId: input.externalId ?? '',
    speakerId: input.speakerId ?? '',
  };
}

export function validateAudioSetup(draft: AudioSetupDraft): AudioSetupBlock | null {
  if (draft.kind === 'mixer-as-mic') {
    return draft.externalId ? 'mixer-needs-external-off' : null;
  }
  if (!draft.externalId) return 'clubbox-mix-needs-external';
  if (draft.micId && draft.micId === draft.externalId) return 'same-cable-mic-external';
  if (draft.speakerId && draft.speakerId === draft.externalId) return 'speakers-on-cable';
  return null;
}

export function extrasCaptureMode(deviceId: string | null | undefined, systemId: string): 'agora-mic' | 'custom-dest' | 'none' {
  if (!deviceId) return 'none';
  if (deviceId === systemId) return 'custom-dest';
  return 'agora-mic';
}

export function planCableCheck(input: {
  devices: AudioDeviceOption[];
  draft: AudioSetupDraft;
  signalHeard?: boolean;
  channelCount?: number;
  sampleRate?: number;
  extrasLive?: boolean;
}): CableCheckStep[] {
  const cables = input.devices.filter((device) => looksLikeVirtualCable(device.label));
  const cableFound = cables.length > 0;
  const duplicate = cables.length > 2;
  const loop = !!(input.draft.speakerId && input.draft.speakerId === input.draft.externalId);
  const formatOk = (input.channelCount ?? 0) >= 2 && (input.sampleRate ?? 0) >= 44100;
  const signal = input.signalHeard === true;
  return [
    { id: 'cable-found', ok: cableFound, warn: duplicate },
    { id: 'signal', ok: signal, warn: false },
    { id: 'format', ok: formatOk, warn: false },
    { id: 'loop-guard', ok: !loop && !!input.draft.speakerId, warn: false },
    { id: 'send-path', ok: input.extrasLive === true || (!!input.draft.externalId && !loop), warn: false },
  ];
}
