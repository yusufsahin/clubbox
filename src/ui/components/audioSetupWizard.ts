import type { AudioQuality } from '../../audio/audioQuality';
import type { AudioSetupDraft, InstallSummary, ListedDevice, SetupChoice } from '../../audio/devicePicker';
import { compareAudioDevices, displayDeviceLabel } from '../../audio/devicePicker';
import { t } from '../../i18n';
import { html, type SafeHtml } from '../html';

export type AudioSetupView = {
  step: 1 | 2 | 3 | 4;
  summary: InstallSummary;
  devices: ListedDevice[];
  unavailable: ReadonlySet<string>;
  draft: AudioSetupDraft;
  choice: SetupChoice | null;
  loopClear: boolean;
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

export function audioSetupWizard(state: AudioSetupView): SafeHtml {
  const summary = state.summary;
  const found = [
    summary.vbcable.length ? t('audioSetupFoundVb', { instances: summary.vbcable.join(', ') }) : '',
    summary.voicemeeter ? t('audioSetupFoundVm') : '',
    summary.blackhole ? t('audioSetupFoundBh') : '',
    summary.loopback ? t('audioSetupFoundLb') : '',
  ].filter(Boolean);
  return html`
    <aside class="room-details-panel" data-audio-setup data-setup-step="${String(state.step)}">
      <header class="room-details-header">
        <h3>${t('audioSetupTitle')}</h3>
        <button class="btn btn-secondary" type="button" data-action="audio-setup-close">${t('close')}</button>
      </header>
      ${state.step === 1 ? html`
        <section class="room-details-card" data-setup-detect>
          <h4>${t('audioSetupStepDetect')}</h4>
          ${found.length ? found.map((line) => html`<p class="list-note">${line}</p>`) : html`<p class="list-note">${t('audioSetupNoneVirtual')}</p>`}
          <p class="list-note">${t('audioSetupPhysical', { inputs: String(summary.physicalInputs), outputs: String(summary.physicalOutputs) })}</p>
          <button class="btn btn-primary" type="button" data-action="audio-setup-next">${t('audioSetupNext')}</button>
          <button class="btn btn-secondary" type="button" data-action="audio-setup-skip">${t('audioSetupSkip')}</button>
        </section>
      ` : ''}
      ${state.step === 2 ? html`
        <section class="room-details-card" data-setup-choice>
          <button class="btn btn-secondary" type="button" data-action="audio-setup-choose" data-setup="mix">
            ${t('audioSetup1Title')}
          </button>
          <p class="list-note">${t('audioSetup1Body')}</p>
          <button class="btn btn-secondary" type="button" data-action="audio-setup-choose" data-setup="mixer">
            ${t('audioSetup2Title')}
          </button>
          <p class="list-note">${t('audioSetup2Body')}</p>
          <button class="btn btn-secondary" type="button" data-action="audio-setup-skip">${t('audioSetupSkip')}</button>
        </section>
      ` : ''}
      ${state.step === 3 ? html`
        <section class="room-details-card" data-setup-devices>
          <h4>${t('audioSetupDevices')}</h4>
          <label class="form-label" for="setup-mic">${t('audioSetupMic')}</label>
          <select class="form-input" id="setup-mic" data-action="audio-setup-draft" data-field="mic">
            ${deviceOptions(state.devices, 'audioinput', state.unavailable, state.draft.micId, t('systemDefault'))}
          </select>
          <label class="form-label" for="setup-external">${t('audioSetupExternal')}</label>
          <select class="form-input" id="setup-external" data-action="audio-setup-draft" data-field="external">
            ${deviceOptions(state.devices, 'audioinput', state.unavailable, state.draft.externalId, t('externalAudioOff'))}
          </select>
          <label class="form-label" for="setup-output">${t('audioSetupOutput')}</label>
          <select class="form-input" id="setup-output" data-action="audio-setup-draft" data-field="output">
            ${deviceOptions(state.devices, 'audiooutput', state.unavailable, state.draft.outputId, t('systemDefault'))}
          </select>
          <label class="form-label" for="setup-quality">${t('audioQuality')}</label>
          <select class="form-input" id="setup-quality" data-action="audio-setup-draft" data-field="quality">
            <option value="normal" ${state.draft.quality === 'normal' ? 'selected' : ''}>${t('audioNormal')}</option>
            <option value="high" ${state.draft.quality === 'high' ? 'selected' : ''}>${t('audioHigh')}</option>
            <option value="music" ${state.draft.quality === 'music' ? 'selected' : ''}>${t('audioMusic')}</option>
          </select>
          <button class="btn btn-primary" type="button" data-action="audio-setup-apply">${t('audioSetupApply')}</button>
          <button class="btn btn-secondary" type="button" data-action="audio-setup-skip">${t('audioSetupSkip')}</button>
        </section>
      ` : ''}
      ${state.step === 4 ? html`
        <section class="room-details-card" data-setup-check>
          <h4>${t('audioSetupCheck')}</h4>
          <p class="list-note">${t('audioSetupMicMeter')}</p>
          <div class="external-audio-meter" aria-hidden="true"><span class="external-audio-meter-fill" data-setup-mic-meter style="width:0%"></span></div>
          <p class="list-note">${t('audioSetupExternalMeter')}</p>
          <div class="external-audio-meter" aria-hidden="true"><span class="external-audio-meter-fill" data-setup-external-meter style="width:0%"></span></div>
          <button class="btn btn-secondary" type="button" data-action="play-setup-tone">${t('audioSetupTone')}</button>
          <p class="list-note">${t('audioSetupToneLocal')}</p>
          <p class="list-note" data-setup-loop>${state.loopClear ? t('audioSetupLoopOk') : t('loopRoomAudio')}</p>
          <button class="btn btn-primary" type="button" data-action="audio-setup-close">${t('audioSetupClose')}</button>
          <button class="btn btn-secondary" type="button" data-action="audio-setup-skip">${t('audioSetupSkip')}</button>
        </section>
      ` : ''}
    </aside>
  `;
}

export function isSetupQuality(value: string): value is AudioQuality {
  return value === 'normal' || value === 'high' || value === 'music';
}
