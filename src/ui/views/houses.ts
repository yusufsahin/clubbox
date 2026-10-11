import type { HouseChatMessage, HouseListItem, HouseMemberItem } from '../../api/communityLists';
import { t } from '../../i18n';
import { html, safeUrl, type SafeHtml } from '../html';

export type HousesViewState = {
  items: HouseListItem[] | null;
  open: HouseListItem | null;
  canHost: boolean;
  canChat: boolean;
  canMembers: boolean;
  chatOpen: boolean;
  chatMessages: HouseChatMessage[] | null;
  canPost: boolean;
  canThread: boolean;
  canReact: boolean;
  canReplyThread: boolean;
  threadId: string | null;
  threadMessages: HouseChatMessage[] | null;
  membersOpen: boolean;
  members: HouseMemberItem[] | null;
};

const HOUSE_CHAT_REACTIONS = ['❤️', '👏', '🔥', '😂'] as const;

function housePhoto(url: string): SafeHtml | string {
  const photo = safeUrl(url);
  if (!photo) return html`<div class="house-list-avatar" aria-hidden="true">🏛</div>`;
  return html`<img class="house-list-avatar" src="${photo}" alt="" width="48" height="48" />`;
}

function houseMessageActions(
  houseId: string,
  msg: HouseChatMessage,
  state: HousesViewState,
): SafeHtml {
  return html`
    <div class="house-chat-actions">
      ${state.canThread ? html`
        <button
          class="btn btn-secondary"
          type="button"
          data-action="open-house-thread"
          data-house-id="${houseId}"
          data-message-id="${msg.id}"
        >${t('houseChatReplies')}</button>
      ` : ''}
      ${state.canReact ? html`
        <div class="thread-react-pad" role="group" aria-label="${t('reactToSegment')}">
          ${HOUSE_CHAT_REACTIONS.map((emoji) => html`
            <button
              class="btn btn-secondary reaction-btn"
              type="button"
              data-action="react-house-message"
              data-house-id="${houseId}"
              data-message-id="${msg.id}"
              data-emoji="${emoji}"
            >${emoji}</button>
          `)}
        </div>
      ` : ''}
    </div>
  `;
}

