import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyAudioDevice, sameVirtualGroup } from '../src/audio/deviceClassify.ts';

test('classifies the owner VB-Cable labels', () => {
  assert.deepEqual(classifyAudioDevice({
    label: 'Speakers (2- VB-Audio Virtual Cable)',
    kind: 'audiooutput',
  }), { family: 'vbcable', instance: '2-', side: 'render' });

  assert.deepEqual(classifyAudioDevice({
    label: 'CABLE Output (2- VB-Audio Virtual Cable)',
    kind: 'audioinput',
  }), { family: 'vbcable', instance: '2-', side: 'capture' });

  assert.deepEqual(classifyAudioDevice({
    label: 'CABLE Output (VB-Audio Virtual Cable)',
    kind: 'audioinput',
  }), { family: 'vbcable', instance: null, side: 'capture' });

  assert.deepEqual(classifyAudioDevice({
    label: 'CABLE In 16 Ch (2- VB-Audio Virtual Cable)',
    kind: 'audiooutput',
  }), { family: 'vbcable', instance: '2-', side: 'render' });

  assert.deepEqual(classifyAudioDevice({
    label: 'CABLE Input (2- VB-Audio Virtual Cable)',
    kind: 'audiooutput',
  }), { family: 'vbcable', instance: '2-', side: 'render' });
});

test('VB-Cable capture and render follow the label, not a mismatched kind', () => {
  const output = classifyAudioDevice({
    label: 'CABLE Output (2- VB-Audio Virtual Cable)',
    kind: 'audiooutput',
  });
  assert.equal(output.side, 'capture');
});

test('classifies Voicemeeter main and AUX buses', () => {
  assert.deepEqual(classifyAudioDevice({
    label: 'VoiceMeeter Input (VB-Audio VoiceMeeter VAIO)',
    kind: 'audiooutput',
  }), { family: 'voicemeeter', instance: null, side: 'render', busHint: 'main' });

  assert.deepEqual(classifyAudioDevice({
    label: 'VoiceMeeter Output (VB-Audio VoiceMeeter VAIO)',
    kind: 'audioinput',
  }), { family: 'voicemeeter', instance: null, side: 'capture', busHint: 'main' });

  assert.deepEqual(classifyAudioDevice({
    label: 'VoiceMeeter Aux Input (VB-Audio VoiceMeeter AUX VAIO)',
    kind: 'audiooutput',
  }), { family: 'voicemeeter', instance: null, side: 'render', busHint: 'aux' });

  assert.deepEqual(classifyAudioDevice({
    label: 'VoiceMeeter Aux Output (VB-Audio VoiceMeeter AUX VAIO)',
    kind: 'audioinput',
  }), { family: 'voicemeeter', instance: null, side: 'capture', busHint: 'aux' });
});

test('classifies BlackHole, Loopback, and physical devices', () => {
  assert.deepEqual(classifyAudioDevice({
    label: 'BlackHole 2ch',
    kind: 'audioinput',
  }), { family: 'blackhole', instance: null, side: 'capture' });

  assert.deepEqual(classifyAudioDevice({
    label: 'Loopback Audio',
    kind: 'audiooutput',
  }), { family: 'loopback', instance: null, side: 'render' });

  assert.deepEqual(classifyAudioDevice({
    label: 'Microphone (Realtek(R) Audio)',
    kind: 'audioinput',
  }), { family: 'physical', instance: null, side: 'capture' });

  assert.deepEqual(classifyAudioDevice({
    label: 'Speakers (USB Audio Device)',
    kind: 'audiooutput',
  }), { family: 'physical', instance: null, side: 'render' });
});

test('sameVirtualGroup matches one VB-Cable instance and splits Voicemeeter buses', () => {
  const speakers = classifyAudioDevice({
    label: 'Speakers (2- VB-Audio Virtual Cable)',
    kind: 'audiooutput',
  });
  const cableOut = classifyAudioDevice({
    label: 'CABLE Output (2- VB-Audio Virtual Cable)',
    kind: 'audioinput',
  });
  const broken = classifyAudioDevice({
    label: 'CABLE Output (VB-Audio Virtual Cable)',
    kind: 'audioinput',
  });
  const mainOut = classifyAudioDevice({
    label: 'VoiceMeeter Output (VB-Audio VoiceMeeter VAIO)',
    kind: 'audioinput',
  });
  const mainIn = classifyAudioDevice({
    label: 'VoiceMeeter Input (VB-Audio VoiceMeeter VAIO)',
    kind: 'audiooutput',
  });
  const auxIn = classifyAudioDevice({
    label: 'VoiceMeeter Aux Input (VB-Audio VoiceMeeter AUX VAIO)',
    kind: 'audiooutput',
  });
  const realtek = classifyAudioDevice({
    label: 'Microphone (Realtek(R) Audio)',
    kind: 'audioinput',
  });
  const usb = classifyAudioDevice({
    label: 'Speakers (USB Audio Device)',
    kind: 'audiooutput',
  });

  assert.equal(sameVirtualGroup(speakers, cableOut), true);
  assert.equal(sameVirtualGroup(cableOut, broken), false);
  assert.equal(sameVirtualGroup(mainOut, mainIn), true);
  assert.equal(sameVirtualGroup(mainOut, auxIn), false);
  assert.equal(sameVirtualGroup(speakers, mainIn), false);
  assert.equal(sameVirtualGroup(realtek, usb), false);
});
