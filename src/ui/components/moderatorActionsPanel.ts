import type {
  HandraiseQueueOption,
  ModeratorActionItem,
} from '../../api/moderatorActions.ts';
import { queueRaisedLabel } from '../../api/moderatorActions.ts';
import type { CHUser } from '../../api/types.ts';
import { t } from '../../i18n';
import { avatarHtml } from '../avatar';
import { html, markup, type SafeHtml } from '../html';

export type ModeratorActionsTab = 'requests' | 'history';

export type ModeratorActionsPanelState = {
  tab: ModeratorActionsTab;
  canRequests: boolean;
  canHistory: boolean;
  canEditQueueMode: boolean;
  queueOptions: HandraiseQueueOption[];
  queueSetting: number | null;
  queueUsers: CHUser[];
  history: ModeratorActionItem[];
  historyCursor: string | null;
  loading: boolean;
};

export function moderatorActionsPanelView(state: ModeratorActionsPanelState): SafeHtml {
  const tab = state.tab === 'history' && state.canHistory
    ? 'history'
    : state.canRequests
      ? 'requests'
      : 'history';
  return html`
    <div class="modal-overlay" id="moderator-actions-overlay" data-action="close-moderator-actions">
      <div class="modal-content moderator-actions-panel" data-action="moderator-actions-root">
        <div class="modal-header">
          <h3 class="modal-title">${t('moderatorActions')}</h3>
          <button class="top-icon-btn" type="button" data-action="close-moderator-actions" title="${t('close')}">✕</button>
        </div>
        <div class="moderator-actions-tabs" role="tablist">
          ${state.canRequests ? html`
            <button
              class="btn ${tab === 'requests' ? 'btn-primary' : 'btn-secondary'}"
              type="button"
              role="tab"
              aria-selected="${tab === 'requests' ? 'true' : 'false'}"
              data-action="moderator-actions-tab"
              data-tab="requests"
            >${t('moderatorRequests')}</button>
          ` : ''}
          ${state.canHistory ? html`
            <button
              class="btn ${tab === 'history' ? 'btn-primary' : 'btn-secondary'}"
              type="button"
              role="tab"
              aria-selected="${tab === 'history' ? 'true' : 'false'}"
              data-action="moderator-actions-tab"
              data-tab="history"
            >${t('moderatorHistory')}</button>
          ` : ''}
        </div>
        ${tab === 'requests' ? requestsTab(state) : historyTab(state)}
      </div>
    </div>
  `;
}

function requestsTab(state: ModeratorActionsPanelState): SafeHtml {
  return html`
    <div class="moderator-actions-body" data-moderator-tab="requests">
      ${state.canEditQueueMode && state.queueOptions.length > 0 ? html`
        <label class="form-label" for="handraise-queue-setting">${t('handRaiseQueueMode')}</label>
        <select
          class="form-input"
          id="handraise-queue-setting"
          data-action="set-handraise-queue-setting"
          aria-label="${t('handRaiseQueueMode')}"
        >
          ${state.queueOptions.map((opt) => html`
            <option value="${opt.value}" ${state.queueSetting === opt.value ? 'selected' : ''}>
              ${opt.label}${opt.sub_label ? ` — ${opt.sub_label}` : ''}
            </option>
          `)}
        </select>
      ` : ''}
      ${state.loading ? html`<p class="list-empty">${t('listLoading')}</p>` : ''}
      ${!state.loading && state.queueUsers.length === 0
        ? html`<p class="list-empty">${t('handRaiseQueueEmpty')}</p>`
        : html`
          <ul class="moderator-queue-list">
            ${state.queueUsers.map((user) => {
              const raised = queueRaisedLabel(user);
              return html`
                <li class="moderator-queue-row">
                  ${avatarHtml(user, 40, 'moderator-queue-avatar')}
                  <span class="discover-copy">
                    <strong>${user.name || user.username || user.user_id}</strong>
                    ${raised ? html`<span class="list-empty">${raised}</span>` : ''}
                  </span>
                  <button
                    class="btn btn-secondary"
                    type="button"
                    data-action="invite-stage"
                    data-user-id="${user.user_id}"
                  >${t('inviteToStage')}</button>
                </li>
              `;
            })}
          </ul>
        `}
    </div>
  `;
}

function historyTab(state: ModeratorActionsPanelState): SafeHtml {
  return html`
    <div class="moderator-actions-body" data-moderator-tab="history">
      ${state.loading ? html`<p class="list-empty">${t('listLoading')}</p>` : ''}
      ${!state.loading && state.history.length === 0
        ? html`<p class="list-empty">${t('moderatorHistoryEmpty')}</p>`
        : html`
          <ul class="moderator-history-list">
            ${state.history.map((item) => html`
              <li class="moderator-history-row">
                <div class="moderator-history-main">
                  <strong>${item.action}</strong>
                  <span>${item.actorName}${item.targetName ? ` → ${item.targetName}` : ''}</span>
                </div>
                ${item.timeLabel ? html`<span class="list-empty">${item.timeLabel}</span>` : ''}
              </li>
            `)}
          </ul>
        `}
      ${state.historyCursor ? html`
        <button class="btn btn-secondary" type="button" data-action="load-more-moderator-history">
          ${t('loadMore')}
        </button>
      ` : ''}
    </div>
  `;
}

export function mountModeratorActionsPanel(state: ModeratorActionsPanelState): void {
  closeModeratorActionsPanel();
  const host = document.createElement('div');
  host.id = 'moderator-actions-host';
  host.innerHTML = markup(moderatorActionsPanelView(state));
  document.body.appendChild(host);
}

export function closeModeratorActionsPanel(): void {
  document.getElementById('moderator-actions-host')?.remove();
}

export function refreshModeratorActionsPanel(state: ModeratorActionsPanelState): void {
  const host = document.getElementById('moderator-actions-host');
  if (!host) {
    mountModeratorActionsPanel(state);
    return;
  }
  host.innerHTML = markup(moderatorActionsPanelView(state));
}

export function isModeratorActionsPanelOpen(): boolean {
  return !!document.getElementById('moderator-actions-host');
}
