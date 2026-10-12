/**
 * Phase 30.7 — guided VB-Cable check (pure verdicts; no device ids in results).
 */
import {
  classifyAudioDevice,
  type AudioDeviceLabel,
  type ClassifiedAudioDevice,
} from './deviceClassify.ts';
import { needsVirtualFormatHint, type CaptureTruth } from './captureTruth.ts';
import { loopGuard } from './loopGuard.ts';
import { installedAudioSummary, type ListedDevice } from './devicePicker.ts';

export type VbCableCheckStepId =
  | 'cable_found'
  | 'signal'
  | 'format'
  | 'loop'
  | 'send_path';

export type VbCableStepResult = {
  id: VbCableCheckStepId;
  pass: boolean;
  /** i18n MessageKey for the fix line; empty when pass and no warn. */
  fixKey: string;
};

export type VbCableCheckResult = {
  atMs: number;
  steps: VbCableStepResult[];
  /** More than one VB-Cable instance listed (broken duplicate). */
  warnDuplicate: boolean;
};

export const VB_CABLE_CHECK_STORAGE_KEY = 'clubbox_vb_cable_check';
export const SIGNAL_PEAK_FLOOR = 0.05;

const STEP_ORDER: VbCableCheckStepId[] = [
  'cable_found',
  'signal',
  'format',
  'loop',
  'send_path',
];

function asLabel(device: AudioDeviceLabel | ListedDevice | null | undefined): AudioDeviceLabel | null {
  if (!device?.label) return null;
  return { label: device.label, kind: 'kind' in device ? device.kind : 'audioinput' };
}

function classifiedOf(device: AudioDeviceLabel | ListedDevice | null | undefined): ClassifiedAudioDevice | null {
  const label = asLabel(device);
  return label ? classifyAudioDevice(label) : null;
}

/** Matching Speakers / CABLE Input render for a CABLE Output capture (same instance). */
export function findVbCableRenderId(
  devices: readonly ListedDevice[],
  externalId: string,
): string | null {
  if (!externalId) return null;
  const external = devices.find((d) => d.id === externalId);
  const extClass = classifiedOf(external);
  if (!extClass || extClass.family !== 'vbcable' || extClass.side !== 'capture') return null;
  const render = devices.find((d) => {
    if (d.kind !== 'audiooutput') return false;
    const c = classifyAudioDevice(d);
    return c.family === 'vbcable' && c.side === 'render' && c.instance === extClass.instance;
  });
  return render?.id ?? null;
}

export function isCableOutputCapture(device: AudioDeviceLabel | ListedDevice | null | undefined): boolean {
  const c = classifiedOf(device);
  return !!c && c.family === 'vbcable' && c.side === 'capture';
}

export type VbCableCheckInput = {
  devices: readonly ListedDevice[];
  micId: string;
  externalId: string;
  outputId: string;
  /** Peak external meter while the tone played into the cable render (0–1). */
  signalPeak: number;
  externalCapture: CaptureTruth | null;
  /** Agora speaker with extras sending, when known. */
  extrasSending: boolean | null;
  /** True when we are publishing as a speaker (extras path can be checked). */
  publishing: boolean;
  nowMs?: number;
};

function deviceById(devices: readonly ListedDevice[], id: string): ListedDevice | null {
  if (!id) return null;
  return devices.find((d) => d.id === id) ?? null;
}

export function evaluateVbCableCheck(input: VbCableCheckInput): VbCableCheckResult {
  const summary = installedAudioSummary(input.devices);
  const warnDuplicate = summary.vbcable.length > 1;
  const hasCable = summary.vbcable.length > 0;
  const external = deviceById(input.devices, input.externalId);
  const mic = deviceById(input.devices, input.micId);
  const output = deviceById(input.devices, input.outputId);
  const cableOutput = isCableOutputCapture(external);
  const signalOk = cableOutput && input.signalPeak >= SIGNAL_PEAK_FLOOR;

  const formatPass = !!input.externalCapture
    && input.externalCapture.channelCount != null
    && input.externalCapture.channelCount >= 2
    && input.externalCapture.sampleRate === 48000
    && !needsVirtualFormatHint(input.externalCapture);

  const guard = loopGuard({
    mic: asLabel(mic),
    external: asLabel(external),
    output: asLabel(output),
  });
  const loopOk = !guard.roomLoop && !guard.blockStage;

  const sendOk = input.publishing
    ? input.extrasSending === true
    : signalOk;

  const steps: VbCableStepResult[] = STEP_ORDER.map((id) => {
    switch (id) {
      case 'cable_found':
        return {
          id,
          pass: hasCable,
          fixKey: !hasCable
            ? 'vbCheckFixNoCable'
            : warnDuplicate
              ? 'vbCheckFixDuplicate'
              : '',
        };
      case 'signal':
        return {
          id,
          pass: signalOk,
          fixKey: signalOk
            ? ''
            : !cableOutput
              ? 'vbCheckFixPickCableOutput'
              : 'vbCheckFixNoSignal',
        };
      case 'format':
        return {
          id,
          pass: formatPass,
          fixKey: formatPass ? '' : 'vbCheckFixFormat',
        };
      case 'loop':
        return {
          id,
          pass: loopOk,
          fixKey: loopOk ? '' : 'vbCheckFixLoop',
        };
      case 'send_path':
        return {
          id,
          pass: sendOk,
          fixKey: sendOk ? '' : 'vbCheckFixSendPath',
        };
      default: {
        const _never: never = id;
        return _never;
      }
    }
  });

  return {
    atMs: input.nowMs ?? Date.now(),
    steps,
    warnDuplicate,
  };
}

export function summarizeVbCableCheck(result: VbCableCheckResult): {
  passed: number;
  total: number;
  allPass: boolean;
} {
  const passed = result.steps.filter((s) => s.pass).length;
  const total = result.steps.length;
  return { passed, total, allPass: passed === total && !result.warnDuplicate };
}

export function readVbCableCheckResult(): VbCableCheckResult | null {
  try {
    const raw = localStorage.getItem(VB_CABLE_CHECK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const rec = parsed as Record<string, unknown>;
    if (typeof rec.atMs !== 'number' || !Array.isArray(rec.steps)) return null;
    const steps: VbCableStepResult[] = [];
    for (const row of rec.steps) {
      if (!row || typeof row !== 'object') continue;
      const s = row as Record<string, unknown>;
      if (
        typeof s.id !== 'string'
        || typeof s.pass !== 'boolean'
        || typeof s.fixKey !== 'string'
      ) continue;
      if (!STEP_ORDER.includes(s.id as VbCableCheckStepId)) continue;
      steps.push({ id: s.id as VbCableCheckStepId, pass: s.pass, fixKey: s.fixKey });
    }
    if (steps.length !== STEP_ORDER.length) return null;
    return {
      atMs: rec.atMs,
      steps,
      warnDuplicate: rec.warnDuplicate === true,
    };
  } catch {
    return null;
  }
}

export function writeVbCableCheckResult(result: VbCableCheckResult): void {
  try {
    const payload = {
      atMs: result.atMs,
      warnDuplicate: result.warnDuplicate,
      steps: result.steps.map((s) => ({ id: s.id, pass: s.pass, fixKey: s.fixKey })),
    };
    localStorage.setItem(VB_CABLE_CHECK_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota / private mode.
  }
}
