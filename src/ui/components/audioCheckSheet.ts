import { t } from '../../i18n';
import type { AudioCheckResult } from '../../audio/sendQuality.ts';
import { html, type SafeHtml } from '../html.ts';

export type AudioCheckSheetState = {
  running: boolean;
  secondsLeft: number;
  result: AudioCheckResult | null;
};

export function audioCheckSheet(state: AudioCheckSheetState): SafeHtml {
  return html`
    <div class="modal-scrim open" data-audio-check-scrim>
      <div class="modal-card" data-audio-check role="dialog" aria-label="${t('audioCheck')}">
        <header class="room-details-header">
          <h3>${t('audioCheck')}</h3>
          <button class="btn btn-secondary" type="button" data-action="close-audio-check">${t('close')}</button>
        </header>
        <p class="list-note">${t('audioCheckHelp')}</p>
        ${state.running ? html`
          <p class="list-note" data-audio-check-running>${t('audioCheckRunning', { sec: String(state.secondsLeft) })}</p>
        ` : ''}
        ${!state.running && !state.result ? html`
          <button class="btn btn-primary" type="button" data-action="start-audio-check">${t('audioCheckStart')}</button>
        ` : ''}
        ${state.result ? html`
          <dl class="live-details-list" data-audio-check-result>
            <div class="live-details-row">
              <dt>${t('audioCheckCapture')}</dt>
              <dd>${state.result.captureLine}</dd>
            </div>
            <div class="live-details-row">
              <dt>${t('audioCheckPeakMic')}</dt>
              <dd>${state.result.peakMic.toFixed(2)}</dd>
            </div>
            <div class="live-details-row">
              <dt>${t('audioCheckPeakExtras')}</dt>
              <dd>${state.result.peakExtras.toFixed(2)}</dd>
            </div>
          </dl>
          <ul class="live-details-caps">
            ${state.result.clipping ? html`<li data-verdict="clipping">${t('audioCheckClipping')}</li>` : ''}
            ${state.result.tooLow ? html`<li data-verdict="too-low">${t('audioCheckTooLow')}</li>` : ''}
            ${state.result.suggestMusic ? html`<li data-verdict="suggest-music">${t('audioCheckSuggestMusic')}</li>` : ''}
            ${state.result.suggestRaiseInput ? html`<li data-verdict="raise-input">${t('audioCheckSuggestRaise')}</li>` : ''}
            ${state.result.musicProfileOk === false ? html`<li data-verdict="music-aec">${t('audioCheckMusicAecOn')}</li>` : ''}
            ${!state.result.clipping && !state.result.tooLow && !state.result.suggestMusic && state.result.musicProfileOk
              ? html`<li data-verdict="ok">${t('audioCheckOk')}</li>`
              : ''}
          </ul>
          <button class="btn btn-secondary" type="button" data-action="start-audio-check">${t('audioCheckAgain')}</button>
        ` : ''}
      </div>
    </div>
  `;
}
