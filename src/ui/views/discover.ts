import { t } from '../../i18n';
import type { SearchHit } from '../../api/types';
import { avatarHtml } from '../avatar';
import { html, safeUrl, type SafeHtml } from '../html';

export type DiscoverTab = 'top' | 'people' | 'rooms' | 'houses';

const TABS: DiscoverTab[] = ['top', 'people', 'rooms', 'houses'];

function tabLabel(tab: DiscoverTab): string {
  if (tab === 'people') return t('discoverPeople');
  if (tab === 'rooms') return t('discoverRooms');
  if (tab === 'houses') return t('discoverHouses');
  return t('discoverTop');
}

function hitRow(hit: SearchHit): SafeHtml {
  if (hit.kind === 'user') {
    const user = hit.user;
    return html`
      <div class="discover-row">
        <button class="discover-main" type="button" data-action="open-profile" data-user-id="${user.user_id}">
          ${avatarHtml(user, 48, 'sidebar-user-avatar')}
          <span class="discover-copy">
            <strong>${user.name || user.username}</strong>
            <span class="list-empty">@${user.username}</span>
            ${hit.followsMe ? html`<span class="list-empty">${t('followsYou')}</span>` : ''}
            ${user.bio ? html`<span class="discover-bio">${user.bio}</span>` : ''}
          </span>
        </button>
      </div>
    `;
  }
  if (hit.kind === 'room' || hit.kind === 'replay') {
    return html`
      <button class="discover-row discover-main" type="button" data-action="join-room" data-channel-id="${hit.channel}">
        <span class="discover-copy">
          <strong>${hit.topic}</strong>
          <span class="list-empty">${hit.kind === 'room' ? t('discoverRoomMeta', { speakers: hit.speakers, listeners: hit.listeners }) : t('replayAvailable')}</span>
        </span>
      </button>
    `;
  }
  if (hit.kind === 'house') {
    const photo = safeUrl(hit.photoUrl);
    return html`
      <div class="discover-row">
        ${photo ? html`<img class="house-photo" src="${photo}" alt="" />` : ''}
        <span class="discover-copy">
          <strong>${hit.name}</strong>
          ${hit.subtitle ? html`<span class="discover-bio">${hit.subtitle}</span>` : ''}
          ${hit.members != null ? html`<span class="list-empty">${t('discoverMembers', { count: hit.members })}</span>` : ''}
        </span>
      </div>
    `;
  }
  return html`
    <div class="discover-row">
      <span class="discover-copy">
        <strong>${hit.title || t('messages')}</strong>
        ${hit.summary ? html`<span class="discover-bio">${hit.summary}</span>` : ''}
      </span>
    </div>
  `;
}

export function discoverView(query: string, tab: DiscoverTab, hits: SearchHit[] | null, loading: boolean): SafeHtml {
  const body = loading && !hits
    ? html`<p class="list-empty">${t('discoverSearching')}</p>`
    : !query
      ? html`<p class="list-empty">${t('discoverPrompt')}</p>`
      : !hits || hits.length === 0
        ? html`<p class="list-empty">${loading ? t('discoverSearching') : t('discoverNone')}</p>`
        : html`<div class="conversation-list">${hits.map((hit) => hitRow(hit))}</div>`;
  return html`
    <div class="list-page">
      <h2>${t('discover')}</h2>
      <div class="discover-search">
        <input id="discover-query" type="search" value="${query}" placeholder="${t('discoverPrompt')}" />
        ${query ? html`<button class="btn btn-secondary" type="button" data-action="discover-clear">${t('discoverCancel')}</button>` : ''}
      </div>
      <div class="discover-tabs">
        ${TABS.map((item) => html`
          <button class="discover-tab ${item === tab ? 'active' : ''}" type="button" data-action="discover-tab" data-discover="${item}">${tabLabel(item)}</button>
        `)}
      </div>
      ${body}
    </div>
  `;
}
