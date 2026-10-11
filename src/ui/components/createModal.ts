import type { CreateAudience, CreateChannelTargets } from '../../api/createComposer';
import {
  capabilityForAudience,
  composerPrivacyOptions,
  createDefaults,
} from '../../api/createComposer';
import { t } from '../../i18n';
import { html, markup } from '../html';

export type CreateModalConfig = {
  titleSuggestions: string[];
  targets: CreateChannelTargets | null;
};

function privacyLabel(audience: CreateAudience): string {
  if (audience === 'social') return t('privacySocial');
  if (audience === 'friends') return t('privacyFriends');
  if (audience === 'friends-of-friends') return t('privacyFof');
  if (audience === 'closed') return t('privacyPrivate');
  if (audience === 'house') return t('privacyHouse');
  return t('privacyPublic');
}

export function mountCreateModal(config: CreateModalConfig): HTMLElement {
  const audiences = composerPrivacyOptions(config.targets ?? {});
  const initialAudience = audiences[0] ?? 'public';
  const defaults = createDefaults(config.targets, initialAudience);
  const initialCap = capabilityForAudience(config.targets, initialAudience);
  const showReplays = initialCap?.is_replay_available === true;
  const clubs = (config.targets?.clubs ?? []).filter(
    (club) => typeof club.social_club_id === 'number' && typeof club.name === 'string',
  );

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
        ${config.titleSuggestions.length > 0 ? html`
          <div class="topic-chips room-title-ideas">
            ${config.titleSuggestions.map((title) => html`<button class="topic-chip" type="button" data-action="pick-room-title" data-title="${title}">${title}</button>`)}
          </div>
        ` : ''}
      </div>

      <div class="form-group">
        <label class="form-label">${t('roomPrivacy')}</label>
        <select class="form-input" id="new-room-privacy">
          ${audiences.map((audience) => html`<option value="${audience}">${privacyLabel(audience)}</option>`)}
        </select>
        <p class="list-note">${t('createAudienceNote')}</p>
      </div>

      ${audiences.includes('house') && clubs.length > 0 ? html`
        <div class="form-group" id="new-room-house-group">
          <label class="form-label">${t('privacyHouse')}</label>
          <select class="form-input" id="new-room-house">
            ${clubs.map((club) => html`<option value="${club.social_club_id}">${club.name}</option>`)}
          </select>
        </div>
      ` : ''}

      ${showReplays ? html`
        <div class="form-group" id="new-room-replays-group">
          <label class="form-label">
            <input type="checkbox" id="new-room-replays" ${defaults.replayEnabled ? 'checked' : ''} />
            ${t('replaysAtCreate')}
          </label>
          <p class="list-note">${t('replaysAtCreateHelp')}</p>
        </div>
      ` : ''}

      <div class="form-group">
        <label class="form-label">
          <input type="checkbox" id="new-room-chat" ${defaults.chatEnabled ? 'checked' : ''} />
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
