import { t } from '../../i18n';
import { html, type SafeHtml } from '../html';

export type OpenOnPhoneSheetState = {
  roomUrl: string;
  qrDataUrl: string | null;
  qrPending: boolean;
};

export function openOnPhoneSheet(state: OpenOnPhoneSheetState): SafeHtml {
  return html`
    <div class="modal-overlay" id="open-on-phone-overlay" data-open-on-phone-sheet role="dialog" aria-modal="true" aria-labelledby="open-on-phone-title">
      <div class="modal-content open-on-phone-sheet">
        <div class="modal-header">
          <h3 class="modal-title" id="open-on-phone-title">${t('openOnPhone')}</h3>
          <button class="top-icon-btn" type="button" data-action="close-open-on-phone" title="${t('close')}" aria-label="${t('close')}">✕</button>
        </div>
        <p class="list-note">${t('openOnPhoneHelp')}</p>
        <label class="form-label" for="open-on-phone-url">${t('openOnPhoneLink')}</label>
        <div class="open-on-phone-url-row">
          <input class="form-input" id="open-on-phone-url" type="text" readonly value="${state.roomUrl}" data-open-on-phone-url />
          <button class="btn btn-secondary" type="button" data-action="copy-open-on-phone-link" ${state.roomUrl ? '' : 'disabled'}>${t('copyLink')}</button>
        </div>
        <div class="open-on-phone-qr" data-open-on-phone-qr>
          ${state.qrDataUrl ? html`
            <img class="open-on-phone-qr-img" src="${state.qrDataUrl}" alt="${t('openOnPhoneQrAlt')}" width="168" height="168" />
          ` : state.qrPending ? html`
            <p class="list-note">${t('openOnPhoneQrLoading')}</p>
          ` : html`
            <p class="list-note">${t('openOnPhoneQrUnavailable')}</p>
          `}
        </div>
      </div>
    </div>
  `;
}
