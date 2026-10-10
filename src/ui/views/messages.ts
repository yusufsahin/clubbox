import type { CHConversation } from '../../api/types';
import { t } from '../../i18n';
import { html, safeUrl, type SafeHtml } from '../html';

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

export function messagesView(items: CHConversation[] | null, dmRequests: number): SafeHtml {
  return html`
    <div class="list-page">
      <h2>${t('messages')}</h2>
      <p class="list-note">${t('privateConversationsOnly')}</p>
      ${dmRequests > 0 ? html`<p class="list-note">${t('dmRequests', { count: dmRequests })}</p>` : ''}
      ${items == null ? html`<p class="list-empty">${t('listLoading')}</p>` : items.length === 0 ? html`<p class="list-empty">${t('messagesEmpty')}</p>` : html`
        <div class="conversation-list">
          ${items.map((item) => html`
            <div class="conversation-row ${item.has_new_segments ? 'is-new' : ''} ${item.is_archived ? 'is-archived' : ''}">
              <div class="conversation-title">${item.short_title || item.title}</div>
              ${item.author_name ? html`<div class="conversation-meta">${item.author_name}</div>` : ''}
              ${item.preview_segment_type === 'TEXT_TO_SPEECH' ? html`<div class="conversation-meta">${t('voicePreview')}</div>` : ''}
              <div class="conversation-preview">${item.preview_segment_text}</div>
              ${item.summary && item.summary !== item.preview_segment_text ? html`<div class="conversation-preview">${item.summary}</div>` : ''}
              ${item.author_names.length > 1 ? html`<div class="conversation-meta">${t('withPeople', { names: item.author_names.join(', ') })}</div>` : ''}
              ${item.social_club_name ? html`<div class="conversation-meta">${houseThumb(item.social_club_photo)} ${item.social_club_name}</div>` : ''}
              ${item.is_subscribed === false ? html`<div class="conversation-meta">${t('notSubscribed')}</div>` : ''}
              ${item.is_archived ? html`<div class="conversation-meta">${t('archived')}</div>` : ''}
              ${!item.can_reply && item.cant_reply_reason ? html`<div class="conversation-meta">${item.cant_reply_reason}</div>` : ''}
              ${item.pending_names.length > 0 ? html`<div class="conversation-meta">${t('waitingNames', { names: item.pending_names.join(', ') })}</div>` : item.pending_count > 0 ? html`<div class="conversation-meta">${t('pendingPeople', { count: item.pending_count })}</div>` : ''}
              ${item.has_listened === false ? html`<div class="conversation-meta">${t('notListened')}</div>` : ''}
              ${item.permanent_house_chat ? html`<div class="conversation-meta">${t('permanentHouse')}</div>` : ''}
              <div class="conversation-meta" title="${item.privacy_tooltip}">${item.privacy_label}${item.time_content_updated ? html` · ${formatStamp(item.time_content_updated)}` : ''}</div>
              ${safeUrl(item.share_url) ? html`<button class="btn btn-secondary conversation-share" type="button" data-action="copy-conversation-share" data-conversation-id="${item.conversation_id}">${t('copyLink')}</button>` : ''}
            </div>
          `)}
        </div>
      `}
    </div>
  `;
}
