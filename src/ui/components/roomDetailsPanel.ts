import { t } from '../../i18n';
import { html, type SafeHtml } from '../html';

export type RoomDetailsState = {
  topic: string;
  replaysOn: boolean;
  audioQuality: 'normal' | 'high' | 'music';
  monitorEnabled: boolean;
  voiceEffect: string;
  voiceEffectOptions: { id: string; label: string }[];
  spatialAudio: boolean;
  canMuteAll: boolean;
  canShare: boolean;
  canModerate: boolean;
  canRename: boolean;
  canPing: boolean;
  canEnd: boolean;
  canChangeVisibility: boolean;
  canHandraise: boolean;
  visibilityMode: 'open' | 'social';
  handraiseMode: 'off' | '1' | '2';
  helpUrl: string;
};

export function roomDetailsPanel(state: RoomDetailsState): SafeHtml {
  return html`
    <aside class="room-details-panel" data-room-details>
      <header class="room-details-header">
        <h3>${t('roomDetails')}</h3>
        <button class="btn btn-secondary" type="button" data-action="close-room-details">${t('close')}</button>
      </header>

      <section class="room-details-card" data-details-section="about">
        <h4>${t('aboutSection')}</h4>
        <strong>${state.replaysOn ? t('replaysOnNote') : t('replaysOffNote')}</strong>
        <p class="list-note"><a href="${state.helpUrl}" target="_blank" rel="noreferrer">${t('learnMore')}</a></p>
        ${state.canShare ? html`
          <button class="btn btn-secondary" type="button" data-action="share-room">${t('shareRoom')}</button>
        ` : ''}
      </section>

      <section class="room-details-card" data-details-section="audio">
        <h4>${t('audioSection')}</h4>
        <label class="form-label" for="room-audio-quality">${t('audioQuality')}</label>
        <select class="form-input" id="room-audio-quality" data-action="set-audio-quality">
          <option value="normal" ${state.audioQuality === 'normal' ? 'selected' : ''}>${t('audioNormal')}</option>
          <option value="high" ${state.audioQuality === 'high' ? 'selected' : ''}>${t('audioHigh')}</option>
          <option value="music" ${state.audioQuality === 'music' ? 'selected' : ''}>${t('audioMusic')}</option>
        </select>
        <label class="form-label">
          <input type="checkbox" data-action="toggle-monitor" ${state.monitorEnabled ? 'checked' : ''} />
          ${t('hearMyself')}
        </label>
        <label class="form-label" for="room-voice-effect">${t('voiceEffects')}</label>
        <select class="form-input" id="room-voice-effect" data-action="pick-voice-effect">
          ${state.voiceEffectOptions.map((opt) => html`
            <option value="${opt.id}" ${state.voiceEffect === opt.id ? 'selected' : ''}>${opt.label}</option>
          `)}
        </select>
        <label class="form-label">
          <input type="checkbox" id="room-spatial-audio" data-action="toggle-spatial-audio" ${state.spatialAudio ? 'checked' : ''} />
          ${t('spatialAudio')}
        </label>
        <label class="form-label" for="room-mic-gain">${t('micLevel')}</label>
        <input type="range" id="room-mic-gain" data-action="set-mic-gain" min="0" max="1" step="0.05" />
      </section>

      ${state.canModerate ? html`
        <section class="room-details-card" data-details-section="moderation">
          <h4>${t('moderationSection')}</h4>
          ${state.canRename ? html`<button class="btn btn-secondary" type="button" data-action="rename-room">${t('renameRoom')}</button>` : ''}
          ${state.canChangeVisibility ? html`
            <label class="form-label" for="room-visibility">${t('roomVisibility')}</label>
            <select class="form-input" id="room-visibility" data-action="set-room-visibility" aria-label="${t('roomVisibility')}">
              <option value="open" ${state.visibilityMode === 'open' ? 'selected' : ''}>${t('roomVisibilityOpen')}</option>
              <option value="social" ${state.visibilityMode === 'social' ? 'selected' : ''}>${t('roomVisibilitySocial')}</option>
            </select>
          ` : ''}
          ${state.canHandraise ? html`
            <label class="form-label" for="room-handraise">${t('handRaisePermission')}</label>
            <select class="form-input" id="room-handraise" data-action="set-handraise" aria-label="${t('handRaisePermission')}">
              <option value="off" ${state.handraiseMode === 'off' ? 'selected' : ''}>${t('handRaiseOff')}</option>
              <option value="1" ${state.handraiseMode === '1' ? 'selected' : ''}>${t('handRaiseEveryone')}</option>
              <option value="2" ${state.handraiseMode === '2' ? 'selected' : ''}>${t('handRaiseFriendsOfSpeakers')}</option>
            </select>
          ` : ''}
          ${state.canPing ? html`<button class="btn btn-secondary" type="button" data-action="open-ping-panel">${t('invitePeople')}</button>` : ''}
          ${state.canMuteAll ? html`<button class="btn btn-secondary" type="button" data-action="mute-everyone">${t('muteEveryone')}</button>` : ''}
          ${state.canEnd ? html`<button class="btn btn-danger" type="button" data-action="end-room">${t('endRoom')}</button>` : ''}
        </section>
      ` : ''}

      <section class="room-details-card" data-details-section="audience">
        <label class="form-label" for="audience-search-details">${t('searchAudience')}</label>
        <input class="form-input" id="audience-search-details" type="search" placeholder="${t('searchAudience')}" />
      </section>
    </aside>
  `;
}
