import { t } from '../../i18n';
import { html, type SafeHtml } from '../html';

export function friendsView(count: number | null): SafeHtml {
  const body = count == null
    ? t('listLoading')
    : count === 0
      ? t('friendsEmpty')
      : t('friendsCount', { count });
  return html`
    <div class="list-page">
      <h2>${t('friends')}</h2>
      <p class="list-empty">${body}</p>
    </div>
  `;
}
