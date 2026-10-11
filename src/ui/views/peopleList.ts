import { t } from '../../i18n';
import type { PeopleListKind } from '../../api/relationship';
import type { CHUser } from '../../api/types';
import { avatarHtml } from '../avatar';
import { html, type SafeHtml } from '../html';

export function peopleListTitle(kind: PeopleListKind): string {
  if (kind === 'followers') return t('followers');
  return t('following');
}

export function peopleListView(state: {
  kind: PeopleListKind;
  users: CHUser[] | null;
  nextCursor: string | null;
  loadingMore: boolean;
}): SafeHtml {
  const users = state.users;
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
      ${state.nextCursor ? html`
        <button class="btn btn-secondary" type="button" data-action="people-list-more" ${state.loadingMore ? 'disabled' : ''}>${t('peopleListMore')}</button>
      ` : ''}
    </div>
  `;
}
