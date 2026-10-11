import type { HouseListItem } from '../../api/communityLists';
import { t } from '../../i18n';
import { html, safeUrl, type SafeHtml } from '../html';

export type HousesViewState = {
  items: HouseListItem[] | null;
  open: HouseListItem | null;
  canHost: boolean;
};

function housePhoto(url: string): SafeHtml | string {
  const photo = safeUrl(url);
  if (!photo) return html`<div class="house-list-avatar" aria-hidden="true">🏛</div>`;
  return html`<img class="house-list-avatar" src="${photo}" alt="" width="48" height="48" />`;
}

export function housesView(state: HousesViewState): SafeHtml {
  const items = state.items;
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
            <button class="btn btn-secondary" type="button" data-action="open-house-members" data-house-id="${state.open.id}" data-house-slug="${state.open.slug}">${t('houseViewMembers')}</button>
            ${state.canHost ? html`
              <button class="btn btn-primary" type="button" data-action="host-house-room" data-house-id="${state.open.id}" data-house-slug="${state.open.slug}">${t('hostInHouse')}</button>
            ` : ''}
          </div>
        </section>
      ` : ''}
    </div>
  `;
}
