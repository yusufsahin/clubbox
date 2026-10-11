import { conversationKind, segmentsForMember } from '../../api/roomActions';
import type { CHConversation, ConversationThread, PresenceFriend } from '../../api/types';
import { t } from '../../i18n';
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
}

function houseThumb(url: string): SafeHtml | string {
  const photo = safeUrl(url);
  if (!photo) return '';
  return html`<img class="house-photo" src="${photo}" alt="" />`;
}

function formatStamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

function conversationRow(item: CHConversation): SafeHtml {
  const kind = conversationKind(item);
  return html`
    <div class="conversation-row ${item.has_new_segments ? 'is-new' : ''} ${item.is_archived ? 'is-archived' : ''}">
      <button class="conversation-open" type="button" data-action="open-conversation" data-conversation-id="${item.conversation_id}">
        <div class="conversation-title">${item.short_title || item.title}</div>
        ${item.author_name ? html`<div class="conversation-meta">${item.author_name}</div>` : ''}
        ${item.preview_segment_type === 'TEXT_TO_SPEECH' ? html`<div class="conversation-meta">${t('voicePreview')}</div>` : ''}
        <div class="conversation-preview">${item.preview_segment_text}</div>
        ${item.summary && item.summary !== item.preview_segment_text ? html`<div class="conversation-preview">${item.summary}</div>` : ''}
        ${item.author_names.length > 1 ? html`<div class="conversation-meta">${t('withPeople', { names: item.author_names.join(', ') })}</div>` : ''}
        ${item.social_club_name ? html`<div class="conversation-meta">${houseThumb(item.social_club_photo)} ${item.social_club_name}</div>` : ''}
        ${kind === 'house' ? html`<div class="conversation-meta">${t('permanentHouse')}</div>` : ''}
        ${kind === 'archive' ? html`<div class="conversation-meta">${t('archived')}</div>` : ''}
        ${!item.can_reply && item.cant_reply_reason ? html`<div class="conversation-meta">${item.cant_reply_reason}</div>` : ''}
        <div class="conversation-meta" title="${item.privacy_tooltip}">${item.privacy_label}${item.time_content_updated ? html` · ${formatStamp(item.time_content_updated)}` : ''}</div>
      </button>
      ${safeUrl(item.share_url) ? html`<button class="btn btn-secondary conversation-share" type="button" data-action="copy-conversation-share" data-conversation-id="${item.conversation_id}">${t('copyLink')}</button>` : ''}
    </div>
  `;
}

function threadPanel(item: CHConversation, state: MessagesState): SafeHtml {
  const thread = state.thread;
  const member = thread?.members.find((entry) => entry.name === state.previewMember) ?? null;
  const segments = thread
    ? segmentsForMember(thread.segments, member ? member.hide_before : null)
    : [];
  return html`
    <section class="thread-panel">
      <div class="thread-head">
        <h3>${item.short_title || item.title}</h3>
        <button class="top-icon-btn" type="button" data-action="close-conversation" title="${t('cancel')}">✕</button>
      </div>
      ${thread == null ? html`<p class="list-note">${t('threadLiveNote')}</p>` : segments.length === 0 ? html`<p class="list-empty">${t('threadEmpty')}</p>` : html`
        <div class="thread-segments">
          ${segments.map((segment) => html`
            <div class="thread-segment">
              <div class="conversation-meta">${segment.author_name}</div>
              ${segment.kind === 'voice' ? html`
                <button class="btn btn-secondary" type="button" data-action="play-thread-voice">${t('voicePreview')}</button>
                <div class="thread-speeds">
                  <span>${t('playbackSpeed')}</span>
                  ${[1, 1.5, 2].map((rate) => html`
                    <button class="btn btn-secondary ${state.playbackRate === rate ? 'is-active' : ''}" type="button" data-action="thread-speed" data-rate="${rate}">${rate}x</button>
                  `)}
                </div>
              ` : html`<div class="conversation-preview">${segment.text}</div>`}
            </div>
          `)}
        </div>
      `}
      ${thread && state.previewMember ? html`<p class="list-note">${t('hiddenFromMember', { name: state.previewMember })}</p>` : ''}
      ${thread?.members.length ? html`
        <div class="thread-actions">
          ${state.previewMember ? html`<button class="btn btn-secondary" type="button" data-action="preview-member">${t('previewAsSelf')}</button>` : thread.members.map((entry) => html`
            <button class="btn btn-secondary" type="button" data-action="preview-member" data-member="${entry.name}">${t('previewAsMember', { name: entry.name })}</button>
          `)}
        </div>
      ` : ''}
      <div class="thread-actions">
        ${item.can_add_members ? html`<button class="btn btn-secondary" type="button" data-action="add-thread-member" data-conversation-id="${item.conversation_id}">${t('addMember')}</button>` : ''}
        ${item.can_invite ? html`<button class="btn btn-secondary" type="button" data-action="thread-permission" data-permission="invite" data-conversation-id="${item.conversation_id}">${t('inviteMember')}</button>` : ''}
        ${item.can_delete ? html`<button class="btn btn-secondary" type="button" data-action="thread-permission" data-permission="delete" data-conversation-id="${item.conversation_id}">${t('deleteConversation')}</button>` : ''}
        ${item.can_leave ? html`<button class="btn btn-secondary" type="button" data-action="thread-permission" data-permission="leave" data-conversation-id="${item.conversation_id}">${t('leaveConversation')}</button>` : ''}
      </div>
      ${item.can_reply ? html`
        <div class="thread-composer">
          <input class="form-input" id="thread-input" placeholder="${t('chatPlaceholder')}" />
          <button class="btn btn-primary" type="button" data-action="send-thread-text" data-conversation-id="${item.conversation_id}">${t('send')}</button>
          <button class="btn btn-secondary" type="button" data-action="send-thread-voice" data-conversation-id="${item.conversation_id}">${t('sendVoice')}</button>
        </div>
      ` : ''}
    </section>
  `;
}

