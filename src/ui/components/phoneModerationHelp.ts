import { t } from '../../i18n';
import { html, type SafeHtml } from '../html';

/** Shared help for Settings › Help and the room “Learn more” sheet (Phase 30.3). */
export function phoneModerationHelpCard(): SafeHtml {
  return html`
    <div class="phone-mod-help" data-phone-moderation-help>
      <h3 class="phone-mod-help-title">${t('phoneModHelpTitle')}</h3>
      <p class="list-note">${t('phoneModHelpIntro')}</p>
      <ol class="phone-mod-help-list">
        <li>${t('phoneModHelpOptionPhone')}</li>
        <li>${t('phoneModHelpOptionCohost')}</li>
      </ol>
      <p class="list-note">${t('phoneModHelpOpenOnPhone')}</p>
    </div>
  `;
}

export type PhoneModerationHelpSheetState = {
  roomUrl: string;
};

export function phoneModerationHelpSheet(state: PhoneModerationHelpSheetState): SafeHtml {
  return html`
    <div class="modal-overlay" id="phone-moderation-help-overlay" data-phone-moderation-help-sheet role="dialog" aria-modal="true" aria-labelledby="phone-mod-help-sheet-title">
      <div class="modal-content phone-mod-help-sheet">
        <div class="modal-header">
          <h3 class="modal-title" id="phone-mod-help-sheet-title">${t('phoneModHelpTitle')}</h3>
          <button class="top-icon-btn" type="button" data-action="close-phone-moderation-help" title="${t('close')}" aria-label="${t('close')}">✕</button>
        </div>
        ${phoneModerationHelpCard()}
        ${state.roomUrl ? html`
          <div class="phone-mod-help-actions">
            <button class="btn btn-primary" type="button" data-action="open-on-phone" data-room-url="${state.roomUrl}">${t('openOnPhone')}</button>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}
