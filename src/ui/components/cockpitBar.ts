import { t } from '../../i18n';
import type { SoundEffectItem } from '../../api/types';
import { html, type SafeHtml } from '../html';

export interface CockpitState {
  muted: boolean;
  musicMode: boolean;
  recording: boolean;
  handRaised: boolean;
  handDisabled: boolean;
  canRaiseHand: boolean;
  showAudioRetry: boolean;
  isSpeaker: boolean;
  inRoom: boolean;
  roomTitle: string;
  effects: SoundEffectItem[];
  latestChat: string;
  unreadChat: number;
  chatOpen: boolean;
  canChat: boolean;
  canClip: boolean;
  canRecord: boolean;
  recordHint: string;
  micVolume: number;
  monitorEnabled: boolean;
}

export function cockpitBar(state: CockpitState): SafeHtml {
  return html`
    <div class="cockpit-bar" data-cockpit="room">
      ${state.inRoom && state.roomTitle ? html`
        <button class="room-bar-title" type="button" data-action="nav" data-tab="stage" data-room-title>${state.roomTitle}</button>
      ` : ''}
      ${state.latestChat ? html`<button class="chat-ticker" type="button" data-action="nav" data-tab="stage">${state.latestChat}</button>` : ''}
      ${state.showAudioRetry ? html`
        <button class="btn btn-secondary audio-retry-btn" data-action="retry-audio" type="button">${t('retryAudio')}</button>
      ` : ''}
      <div class="cockpit-left">
        <div class="mic-control-cluster">
          <button class="mic-toggle-btn ${!state.muted ? 'unmuted' : ''}" id="mic-toggle-btn" data-action="toggle-mic" title="${t('toggleMic')}">
            ${!state.muted ? '🎙️' : '🔇'}
          </button>
          <div class="mic-meter-box">
            <span class="mic-meter-label">${state.isSpeaker ? (!state.muted ? t('liveBadge') : t('mutedLabel')) : t('micLabel')}</span>
            <div class="meter-bar-track">
              <div class="meter-bar-fill" id="vu-meter-fill"></div>
            </div>
            <input type="range" id="mic-vol-slider" min="0" max="1" step="0.05" value="${state.micVolume}" title="${t('micLevel')}" />
          </div>
        </div>

        <button class="toggle-state-btn ${state.monitorEnabled ? 'active' : ''}" type="button" data-action="toggle-monitor" title="${t('hearMyself')}">
          <span>🎧</span>
          <span>${t('hearMyself')}</span>
        </button>

        <button class="toggle-state-btn ${state.musicMode ? 'active' : ''}" id="music-mode-btn" data-action="toggle-music" title="${t('musicModeTitle')}">
          <span>🎵</span>
          <span>${t('musicMode')}</span>
        </button>
      </div>

      <div class="cockpit-center">
        ${state.effects.slice(0, 5).map((fx) => html`
          <button class="soundpad-quick-btn" data-action="play-sound" data-fx-id="${fx.id}">
            <span>${fx.icon}</span>
            <span>${fx.name}</span>
            <span class="key-tag">${fx.hotkey}</span>
          </button>
        `)}
      </div>

      <div class="cockpit-right">
        ${state.canRaiseHand ? html`
        <button class="toggle-state-btn ${state.handRaised ? 'active' : ''}" id="hand-btn" data-action="toggle-hand" title="${t('raiseHandTitle')}" ${state.handDisabled ? 'disabled' : ''}>
          <span>✋</span>
          <span>${t('raiseHand')}</span>
        </button>
        ` : ''}

        ${state.inRoom ? html`
          <button class="toggle-state-btn" type="button" data-action="save-clip" title="${state.canClip ? t('clipTitle') : t('clipUnavailable')}" ${state.canClip ? '' : 'disabled'}>
            <span>✂</span>
            <span>${t('clip')}</span>
          </button>
        ` : ''}
        <button class="toggle-state-btn ${state.recording ? 'record-active' : ''}" id="record-btn" data-action="toggle-record" title="${state.recordHint}" ${state.canRecord || state.recording ? '' : 'disabled'}>
          <span>🔴</span>
          <span id="record-timer">${t('recLabel')}</span>
        </button>

        ${state.inRoom ? html`
          <button class="toggle-state-btn ${state.chatOpen ? 'active' : ''}" type="button" data-action="toggle-chat" title="${state.canChat ? t('chat') : t('chatOff')}" ${state.canChat ? '' : 'disabled'}>
            <span>💬</span>
            <span>${t('chat')}</span>
            ${state.unreadChat > 0 ? html`<span class="count-badge">${state.unreadChat}</span>` : ''}
          </button>
          <button class="btn btn-danger" data-action="leave-room" style="padding: 9px 16px;">${t('leave')}</button>
        ` : ''}
      </div>
    </div>
  `;
}
