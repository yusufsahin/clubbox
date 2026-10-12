import { t } from '../../i18n';
import {
  roomActionsFor,
  roomRoleFor,
  type RoomCardAction,
  type RoomRole,
} from '../../api/roomCardActions';
import { relationshipFromStatus } from '../../api/relationship';
import type { CHChannelDetail, CHChatMessage, CHUser } from '../../api/types';
import { audienceMatchesQuery } from '../../studio/audienceSearch';
import { avatarHtml } from '../avatar';
import { linkifyChatMessage } from '../chatText';
import { html, type SafeHtml } from '../html';

export interface StageState {
  channel: CHChannelDetail;
  me: CHUser | null;
  openSpeakerMenuId: number | null;
  audioDisconnected: boolean;
  moderator: boolean;
  canMute: boolean;
  canMakeModerator: boolean;
  canMoveToAudience: boolean;
  canInvite: boolean;
  canEnd: boolean;
  canMuteEveryone: boolean;
  canBlock: boolean;
  canRename: boolean;
  canHandraise: boolean;
  canReact: boolean;
  canGifReact: boolean;
  canPing: boolean;
  canChangeVisibility: boolean;
  canFollow: boolean;
  /** Audience in an open-stage room — show Join stage CTA. */
  canJoinStage: boolean;
  audienceSearch: string;
  handraiseMode: 'off' | '1' | '2';
  visibilityMode: 'open' | 'social' | 'other';
}

export function emptyStageView(): SafeHtml {
  return html`
    <div style="text-align:center; padding: 80px 20px;">
      <div style="font-size:48px; margin-bottom:16px;">📻</div>
      <h2 style="font-size:22px; font-weight:700; margin-bottom:8px;">${t('emptyStageTitle')}</h2>
      <p style="color:var(--text-muted); max-width:440px; margin:0 auto 24px;">${t('emptyStageBody')}</p>
      <button class="btn btn-primary" data-action="nav" data-tab="explore">🧭 ${t('exploreRooms')}</button>
    </div>
  `;
}

export function stageView(
  column: SafeHtml,
  messages: SafeHtml,
  chatOpen: boolean,
  headphonesBanner = false,
): SafeHtml {
  return html`
    <div class="stage-main-wrapper">
      <div id="realtime-banner" hidden class="rec-banner stage-strip-banner">${t('realtimeReconnecting')}</div>
      ${headphonesBanner ? html`
        <div class="rec-banner stage-strip-banner" data-headphones-banner role="status">
          <span class="stage-strip-banner-text">${t('musicHeadphonesBanner')}</span>
          <button
            class="stage-strip-banner-dismiss"
            type="button"
            data-action="dismiss-headphones-banner"
            title="${t('close')}"
            aria-label="${t('close')}"
          >✕</button>
        </div>
      ` : ''}
      <div class="stage-main-row">
        <div class="stage-content-col" id="stage-column">
          ${column}
        </div>

        ${chatOpen ? html`
          <aside class="stage-chat-panel">
            <div class="chat-panel-header">
              <span>${t('roomChat')}</span>
              <button class="top-icon-btn" type="button" data-action="toggle-chat" title="${t('close')}">✕</button>
            </div>
            <div class="chat-messages-scroll" id="chat-scroll">
              ${messages}
            </div>
            <div class="chat-input-bar">
              <input class="form-input" id="chat-input" placeholder="${t('chatPlaceholder')}" style="padding: 8px 12px; font-size: 13px;" />
              <button class="btn btn-primary" data-action="send-chat" style="padding: 8px 12px;">${t('send')}</button>
            </div>
          </aside>
        ` : ''}
      </div>
    </div>
  `;
}

