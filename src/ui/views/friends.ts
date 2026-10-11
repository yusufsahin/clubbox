import { t } from '../../i18n';
import type { CHUser } from '../../api/types';
import { avatarHtml } from '../avatar';
import { html, type SafeHtml } from '../html';

export function friendsView(suggestions: number | null, people: CHUser[] | null): SafeHtml {
  const suggestionText = suggestions == null
    ? t('listLoading')
    : suggestions === 0
      ? t('friendsEmpty')
      : t('friendsCount', { count: suggestions });
  return html`
    <div class="list-page">
      <h2>${t('peopleYouTalkTo')}</h2>
      <p class="list-note">${t('peopleYouTalkToHelp')}</p>
      ${people == null ? html`<p class="list-empty">${t('listLoading')}</p>` : ''}
      ${people && people.length === 0 ? html`<p class="list-empty">${t('peopleYouTalkToEmpty')}</p>` : ''}
      ${(people ?? []).map((user) => html`
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
      <h2 class="friends-suggestions">${t('suggestions')}</h2>
      <p class="list-empty">${suggestionText}</p>
    </div>
  `;
}
