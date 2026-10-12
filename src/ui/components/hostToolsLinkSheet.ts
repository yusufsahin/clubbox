import { t, type MessageKey } from '../../i18n';
import { html, type SafeHtml } from '../html.ts';

export type HostToolsLinkSheetState = {
  open: boolean;
  /** True when main has no remembered phone — one-time national number field. */
  needPhone: boolean;
  busy: boolean;
  errorKey: MessageKey | null;
};

export function hostToolsLinkSheet(state: HostToolsLinkSheetState): SafeHtml {
  if (!state.open) return html``;
  return html`
    <div class="host-tools-link-sheet" data-host-tools-link-sheet role="dialog" aria-modal="true" aria-labelledby="host-tools-link-title">
      <div class="host-tools-link-sheet-panel">
        <h2 id="host-tools-link-title">${t('hostToolsLinkTitle')}</h2>
        <p class="list-note">${t('hostToolsLinkHelp')}</p>
        ${state.needPhone ? html`
          <label class="host-tools-link-label" for="host-tools-phone">${t('phoneNumber')}</label>
          <input
            id="host-tools-phone"
            class="host-tools-link-input"
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            data-host-tools-phone
            ${state.busy ? 'disabled' : ''}
          />
        ` : ''}
        <label class="host-tools-link-label" for="host-tools-code">${t('hostToolsLinkCode')}</label>
        <input
          id="host-tools-code"
          class="host-tools-link-input"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="8"
          data-host-tools-code
          ${state.busy ? 'disabled' : ''}
        />
        ${state.errorKey ? html`<p class="list-note host-tools-link-error" role="alert">${t(state.errorKey)}</p>` : ''}
        <div class="host-tools-link-actions">
          <button type="button" class="btn btn-secondary" data-action="host-tools-link-cancel" ${state.busy ? 'disabled' : ''}>${t('cancel')}</button>
          <button type="button" class="btn btn-secondary" data-action="host-tools-link-resend" ${state.busy ? 'disabled' : ''}>${t('hostToolsLinkResend')}</button>
          <button type="button" class="btn btn-primary" data-action="host-tools-link-submit" ${state.busy ? 'disabled' : ''}>${t('hostToolsLinkSubmit')}</button>
        </div>
      </div>
    </div>
  `;
}
