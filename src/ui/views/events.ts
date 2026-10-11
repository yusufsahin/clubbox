import type { EventListItem } from '../../api/communityLists';
import { t } from '../../i18n';
import { html, safeUrl, type SafeHtml } from '../html';

export type EventsViewState = {
  items: EventListItem[] | null;
  experimentalOn: boolean;
  supported: boolean;
};

function formatWhen(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function eventsView(state: EventsViewState): SafeHtml {
  const items = state.items;
  return html`
    <div class="list-page events-page">
      <header class="activity-header">
        <div>
          <h2>${t('events')}</h2>
          <p class="list-note">${t('eventsHelp')}</p>
        </div>
        <button class="btn btn-secondary" type="button" data-action="refresh-events">${t('refresh')}</button>
      </header>

      ${!state.supported ? html`
        <p class="list-note">${state.experimentalOn ? t('eventsUnavailable') : t('activityEnableExperimental')}</p>
      ` : ''}

      ${items == null ? html`<p class="list-empty">${t('listLoading')}</p>` : items.length === 0 ? html`
        <p class="list-empty">${t('eventsEmpty')}</p>
      ` : html`
        <div class="event-list">
          ${items.map((event) => html`
            <div class="event-row">
              <div class="event-copy">
                <div class="conversation-title">${event.title}</div>
                <div class="conversation-meta">${formatWhen(event.timeStart)}${event.houseName ? html` · ${event.houseName}` : ''}</div>
              </div>
              <div class="event-actions">
                ${safeUrl(event.url) ? html`
                  <button class="btn btn-secondary" type="button" data-action="copy-event-link" data-event-url="${event.url}">${t('copyLink')}</button>
                ` : ''}
                <button
                  class="btn btn-secondary"
                  type="button"
                  data-action="add-event-calendar"
                  data-event-id="${event.id}"
                  data-event-title="${event.title}"
                  data-event-start="${event.timeStart}"
                  data-event-end="${event.timeEnd}"
                  data-event-url="${event.url}"
                  data-event-house="${event.houseName}"
                >${t('addToCalendar')}</button>
              </div>
            </div>
          `)}
        </div>
      `}
    </div>
  `;
}
