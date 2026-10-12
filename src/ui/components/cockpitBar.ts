import { t } from '../../i18n';
import type { SoundEffectItem } from '../../api/types';
import { html, type SafeHtml } from '../html';
import { icon } from '../icons';

export interface CockpitState {
  muted: boolean;
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
  reactionsOpen: boolean;
  soundsOpen: boolean;
  canReact: boolean;
  canGifReact: boolean;
  overflowOpen: boolean;
  networkQualityTone?: 'good' | 'ok' | 'poor' | 'unknown';
  networkQualityTitle?: string;
}

function barBtn(
  item: string,
  action: string,
  label: string,
  iconName: Parameters<typeof icon>[0],
  opts: { active?: boolean; disabled?: boolean; title?: string; extra?: string } = {},
): SafeHtml {
  const title = opts.title ?? label;
  const disabled = opts.disabled ? 'disabled' : '';
  const active = opts.active ? 'is-active' : '';
  return html`
    <button
      class="room-bar-btn ${active}"
      type="button"
      data-action="${action}"
      data-room-bar-item="${item}"
      aria-label="${label}"
      title="${title}"
      ${disabled}
      ${opts.extra ?? ''}
    >${icon(iconName)}<span class="room-bar-label">${label}</span></button>
  `;
}

export function cockpitBar(state: CockpitState): SafeHtml {
  const showHand = state.canRaiseHand && !state.isSpeaker;
  const showRecord = state.canRecord || state.recording || state.canClip;
  return html`
    <div class="cockpit-bar" data-cockpit="room">
      ${state.inRoom && state.roomTitle ? html`
        <button
          class="room-bar-title"
          type="button"
          data-action="nav"
          data-tab="stage"
          data-room-title
          data-room-bar-item="title"
          title="${state.roomTitle}"
        >${state.roomTitle}</button>
      ` : ''}
      ${state.inRoom ? html`
        <span
          class="network-quality-dot"
          data-network-quality
          data-tone="${state.networkQualityTone || 'unknown'}"
          title="${state.networkQualityTitle || ''}"
          aria-hidden="true"
        ></span>
      ` : ''}
      ${state.showAudioRetry ? html`
        <button class="btn btn-secondary audio-retry-btn" data-action="retry-audio" type="button">${t('retryAudio')}</button>
      ` : ''}

      <div class="room-bar-tools" data-room-bar-tools>
        <button
          class="room-bar-btn room-bar-mic ${!state.muted ? 'is-active' : ''}"
          type="button"
          data-action="toggle-mic"
          data-room-bar-item="mic"
          id="mic-toggle-btn"
          aria-label="${t('toggleMic')}"
          title="${t('toggleMic')}"
        >
          <span class="mic-ring" id="vu-meter-fill" aria-hidden="true"></span>
          ${icon(state.muted ? 'micOff' : 'mic')}
          <span class="room-bar-label">${t('mic')}</span>
        </button>

        ${showHand ? barBtn('hand', 'toggle-hand', t('hand'), 'hand', {
          active: state.handRaised,
          disabled: state.handDisabled,
          title: t('raiseHandTitle'),
          extra: 'id="hand-btn"',
        }) : ''}

        ${state.inRoom ? barBtn('reactions', 'toggle-reactions', t('reactions'), 'smile', {
          active: state.reactionsOpen,
          disabled: !state.canReact,
        }) : ''}

        ${state.inRoom ? barBtn('sounds', 'toggle-sounds', t('sounds'), 'speaker', {
          active: state.soundsOpen,
        }) : ''}

        ${state.inRoom && showRecord ? html`
          <button
            class="room-bar-btn room-bar-foldable ${state.recording ? 'is-active record-active' : ''}"
            type="button"
            data-action="${state.canClip && !state.canRecord ? 'save-clip' : 'toggle-record'}"
            data-room-bar-item="record"
            id="record-btn"
            aria-label="${t('record')}"
            title="${state.recordHint}"
            ${state.canRecord || state.recording || state.canClip ? '' : 'disabled'}
          >${icon('record')}<span class="room-bar-label" id="record-timer">${t('record')}</span></button>
        ` : ''}

        ${state.inRoom ? barBtn('chat', 'toggle-chat', t('chat'), 'chat', {
          active: state.chatOpen,
          disabled: !state.canChat,
          title: state.canChat ? t('chat') : t('chatOff'),
          extra: 'data-room-bar-foldable="1"',
        }) : ''}

        ${state.latestChat ? html`
          <button class="chat-ticker room-bar-foldable" type="button" data-action="nav" data-tab="stage" title="${state.latestChat}">${state.latestChat}</button>
        ` : ''}

        ${state.inRoom ? barBtn('details', 'open-room-details', t('details'), 'details') : ''}

        <button
          class="room-bar-btn room-bar-more"
          type="button"
          data-action="toggle-room-bar-more"
          data-room-bar-item="more"
          aria-label="${t('moreOptions')}"
          title="${t('moreOptions')}"
          ${state.overflowOpen ? 'aria-expanded="true"' : 'aria-expanded="false"'}
        >${icon('more')}<span class="room-bar-label">${t('moreOptions')}</span></button>

        ${state.inRoom ? html`
          <button
            class="room-bar-btn room-bar-leave"
            type="button"
            data-action="leave-room"
            data-room-bar-item="leave"
            aria-label="${t('leave')}"
            title="${t('leave')}"
          >${icon('leave')}<span class="room-bar-label">${t('leave')}</span></button>
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
            <input type="range" id="soundpad-vol-slider" min="0" max="1" step="0.05" value="1" />
            <button class="btn btn-secondary" type="button" data-action="stop-sounds">${t('stopSounds')}</button>
            <button class="btn btn-secondary" type="button" data-action="duck-sounds" title="${t('duckSounds')}">${t('duckSounds')}</button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}
