import { t } from '../../i18n';
import type { HouseListItem } from '../../api/communityLists';
import { shouldOfferFollowBack } from '../../api/relationship';
import type { CHUser, SearchHit } from '../../api/types';
import { avatarHtml } from '../avatar';
import { html, safeUrl, type SafeHtml } from '../html';

export type DiscoverTab = 'top' | 'people' | 'rooms' | 'houses';

export type DiscoverHomeState = {
  suggestions: number | null;
  talkPartners: CHUser[] | null;
  houses: HouseListItem[] | null;
};

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
    const followBack = shouldOfferFollowBack({
      follows_me: hit.followsMe || user.follows_me,
      follow_status: user.follow_status,
    });
    return html`
      <div class="discover-row">
        <button class="discover-main" type="button" data-action="open-profile" data-user-id="${user.user_id}">
          ${avatarHtml(user, 48, 'sidebar-user-avatar')}
          <span class="discover-copy">
            <strong>${user.name || user.username}</strong>
            <span class="list-empty">@${user.username}</span>
            ${hit.followsMe && !followBack ? html`<span class="list-empty">${t('followsYou')}</span>` : ''}
            ${user.bio ? html`<span class="discover-bio">${user.bio}</span>` : ''}
          </span>
        </button>
        ${followBack ? html`
          <button class="btn btn-primary" type="button" data-action="follow-user" data-user-id="${user.user_id}" data-follow-back="1">${t('followBack')}</button>
        ` : ''}
      </div>
    `;
  }
  if (hit.kind === 'room') {
    return html`
      <button class="discover-row discover-main" type="button" data-action="join-room" data-channel-id="${hit.channel}">
        <span class="discover-copy">
          <strong>${hit.topic}</strong>
          <span class="list-empty">${t('discoverRoomMeta', { speakers: hit.speakers, listeners: hit.listeners })}</span>
        </span>
      </button>
    `;
  }
  if (hit.kind === 'replay') {
    return html`
      <button class="discover-row discover-main" type="button" data-action="open-replay" data-replay-id="${hit.channel}">
        <span class="discover-copy">
          <strong>${hit.topic}</strong>
          <span class="list-empty">${t('replayAvailable')}</span>
        </span>
      </button>
    `;
  }
  if (hit.kind === 'house') {
    const photo = safeUrl(hit.photoUrl);
    const body = html`
      ${photo ? html`<img class="house-photo" src="${photo}" alt="" />` : ''}
      <span class="discover-copy">
        <strong>${hit.name}</strong>
        ${hit.subtitle ? html`<span class="discover-bio">${hit.subtitle}</span>` : ''}
        ${hit.members != null ? html`<span class="list-empty">${t('discoverMembers', { count: hit.members })}</span>` : ''}
      </span>
    `;
    if (!hit.slug) {
      return html`<div class="discover-row">${body}</div>`;
    }
    return html`
      <button class="discover-row discover-main" type="button" data-action="open-house" data-house-slug="${hit.slug}" data-house-id="${hit.id}">
        ${body}
      </button>
    `;
  }
  return html`
    <button class="discover-row discover-main" type="button" data-action="open-conversation" data-conversation-id="${hit.id}">
      <span class="discover-copy">
        <strong>${hit.title || t('messages')}</strong>
        ${hit.summary ? html`<span class="discover-bio">${hit.summary}</span>` : ''}
      </span>
    </button>
  `;
}

function homeBody(home: DiscoverHomeState): SafeHtml {
  const suggestionText = home.suggestions == null
    ? t('listLoading')
    : home.suggestions === 0
      ? t('friendsEmpty')
      : t('friendsCount', { count: home.suggestions });
  const houses = home.houses;
  return html`
    <section class="discover-home-section" data-nav-contains="friends">
      <h3>${t('suggestions')}</h3>
      <p class="list-note">${t('peopleYouMayKnowHelp')}</p>
      <p class="list-empty">${suggestionText}</p>
      <h3>${t('peopleYouTalkTo')}</h3>
      <p class="list-note">${t('peopleYouTalkToHelp')}</p>
      ${home.talkPartners == null ? html`<p class="list-empty">${t('listLoading')}</p>` : ''}
      ${home.talkPartners && home.talkPartners.length === 0 ? html`<p class="list-empty">${t('peopleYouTalkToEmpty')}</p>` : ''}
      ${(home.talkPartners ?? []).map((user) => html`
        <div class="discover-row">
          <button class="discover-main" type="button" data-action="open-profile" data-user-id="${user.user_id}">
            ${avatarHtml(user, 48, 'sidebar-user-avatar')}
            <span class="discover-copy">
              <strong>${user.name || user.username}</strong>
              <span class="list-empty">@${user.username}</span>
            </span>
          </button>
        </div>
      `)}
    </section>
    <section class="discover-home-section" data-nav-contains="houses">
      <h3>${t('houses')}</h3>
      <p class="list-note">${t('housesHelp')}</p>
      ${houses == null ? html`<p class="list-empty">${t('listLoading')}</p>` : houses.length === 0 ? html`
        <p class="list-empty">${t('housesEmpty')}</p>
      ` : html`
        <div class="house-list">
          ${houses.map((house) => html`
            <button class="house-list-row" type="button" data-action="open-house" data-house-slug="${house.slug}" data-house-id="${house.id}">
              <span class="discover-copy">
                <strong>${house.name}</strong>
                <span class="list-empty">${t('houseMembers', { count: house.members })}</span>
              </span>
            </button>
          `)}
        </div>
      `}
    </section>
  `;
}

export function discoverView(
  query: string,
  tab: DiscoverTab,
  hits: SearchHit[] | null,
  loading: boolean,
  home: DiscoverHomeState | null = null,
): SafeHtml {
  const body = query
    ? (loading && !hits
      ? html`<p class="list-empty">${t('discoverSearching')}</p>`
      : !hits || hits.length === 0
        ? html`<p class="list-empty">${loading ? t('discoverSearching') : t('discoverNone')}</p>`
        : html`<div class="conversation-list">${hits.map((hit) => hitRow(hit))}</div>`)
    : home
      ? homeBody(home)
      : html`<p class="list-empty">${t('discoverPrompt')}</p>`;
  return html`
    <div class="list-page" data-page="discover">
      <div class="discover-search">
        <input id="discover-query" type="search" value="${query}" placeholder="${t('discoverPrompt')}" />
        ${query ? html`<button class="btn btn-secondary" type="button" data-action="discover-clear">${t('discoverCancel')}</button>` : ''}
      </div>
      ${query ? html`
        <div class="discover-tabs">
          ${TABS.map((item) => html`
            <button class="discover-tab ${item === tab ? 'active' : ''}" type="button" data-action="discover-tab" data-discover="${item}">${tabLabel(item)}</button>
          `)}
        </div>
      ` : ''}
      ${body}
    </div>
  `;
}
