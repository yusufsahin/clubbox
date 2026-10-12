import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chooseMicApplyKind,
  micCaptureNeedsRepublish,
} from '../src/audio/applyMicDevice.ts';
import { micCaptureProfile } from '../src/audio/mixerMic.ts';
import { audioEngine } from '../src/audio/audioEngine.ts';
import { audioConnectionNotes } from '../src/audio/audioConnectionNotes.ts';

test('micCaptureNeedsRepublish when virtuality flips', () => {
  const physical = micCaptureProfile({ label: 'USB Mic', kind: 'audioinput' }, 'high');
  const virtual = micCaptureProfile(
    { label: 'CABLE Output (VB-Audio Virtual Cable)', kind: 'audioinput' },
    'high',
  );
  assert.equal(physical.virtual, false);
  assert.equal(virtual.virtual, true);
  assert.equal(micCaptureNeedsRepublish(physical, virtual), true);
  assert.equal(micCaptureNeedsRepublish(physical, physical), false);
});

test('chooseMicApplyKind: local restart when not speaking', () => {
  const profile = micCaptureProfile({ label: 'USB Mic', kind: 'audioinput' }, 'normal');
  assert.equal(
    chooseMicApplyKind({
      joinedSpeaker: false,
      previousProfile: profile,
      nextProfile: profile,
    }),
    'local_restart',
  );
});

test('chooseMicApplyKind: setDevice when same profile while speaking', () => {
  const profile = micCaptureProfile({ label: 'USB Mic', kind: 'audioinput' }, 'high');
  assert.equal(
    chooseMicApplyKind({
      joinedSpeaker: true,
      previousProfile: profile,
      nextProfile: profile,
    }),
    'agora_set_device',
  );
});

test('chooseMicApplyKind: republish when profile changes while speaking', () => {
  const physical = micCaptureProfile({ label: 'USB Mic', kind: 'audioinput' }, 'music');
  const virtual = micCaptureProfile(
    { label: 'VoiceMeeter Output', kind: 'audioinput' },
    'music',
  );
  assert.equal(
    chooseMicApplyKind({
      joinedSpeaker: true,
      previousProfile: physical,
      nextProfile: virtual,
    }),
    'agora_republish',
  );
});

test('storeInputDeviceId never restarts capture', () => {
  let restarted = false;
  const original = audioEngine.restartMicrophone.bind(audioEngine);
  audioEngine.restartMicrophone = () => {
    restarted = true;
    return Promise.resolve(true);
  };
  try {
    audioEngine.storeInputDeviceId('device-a', 'Label A');
    assert.equal(restarted, false);
    assert.equal(audioEngine.getInputDeviceId(), 'device-a');
    assert.equal(audioEngine.getInputDeviceLabel(), 'Label A');
  } finally {
    audioEngine.restartMicrophone = original;
  }
});

test('setInputDeviceId does not restart when mic is owned externally', () => {
  type EngineInternals = {
    micOwnedExternally: boolean;
    micStream: { getAudioTracks: () => Array<{ readyState: string }> } | null;
  };
  const internals = audioEngine as unknown as EngineInternals;
  const prevOwned = internals.micOwnedExternally;
  const prevStream = internals.micStream;
  let restarted = false;
  const original = audioEngine.restartMicrophone.bind(audioEngine);
  audioEngine.restartMicrophone = () => {
    restarted = true;
    return Promise.resolve(true);
  };
  try {
    internals.micOwnedExternally = true;
    internals.micStream = {
      getAudioTracks: () => [{ readyState: 'live' }],
    };
    audioEngine.setInputDeviceId('device-b', 'Other Mic');
    assert.equal(restarted, false);
    assert.equal(audioEngine.getInputDeviceId(), 'device-b');
    assert.equal(audioEngine.getInputDeviceLabel(), 'Other Mic');
    assert.equal(audioEngine.isMicOwnedExternally(), true);
  } finally {
    audioEngine.restartMicrophone = original;
    internals.micOwnedExternally = prevOwned;
    internals.micStream = prevStream;
  }
});

test('audioConnectionNotes lists loop and double-cable warnings', () => {
  const notes = audioConnectionNotes({
    guard: { roomLoop: true, voicemeeterAux: false, blockStage: true },
    doublesMic: true,
  });
  assert.deepEqual(
    notes.map((note) => note.messageKey),
    ['loopRoomAudio', 'loopBlockStage', 'mixerDoubleSignal'],
  );
});
