import { t } from '../../i18n';
import { html, markup } from '../html';

export function mountSpeakerInvite(): void {
  if (document.getElementById('speaker-invite-overlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'speaker-invite-overlay';
  overlay.innerHTML = markup(html`
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="modal-title">${t('invitedToSpeakTitle')}</h3>
      </div>
      <p style="color:var(--text-muted); font-size:14px; margin-bottom:20px;">${t('invitedToSpeakBody')}</p>
      <div style="display:flex; justify-content:flex-end; gap:12px;">
        <button class="btn btn-secondary" data-action="decline-invite">${t('notNow')}</button>
        <button class="btn btn-primary" id="accept-speak-btn" data-action="accept-invite">${t('accept')}</button>
      </div>
    </div>
  `);
  document.body.appendChild(overlay);
}
