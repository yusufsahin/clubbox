import assert from 'node:assert/strict';
import test from 'node:test';
import { loopGuard } from '../src/audio/loopGuard.ts';
import { roomDetailsPanel, type RoomDetailsState } from '../src/ui/components/roomDetailsPanel.ts';

const cableOut = { label: 'CABLE Output (2- VB-Audio Virtual Cable)', kind: 'audioinput' };
const cableIn = { label: 'CABLE Input (2- VB-Audio Virtual Cable)', kind: 'audiooutput' };
const cableSpeakers = { label: 'Speakers (2- VB-Audio Virtual Cable)', kind: 'audiooutput' };
const cableOther = { label: 'CABLE Output (VB-Audio Virtual Cable)', kind: 'audioinput' };
const realtek = { label: 'Microphone (Realtek(R) Audio)', kind: 'audioinput' };
const headphones = { label: 'Headphones (Realtek(R) Audio)', kind: 'audiooutput' };
const vmOut = { label: 'VoiceMeeter Output (VB-Audio VoiceMeeter VAIO)', kind: 'audioinput' };
const vmIn = { label: 'VoiceMeeter Input (VB-Audio VoiceMeeter VAIO)', kind: 'audiooutput' };
const vmAux = { label: 'VoiceMeeter Aux Input (VB-Audio VoiceMeeter AUX VAIO)', kind: 'audiooutput' };
const blackhole = { label: 'BlackHole 2ch', kind: 'audioinput' };
const blackholeOut = { label: 'BlackHole 2ch', kind: 'audiooutput' };

test('output in the same virtual group as the mic or external is a room loop', () => {
  assert.equal(loopGuard({ mic: cableOut, output: cableSpeakers }).roomLoop, true);
  assert.equal(loopGuard({ mic: realtek, external: cableOut, output: cableSpeakers }).roomLoop, true);
  assert.equal(loopGuard({ mic: blackhole, output: blackholeOut }).roomLoop, true);
  assert.equal(loopGuard({ mic: cableOut, output: headphones }).roomLoop, false);
  assert.equal(loopGuard({ mic: cableOther, output: cableSpeakers }).roomLoop, false);
  assert.equal(loopGuard({ mic: realtek, output: headphones }).roomLoop, false);
});

test('Voicemeeter main output into the main input asks for Aux; Aux output is clear', () => {
  const main = loopGuard({ mic: vmOut, output: vmIn });
  assert.equal(main.voicemeeterAux, true);
  assert.equal(main.roomLoop, true);
  assert.equal(main.blockStage, false);
  const aux = loopGuard({ mic: vmOut, output: vmAux });
  assert.equal(aux.voicemeeterAux, false);
  assert.equal(aux.roomLoop, false);
  assert.equal(aux.blockStage, false);
});

test('same VB-Cable instance blocks the stage and a different instance does not', () => {
  const sameSpeakers = loopGuard({ mic: cableOut, output: cableSpeakers });
  assert.equal(sameSpeakers.blockStage, true);
  assert.equal(sameSpeakers.roomLoop, true);
  const sameInput = loopGuard({ mic: cableOut, output: cableIn });
  assert.equal(sameInput.blockStage, true);
  const other = loopGuard({ mic: cableOther, output: cableSpeakers });
  assert.equal(other.blockStage, false);
  assert.equal(loopGuard({ mic: vmOut, output: vmIn }).blockStage, false);
  assert.equal(loopGuard({ external: cableOut, mic: realtek, output: cableSpeakers }).blockStage, true);
});

function details(extra: Partial<RoomDetailsState>): string {
  const state: RoomDetailsState = {
    topic: 'Room',
    replaysOn: false,
    audioQuality: 'normal',
    monitorEnabled: false,
    voiceEffect: 'none',
    voiceEffectOptions: [],
    spatialAudio: false,
    micVolume: 1,
    canMuteAll: false,
    canShare: false,
    canHideRoom: false,
    canSaveReplay: false,
    canModerate: false,
    canPinnedLink: false,
    pinnedLink: '',
    canToggleChat: false,
    chatEnabled: true,
    canDisableReplay: false,
    canNsfw: false,
    isNsfw: false,
    canHandraiseQueue: false,
    canSuggestedSpeakers: false,
    queueUsers: [],
    suggestedUsers: [],
    canRename: false,
    canPing: false,
    canEnd: false,
    canChangeVisibility: false,
    canHandraise: false,
    visibilityMode: 'open',
    handraiseMode: '1',
    audienceSearch: '',
    helpUrl: 'https://support.clubhouse.com/hc/en-us/articles/360059385913',
    showExternalAudio: true,
    externalDevices: [],
    externalDeviceId: 'cable',
    externalVolume: 0.8,
    externalMuted: false,
    externalMonitor: true,
    externalDuck: false,
    externalDuckDb: -12,
    externalActive: true,
    systemAudioAvailable: false,
    systemAudioBlockedReason: '',
    ...extra,
  };
  return roomDetailsPanel(state).value;
}

test('room details shows the loop warning and disables monitor external', () => {
  const markup = details({ loopRoom: true, monitorBlocked: true, loopVoicemeeter: true, loopBlockStage: true });
  assert.match(markup, /Room audio would be sent back into the room/);
  assert.match(markup, /Set Clubbox output to VoiceMeeter Aux Input/);
  assert.match(markup, /data-action="toggle-external-monitor"[^>]*disabled/);
  const open = details({});
  assert.doesNotMatch(open, /Room audio would be sent back into the room/);
  assert.doesNotMatch(open, /data-action="toggle-external-monitor"[^>]*disabled/);
});
