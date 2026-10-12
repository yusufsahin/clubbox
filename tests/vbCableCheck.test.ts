import assert from 'node:assert/strict';
import test from 'node:test';
import type { CaptureTruth } from '../src/audio/captureTruth.ts';
import type { ListedDevice } from '../src/audio/devicePicker.ts';
import {
  evaluateVbCableCheck,
  findVbCableRenderId,
  isCableOutputCapture,
  summarizeVbCableCheck,
} from '../src/audio/vbCableCheck.ts';

const devices: ListedDevice[] = [
  { id: 'mic', label: 'Microphone (Realtek)', kind: 'audioinput' },
  { id: 'cable1-cap', label: 'CABLE Output (VB-Audio Virtual Cable)', kind: 'audioinput' },
  { id: 'cable1-ren', label: 'Speakers (VB-Audio Virtual Cable)', kind: 'audiooutput' },
  { id: 'cable2-cap', label: 'CABLE Output (2- VB-Audio Virtual Cable)', kind: 'audioinput' },
  { id: 'cable2-ren', label: 'Speakers (2- VB-Audio Virtual Cable)', kind: 'audiooutput' },
  { id: 'phones', label: 'Headphones (Realtek)', kind: 'audiooutput' },
];

const goodCapture: CaptureTruth = {
  channelCount: 2,
  sampleRate: 48000,
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  family: 'vbcable',
  side: 'capture',
};

const monoCapture: CaptureTruth = {
  ...goodCapture,
  channelCount: 1,
};

test('isCableOutputCapture and findVbCableRenderId match instance', () => {
  assert.equal(isCableOutputCapture(devices[3]!), true);
  assert.equal(findVbCableRenderId(devices, 'cable2-cap'), 'cable2-ren');
  assert.equal(findVbCableRenderId(devices, 'cable1-cap'), 'cable1-ren');
  assert.equal(findVbCableRenderId(devices, 'mic'), null);
});

test('cable_found warns on duplicate instances but still passes', () => {
  const result = evaluateVbCableCheck({
    devices,
    micId: 'mic',
    externalId: 'cable2-cap',
    outputId: 'phones',
    signalPeak: 0.2,
    externalCapture: goodCapture,
    extrasSending: null,
    publishing: false,
    nowMs: 1,
  });
  assert.equal(result.warnDuplicate, true);
  assert.equal(result.steps.find((s) => s.id === 'cable_found')?.pass, true);
  assert.equal(result.steps.find((s) => s.id === 'cable_found')?.fixKey, 'vbCheckFixDuplicate');
});

test('signal fails without CABLE Output or without peak', () => {
  const noCable = evaluateVbCableCheck({
    devices,
    micId: 'mic',
    externalId: 'mic',
    outputId: 'phones',
    signalPeak: 0.5,
    externalCapture: goodCapture,
    extrasSending: null,
    publishing: false,
    nowMs: 1,
  });
  assert.equal(noCable.steps.find((s) => s.id === 'signal')?.pass, false);
  assert.equal(noCable.steps.find((s) => s.id === 'signal')?.fixKey, 'vbCheckFixPickCableOutput');

  const noPeak = evaluateVbCableCheck({
    devices,
    micId: 'mic',
    externalId: 'cable2-cap',
    outputId: 'phones',
    signalPeak: 0.01,
    externalCapture: goodCapture,
    extrasSending: null,
    publishing: false,
    nowMs: 1,
  });
  assert.equal(noPeak.steps.find((s) => s.id === 'signal')?.pass, false);
  assert.equal(noPeak.steps.find((s) => s.id === 'signal')?.fixKey, 'vbCheckFixNoSignal');
});

test('format fails for mono or non-48k', () => {
  const mono = evaluateVbCableCheck({
    devices: devices.filter((d) => !d.id.startsWith('cable1')),
    micId: 'mic',
    externalId: 'cable2-cap',
    outputId: 'phones',
    signalPeak: 0.3,
    externalCapture: monoCapture,
    extrasSending: null,
    publishing: false,
    nowMs: 1,
  });
  assert.equal(mono.steps.find((s) => s.id === 'format')?.pass, false);
  assert.equal(mono.steps.find((s) => s.id === 'format')?.fixKey, 'vbCheckFixFormat');
});

test('same-cable loop fails loop step', () => {
  const result = evaluateVbCableCheck({
    devices,
    micId: 'mic',
    externalId: 'cable2-cap',
    outputId: 'cable2-ren',
    signalPeak: 0.3,
    externalCapture: goodCapture,
    extrasSending: null,
    publishing: false,
    nowMs: 1,
  });
  assert.equal(result.steps.find((s) => s.id === 'loop')?.pass, false);
  assert.equal(result.steps.find((s) => s.id === 'loop')?.fixKey, 'vbCheckFixLoop');
});

test('send_path uses extras when publishing, else local signal', () => {
  const local = evaluateVbCableCheck({
    devices: devices.filter((d) => !d.id.startsWith('cable1')),
    micId: 'mic',
    externalId: 'cable2-cap',
    outputId: 'phones',
    signalPeak: 0.3,
    externalCapture: goodCapture,
    extrasSending: null,
    publishing: false,
    nowMs: 1,
  });
  assert.equal(local.steps.find((s) => s.id === 'send_path')?.pass, true);

  const pubFail = evaluateVbCableCheck({
    devices: devices.filter((d) => !d.id.startsWith('cable1')),
    micId: 'mic',
    externalId: 'cable2-cap',
    outputId: 'phones',
    signalPeak: 0.3,
    externalCapture: goodCapture,
    extrasSending: false,
    publishing: true,
    nowMs: 1,
  });
  assert.equal(pubFail.steps.find((s) => s.id === 'send_path')?.pass, false);

  const pubOk = evaluateVbCableCheck({
    devices: devices.filter((d) => !d.id.startsWith('cable1')),
    micId: 'mic',
    externalId: 'cable2-cap',
    outputId: 'phones',
    signalPeak: 0.3,
    externalCapture: goodCapture,
    extrasSending: true,
    publishing: true,
    nowMs: 1,
  });
  assert.equal(pubOk.steps.find((s) => s.id === 'send_path')?.pass, true);

  const summary = summarizeVbCableCheck(local);
  assert.equal(summary.allPass, true);
  assert.equal(summary.passed, 5);
});
