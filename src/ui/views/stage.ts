import { t } from '../../i18n';
import { relationshipFromStatus } from '../../api/relationship';
import type { CHChannelDetail, CHChatMessage, CHUser } from '../../api/types';
import { avatarHtml } from '../avatar';
import { html, type SafeHtml } from '../html';

export interface StageState {
  channel: CHChannelDetail;
  me: CHUser | null;
  openSpeakerMenuId: number | null;
  audioDisconnected: boolean;
  moderator: boolean;
  canMute: boolean;
  canMod: boolean;
  canMoveToAudience: boolean;
  canInvite: boolean;
  canEnd: boolean;
  canMuteEveryone: boolean;
  canBlock: boolean;
  canFollow: boolean;
}

function unverifiedAction(): SafeHtml {
  return html`<span class="invited-tag" title="${t('availableInClubhouseApp')}">${t('availableInClubhouseApp')}</span>`;
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

export function stageView(column: SafeHtml, messages: SafeHtml, chatOpen: boolean): SafeHtml {
  return html`
    <div class="stage-main-wrapper">
      <div class="stage-content-col" id="stage-column">
        ${column}
      </div>

      ${chatOpen ? html`
        <aside class="stage-chat-panel">
          <div class="chat-panel-header">
            <span>${t('roomChat')}</span>
            <button class="top-icon-btn" type="button" data-action="toggle-chat" title="${t('chat')}">✕</button>
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
  `;
}

export function stageColumn(state: StageState): SafeHtml {
  const speakers = state.channel.users.filter((u) => u.is_speaker);
  const raisedHands = state.channel.users.filter((u) => !u.is_speaker && u.is_hand_raised);
  const audience = state.channel.users.filter((u) => !u.is_speaker && !u.is_hand_raised);
  return html`
        <div class="stage-section">
          <div>
            <div class="stage-header" style="margin-bottom:16px;">
              <div class="section-title">
                <span>${t('stageSpeakers')}</span>
                <span class="badge">${speakers.length}</span>
              </div>
              <span style="font-size:12px; color:var(--text-dim);">${state.audioDisconnected ? t('audioDisconnected') : t('roomAudio')}</span>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
              <button class="btn btn-secondary" type="button" data-action="refresh-stage" title="Ctrl+P">${t('refreshStage')}</button>
              ${state.moderator && state.canMuteEveryone ? html`<button class="btn btn-secondary" type="button" data-action="mute-everyone">${t('muteEveryone')}</button>` : ''}
              ${state.moderator && state.canEnd ? html`<button class="btn btn-danger" type="button" data-action="end-room">${t('endRoom')}</button>` : ''}
              ${state.moderator && !state.canEnd && !state.canMuteEveryone && !state.canInvite ? unverifiedAction() : ''}
            </div>

            <div class="speakers-grid">
              ${speakers.map((speaker) => html`
                <div class="speaker-card ${speaker.is_speaking ? 'speaking' : ''} ${speaker.user_id === state.me?.user_id ? 'me-speaker' : ''}" data-action="open-profile" data-user-id="${speaker.user_id}">
                  <div class="avatar-wrapper">
                    ${avatarHtml(speaker, 82, 'avatar-img')}
                    ${speaker.is_moderator ? html`<span class="badge-crown" title="${t('moderator')}">👑</span>` : ''}
                    ${speaker.is_muted ? html`<span class="badge-mute" title="${t('muted')}">🔇</span>` : ''}
                    ${showFollow(speaker, state) ? html`
                      <button class="speaker-follow-btn" type="button" data-action="follow-user" data-user-id="${speaker.user_id}" title="${t('relationshipNone')}">+</button>
                    ` : ''}
                  </div>
                  <div class="speaker-name">${speaker.name}${state.channel.creator_user_profile_id === speaker.user_id ? html` <span class="host-tag">${t('host')}</span>` : ''}</div>
                  ${speaker.username ? html`<div class="speaker-handle">@${speaker.username}</div>` : ''}
                  ${state.moderator && speaker.user_id !== state.me?.user_id && !(state.canMute || state.canMod || state.canMoveToAudience || state.canBlock) ? unverifiedAction() : ''}
                  ${state.moderator && speaker.user_id !== state.me?.user_id && (state.canMute || state.canMod || state.canMoveToAudience || state.canBlock) ? html`
                    <button class="speaker-menu-btn" data-action="speaker-menu" data-user-id="${speaker.user_id}" title="${t('speakerActions')}">⋯</button>
                    ${state.openSpeakerMenuId === speaker.user_id ? html`
                      <div class="speaker-menu">
                        ${state.canMute && !speaker.is_muted ? html`<button type="button" data-action="moderate" data-mod-action="mute" data-user-id="${speaker.user_id}">${t('mute')}</button>` : ''}
                        ${state.canMod && !speaker.is_moderator ? html`<button type="button" data-action="moderate" data-mod-action="moderator" data-user-id="${speaker.user_id}">${t('makeModerator')}</button>` : ''}
                        ${state.canMoveToAudience ? html`<button type="button" data-action="moderate" data-mod-action="audience" data-user-id="${speaker.user_id}">${t('moveToAudience')}</button>` : ''}
                        ${state.canBlock ? html`<button type="button" data-action="moderate" data-mod-action="block" data-user-id="${speaker.user_id}">${t('blockFromRoom')}</button>` : ''}
                      </div>
                    ` : ''}
                  ` : ''}
                </div>
              `)}
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
                ${raisedHands.map((listener) => html`
                  <div class="audience-card" data-action="open-profile" data-user-id="${listener.user_id}">
                    <div class="audience-avatar-wrapper">
                      ${avatarHtml(listener, 52, 'audience-avatar-img')}
                    </div>
                    <div class="audience-name">${listener.name} ✋</div>
                    ${listener.is_invited_to_speak ? html`<div class="invited-tag">${t('invited')}</div>` : ''}
                    ${state.moderator ? (state.canInvite ? html`<button class="invite-stage-btn" data-action="invite-stage" data-user-id="${listener.user_id}">${t('inviteToStage')}</button>` : unverifiedAction()) : ''}
                  </div>
                `)}
              </div>
            </div>
          ` : ''}

          ${audienceSections(audience, state)}
        </div>
  `;
}

function listenerCards(listeners: CHUser[], state: StageState): SafeHtml {
  return html`
    <div class="audience-grid">
      ${listeners.map((listener) => html`
        <div class="audience-card" data-action="open-profile" data-user-id="${listener.user_id}">
          <div class="audience-avatar-wrapper">
            ${avatarHtml(listener, 52, 'audience-avatar-img')}
          </div>
          <div class="audience-name">${listener.name}</div>
          ${listener.is_invited_to_speak ? html`<div class="invited-tag">${t('invited')}</div>` : ''}
          ${state.moderator ? (state.canInvite ? html`<button class="invite-stage-btn" data-action="invite-stage" data-user-id="${listener.user_id}">${t('inviteToStage')}</button>` : unverifiedAction()) : ''}
        </div>
      `)}
    </div>
  `;
}

function audienceSection(title: string, listeners: CHUser[], state: StageState): SafeHtml {
  return html`
    <div>
      <div class="stage-header" style="margin-bottom:16px;">
        <div class="section-title">
          <span>${title}</span>
          <span class="badge">${listeners.length}</span>
        </div>
      </div>
      ${listenerCards(listeners, state)}
    </div>
  `;
}

function showFollow(user: CHUser, state: StageState): boolean {
  if (!state.canFollow || user.user_id === state.me?.user_id) return false;
  const relationship = relationshipFromStatus(user.follow_status);
  return relationship === 'none' || relationship === 'follower';
}

function audienceSections(listeners: CHUser[], state: StageState): SafeHtml {
  // A house-member section waits until a capture marks membership on each user.
  // is_following is not a friend marker. Only a mapped follow_status splits the room.
  const friends = listeners.filter((listener) => relationshipFromStatus(listener.follow_status) === 'friends');
  if (friends.length === 0) return audienceSection(t('audience'), listeners, state);
  const others = listeners.filter((listener) => relationshipFromStatus(listener.follow_status) !== 'friends');
  return html`
    ${audienceSection(t('friendsHere'), friends, state)}
    ${others.length > 0 ? audienceSection(t('audience'), others, state) : ''}
  `;
}

export function chatList(messages: CHChatMessage[]): SafeHtml {
  if (messages.length === 0) return html`<div class="chat-empty">${t('noMessages')}</div>`;
  return html`${messages.map((msg) => html`
    <div class="chat-message-bubble">
      ${avatarHtml(msg, 28, 'chat-msg-avatar')}
      <div class="chat-msg-content">
        <div class="chat-msg-author">${msg.name}</div>
        <div class="chat-msg-text">${msg.message}</div>
      </div>
    </div>
  `)}`;
}