export function stageColumn(state: StageState): SafeHtml {
  const speakers = state.channel.users.filter((u) => u.is_speaker);
  const raisedHands = state.channel.users.filter((u) => !u.is_speaker && u.is_hand_raised);
  let audience = state.channel.users.filter((u) => !u.is_speaker && !u.is_hand_raised);
  if (state.audienceSearch.trim()) {
    audience = audience.filter((user) => audienceMatchesQuery(user, state.audienceSearch));
  }
  const meId = state.me != null ? String(state.me.user_id) : '';
  const meOnStage = !!state.me && speakers.some((u) => String(u.user_id) === meId);
  const showJoinStage = state.canJoinStage && !meOnStage;
  const meRole = roomRoleFor(state.me, state.moderator);
  return html`
        <div class="stage-section">
          <div>
            ${state.channel.is_web_listening_enabled === false ? html`
              <p class="list-note" data-web-listening-off style="margin-bottom:12px;">${t('webListeningDisabled')}</p>
            ` : ''}
            ${showJoinStage ? html`
              <div class="open-stage-banner" data-open-stage-banner>
                <div class="open-stage-banner-copy">
                  <strong>${t('joinStage')}</strong>
                  <span>${t('joinStageHelp')}</span>
                </div>
                <button class="btn btn-primary" type="button" data-action="join-open-stage" id="join-open-stage-btn">
                  ${t('joinStage')}
                </button>
              </div>
            ` : ''}
            <div class="stage-header" style="margin-bottom:16px;">
              <div class="section-title">
                <span>${t('stageSpeakers')}</span>
                <span class="badge">${speakers.length}</span>
              </div>
              <span style="font-size:12px; color:var(--text-dim);">${state.audioDisconnected ? t('audioDisconnected') : t('roomAudio')}</span>
            </div>
            <div class="speakers-grid">
              ${speakers.map((speaker) => {
                const speakerId = Number(speaker.user_id);
                const isSelf = state.me != null && String(speaker.user_id) === String(state.me.user_id);
                const actions = cardActions(state, meRole, speaker, isSelf, true);
                const menuActions = actions.filter((action) => action !== 'view_profile');
                const showMenu = menuActions.length > 0;
                const menuOpen = showMenu
                  && state.openSpeakerMenuId != null
                  && Number(state.openSpeakerMenuId) === speakerId;
                return html`
                <div class="speaker-card ${speaker.is_speaking ? 'speaking' : ''} ${isSelf ? 'me-speaker' : ''}">
                  <div class="avatar-wrapper" data-action="open-profile" data-user-id="${speaker.user_id}">
                    ${avatarHtml(speaker, 82, 'avatar-img')}
                    ${speaker.is_moderator ? html`<span class="badge-crown" title="${t('moderator')}">👑</span>` : ''}
                    ${speaker.is_muted ? html`<span class="badge-mute" title="${t('muted')}">🔇</span>` : ''}
                    ${showFollow(speaker, state) ? html`
                      <button class="speaker-follow-btn" type="button" data-action="follow-user" data-user-id="${speaker.user_id}" title="${t('relationshipNone')}">+</button>
                    ` : ''}
                  </div>
                  <div class="speaker-name" data-action="open-profile" data-user-id="${speaker.user_id}">${speaker.name}${state.channel.creator_user_profile_id === speaker.user_id ? html` <span class="host-tag">${t('host')}</span>` : ''}</div>
                  ${speaker.username ? html`<div class="speaker-handle" data-action="open-profile" data-user-id="${speaker.user_id}">@${speaker.username}</div>` : ''}
                  ${showMenu ? html`
                    <button class="speaker-menu-btn" type="button" data-action="speaker-menu" data-user-id="${speaker.user_id}" title="${t('speakerActions')}">⋯</button>
                    ${menuOpen ? html`
                      <div class="speaker-menu">
                        ${menuActions.map((action) => cardActionButton(action, speaker.user_id))}
                      </div>
                    ` : ''}
                  ` : ''}
                </div>
              `;
              })}
            </div>
          </div>

          ${raisedHands.length > 0 ? html`
            <div>
              <div class="stage-header" style="margin-bottom:16px;">
                <div class="section-title">
                    <span>${t('raisedHands')}</span>
                  <span class="badge">${raisedHands.length}</span>
                </div>
              </div>
              <div class="audience-grid">
                ${raisedHands.map((listener) => {
                  const isSelf = state.me != null && String(listener.user_id) === String(state.me.user_id);
                  const actions = cardActions(state, meRole, listener, isSelf, false)
                    .filter((action) => action !== 'leave_room' && action !== 'leave_stage');
                  return html`
                  <div class="audience-card">
                    <div class="audience-avatar-wrapper" data-action="open-profile" data-user-id="${listener.user_id}">
                      ${avatarHtml(listener, 52, 'audience-avatar-img')}
                    </div>
                    <div class="audience-name" data-action="open-profile" data-user-id="${listener.user_id}">${listener.name} ✋</div>
                    ${listener.is_invited_to_speak ? html`<div class="invited-tag">${t('invited')}</div>` : ''}
                    ${actions.map((action) => cardActionInline(action, listener.user_id))}
                  </div>
                `;
                })}
              </div>
            </div>
          ` : ''}

          ${audienceSections(audience, state, meRole)}
        </div>
  `;
}

