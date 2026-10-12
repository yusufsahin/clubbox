import type { AudioQuality } from '../../audio/audioQuality';
import { classifyAudioDevice, sameVirtualGroup } from '../../audio/deviceClassify';
import type { AudioSetupDraft, InstallSummary, ListedDevice, SetupChoice } from '../../audio/devicePicker';
import { compareAudioDevices, displayDeviceLabel } from '../../audio/devicePicker';
import type { VbCableCheckResult, VbCableCheckStepId } from '../../audio/vbCableCheck';
import { t, type MessageKey } from '../../i18n';
import { html, type SafeHtml } from '../html';

export type AudioSetupView = {
  step: 1 | 2 | 3 | 4;
  summary: InstallSummary;
  devices: ListedDevice[];
  unavailable: ReadonlySet<string>;
  draft: AudioSetupDraft;
  choice: SetupChoice | null;
  loopClear: boolean;
  vbCheckRunning?: boolean;
  vbCheckResult?: VbCableCheckResult | null;
};

const VB_STEP_LABEL: Record<VbCableCheckStepId, MessageKey> = {
  cable_found: 'vbCheckStepCableFound',
  signal: 'vbCheckStepSignal',
  format: 'vbCheckStepFormat',
  loop: 'vbCheckStepLoop',
  send_path: 'vbCheckStepSendPath',
};

function deviceOptions(devices: ListedDevice[], kind: string, unavailable: ReadonlySet<string>, selected: string, blank: string): SafeHtml {
  const rows = devices.filter((device) => device.kind === kind).slice().sort(compareAudioDevices);
  return html`
    <option value="">${blank}</option>
    ${rows.map((device) => html`
      <option value="${device.id}" ${device.id === selected ? 'selected' : ''} class="${unavailable.has(device.id) ? 'device-unavailable' : ''}">
        ${displayDeviceLabel(device, unavailable.has(device.id), t('audioDeviceUnavailableMark'))}
      </option>
    `)}
  `;
}

function draftDoublesCable(devices: readonly ListedDevice[], draft: AudioSetupDraft): boolean {
  if (!draft.micId || !draft.externalId) return false;
  if (draft.micId === draft.externalId) return true;
  const mic = devices.find((device) => device.id === draft.micId);
  const external = devices.find((device) => device.id === draft.externalId);
  if (!mic || !external) return false;
  return sameVirtualGroup(classifyAudioDevice(mic), classifyAudioDevice(external));
}

/** Exported so the app can refresh the warn line without rebuilding selects. */
export function draftUsesSameCable(devices: readonly ListedDevice[], draft: AudioSetupDraft): boolean {
  return draftDoublesCable(devices, draft);
}

function stepLabel(step: 1 | 2 | 3 | 4): string {
  switch (step) {
    case 1: return t('audioSetupStepDetect');
    case 2: return t('audioSetupStepChoose');
    case 3: return t('audioSetupDevices');
    case 4: return t('audioSetupCheck');
    default: {
      const neverStep: never = step;
      return neverStep;
    }
  }
}

function setupHint(choice: SetupChoice | null): SafeHtml {
  if (choice === 'mix') return html`<p class="audio-setup-hint" data-setup-hint="mix">${t('audioSetupMixHint')}</p>`;
  if (choice === 'mixer') return html`<p class="audio-setup-hint" data-setup-hint="mixer">${t('audioSetupMixerHint')}</p>`;
  return html``;
}

