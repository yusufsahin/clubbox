import { t } from '../../i18n';
import { html, type SafeHtml } from '../html';

export type ExternalAudioDeviceOption = { id: string; label: string };

export type RoomDetailsState = {
  topic: string;
  replaysOn: boolean;
  audioQuality: 'normal' | 'high' | 'music';
  monitorEnabled: boolean;
  voiceEffect: string;
  voiceEffectOptions: { id: string; label: string }[];
  spatialAudio: boolean;
  micVolume: number;
  canMuteAll: boolean;
  canShare: boolean;
  canModerate: boolean;
  canRename: boolean;
  canPing: boolean;
  canEnd: boolean;
  canChangeVisibility: boolean;
  canHandraise: boolean;
  visibilityMode: 'open' | 'social' | 'other';
  handraiseMode: 'off' | '1' | '2';
  audienceSearch: string;
  helpUrl: string;
  /** Show External audio controls only while the user is a speaker. */
  showExternalAudio: boolean;
  externalDevices: ExternalAudioDeviceOption[];
  externalDeviceId: string;
  externalVolume: number;
  externalMuted: boolean;
  externalMonitor: boolean;
  externalDuck: boolean;
  externalDuckDb: number;
  externalActive: boolean;
  systemAudioAvailable: boolean;
  systemAudioBlockedReason: string;
  /** Output would feed a captured virtual device. */
  monitorBlocked?: boolean;
  loopRoom?: boolean;
  loopVoicemeeter?: boolean;
  loopBlockStage?: boolean;
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
        ${state.loopRoom ? html`<p class="list-note" data-loop-room>${t('loopRoomAudio')}</p>` : ''}
        ${state.loopVoicemeeter ? html`<p class="list-note" data-loop-voicemeeter>${t('loopVoicemeeterAux')}</p>` : ''}
        ${state.loopBlockStage ? html`<p class="list-note" data-loop-stage>${t('loopBlockStage')}</p>` : ''}
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
        <div class="room-voice-effect-actions">
          <button class="btn btn-secondary" type="button" data-action="preview-voice-effect">${t('voiceEffectPreview')}</button>
          <button class="btn btn-primary" type="button" data-action="apply-voice-effect">${t('voiceEffectApply')}</button>
        </div>
        <p class="list-note">${t('voiceEffectsHelp')}</p>
        <label class="form-label">
          <input type="checkbox" id="room-spatial-audio" data-action="toggle-spatial-audio" ${state.spatialAudio ? 'checked' : ''} />
          ${t('spatialAudio')}
        </label>
        <label class="form-label" for="room-mic-gain">${t('micLevel')}</label>
        <input
          type="range"
          id="room-mic-gain"
          data-action="set-mic-gain"
          min="0"
          max="1"
          step="0.05"
          value="${String(state.micVolume)}"
        />

        ${state.showExternalAudio ? html`
          <div class="external-audio-block" data-external-audio>
            <h5 class="external-audio-title">${t('externalAudio')}</h5>
            <button class="btn btn-secondary" type="button" data-action="open-audio-setup">${t('audioSetupOpen')}</button>
            <label class="form-label" for="room-external-device">${t('externalAudioSource')}</label>
            <select class="form-input" id="room-external-device" data-action="set-external-device">
              <option value="">${t('externalAudioOff')}</option>
              ${state.systemAudioAvailable ? html`
                <option value="__system_audio__" ${state.externalDeviceId === '__system_audio__' ? 'selected' : ''}>
                  ${t('externalSystemAudio')}
                </option>
              ` : ''}
              ${state.externalDevices.map((device) => html`
                <option value="${device.id}" ${state.externalDeviceId === device.id ? 'selected' : ''}>${device.label}</option>
              `)}
            </select>
            ${state.audioQuality === 'normal' && state.externalActive ? html`
              <button class="btn btn-secondary" type="button" data-action="set-audio-quality" data-quality="music">
                ${t('switchToMusicExternal')}
              </button>
            ` : ''}
            ${!state.systemAudioAvailable && state.systemAudioBlockedReason ? html`
              <p class="list-note" data-external-system-hint>${state.systemAudioBlockedReason}</p>
            ` : ''}
            <label class="form-label" for="room-external-vol">${t('externalVolume')}</label>
            <input
              type="range"
              id="room-external-vol"
              data-action="set-external-volume"
              min="0"
              max="1"
              step="0.05"
              value="${String(state.externalVolume)}"
              ${state.externalActive ? '' : 'disabled'}
            />
            <div class="external-audio-meter" aria-hidden="true">
              <span class="external-audio-meter-fill" data-external-meter style="width:${state.externalActive ? '8%' : '0%'}"></span>
            </div>
            <label class="form-label">
              <input type="checkbox" data-action="toggle-external-mute" ${state.externalMuted ? 'checked' : ''} ${state.externalActive ? '' : 'disabled'} />
              ${t('externalMute')}
            </label>
            <label class="form-label">
              <input type="checkbox" data-action="toggle-external-monitor" ${state.externalMonitor && !state.monitorBlocked ? 'checked' : ''} ${state.externalActive && !state.monitorBlocked ? '' : 'disabled'} />
              ${t('externalMonitor')}
            </label>
            <label class="form-label">
              <input type="checkbox" data-action="toggle-external-duck" ${state.externalDuck ? 'checked' : ''} ${state.externalActive ? '' : 'disabled'} />
              ${t('externalDuck')}
            </label>
            <label class="form-label" for="room-external-duck-db">${t('externalDuckAmount')}</label>
            <input
              type="range"
              id="room-external-duck-db"
              data-action="set-external-duck-db"
              min="-24"
              max="0"
              step="1"
              value="${String(state.externalDuckDb)}"
              ${state.externalActive && state.externalDuck ? '' : 'disabled'}
            />
          </div>
        ` : ''}
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
        <input
          class="form-input"
          id="audience-search-details"
          type="search"
          value="${state.audienceSearch}"
          placeholder="${t('searchAudience')}"
        />
      </section>
    </aside>
  `;
}
