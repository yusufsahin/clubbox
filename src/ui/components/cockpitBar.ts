import { t } from '../../i18n';
import type { SoundEffectItem } from '../../api/types';
import { html, type SafeHtml } from '../html';
import { icon } from '../icons';

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
  reactionsOpen: boolean;
  soundsOpen: boolean;
  canReact: boolean;
  canGifReact: boolean;
  overflowOpen: boolean;
  showMusicMute: boolean;
  musicMuted: boolean;
  soundpadVolume: number;
}

function toggleBtn(
  action: string,
  label: string,
  iconName: Parameters<typeof icon>[0],
  opts: {
    item?: string;
    active?: boolean;
    disabled?: boolean;
    title?: string;
    extraClass?: string;
    extra?: string;
    badge?: number;
  } = {},
): SafeHtml {
  const item = opts.item ? html`data-room-bar-item="${opts.item}"` : '';
  const active = opts.active ? 'active' : '';
  const disabled = opts.disabled ? 'disabled' : '';
  const extraClass = opts.extraClass ?? '';
  const badge = opts.badge && opts.badge > 0
    ? html`<span class="room-bar-badge">${String(opts.badge)}</span>`
    : '';
  return html`
    <button
      class="toggle-state-btn ${active} ${extraClass}"
      type="button"
      data-action="${action}"
      ${item}
      aria-label="${label}"
      title="${opts.title ?? label}"
      ${disabled}
      ${opts.extra ?? ''}
    >${icon(iconName)}<span class="room-bar-label">${label}</span>${badge}</button>
  `;
}

