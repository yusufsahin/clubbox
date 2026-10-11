import { conversationKind, segmentsForMember } from '../../api/roomActions';
import type { CHConversation, ConversationThread, PresenceFriend } from '../../api/types';
import { t } from '../../i18n';
import { avatarHtml } from '../avatar';
import { html, safeUrl, type SafeHtml } from '../html';

export interface MessagesState {
  items: CHConversation[] | null;
  dmRequests: number;
  filter: 'all' | 'house' | 'vm';
  openId: string | null;
  thread: ConversationThread | null;
  previewMember: string | null;
  playbackRate: number;
  presence: PresenceFriend[];
  canCreateVm: boolean;
  canReact: boolean;
  canLoadMore?: boolean;
  loadingMore?: boolean;
  threadNote?: string;
  unreadById?: Record<string, number>;
}

const THREAD_REACTIONS = ['❤️', '👏', '🔥', '😂'] as const;

function formatRelative(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const deltaSec = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(deltaSec);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (abs < 60) return rtf.format(deltaSec, 'second');
  if (abs < 3600) return rtf.format(Math.round(deltaSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(deltaSec / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(deltaSec / 86400), 'day');
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function kindLabel(kind: ReturnType<typeof conversationKind>): string {
  if (kind === 'house') return t('messageFilterHouse');
  if (kind === 'archive') return t('archived');
  return t('messageFilterVm');
}

function rowAvatar(item: CHConversation): SafeHtml {
  const person = item.participants[0];
  if (person) return avatarHtml(person, 44, 'conversation-avatar');
  if (item.social_club_photo && safeUrl(item.social_club_photo)) {
    return html`<img class="conversation-avatar house-photo" src="${safeUrl(item.social_club_photo)}" alt="" width="44" height="44" />`;
  }
  return avatarHtml({ name: item.short_title || item.title || '?' }, 44, 'conversation-avatar');
}

function conversationRow(
  item: CHConversation,
  openId: string | null,
  unreadById: Record<string, number> | undefined,
): SafeHtml {
  const kind = conversationKind(item);
  const title = item.short_title || item.title || t('messages');
  const preview = item.preview_segment_text || item.summary || '';
  const isVoice = item.preview_segment_type === 'TEXT_TO_SPEECH' || item.preview_segment_type === 'AUDIO';
  const selected = openId === item.conversation_id;
  const unreadCount = unreadById?.[item.conversation_id] ?? 0;
  const showUnread = unreadCount > 0 || item.has_new_segments;
  return html`
    <div class="conversation-row ${showUnread ? 'is-new' : ''} ${item.is_archived ? 'is-archived' : ''} ${selected ? 'is-selected' : ''}">
      <button class="conversation-open" type="button" data-action="open-conversation" data-conversation-id="${item.conversation_id}">
        ${rowAvatar(item)}
        <div class="conversation-body">
          <div class="conversation-top">
            <div class="conversation-title">${title}</div>
            <div class="conversation-time">${item.time_content_updated ? formatRelative(item.time_content_updated) : ''}</div>
          </div>
          <div class="conversation-preview">
            ${isVoice ? html`<span class="conversation-kind-inline">🎙</span> ` : ''}
            ${preview || t('threadEmpty')}
          </div>
          <div class="conversation-tags">
            <span class="conversation-chip">${kindLabel(kind)}</span>
            ${item.social_club_name ? html`<span class="conversation-chip is-house">${item.social_club_name}</span>` : ''}
            ${unreadCount > 0 ? html`<span class="conversation-chip is-unread">${unreadCount}</span>` : item.has_new_segments ? html`<span class="conversation-chip is-unread">${t('messageNew')}</span>` : ''}
            ${!item.can_reply && item.cant_reply_reason ? html`<span class="conversation-chip is-muted" title="${item.cant_reply_reason}">🔒</span>` : ''}
          </div>
        </div>
      </button>
      ${safeUrl(item.share_url) ? html`
        <button
          class="top-icon-btn conversation-share"
          type="button"
          data-action="copy-conversation-share"
          data-conversation-id="${item.conversation_id}"
          title="${t('copyLink')}"
        >🔗</button>
      ` : ''}
    </div>
  `;
}

function threadPanel(item: CHConversation, state: MessagesState): SafeHtml {
  const thread = state.thread;
  const member = thread?.members.find((entry) => entry.name === state.previewMember) ?? null;
  const segments = thread
    ? segmentsForMember(thread.segments, member ? member.hide_before : null)
    : [];
  const title = item.short_title || item.title || t('messages');
  const subtitle = item.author_names.length > 1
    ? t('withPeople', { names: item.author_names.join(', ') })
    : (item.author_name || item.social_club_name || item.privacy_label);
  return html`
    <section class="thread-panel">
      <div class="thread-head">
        <div class="thread-head-copy">
          <h3>${title}</h3>
          ${subtitle ? html`<p class="thread-subtitle">${subtitle}</p>` : ''}
        </div>
        <button class="top-icon-btn" type="button" data-action="close-conversation" title="${t('close')}">✕</button>
      </div>

      <div class="thread-scroll">
        ${state.threadNote ? html`<p class="list-note">${state.threadNote}</p>` : ''}
        ${thread == null ? html`<p class="list-note">${t('threadLoading')}</p>` : segments.length === 0 ? html`<p class="list-empty">${t('threadEmpty')}</p>` : html`
          <div class="thread-segments">
            ${segments.map((segment) => html`
              <div class="thread-segment ${segment.kind === 'voice' ? 'is-voice' : 'is-text'}">
                ${segment.author_name ? html`<div class="thread-author">${segment.author_name}</div>` : ''}
                ${segment.kind === 'voice' ? html`
                  <div class="thread-voice">
                    <button
                      class="btn btn-secondary"
                      type="button"
                      data-action="play-thread-voice"
                      data-conversation-id="${item.conversation_id}"
                      data-segment-id="${segment.id}"
                    >▶ ${t('voicePreview')}</button>
                    <div class="thread-speeds" role="group" aria-label="${t('playbackSpeed')}">
                      ${[1, 1.5, 2].map((rate) => html`
                        <button class="speed-chip ${state.playbackRate === rate ? 'is-active' : ''}" type="button" data-action="thread-speed" data-rate="${rate}">${rate}x</button>
                      `)}
                    </div>
                  </div>
                  ${segment.text ? html`<div class="thread-transcript">${segment.text}</div>` : ''}
                ` : html`<div class="thread-bubble">${segment.text}</div>`}
                ${state.canReact ? html`
                  <div class="thread-react-pad" role="group" aria-label="${t('reactToSegment')}">
                    ${THREAD_REACTIONS.map((emoji) => html`
                      <button
                        class="speed-chip"
                        type="button"
                        data-action="react-thread-segment"
                        data-conversation-id="${item.conversation_id}"
                        data-segment-id="${segment.id}"
                        data-emoji="${emoji}"
                      >${emoji}</button>
                    `)}
                  </div>
                ` : ''}
              </div>
            `)}
          </div>
        `}
        ${thread && state.previewMember ? html`<p class="list-note">${t('hiddenFromMember', { name: state.previewMember })}</p>` : ''}
      </div>

      ${thread?.members.length ? html`
        <div class="thread-actions">
          ${state.previewMember ? html`<button class="btn btn-secondary" type="button" data-action="preview-member">${t('previewAsSelf')}</button>` : thread.members.map((entry) => html`
            <button class="btn btn-secondary" type="button" data-action="preview-member" data-member="${entry.name}">${t('previewAsMember', { name: entry.name })}</button>
          `)}
        </div>
      ` : ''}

      ${(item.can_add_members || item.can_invite || item.can_delete || item.can_leave) ? html`
        <div class="thread-actions thread-actions-secondary">
          ${item.can_add_members ? html`<button class="btn btn-secondary" type="button" data-action="add-thread-member" data-conversation-id="${item.conversation_id}">${t('addMember')}</button>` : ''}
          ${item.can_invite ? html`<button class="btn btn-secondary" type="button" data-action="thread-permission" data-permission="invite" data-conversation-id="${item.conversation_id}">${t('inviteMember')}</button>` : ''}
          ${item.can_delete ? html`<button class="btn btn-secondary" type="button" data-action="thread-permission" data-permission="rename" data-conversation-id="${item.conversation_id}">${t('renameConversation')}</button>` : ''}
          ${item.can_delete ? html`<button class="btn btn-secondary" type="button" data-action="thread-permission" data-permission="delete" data-conversation-id="${item.conversation_id}">${t('deleteConversation')}</button>` : ''}
          ${item.can_leave ? html`<button class="btn btn-secondary" type="button" data-action="thread-permission" data-permission="leave" data-conversation-id="${item.conversation_id}">${t('leaveConversation')}</button>` : ''}
        </div>
      ` : ''}

      ${item.can_reply ? html`
        <div class="thread-composer">
          <input class="form-input" id="thread-input" placeholder="${t('chatPlaceholder')}" autocomplete="off" />
          <button class="btn btn-primary" type="button" data-action="send-thread-text" data-conversation-id="${item.conversation_id}">${t('send')}</button>
          <button class="btn btn-secondary" type="button" data-action="send-thread-voice" data-conversation-id="${item.conversation_id}">🎙 ${t('sendVoice')}</button>
        </div>
      ` : item.cant_reply_reason ? html`<p class="list-note">${item.cant_reply_reason}</p>` : ''}
    </section>
  `;
}

function emptyThreadPane(): SafeHtml {
  return html`
    <section class="thread-panel thread-panel-empty">
      <div class="thread-empty-hero">
        <div class="thread-empty-icon">💬</div>
        <h3>${t('selectConversation')}</h3>
        <p class="list-note">${t('selectConversationHelp')}</p>
      </div>
    </section>
  `;
}

function pendingThreadPane(): SafeHtml {
  return html`
    <section class="thread-panel">
      <div class="thread-head">
        <div class="thread-head-copy">
          <h3>${t('messages')}</h3>
        </div>
        <button class="top-icon-btn" type="button" data-action="close-conversation" title="${t('close')}">✕</button>
      </div>
      <div class="thread-scroll">
        <p class="list-note">${t('threadLoading')}</p>
      </div>
    </section>
  `;
}

export function messagesView(state: MessagesState): SafeHtml {
  const items = state.items;
  const archive = items?.filter((item) => conversationKind(item) === 'archive') ?? [];
  const active = items?.filter((item) => conversationKind(item) !== 'archive') ?? [];
  const houseCount = active.filter((item) => conversationKind(item) === 'house').length;
  const vmCount = active.filter((item) => conversationKind(item) === 'vm').length;
  const shown = state.filter === 'all' ? active : active.filter((item) => conversationKind(item) === state.filter);
  const openInFilter = shown.find((item) => item.conversation_id === state.openId)
    ?? (state.filter === 'all' ? archive.find((item) => item.conversation_id === state.openId) : undefined)
    ?? null;
  const open = openInFilter;
  const pendingOpen = !open && !!state.openId;
  const threadPane = open ? threadPanel(open, state) : (pendingOpen ? pendingThreadPane() : emptyThreadPane());

  return html`
    <div class="messages-page">
      <header class="messages-header">
        <div>
          <h2>${t('messages')}</h2>
          <p class="list-note">${t('privateConversationsOnly')}</p>
        </div>
        <div class="messages-header-actions">
          ${state.dmRequests > 0 ? html`<span class="messages-request-badge">${t('dmRequests', { count: state.dmRequests })}</span>` : ''}
          <button class="btn btn-secondary" type="button" data-action="refresh-messages">${t('refresh')}</button>
        </div>
      </header>

      ${state.presence.length > 0 ? html`
        <div class="presence-row" aria-label="${t('onlineNow')}">
          ${state.presence.map((friend) => html`
            <div class="presence-card">
              <div class="presence-name">
                <span class="presence-mark ${friend.status === 'in-room' ? 'is-room' : 'is-online'}" aria-hidden="true">${friend.status === 'in-room' ? '🎧' : ''}</span>
                <span class="presence-name-text">${friend.name}</span>
              </div>
              <div class="conversation-meta">${friend.status === 'in-room' ? t('inARoom') : t('onlineNow')}</div>
              <div class="presence-actions">
                ${friend.status === 'in-room' ? html`
                  <button class="btn btn-primary" type="button" data-action="presence-join" data-channel-id="${friend.channel_id}">${t('join')}</button>
                ` : html`
                  <button class="btn btn-primary" type="button" data-action="presence-talk" data-user-id="${friend.user_id}" data-name="${friend.name}" data-username="${friend.username}">${t('talkLive')}</button>
                  ${state.canCreateVm ? html`
                    <button class="btn btn-secondary" type="button" data-action="presence-vm" data-user-id="${friend.user_id}" data-name="${friend.name}" data-username="${friend.username}">${t('sendVm')}</button>
                  ` : ''}
                `}
              </div>
            </div>
          `)}
        </div>
      ` : ''}

      <div class="message-filters" role="tablist">
        <button class="filter-chip ${state.filter === 'all' ? 'is-active' : ''}" type="button" data-action="messages-filter" data-filter="all" role="tab" aria-selected="${state.filter === 'all'}">
          ${t('messageFilterAll')} <span class="filter-count">${active.length}</span>
        </button>
        <button class="filter-chip ${state.filter === 'vm' ? 'is-active' : ''}" type="button" data-action="messages-filter" data-filter="vm" role="tab" aria-selected="${state.filter === 'vm'}">
          ${t('messageFilterVm')} <span class="filter-count">${vmCount}</span>
        </button>
        <button class="filter-chip ${state.filter === 'house' ? 'is-active' : ''}" type="button" data-action="messages-filter" data-filter="house" role="tab" aria-selected="${state.filter === 'house'}">
          ${t('messageFilterHouse')} <span class="filter-count">${houseCount}</span>
        </button>
      </div>

      ${items == null ? html`
        <div class="messages-layout ${pendingOpen ? 'has-thread' : 'no-thread'}">
          <div class="messages-list-pane">
            <p class="list-empty">${t('listLoading')}</p>
          </div>
          ${pendingOpen ? pendingThreadPane() : emptyThreadPane()}
        </div>
      ` : html`
        <div class="messages-layout ${open || pendingOpen ? 'has-thread' : 'no-thread'}">
          <div class="messages-list-pane">
            ${shown.length === 0 ? html`<p class="list-empty">${t('messagesEmpty')}</p>` : html`
              <div class="conversation-list">${shown.map((item) => conversationRow(item, state.openId, state.unreadById))}</div>
            `}
            ${archive.length > 0 && state.filter === 'all' ? html`
              <h3 class="archive-heading">${t('archiveHeading')}</h3>
              <div class="conversation-list">${archive.map((item) => conversationRow(item, state.openId, state.unreadById))}</div>
            ` : ''}
            ${state.canLoadMore ? html`
              <div style="margin:12px 0; text-align:center;">
                <button class="btn btn-secondary" type="button" data-action="load-more-conversations" ${state.loadingMore ? 'disabled' : ''}>
                  ${t('loadMoreConversations')}
                </button>
              </div>
            ` : ''}
          </div>
          ${threadPane}
        </div>
      `}
    </div>
  `;
}
