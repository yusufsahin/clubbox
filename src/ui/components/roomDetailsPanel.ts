import { t } from '../../i18n';
import { html, type SafeHtml } from '../html';

export type RoomDetailsState = {
  topic: string;
  replaysOn: boolean;
  audioQuality: 'normal' | 'high' | 'music';
  canMuteAll: boolean;
  canShare: boolean;
  helpUrl: string;
};

export function roomDetailsPanel(state: RoomDetailsState): SafeHtml {
  return html`
    <aside class="room-details-panel" data-room-details>
      <header class="room-details-header">
        <h3>${t('roomDetails')}</h3>
        <button class="btn btn-secondary" type="button" data-action="close-room-details">${t('close')}</button>
      </header>
      <section class="room-details-card">
        <strong>${state.replaysOn ? t('replaysOnNote') : t('replaysOffNote')}</strong>
        <p class="list-note"><a href="${state.helpUrl}" target="_blank" rel="noreferrer">${t('learnMore')}</a></p>
      </section>
      <section class="room-details-card">
        <label class="form-label" for="room-audio-quality">${t('audioQuality')}</label>
        <select class="form-input" id="room-audio-quality" data-action="set-audio-quality">
          <option value="normal" ${state.audioQuality === 'normal' ? 'selected' : ''}>${t('audioNormal')}</option>
          <option value="high" ${state.audioQuality === 'high' ? 'selected' : ''}>${t('audioHigh')}</option>
          <option value="music" ${state.audioQuality === 'music' ? 'selected' : ''}>${t('audioMusic')}</option>
        </select>
      </section>
      <section class="room-details-card">
        <label class="form-label" for="audience-search-details">${t('searchAudience')}</label>
        <input class="form-input" id="audience-search-details" type="search" placeholder="${t('searchAudience')}" />
      </section>
      ${state.canShare ? html`
        <button class="btn btn-secondary" type="button" data-action="share-room">${t('shareRoom')}</button>
      ` : ''}
      ${state.canMuteAll ? html`
        <button class="btn btn-secondary" type="button" data-action="mute-everyone">${t('muteAllSpeakers')}</button>
      ` : ''}
    </aside>
  `;
}