function actionFlags(state: StageState) {
  return {
    canMute: state.canMute,
    canMakeModerator: state.canMakeModerator,
    canMoveToAudience: state.canMoveToAudience,
    canInvite: state.canInvite,
    canBlock: state.canBlock,
    canLeaveStage: false,
  };
}

function cardActions(
  state: StageState,
  meRole: RoomRole,
  user: CHUser,
  isSelf: boolean,
  isSpeaker: boolean,
): RoomCardAction[] {
  return roomActionsFor(meRole, actionFlags(state), {
    isSelf,
    isSpeaker,
    isModerator: user.is_moderator === true,
    isMuted: user.is_muted === true,
  });
}

function cardActionLabel(action: RoomCardAction): string {
  switch (action) {
    case 'invite_to_stage':
      return t('inviteToStage');
    case 'mute':
      return t('mute');
    case 'move_to_audience':
      return t('moveToAudience');
    case 'make_moderator':
      return t('makeModerator');
    case 'remove_from_room':
      return t('blockFromRoom');
    case 'view_profile':
      return t('viewProfile');
    case 'leave_stage':
      return t('leaveStage');
    case 'leave_room':
      return t('leaveQuietly');
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

function cardActionButton(action: RoomCardAction, userId: number | string | undefined): SafeHtml {
  const label = cardActionLabel(action);
  switch (action) {
    case 'mute':
      return html`<button type="button" data-action="moderate" data-mod-action="mute" data-user-id="${userId}">${label}</button>`;
    case 'move_to_audience':
      return html`<button type="button" data-action="moderate" data-mod-action="audience" data-user-id="${userId}">${label}</button>`;
    case 'make_moderator':
      return html`<button type="button" data-action="moderate" data-mod-action="moderator" data-user-id="${userId}">${label}</button>`;
    case 'remove_from_room':
      return html`<button type="button" data-action="moderate" data-mod-action="block" data-user-id="${userId}">${label}</button>`;
    case 'invite_to_stage':
      return html`<button type="button" data-action="invite-stage" data-user-id="${userId}">${label}</button>`;
    case 'view_profile':
      return html`<button type="button" data-action="open-profile" data-user-id="${userId}">${label}</button>`;
    case 'leave_stage':
      return html`<button type="button" data-action="leave-stage">${label}</button>`;
    case 'leave_room':
      return html`<button type="button" data-action="leave-room">${label}</button>`;
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

function cardActionInline(action: RoomCardAction, userId: number | string | undefined): SafeHtml {
  if (action === 'view_profile') {
    return html`<button class="invite-stage-btn" type="button" data-action="open-profile" data-user-id="${userId}">${t('viewProfile')}</button>`;
  }
  if (action === 'invite_to_stage') {
    return html`<button class="invite-stage-btn" type="button" data-action="invite-stage" data-user-id="${userId}">${t('inviteToStage')}</button>`;
  }
  if (action === 'remove_from_room') {
    return html`<button class="invite-stage-btn" type="button" data-action="moderate" data-mod-action="block" data-user-id="${userId}">${t('blockFromRoom')}</button>`;
  }
  return html``;
}

function listenerCards(listeners: CHUser[], state: StageState, meRole: RoomRole): SafeHtml {
  return html`
    <div class="audience-grid">
      ${listeners.map((listener) => {
        const isSelf = state.me != null && String(listener.user_id) === String(state.me.user_id);
        const actions = cardActions(state, meRole, listener, isSelf, false)
          .filter((action) => action !== 'leave_room' && action !== 'leave_stage');
        return html`
        <div class="audience-card">
          <div class="audience-avatar-wrapper" data-action="open-profile" data-user-id="${listener.user_id}">
            ${avatarHtml(listener, 52, 'audience-avatar-img')}
          </div>
          <div class="audience-name" data-action="open-profile" data-user-id="${listener.user_id}">${listener.name}</div>
          ${listener.is_invited_to_speak ? html`<div class="invited-tag">${t('invited')}</div>` : ''}
          ${actions.map((action) => cardActionInline(action, listener.user_id))}
        </div>
      `;
      })}
    </div>
  `;
}

function audienceSection(
  title: string,
  listeners: CHUser[],
  state: StageState,
  meRole: RoomRole,
  showSearch: boolean,
): SafeHtml {
  return html`
    <div>
      <div class="stage-header" style="margin-bottom:16px;">
        <div class="section-title">
          <span>${title}</span>
          <span class="badge">${listeners.length}</span>
        </div>
        ${showSearch ? html`
          <input class="form-input" id="audience-search" value="${state.audienceSearch}" placeholder="${t('audienceSearchPlaceholder')}" style="max-width:240px; font-size:12px;" />
        ` : ''}
      </div>
      ${listenerCards(listeners, state, meRole)}
    </div>
  `;
}

function showFollow(user: CHUser, state: StageState): boolean {
  if (!state.canFollow || user.user_id === state.me?.user_id) return false;
  const relationship = relationshipFromStatus(user.follow_status);
  return relationship === 'none' || relationship === 'follower';
}

function audienceSections(listeners: CHUser[], state: StageState, meRole: RoomRole): SafeHtml {
  // A house-member section waits until a capture marks membership on each user.
  // is_following is not a friend marker. Only a mapped follow_status splits the room.
  const friends = listeners.filter((listener) => relationshipFromStatus(listener.follow_status) === 'friends');
  if (friends.length === 0) return audienceSection(t('audience'), listeners, state, meRole, true);
  const others = listeners.filter((listener) => relationshipFromStatus(listener.follow_status) !== 'friends');
  return html`
    ${audienceSection(t('friendsHere'), friends, state, meRole, false)}
    ${others.length > 0 ? audienceSection(t('audience'), others, state, meRole, true) : ''}
  `;
}

export function chatList(messages: CHChatMessage[], opts: { canDelete?: boolean } = {}): SafeHtml {
  if (messages.length === 0) return html`<div class="chat-empty">${t('noMessages')}</div>`;
  return html`${messages.map((msg) => html`
    <div class="chat-message-bubble">
      ${avatarHtml(msg, 28, 'chat-msg-avatar')}
      <div class="chat-msg-content">
        <div class="chat-msg-author">${msg.name}</div>
        <div class="chat-msg-text">${linkifyChatMessage(msg.message)}</div>
        ${opts.canDelete && msg.id ? html`
          <button class="chat-msg-delete" type="button" data-action="delete-chat-message" data-message-id="${msg.id}">${t('deleteChatMessage')}</button>
        ` : ''}
      </div>
    </div>
  `)}`;
}
