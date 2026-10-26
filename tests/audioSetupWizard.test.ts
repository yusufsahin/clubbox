import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultAudioSetupDraft,
  extrasCaptureMode,
  looksLikeVirtualCable,
  planCableCheck,
  validateAudioSetup,
} from '../src/audio/audioSetupWizard.ts';

test('Setup 1 Clubbox mix needs a distinct external cable', () => {
  const draft = defaultAudioSetupDraft({
    micId: 'mic-1',
    externalId: 'cable-out',
    speakerId: 'headphones',
  });
  assert.equal(validateAudioSetup(draft), null);
  assert.equal(validateAudioSetup({ ...draft, externalId: '' }), 'clubbox-mix-needs-external');
  assert.equal(validateAudioSetup({ ...draft, micId: 'cable-out' }), 'same-cable-mic-external');
  assert.equal(validateAudioSetup({ ...draft, speakerId: 'cable-out' }), 'speakers-on-cable');
});

test('Setup 2 mixer-as-mic keeps External off', () => {
  const draft = defaultAudioSetupDraft({ micId: 'voicemeeter', speakerId: 'aux' });
  draft.kind = 'mixer-as-mic';
  assert.equal(validateAudioSetup(draft), null);
  assert.equal(validateAudioSetup({ ...draft, externalId: 'cable-out' }), 'mixer-needs-external-off');
});

test('VB-Cable labels are recognized', () => {
  assert.equal(looksLikeVirtualCable('CABLE Output (VB-Audio Virtual Cable)'), true);
  assert.equal(looksLikeVirtualCable('Speakers (2- VB-Audio Virtual Cable)'), true);
  assert.equal(looksLikeVirtualCable('Realtek Microphone'), false);
});

test('VB-Cable extras use Agora microphone capture, not a silent custom dest', () => {
  assert.equal(extrasCaptureMode('cable-out', '__system_audio__'), 'agora-mic');
  assert.equal(extrasCaptureMode('__system_audio__', '__system_audio__'), 'custom-dest');
  assert.equal(extrasCaptureMode('', '__system_audio__'), 'none');
});

test('cable check reports found / loop / send path', () => {
  const devices = [
    { id: 'mic-1', label: 'USB Mic' },
    { id: 'cable-out', label: 'CABLE Output (VB-Audio Virtual Cable)' },
    { id: 'headphones', label: 'Headphones' },
  ];
  const draft = defaultAudioSetupDraft({
    micId: 'mic-1',
    externalId: 'cable-out',
    speakerId: 'headphones',
  });
  const steps = planCableCheck({
    devices,
    draft,
    signalHeard: true,
    channelCount: 2,
    sampleRate: 48000,
    extrasLive: true,
  });
  assert.deepEqual(
    steps.map((step) => `${step.id}:${step.ok}`),
    ['cable-found:true', 'signal:true', 'format:true', 'loop-guard:true', 'send-path:true'],
  );
});