export function housesView(state: HousesViewState): SafeHtml {
  const items = state.items;
  const houseId = state.open?.id ?? '';
  return html`
    <div class="list-page houses-page">
      <header class="activity-header">
        <div>
          <h2>${t('houses')}</h2>
          <p class="list-note">${t('housesHelp')}</p>
        </div>
        <button class="btn btn-secondary" type="button" data-action="refresh-houses">${t('refresh')}</button>
      </header>

      ${items == null ? html`<p class="list-empty">${t('listLoading')}</p>` : items.length === 0 ? html`
        <p class="list-empty">${t('housesEmpty')}</p>
      ` : html`
        <div class="house-list">
          ${items.map((house) => html`
            <button class="house-list-row ${state.open?.id === house.id ? 'is-selected' : ''}" type="button" data-action="open-house" data-house-slug="${house.slug}" data-house-id="${house.id}">
              ${housePhoto(house.photoUrl)}
              <span class="discover-copy">
                <strong>${house.name}</strong>
                <span class="list-empty">${t('houseMembers', { count: house.members })}</span>
              </span>
            </button>
          `)}
        </div>
      `}

      ${state.open ? html`
        <section class="house-detail">
          <h3>${state.open.name}</h3>
          ${state.open.description ? html`<p class="list-note">${state.open.description}</p>` : html`<p class="list-empty">${t('houseNoDescription')}</p>`}
          <p class="conversation-meta">${t('houseMembers', { count: state.open.members })}</p>
          <div class="thread-actions">
            ${state.canMembers ? html`
              <button class="btn btn-secondary" type="button" data-action="open-house-members" data-house-id="${state.open.id}" data-house-slug="${state.open.slug}">${t('houseViewMembers')}</button>
            ` : ''}
            ${state.canChat ? html`
              <button class="btn btn-secondary" type="button" data-action="open-house-chat" data-house-id="${state.open.id}" data-house-slug="${state.open.slug}">${t('houseChat')}</button>
            ` : ''}
            ${state.canHost ? html`
              <button class="btn btn-primary" type="button" data-action="host-house-room" data-house-id="${state.open.id}" data-house-slug="${state.open.slug}">${t('hostInHouse')}</button>
            ` : ''}
          </div>

          ${state.membersOpen ? html`
            <div class="house-chat">
              <div class="house-chat-header">
                <strong>${t('houseViewMembers')}</strong>
                <button class="btn btn-secondary" type="button" data-action="close-house-members">${t('close')}</button>
              </div>
              ${state.members == null ? html`<p class="list-empty">${t('listLoading')}</p>` : state.members.length === 0 ? html`
                <p class="list-empty">${t('peopleListEmpty')}</p>
              ` : html`
                <div class="conversation-list">
                  ${state.members.map((member) => html`
                    <button class="discover-row discover-main" type="button" data-action="open-profile" data-user-id="${member.userId}" data-user-name="${member.name}" data-username="${member.username}">
                      <span class="discover-copy">
                        <strong>${member.name}</strong>
                        <span class="list-empty">@${member.username}</span>
                      </span>
                    </button>
                  `)}
                </div>
              `}
            </div>
          ` : ''}

          ${state.chatOpen ? html`
            <div class="house-chat">
              <div class="house-chat-header">
                <strong>${t('houseChat')}</strong>
                <button class="btn btn-secondary" type="button" data-action="close-house-chat">${t('close')}</button>
              </div>
              ${state.chatMessages == null ? html`<p class="list-empty">${t('listLoading')}</p>` : state.chatMessages.length === 0 ? html`
                <p class="list-empty">${t('houseChatEmpty')}</p>
              ` : html`
                <div class="house-chat-messages">
                  ${state.chatMessages.map((msg) => html`
                    <div class="house-chat-row">
                      <div class="conversation-title">${msg.authorName || t('houseChat')}</div>
                      <div class="conversation-meta">${msg.text}</div>
                      ${houseMessageActions(houseId, msg, state)}
                    </div>
                  `)}
                </div>
              `}
              ${state.canPost ? html`
                <div class="house-chat-compose">
                  <input class="form-input" id="house-chat-input" placeholder="${t('houseChatPlaceholder')}" />
                  <button class="btn btn-primary" type="button" data-action="send-house-chat" data-house-id="${state.open.id}" data-house-slug="${state.open.slug}">${t('send')}</button>
                </div>
              ` : html`
                <p class="list-note">${t('houseChatAdminsOnly')}</p>
              `}

              ${state.threadId ? html`
                <div class="house-chat-thread">
                  <div class="house-chat-header">
                    <strong>${t('houseChatThread')}</strong>
                    <button class="btn btn-secondary" type="button" data-action="close-house-thread">${t('close')}</button>
                  </div>
                  ${state.threadMessages == null ? html`<p class="list-empty">${t('listLoading')}</p>` : state.threadMessages.length === 0 ? html`
                    <p class="list-empty">${t('houseChatThreadEmpty')}</p>
                  ` : html`
                    <div class="house-chat-messages">
                      ${state.threadMessages.map((msg) => html`
                        <div class="house-chat-row">
                          <div class="conversation-title">${msg.authorName || t('houseChat')}</div>
                          <div class="conversation-meta">${msg.text}</div>
                        </div>
                      `)}
                    </div>
                  `}
                  ${state.canReplyThread ? html`
                    <div class="house-chat-compose">
                      <input class="form-input" id="house-thread-input" placeholder="${t('houseChatThreadPlaceholder')}" />
                      <button class="btn btn-primary" type="button" data-action="send-house-thread" data-house-id="${state.open.id}">${t('send')}</button>
                    </div>
                  ` : ''}
                </div>
              ` : ''}
            </div>
          ` : ''}
        </section>
      ` : ''}
    </div>
  `;
}
