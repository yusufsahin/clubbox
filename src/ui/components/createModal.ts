import type { CreateAudience, CreateChannelTargets } from '../../api/createComposer';
import {
  capabilityForAudience,
  composerPrivacyOptions,
  createDefaults,
  showAutomaticSpeakerApproval,
  showTopicPicker,
} from '../../api/createComposer';
import { t } from '../../i18n';
import { html, markup, safeUrl } from '../html';

export type CreateModalConfig = {
  titleSuggestions: string[];
  targets: CreateChannelTargets | null;
};

type RoomTypeChoice =
  | { kind: 'audience'; audience: CreateAudience; label: string }
  | { kind: 'house'; audience: 'house'; clubId: number; label: string; photo: string | null; access: string };

function roomTypeChoices(targets: CreateChannelTargets | null): RoomTypeChoice[] {
  const audiences = composerPrivacyOptions(targets ?? {});
  const out: RoomTypeChoice[] = [];
  for (const audience of audiences) {
    if (audience === 'house') continue;
    if (audience === 'public') out.push({ kind: 'audience', audience, label: t('roomTypePublic') });
    else if (audience === 'friends-of-friends') out.push({ kind: 'audience', audience, label: t('roomTypeFof') });
    else if (audience === 'friends') out.push({ kind: 'audience', audience, label: t('roomTypeFriends') });
    else if (audience === 'social') out.push({ kind: 'audience', audience, label: t('privacySocial') });
    else if (audience === 'closed') out.push({ kind: 'audience', audience, label: t('privacyPrivate') });
  }
  const clubs = (targets?.clubs ?? []).filter(
    (club) => typeof club.social_club_id === 'number' && typeof club.name === 'string',
  );
  if (audiences.includes('house')) {
    for (const club of clubs) {
      const open = club.is_open_to_anyone !== false && club.access_label !== 'members';
      out.push({
        kind: 'house',
        audience: 'house',
        clubId: club.social_club_id as number,
        label: club.name as string,
        photo: typeof club.photo_url === 'string' ? club.photo_url : null,
        access: open ? t('houseAccessAnyone') : t('houseAccessMembers'),
      });
    }
  }
  return out;
}

export function mountCreateModal(config: CreateModalConfig): HTMLElement {
  const choices = roomTypeChoices(config.targets);
  const initial = choices[0];
  const initialAudience: CreateAudience = initial?.audience ?? 'public';
  const defaults = createDefaults(config.targets, initialAudience);
  const initialCap = capabilityForAudience(config.targets, initialAudience);
  const showReplays = initialCap?.is_replay_available !== false;
  const showTopics = showTopicPicker(config.targets, initialAudience);
  const showAutoApprove = showAutomaticSpeakerApproval(config.targets, initialAudience);
  const topicChoices = (config.targets?.topics ?? []).filter(
    (topic) => typeof (topic.topic_id ?? topic.id) === 'number'
      && typeof (topic.name ?? topic.title) === 'string',
  );

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'create-modal-overlay';
  overlay.innerHTML = markup(html`
    <div class="modal-content create-modal-simple" data-create-composer>
      <div class="modal-header">
        <h3 class="modal-title">${t('startRoomTitle')}</h3>
        <button class="modal-close-btn" data-action="close-create">✕</button>
      </div>

      <div class="form-group">
        <label class="form-label" for="new-room-topic">${t('roomTopic')}</label>
        <input class="form-input" id="new-room-topic" data-create-title placeholder="${t('roomTopic')}" />
        ${config.titleSuggestions.length > 0 ? html`
          <div class="topic-chips room-title-ideas">
            ${config.titleSuggestions.map((title) => html`<button class="topic-chip" type="button" data-action="pick-room-title" data-title="${title}">${title}</button>`)}
          </div>
        ` : ''}
      </div>

      <div class="form-group" data-room-type-list>
        <label class="form-label">${t('roomType')}</label>
        <div class="room-type-list" role="listbox" aria-label="${t('roomType')}">
          ${choices.map((choice, index) => {
            const value = choice.kind === 'house' ? `house:${choice.clubId}` : choice.audience;
            const checked = index === 0 ? 'checked' : '';
            const photo = choice.kind === 'house' && choice.photo ? safeUrl(choice.photo) : null;
            return html`
              <label class="room-type-row" data-room-type="${value}">
                <input type="radio" name="new-room-type" value="${value}" ${checked} />
                ${photo ? html`<img class="room-type-photo" src="${photo}" alt="" width="36" height="36" />` : html`<span class="room-type-icon" aria-hidden="true">🎙️</span>`}
                <span class="room-type-copy">
                  <strong>${choice.label}</strong>
                  ${choice.kind === 'house' ? html`<span class="list-empty">${choice.access}</span>` : ''}
                </span>
              </label>
            `;
          })}
        </div>
        <input type="hidden" id="new-room-privacy" value="${initialAudience}" />
        <input type="hidden" id="new-room-house" value="${initial?.kind === 'house' ? String(initial.clubId) : ''}" />
      </div>

      <details class="create-more-options" data-more-options open>
        <summary>${t('moreOptions')}</summary>
        ${showReplays ? html`
          <div class="form-group" id="new-room-replays-group">
            <label class="form-label create-replay-toggle">
              <input type="checkbox" id="new-room-disable-replay" ${defaults.replayEnabled ? '' : 'checked'} />
              <span>
                <strong>${t('disableReplay')}</strong>
                <span class="list-note" style="display:block; font-weight:400; margin-top:4px;">${t('replaysAtCreateHelp')}</span>
              </span>
            </label>
            <input type="hidden" id="new-room-replays" value="${defaults.replayEnabled ? '1' : '0'}" />
          </div>
        ` : html`
          <p class="list-note" id="new-room-replays-unavailable">${t('replaysUnavailableAtCreate')}</p>
        `}

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
      </details>

      <button class="btn btn-primary create-go-live" type="button" data-action="confirm-create">${t('goLive')}</button>
    </div>
  `);

  const privacyHidden = overlay.querySelector('#new-room-privacy') as HTMLInputElement;
  const houseHidden = overlay.querySelector('#new-room-house') as HTMLInputElement;
  const replaysHidden = overlay.querySelector('#new-room-replays') as HTMLInputElement | null;
  const disableReplay = overlay.querySelector('#new-room-disable-replay') as HTMLInputElement | null;
  overlay.querySelectorAll('input[name="new-room-type"]').forEach((input) => {
    input.addEventListener('change', () => {
      const value = (input as HTMLInputElement).value;
      if (value.startsWith('house:')) {
        privacyHidden.value = 'house';
        houseHidden.value = value.slice('house:'.length);
      } else {
        privacyHidden.value = value;
        houseHidden.value = '';
      }
    });
  });
  disableReplay?.addEventListener('change', () => {
    if (replaysHidden) replaysHidden.value = disableReplay.checked ? '0' : '1';
  });

  const topicInput = overlay.querySelector('#new-room-topic') as HTMLInputElement | null;
  topicInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const btn = overlay.querySelector('[data-action="confirm-create"]') as HTMLButtonElement | null;
      btn?.click();
    }
  });

  return overlay;
}