export function messagesView(state: MessagesState): SafeHtml {
  const items = state.items;
  const archive = items?.filter((item) => conversationKind(item) === 'archive') ?? [];
  const active = items?.filter((item) => conversationKind(item) !== 'archive') ?? [];
  const shown = state.filter === 'all' ? active : active.filter((item) => conversationKind(item) === state.filter);
  const open = items?.find((item) => item.conversation_id === state.openId) ?? null;
  return html`
    <div class="list-page messages-page">
      <h2>${t('messages')}</h2>
      <p class="list-note">${t('privateConversationsOnly')}</p>
      ${state.dmRequests > 0 ? html`<p class="list-note">${t('dmRequests', { count: state.dmRequests })}</p>` : ''}
      ${state.presence.length > 0 ? html`
        <div class="presence-row">
          ${state.presence.map((friend) => html`
            <div class="presence-card">
              <div class="presence-name">
                <span class="presence-mark ${friend.status === 'in-room' ? 'is-room' : 'is-online'}" aria-hidden="true">${friend.status === 'in-room' ? '🎧' : ''}</span>
                ${friend.name}
              </div>
              <div class="conversation-meta">${friend.status === 'in-room' ? t('inARoom') : t('onlineNow')}</div>
              ${friend.status === 'in-room' ? html`
                <button class="btn btn-primary" type="button" data-action="presence-join" data-channel-id="${friend.channel_id}">${t('join')}</button>
              ` : html`
                <button class="btn btn-primary" type="button" data-action="presence-talk" data-user-id="${friend.user_id}" data-name="${friend.name}" data-username="${friend.username}">${t('talkLive')}</button>
                <button class="btn btn-secondary" type="button" data-action="presence-vm" data-user-id="${friend.user_id}" data-name="${friend.name}" data-username="${friend.username}">${t('sendVm')}</button>
              `}
            </div>
          `)}
        </div>
      ` : html`<button class="btn btn-secondary" type="button" data-action="talk-live">${t('talkLive')}</button>`}
      <div class="message-filters">
        <button class="btn btn-secondary ${state.filter === 'all' ? 'is-active' : ''}" type="button" data-action="messages-filter" data-filter="all">${t('messageFilterAll')}</button>
        <button class="btn btn-secondary ${state.filter === 'house' ? 'is-active' : ''}" type="button" data-action="messages-filter" data-filter="house">${t('messageFilterHouse')}</button>
        <button class="btn btn-secondary ${state.filter === 'vm' ? 'is-active' : ''}" type="button" data-action="messages-filter" data-filter="vm">${t('messageFilterVm')}</button>
      </div>
      ${items == null ? html`<p class="list-empty">${t('listLoading')}</p>` : html`
        <div class="messages-layout ${open ? 'has-thread' : ''}">
          <div>
            ${shown.length === 0 ? html`<p class="list-empty">${t('messagesEmpty')}</p>` : html`<div class="conversation-list">${shown.map((item) => conversationRow(item))}</div>`}
            ${archive.length > 0 ? html`
              <h3 class="archive-heading">${t('archiveHeading')}</h3>
              <div class="conversation-list">${archive.map((item) => conversationRow(item))}</div>
            ` : ''}
          </div>
          ${open ? threadPanel(open, state) : ''}
        </div>
      `}
    </div>
  `;
}
