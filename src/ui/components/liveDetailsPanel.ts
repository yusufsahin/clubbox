import { t, type MessageKey } from '../../i18n';
import type { LiveDetailsModel, LiveDetailsRow } from '../../api/liveDetails.ts';
import { html, type SafeHtml } from '../html.ts';

function rowsBlock(titleKey: MessageKey, rows: LiveDetailsRow[]): SafeHtml {
  if (rows.length === 0) return html``;
  return html`
    <section class="room-details-card" data-live-details-section>
      <h4>${t(titleKey)}</h4>
      <dl class="live-details-list">
        ${rows.map((row) => html`
          <div class="live-details-row">
            <dt>${t(row.labelKey as MessageKey)}</dt>
            <dd>${row.value}</dd>
          </div>
        `)}
      </dl>
    </section>
  `;
}

export function liveDetailsPanel(model: LiveDetailsModel): SafeHtml {
  return html`
    <aside class="room-details-panel" data-live-details>
      <header class="room-details-header">
        <h3>${t('liveDetails')}</h3>
        <button class="btn btn-secondary" type="button" data-action="close-live-details">${t('close')}</button>
      </header>
      <p class="list-note"><strong>${model.title}</strong></p>
      ${rowsBlock('liveDetailsRoom', model.roomRows)}
      ${rowsBlock('liveDetailsLive', model.liveRows)}
      ${rowsBlock('liveDetailsState', model.stateRows)}
      ${model.capabilityRows.length ? html`
        <section class="room-details-card" data-live-details-section="capabilities">
          <h4>${t('liveDetailsYourPermissions')}</h4>
          <ul class="live-details-caps">
            ${model.capabilityRows.map((row) => html`<li>${t('liveDetailsCapability', { name: row.value })}</li>`)}
          </ul>
        </section>
      ` : ''}
    </aside>
  `;
}
