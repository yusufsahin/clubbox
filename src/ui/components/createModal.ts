import type { CreateAudience, CreateChannelTargets } from '../../api/createComposer';
import {
  capabilityForAudience,
  composerPrivacyOptions,
  createDefaults,
  showAutomaticSpeakerApproval,
  showTopicPicker,
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
  const showTopics = showTopicPicker(config.targets, initialAudience);
  const showAutoApprove = showAutomaticSpeakerApproval(config.targets, initialAudience);
  const topicChoices = (config.targets?.topics ?? []).filter(
    (topic) => typeof (topic.topic_id ?? topic.id) === 'number'
      && typeof (topic.name ?? topic.title) === 'string',
  );
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

      ${initialCap?.is_handraise_available === true ? html`
        <div class="form-group" id="new-room-handraise-group">
          <label class="form-label" for="new-room-handraise">${t('handraiseAtCreate')}</label>
          <select class="form-input" id="new-room-handraise">
            <option value="1">${t('handraiseEveryone')}</option>
            <option value="2">${t('handraiseFriendsOfSpeakers')}</option>
          </select>
        </div>
      ` : ''}

      ${initialCap?.is_pinned_links_available === true ? html`
        <div class="form-group" id="new-room-link-group">
          <label class="form-label" for="new-room-link">${t('pinnedLinkAtCreate')}</label>
          <input class="form-input" id="new-room-link" type="url" placeholder="${t('pinnedLinkPlaceholder')}" />
        </div>
      ` : ''}

      ${showTopics && topicChoices.length > 0 ? html`
        <div class="form-group" id="new-room-topics-group">
          <label class="form-label">${t('topicsAtCreate')}</label>
          <div class="topic-chips" id="new-room-topics">
            ${topicChoices.map((topic) => {
              const id = topic.topic_id ?? topic.id;
              const label = topic.name ?? topic.title ?? '';
              return html`<label class="topic-chip"><input type="checkbox" name="new-room-topic-id" value="${id}" /> ${label}</label>`;
            })}
          </div>
        </div>
      ` : ''}

      ${showAutoApprove ? html`
        <div class="form-group" id="new-room-auto-approve-group">
          <label class="form-label">
            <input type="checkbox" id="new-room-auto-approve" />
            ${t('approveSpeakersAutomatically')}
          </label>
        </div>
      ` : ''}

      <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:24px;">
        <button class="btn btn-secondary" data-action="close-create">${t('cancel')}</button>
        <button class="btn btn-primary" data-action="confirm-create">${t('goLive')}</button>
      </div>
    </div>
  `);
  return overlay;
}
