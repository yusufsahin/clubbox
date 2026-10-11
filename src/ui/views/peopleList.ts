import { t } from '../../i18n';
import type { PeopleListKind } from '../../api/relationship';
import type { CHUser } from '../../api/types';
import { avatarHtml } from '../avatar';
import { html, type SafeHtml } from '../html';

export function peopleListTitle(kind: PeopleListKind): string {
  if (kind === 'followers') return t('followers');
  if (kind === 'following') return t('following');
  if (kind === 'friends') return t('profileFriends');
  if (kind === 'mutual_follows') return t('mutualFollows');
  return t('mutualFriends');
}

export function peopleListView(state: {
  kind: PeopleListKind;
  users: CHUser[] | null;
  nextCursor: string | null;
  loadingMore: boolean;
  unavailable?: boolean;
  moreNotShown?: number;
}): SafeHtml {
  if (state.unavailable) {
    return html`
      <div class="list-page people-list" data-people-list-unavailable>
        <button class="profile-back" type="button" data-action="close-people-list">${t('backToProfile')}</button>
        <h2>${peopleListTitle(state.kind)}</h2>
        <p class="list-empty" data-list-unavailable>${t('listsUnavailableWeb')}</p>
      </div>
    `;
  }
  const users = state.users;
  const more = typeof state.moreNotShown === 'number' && state.moreNotShown > 0
    ? state.moreNotShown
    : 0;
  return html`
    <div class="list-page people-list">
      <button class="profile-back" type="button" data-action="close-people-list">${t('backToProfile')}</button>
      <h2>${peopleListTitle(state.kind)}</h2>
      ${users == null ? html`<p class="list-empty">${t('listLoading')}</p>` : ''}
      ${users && users.length === 0 ? html`<p class="list-empty">${t('peopleListEmpty')}</p>` : ''}
      ${(users ?? []).map((user) => html`
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
      ${more > 0 ? html`<p class="list-note" data-mutual-more>${t('mutualMoreNotShown', { count: more })}</p>` : ''}
      ${state.nextCursor ? html`
        <button class="btn btn-secondary" type="button" data-action="people-list-more" ${state.loadingMore ? 'disabled' : ''}>${t('peopleListMore')}</button>
      ` : ''}
    </div>
  `;
}