export function cockpitBar(state: CockpitState): SafeHtml {
  const showHand = state.canRaiseHand && !state.isSpeaker;
  const showRecord = state.canRecord || state.recording || state.canClip;
  const micLabel = state.isSpeaker ? (!state.muted ? t('liveBadge') : t('mutedLabel')) : t('micLabel');
  return html`
    <div class="cockpit-bar" data-cockpit="room">
      ${state.inRoom && state.roomTitle ? html`
        <button
          class="room-bar-title"
          type="button"
          data-action="open-room-details"
          data-room-title
          data-room-bar-item="title"
          title="${state.roomTitle}"
        >${state.roomTitle}</button>
      ` : ''}
      ${state.latestChat ? html`
        <button class="chat-ticker" type="button" data-action="nav" data-tab="stage" title="${state.latestChat}">${state.latestChat}</button>
      ` : ''}
      ${state.showAudioRetry ? html`
        <button class="btn btn-secondary audio-retry-btn" data-action="retry-audio" type="button">${t('retryAudio')}</button>
      ` : ''}

      <div class="cockpit-left">
        <div class="mic-control-cluster">
          <button
            class="mic-toggle-btn ${!state.muted ? 'unmuted' : ''}"
            id="mic-toggle-btn"
            type="button"
            data-action="toggle-mic"
            data-room-bar-item="mic"
            aria-label="${t('mic')}"
            title="${t('toggleMic')}"
          >${icon(state.muted ? 'micOff' : 'mic', 22)}</button>
          <div class="mic-meter-box">
            <span class="mic-meter-label">${micLabel}</span>
            <div class="meter-bar-track">
              <div class="meter-bar-fill" id="vu-meter-fill"></div>
            </div>
            <input type="range" id="mic-vol-slider" min="0" max="1" step="0.05" value="${String(state.micVolume)}" title="${t('micLevel')}" />
          </div>
        </div>

        ${toggleBtn('toggle-monitor', t('hearMyself'), 'headphones', {
          active: state.monitorEnabled,
          title: t('hearMyself'),
        })}
        ${toggleBtn('toggle-music', t('musicMode'), 'music', {
          active: state.musicMode,
          extra: 'id="music-mode-btn"',
          title: t('musicModeTitle'),
        })}
        ${state.showMusicMute ? toggleBtn('toggle-music-mute', t('cockpitMusic'), 'speaker', {
          active: !state.musicMuted,
          title: t('cockpitMusicTitle'),
        }) : ''}
      </div>

      <div class="cockpit-center">
        ${state.effects.slice(0, 5).map((fx) => html`
          <button class="soundpad-quick-btn" type="button" data-action="play-sound" data-fx-id="${fx.id}">
            <span class="soundpad-icon">${fx.icon}</span>
            <span>${fx.name}</span>
            <span class="key-tag">${fx.hotkey || t('noHotkey')}</span>
          </button>
        `)}
      </div>

      <div class="cockpit-right">
        ${showHand ? toggleBtn('toggle-hand', t('hand'), 'hand', {
          item: 'hand',
          active: state.handRaised,
          disabled: state.handDisabled,
          title: t('raiseHandTitle'),
          extra: 'id="hand-btn"',
        }) : ''}

        ${state.inRoom ? toggleBtn('toggle-reactions', t('reactions'), 'smile', {
          item: 'reactions',
          active: state.reactionsOpen,
          disabled: !state.canReact,
        }) : ''}

        ${state.inRoom ? toggleBtn('toggle-sounds', t('sounds'), 'speaker', {
          item: 'sounds',
          active: state.soundsOpen,
        }) : ''}

        ${state.inRoom ? toggleBtn('save-clip', t('clip'), 'clip', {
          disabled: !state.canClip,
          title: state.canClip ? t('clipTitle') : t('clipUnavailable'),
        }) : ''}

        ${state.inRoom && showRecord ? html`
          <button
            class="toggle-state-btn ${state.recording ? 'record-active' : ''}"
            type="button"
            data-action="toggle-record"
            data-room-bar-item="record"
            id="record-btn"
            aria-label="${t('record')}"
            title="${state.recordHint}"
            ${state.canRecord || state.recording ? '' : 'disabled'}
          >${icon('record')}<span class="room-bar-label">${t('record')}</span><span class="room-bar-timer" id="record-timer" ${state.recording ? '' : 'hidden'}>${state.recording ? '00:00' : ''}</span></button>
        ` : ''}

        ${state.inRoom ? toggleBtn('toggle-chat', t('chat'), 'chat', {
          item: 'chat',
          active: state.chatOpen,
          disabled: !state.canChat,
          title: state.unreadChat > 0 ? t('unreadChat', { count: state.unreadChat }) : (state.canChat ? t('chat') : t('chatOff')),
          badge: state.unreadChat,
        }) : ''}

        ${state.inRoom ? toggleBtn('open-room-details', t('details'), 'details', { item: 'details' }) : ''}

        ${state.inRoom ? html`
          <button class="btn btn-danger" type="button" data-action="leave-room" data-room-bar-item="leave" style="padding: 9px 16px;">
            ${icon('leave')}<span class="room-bar-label">${t('leave')}</span>
          </button>
        ` : ''}
      </div>

      ${state.reactionsOpen ? html`
        <div class="room-bar-popover" data-reactions-popover>
          <div class="reaction-pad" role="group" aria-label="${t('sendReaction')}">
            ${['👏', '❤️', '🔥', '😂'].map((emoji) => html`
              <button class="btn btn-secondary reaction-btn" type="button" data-action="send-reaction" data-emoji="${emoji}">${emoji}</button>
            `)}
          </div>
          ${state.canGifReact ? html`
            <div class="gif-reaction-row">
              <input class="form-input" id="gif-reaction-input" type="url" placeholder="${t('gifReactionPlaceholder')}" aria-label="${t('gifReactionLabel')}" />
              <button class="btn btn-secondary" type="button" data-action="send-gif-reaction">${t('gifReactionSend')}</button>
            </div>
          ` : ''}
        </div>
      ` : ''}

      ${state.soundsOpen ? html`
        <div class="room-bar-popover room-sounds-panel" data-sounds-panel>
          <div class="soundboard-grid">
            ${state.effects.map((fx) => html`
              <button class="soundpad-play" type="button" data-action="play-sound" data-fx-id="${fx.id}">
                <span class="soundpad-hotkey">${fx.hotkey || t('noHotkey')}</span>
                <span class="soundpad-icon">${fx.icon}</span>
                <span class="soundpad-name">${fx.name}</span>
              </button>
            `)}
          </div>
          <div class="room-sounds-controls">
            <label class="form-label" for="soundpad-vol-slider">${t('soundpadVolume')}</label>
            <input type="range" id="soundpad-vol-slider" min="0" max="1" step="0.05" value="${String(state.soundpadVolume)}" />
            <span id="soundpad-vol-label">${String(Math.round(state.soundpadVolume * 100))}%</span>
            <button class="btn btn-secondary" type="button" data-action="stop-sounds">${t('stopSounds')}</button>
            <button class="btn btn-secondary" type="button" data-action="duck-sounds" title="${t('duckSounds')}">${t('duckSounds')}</button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}