export function audioSetupWizard(state: AudioSetupView): SafeHtml {
  const summary = state.summary;
  const found = [
    summary.vbcable.length ? t('audioSetupFoundVb', { instances: summary.vbcable.join(', ') }) : '',
    summary.voicemeeter ? t('audioSetupFoundVm') : '',
    summary.blackhole ? t('audioSetupFoundBh') : '',
    summary.loopback ? t('audioSetupFoundLb') : '',
  ].filter(Boolean);
  const doubles = state.step === 3 && draftDoublesCable(state.devices, state.draft);
  return html`
    <aside class="room-details-panel audio-setup-panel" data-audio-setup data-setup-step="${String(state.step)}">
      <header class="room-details-header">
        <div class="audio-setup-heading">
          <h3>${t('audioSetupTitle')}</h3>
          <p class="audio-setup-step-meta">${t('audioSetupStepOf', { step: String(state.step), label: stepLabel(state.step) })}</p>
        </div>
        <button class="btn btn-secondary" type="button" data-action="audio-setup-close">${t('close')}</button>
      </header>
      <ol class="audio-setup-progress" aria-hidden="true">
        <li class="${state.step === 1 ? 'is-current' : ''} ${state.step > 1 ? 'is-done' : ''}"></li>
        <li class="${state.step === 2 ? 'is-current' : ''} ${state.step > 2 ? 'is-done' : ''}"></li>
        <li class="${state.step === 3 ? 'is-current' : ''} ${state.step > 3 ? 'is-done' : ''}"></li>
        <li class="${state.step === 4 ? 'is-current' : ''}"></li>
      </ol>
      ${state.step === 1 ? html`
        <section class="room-details-card audio-setup-card" data-setup-detect>
          <h4>${t('audioSetupStepDetect')}</h4>
          ${found.length ? found.map((line) => html`<p class="list-note">${line}</p>`) : html`<p class="list-note">${t('audioSetupNoneVirtual')}</p>`}
          <p class="list-note">${t('audioSetupPhysical', { inputs: String(summary.physicalInputs), outputs: String(summary.physicalOutputs) })}</p>
          <div class="audio-setup-actions">
            <button class="btn btn-primary" type="button" data-action="audio-setup-next">${t('audioSetupNext')}</button>
            <button class="btn btn-secondary" type="button" data-action="audio-setup-skip">${t('audioSetupSkip')}</button>
          </div>
        </section>
      ` : ''}
      ${state.step === 2 ? html`
        <section class="room-details-card audio-setup-card" data-setup-choice>
          <button class="audio-setup-choice" type="button" data-action="audio-setup-choose" data-setup="mix">
            <strong>${t('audioSetup1Title')}</strong>
            <span>${t('audioSetup1Body')}</span>
          </button>
          <button class="audio-setup-choice" type="button" data-action="audio-setup-choose" data-setup="mixer">
            <strong>${t('audioSetup2Title')}</strong>
            <span>${t('audioSetup2Body')}</span>
          </button>
          <div class="audio-setup-actions">
            <button class="btn btn-secondary" type="button" data-action="audio-setup-skip">${t('audioSetupSkip')}</button>
          </div>
        </section>
      ` : ''}
      ${state.step === 3 ? html`
        <section class="room-details-card audio-setup-card" data-setup-devices>
          <h4>${t('audioSetupDevices')}</h4>
          ${setupHint(state.choice)}
          <p class="list-note">${t('audioSetupNothingUntilApply')}</p>
          ${doubles ? html`<p class="audio-setup-warn" data-setup-double>${t('audioSetupDoubleCable')}</p>` : ''}
          <div class="form-group">
            <label class="form-label" for="setup-mic">${t('audioSetupMic')}</label>
            <select class="form-input" id="setup-mic" data-action="audio-setup-draft" data-field="mic">
              ${deviceOptions(state.devices, 'audioinput', state.unavailable, state.draft.micId, t('systemDefault'))}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="setup-external">${t('audioSetupExternal')}</label>
            <select class="form-input" id="setup-external" data-action="audio-setup-draft" data-field="external">
              ${deviceOptions(state.devices, 'audioinput', state.unavailable, state.draft.externalId, t('externalAudioOff'))}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="setup-output">${t('audioSetupOutput')}</label>
            <select class="form-input" id="setup-output" data-action="audio-setup-draft" data-field="output">
              ${deviceOptions(state.devices, 'audiooutput', state.unavailable, state.draft.outputId, t('systemDefault'))}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="setup-quality">${t('audioQuality')}</label>
            <select class="form-input" id="setup-quality" data-action="audio-setup-draft" data-field="quality">
              <option value="normal" ${state.draft.quality === 'normal' ? 'selected' : ''}>${t('audioNormal')}</option>
              <option value="high" ${state.draft.quality === 'high' ? 'selected' : ''}>${t('audioHigh')}</option>
              <option value="music" ${state.draft.quality === 'music' ? 'selected' : ''}>${t('audioMusic')}</option>
            </select>
          </div>
          <div class="audio-setup-actions">
            <button class="btn btn-primary" type="button" data-action="audio-setup-apply" ${doubles ? 'disabled' : ''}>${t('audioSetupApply')}</button>
            <button class="btn btn-secondary" type="button" data-action="audio-setup-skip">${t('audioSetupSkip')}</button>
          </div>
        </section>
      ` : ''}
      ${state.step === 4 ? html`
        <section class="room-details-card audio-setup-card" data-setup-check>
          <h4>${t('audioSetupCheck')}</h4>
          <div class="audio-setup-meter-row">
            <span>${t('audioSetupMicMeter')}</span>
            <div class="external-audio-meter" aria-hidden="true"><span class="external-audio-meter-fill" data-setup-mic-meter style="width:0%"></span></div>
          </div>
          <div class="audio-setup-meter-row">
            <span>${t('audioSetupExternalMeter')}</span>
            <div class="external-audio-meter" aria-hidden="true"><span class="external-audio-meter-fill" data-setup-external-meter style="width:0%"></span></div>
          </div>
          <button class="btn btn-secondary" type="button" data-action="play-setup-tone">${t('audioSetupTone')}</button>
          <p class="list-note">${t('audioSetupToneLocal')}</p>
          <p class="list-note" data-setup-loop>${state.loopClear ? t('audioSetupLoopOk') : t('loopRoomAudio')}</p>
          <div class="vb-cable-check" data-vb-cable-check>
            <h4>${t('vbCheckTitle')}</h4>
            ${state.vbCheckRunning ? html`<p class="list-note" data-vb-running>${t('vbCheckRunning')}</p>` : html`
              <button class="btn btn-secondary" type="button" data-action="run-vb-cable-check">${t('vbCheckRun')}</button>
            `}
            ${state.vbCheckResult ? html`
              <ul class="vb-check-steps" data-vb-check-result>
                ${state.vbCheckResult.steps.map((step) => html`
                  <li data-vb-step="${step.id}" data-pass="${step.pass ? '1' : '0'}">
                    <strong>${t(VB_STEP_LABEL[step.id])}</strong>
                    <span>${step.pass ? t('vbCheckPass') : t('vbCheckFail')}</span>
                    ${step.fixKey ? html`<p class="list-note">${t(step.fixKey as MessageKey)}</p>` : ''}
                  </li>
                `)}
              </ul>
            ` : ''}
          </div>
          <div class="audio-setup-actions">
            <button class="btn btn-primary" type="button" data-action="audio-setup-close">${t('audioSetupClose')}</button>
          </div>
        </section>
      ` : ''}
    </aside>
  `;
}

export function isSetupQuality(value: string): value is AudioQuality {
  return value === 'normal' || value === 'high' || value === 'music';
}
