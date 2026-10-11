import type { ReplayPlayback } from '../../api/replayPlayback';
import { t } from '../../i18n';
import { html, safeUrl, type SafeHtml } from '../html';

export type ReplayViewState = {
  item: ReplayPlayback;
  rate: number;
};

export function replayView(state: ReplayViewState): SafeHtml {
  const audio = state.item.audioUrl && /^https:\/\//i.test(state.item.audioUrl)
    ? safeUrl(state.item.audioUrl)
    : (state.item.audioUrl.startsWith('blob:') ? state.item.audioUrl : '');
  return html`
    <div class="list-page replay-page">
      <header class="activity-header">
        <div>
          <h2>${state.item.kind === 'highlight' ? t('highlight') : t('replay')}</h2>
          <p class="list-note">${state.item.title}</p>
        </div>
        <button class="btn btn-secondary" type="button" data-action="close-replay">${t('close')}</button>
      </header>

      ${audio ? html`
        <audio id="replay-audio" class="replay-audio" controls src="${audio}"></audio>
      ` : html`
        <p class="list-note">${t('replayNoAudio')}</p>
      `}

      <div class="replay-controls">
        <div class="reaction-pad" role="group" aria-label="${t('replaySpeed')}">
          ${[1, 1.5, 2].map((rate) => html`
            <button
              class="btn ${state.rate === rate ? 'btn-primary' : 'btn-secondary'}"
              type="button"
              data-action="set-replay-rate"
              data-rate="${rate}"
            >${rate}x</button>
          `)}
        </div>
        <div class="reaction-pad">
          <button class="btn btn-secondary" type="button" data-action="skip-replay" data-seconds="-15">${t('replaySkipBack')}</button>
          <button class="btn btn-secondary" type="button" data-action="skip-replay" data-seconds="15">${t('replaySkipForward')}</button>
        </div>
      </div>
    </div>
  `;
}
