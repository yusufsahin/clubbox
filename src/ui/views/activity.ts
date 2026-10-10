import { t } from '../../i18n';
import { html, type SafeHtml } from '../html';

export function activityView(count: number | null): SafeHtml {
  const body = count == null
    ? t('listLoading')
    : count === 0
      ? t('activityEmpty')
      : t('activityCount', { count });
  return html`
    <div class="list-page">
      <h2>${t('activity')}</h2>
      <p class="list-empty">${body}</p>
    </div>
  `;
}
