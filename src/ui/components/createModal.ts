import { t } from '../../i18n';
import { html, markup } from '../html';

export function mountCreateModal(titles: string[]): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'create-modal-overlay';
  overlay.innerHTML = markup(html`
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="modal-title">${t('startRoomTitle')}</h3>
        <button class="modal-close-btn" data-action="close-create">✕</button>
      </div>

      <div class="form-group">
        <label class="form-label">${t('roomTopic')}</label>
        <input class="form-input" id="new-room-topic" placeholder="e.g. 🎧 Sound Design Workshop & Live AMA" />
        ${titles.length > 0 ? html`
          <div class="topic-chips room-title-ideas">
            ${titles.map((title) => html`<button class="topic-chip" type="button" data-action="pick-room-title" data-title="${title}">${title}</button>`)}
          </div>
        ` : ''}
      </div>

      <div class="form-group">
        <label class="form-label">${t('roomPrivacy')}</label>
        <select class="form-input" id="new-room-privacy">
          <option value="public">${t('privacyPublic')}</option>
          <option value="friends">${t('privacyFriends')}</option>
          <option value="friends-of-friends">${t('privacyFof')}</option>
          <option value="house">${t('privacyHouse')}</option>
        </select>
        <p class="list-note">${t('createAudienceNote')}</p>
      </div>

      <div class="form-group">
        <label class="form-label">
          <input type="checkbox" id="new-room-replays" checked />
          ${t('replaysAtCreate')}
        </label>
        <p class="list-note">${t('replaysAtCreateHelp')}</p>
      </div>

      <div class="form-group">
        <label class="form-label">
          <input type="checkbox" id="new-room-chat" checked />
          ${t('chatAtCreate')}
        </label>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:24px;">
        <button class="btn btn-secondary" data-action="close-create">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="confirm-create">${t('goLive')}</button>
      </div>
    </div>
  `);
  return overlay;
}
