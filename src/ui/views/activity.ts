import type { ActivityItem } from '../../api/activityFeed';
import { t } from '../../i18n';
import { avatarHtml } from '../avatar';
import { html, type SafeHtml } from '../html';

export type ActivityViewState = {
  items: ActivityItem[] | null;
  unread: boolean;
  experimentalOn: boolean;
  notificationsSupported: boolean;
};

function formatRelative(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const deltaSec = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(deltaSec);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (abs < 60) return rtf.format(deltaSec, 'second');
  if (abs < 3600) return rtf.format(Math.round(deltaSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(deltaSec / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(deltaSec / 86400), 'day');
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function activityRow(item: ActivityItem): SafeHtml {
  return html`
    <div class="activity-row ${item.isPing ? 'is-ping' : ''}">
      <div class="activity-main">
        ${item.user ? avatarHtml(item.user, 40, 'activity-avatar') : html`<div class="activity-avatar activity-avatar-fallback">🔔</div>`}
        <div class="activity-copy">
          <div class="activity-message">${item.message}</div>
          <div class="activity-meta">
            ${item.time ? html`<span>${formatRelative(item.time)}</span>` : ''}
            ${item.source === 'notification' ? html`<span class="activity-source">${t('notifications')}</span>` : ''}
          </div>
        </div>
      </div>
      ${item.isPing && item.channel ? html`
        <button class="btn btn-primary" type="button" data-action="activity-join" data-channel-id="${item.channel}">${t('join')}</button>
      ` : item.user && item.user.user_id ? html`
        <button class="btn btn-secondary" type="button" data-action="open-profile" data-user-id="${item.user.user_id}" data-user-name="${item.user.name || ''}" data-username="${item.user.username || ''}">${t('viewProfile')}</button>
      ` : ''}
    </div>
  `;
}

export function activityView(state: ActivityViewState): SafeHtml {
  const items = state.items;
  return html`
    <div class="list-page activity-page">
      <header class="activity-header">
        <div>
          <h2>${t('activity')}</h2>
          <p class="list-note">${t('activityHelp')}</p>
        </div>
        <div class="activity-header-actions">
          ${state.unread ? html`<span class="activity-unread-badge">${t('activityUnread')}</span>` : ''}
          <button class="btn btn-secondary" type="button" data-action="refresh-activity">${t('refresh')}</button>
        </div>
      </header>

      ${!state.notificationsSupported ? html`
        <p class="list-note">${state.experimentalOn ? t('activityNotificationsUnavailable') : t('activityEnableExperimental')}</p>
      ` : ''}

      ${items == null ? html`<p class="list-empty">${t('listLoading')}</p>` : items.length === 0 ? html`
        <div class="activity-empty">
          <p class="list-empty">${t('activityEmpty')}</p>
          <button class="btn btn-secondary" type="button" data-action="refresh-activity">${t('refresh')}</button>
        </div>
      ` : html`
        <div class="activity-list">
          ${items.map((item) => activityRow(item))}
        </div>
      `}
    </div>
  `;
}
