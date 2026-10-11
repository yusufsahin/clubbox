import type { PingCandidate } from '../../api/pingInvites';
import { t } from '../../i18n';
import { avatarHtml } from '../avatar';
import { html, markup, type SafeHtml } from '../html';

export type PingPanelState = {
  query: string;
  candidates: PingCandidate[];
  selectedIds: number[];
  loading: boolean;
};

export function pingPanelView(state: PingPanelState): SafeHtml {
  return html`
    <div class="modal-overlay" id="ping-panel-overlay" data-action="close-ping-panel">
      <div class="modal-content ping-panel" data-action="ping-panel-root">
        <div class="modal-header">
          <h3 class="modal-title">${t('invitePeople')}</h3>
          <button class="top-icon-btn" type="button" data-action="close-ping-panel" title="${t('close')}">✕</button>
        </div>
        <p class="list-note">${t('invitePeopleHelp')}</p>
        <div class="ping-search-row">
          <input class="form-input" id="ping-search-input" value="${state.query}" placeholder="${t('invitePeopleSearch')}" />
          <button class="btn btn-secondary" type="button" data-action="search-ping">${t('search')}</button>
        </div>
        ${state.loading ? html`<p class="list-empty">${t('listLoading')}</p>` : state.candidates.length === 0 ? html`
          <p class="list-empty">${t('invitePeopleEmpty')}</p>
        ` : html`
          <div class="ping-candidate-list">
            ${state.candidates.map((person) => {
              const checked = state.selectedIds.includes(person.userId);
              return html`
                <label class="ping-candidate-row">
                  <input type="checkbox" data-action="toggle-ping-select" data-user-id="${person.userId}" ${checked ? 'checked' : ''} />
                  ${avatarHtml({ name: person.name, photo_url: person.photoUrl || null, user_id: person.userId }, 36, 'ping-avatar')}
                  <span class="discover-copy">
                    <strong>${person.name}</strong>
                    ${person.username ? html`<span class="list-empty">@${person.username}</span>` : ''}
                  </span>
                </label>
              `;
            })}
          </div>
        `}
        <div class="modal-footer ping-panel-footer">
          <button class="btn btn-secondary" type="button" data-action="close-ping-panel">${t('cancel')}</button>
          <button class="btn btn-primary" type="button" data-action="send-pings" ${state.selectedIds.length === 0 ? 'disabled' : ''}>
            ${t('pingSelected', { count: state.selectedIds.length })}
          </button>
        </div>
      </div>
    </div>
  `;
}

export function mountPingPanel(state: PingPanelState): void {
  closePingPanel();
  const host = document.createElement('div');
  host.id = 'ping-panel-host';
  host.innerHTML = markup(pingPanelView(state));
  document.body.appendChild(host);
}

export function closePingPanel(): void {
  document.getElementById('ping-panel-host')?.remove();
}

export function refreshPingPanel(state: PingPanelState): void {
  const host = document.getElementById('ping-panel-host');
  if (!host) {
    mountPingPanel(state);
    return;
  }
  host.innerHTML = markup(pingPanelView(state));
}
