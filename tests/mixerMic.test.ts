import assert from 'node:assert/strict';
import test from 'node:test';
import {
  externalDoublesMic,
  micCaptureProfile,
  micTrackConstraints,
  shouldPromptMixerMusic,
} from '../src/audio/mixerMic.ts';
import { cockpitBar } from '../src/ui/components/cockpitBar.ts';
import type { SoundEffectItem } from '../src/api/types.ts';

const cable = { label: 'CABLE Output (2- VB-Audio Virtual Cable)', kind: 'audioinput' };
const cableOther = { label: 'CABLE Output (VB-Audio Virtual Cable)', kind: 'audioinput' };
const realtek = { label: 'Microphone (Realtek(R) Audio)', kind: 'audioinput' };
const voicemeeterMain = { label: 'VoiceMeeter Output (VB-Audio VoiceMeeter VAIO)', kind: 'audioinput' };
const voicemeeterAux = { label: 'VoiceMeeter Aux Output (VB-Audio VoiceMeeter AUX VAIO)', kind: 'audioinput' };

test('virtual mic opens as a line input even at Normal quality', () => {
  const profile = micCaptureProfile(cable, 'normal');
  assert.equal(profile.virtual, true);
  assert.equal(profile.echoCancellation, false);
  assert.equal(profile.noiseSuppression, false);
  assert.equal(profile.autoGainControl, false);
  assert.equal(profile.channelCount, 2);
  assert.equal(profile.aiDenoiser, false);
  assert.deepEqual(micTrackConstraints(cable, 'high'), {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 2,
  });
  const voice = micCaptureProfile(realtek, 'normal');
  assert.equal(voice.virtual, false);
  assert.equal(voice.echoCancellation, true);
  assert.equal(voice.noiseSuppression, true);
  assert.equal(voice.autoGainControl, true);
  assert.equal(voice.channelCount, undefined);
  assert.equal(voice.aiDenoiser, true);
});

test('same-group mic and external input are blocked', () => {
  assert.equal(externalDoublesMic(cable, cable), true);
  assert.equal(externalDoublesMic(voicemeeterMain, voicemeeterMain), true);
  assert.equal(externalDoublesMic(cable, cableOther), false);
  assert.equal(externalDoublesMic(voicemeeterMain, voicemeeterAux), false);
  assert.equal(externalDoublesMic(realtek, cable), false);
  assert.equal(externalDoublesMic(realtek, realtek), false);
});

test('mixer music prompt is once per device id and skipped when already Music', () => {
  assert.equal(shouldPromptMixerMusic(cable, 'dev-2', [], 'normal'), true);
  assert.equal(shouldPromptMixerMusic(cable, 'dev-2', ['dev-2'], 'normal'), false);
  assert.equal(shouldPromptMixerMusic(cable, 'dev-2', [], 'music'), false);
  assert.equal(shouldPromptMixerMusic(realtek, 'dev-2', [], 'normal'), false);
});

test('mixer mic button tooltip says Mix', () => {
  const effects: SoundEffectItem[] = [];
  const markup = cockpitBar({
    muted: false,
    musicMode: false,
    mixerMic: true,
    recording: false,
    handRaised: false,
    handDisabled: true,
    canRaiseHand: false,
    canJoinStage: false,
    showAudioRetry: false,
    isSpeaker: true,
    inRoom: true,
    roomTitle: 'Room',
    effects,
    latestChat: '',
    unreadChat: 0,
    chatOpen: false,
    canChat: true,
    canClip: false,
    canRecord: false,
    recordHint: '',
    reactionsOpen: false,
    soundsOpen: false,
    canReact: false,
    canGifReact: false,
    overflowOpen: false,
  }).value;
  assert.match(markup, /Mix — muting mutes the whole mix\. Soundboard still goes through extras\./);
  assert.match(markup, /room-bar-label">Mix</);
});
