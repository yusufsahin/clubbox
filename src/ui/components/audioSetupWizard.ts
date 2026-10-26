import type { AudioDeviceOption, AudioSetupDraft, AudioSetupKind, CableCheckStep } from '../../audio/audioSetupWizard';
import { t } from '../../i18n';
import { html, markup, type SafeHtml } from '../html';

export type AudioSetupWizardState = {
  draft: AudioSetupDraft;
  inputs: AudioDeviceOption[];
  outputs: AudioDeviceOption[];
  block: string | null;
  checks: CableCheckStep[];
  checking: boolean;
};

function kindBtn(kind: AudioSetupKind, current: AudioSetupKind, label: string, help: string): SafeHtml {
  return html`
    <button
      class="btn ${kind === current ? 'btn-primary' : 'btn-secondary'}"
      type="button"
      data-action="audio-setup-kind"
      data-kind="${kind}"
    >${label}</button>
    <p class="list-note">${help}</p>
  `;
}

function deviceOptions(devices: AudioDeviceOption[], selected: string): SafeHtml {
  return html`${devices.map((device) => html`
    <option value="${device.id}" ${device.id === selected ? 'selected' : ''}>${device.label || device.id}</option>
  `)}`;
}

function checkRow(step: CableCheckStep): SafeHtml {
  const label =
    step.id === 'cable-found' ? t('cableCheckCableFound')
    : step.id === 'signal' ? t('cableCheckSignal')
    : step.id === 'format' ? t('cableCheckFormat')
    : step.id === 'loop-guard' ? t('cableCheckLoop')
    : t('cableCheckSend');
  const mark = step.ok ? t('cableCheckPass') : t('cableCheckFail');
  return html`<li class="audio-setup-check ${step.ok ? 'is-ok' : 'is-fail'}" data-check="${step.id}">${mark} — ${label}</li>`;
}

export function audioSetupWizard(state: AudioSetupWizardState): SafeHtml {
  const mix = state.draft.kind === 'clubbox-mix';
  return html`
    <div class="modal-overlay" id="audio-setup-overlay" data-action="close-audio-setup">
      <div class="modal-content create-modal-simple audio-setup-modal" data-action="audio-setup-root">
        <div class="modal-header">
          <h3 class="modal-title">${t('audioSetupTitle')}</h3>
          <button class="modal-close-btn" type="button" data-action="close-audio-setup">✕</button>
        </div>
        <p class="list-note">${t('audioSetupHelp')}</p>
        <div class="form-group">
          ${kindBtn('clubbox-mix', state.draft.kind, t('audioSetup1Title'), t('audioSetup1Help'))}
          ${kindBtn('mixer-as-mic', state.draft.kind, t('audioSetup2Title'), t('audioSetup2Help'))}
        </div>
        <div class="form-group">
          <label class="form-label" for="audio-setup-mic">${t('audioSetupMic')}</label>
          <select class="form-input" id="audio-setup-mic" data-action="audio-setup-mic">
            <option value="">${t('systemDefault')}</option>
            ${deviceOptions(state.inputs, state.draft.micId)}
          </select>
        </div>
        ${mix ? html`
          <div class="form-group">
            <label class="form-label" for="audio-setup-external">${t('audioSetupExternal')}</label>
            <select class="form-input" id="audio-setup-external" data-action="audio-setup-external">
              <option value="">${t('externalAudioOff')}</option>
              ${deviceOptions(state.inputs, state.draft.externalId)}
            </select>
          </div>
        ` : ''}
        <div class="form-group">
          <label class="form-label" for="audio-setup-speakers">${t('audioSetupSpeakers')}</label>
          <select class="form-input" id="audio-setup-speakers" data-action="audio-setup-speakers">
            <option value="">${t('systemDefault')}</option>
            ${deviceOptions(state.outputs, state.draft.speakerId)}
          </select>
        </div>
        ${state.block ? html`<p class="list-note" data-audio-setup-block>${state.block}</p>` : ''}
        <p class="list-note">${t('audioSetupNothingUntilApply')}</p>
        <div class="audio-setup-actions">
          <button class="btn btn-primary" type="button" data-action="apply-audio-setup">${t('audioSetupApply')}</button>
          <button class="btn btn-secondary" type="button" data-action="run-vb-cable-check" ${state.checking ? 'disabled' : ''}>${t('audioSetupCheck')}</button>
        </div>
        ${state.checks.length ? html`
          <ul class="audio-setup-checks" data-vb-cable-check>
            ${state.checks.map((step) => checkRow(step))}
          </ul>
        ` : ''}
      </div>
    </div>
  `;
}

export function mountAudioSetupWizard(state: AudioSetupWizardState): HTMLElement {
  unmountAudioSetupWizard();
  const wrap = document.createElement('div');
  wrap.innerHTML = markup(audioSetupWizard(state));
  const overlay = wrap.firstElementChild as HTMLElement;
  document.body.appendChild(overlay);
  return overlay;
}

export function unmountAudioSetupWizard(): void {
  document.getElementById('audio-setup-overlay')?.remove();
}
