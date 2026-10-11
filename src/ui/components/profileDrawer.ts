import { t } from '../../i18n';
import type { MessageKey } from '../../i18n/en';
import { relationshipFromStatus, type Relationship } from '../../api/relationship';
import type { CHUser } from '../../api/types';
import { avatarHtml } from '../avatar';
import { html, markup, safeUrl, type SafeHtml } from '../html';

export interface ProfileDrawerState {
  profile: CHUser;
  canChangeRelationship: boolean;
  canInvite: boolean;
  loading: boolean;
  showVolume: boolean;
  remoteVolume: number;
  requestedFollowingCount: number | null;
  placeLabel: string;
  canMessage: boolean;
  voiceMode: boolean;
  privateLines: { text: string; voice: boolean }[];
  listEnabled: { followers: boolean; following: boolean; friends: boolean };
}

export function selfProfilePage(state: ProfileDrawerState): SafeHtml {
  const profile = state.profile;
  const sent = state.requestedFollowingCount;
  return html`
    <div class="profile-page">
      <button class="profile-back" type="button" data-action="close-self-profile">${t('backToSection', { section: state.placeLabel })}</button>
      <section class="profile-page-card">
        <div class="profile-page-hero">
          ${avatarHtml(profile, 96, 'profile-page-avatar')}
          <div>
            <h2 class="profile-page-name">${profile.name}</h2>
            ${aliasLine(profile.displayname, 'profile-page-alias')}
            <div class="profile-page-handle">@${profile.username}</div>
            ${state.loading ? html`<div class="profile-loading">${t('loadingProfile')}</div>` : ''}
          </div>
        </div>
        ${stats(profile, state.listEnabled)}
        ${bio(profile)}
        ${sent != null && sent > 0 ? html`
          <div class="profile-setting-row"><span>${t('sentFollowRequests')}</span><span>${sent}</span></div>
        ` : ''}
        <div class="profile-page-actions">
          ${shareButton(profile)}
          <button class="btn btn-primary" type="button" data-action="profile-settings">${t('accountSettings')}</button>
        </div>
      </section>
    </div>
  `;
}

export function paintPersonSheet(drawer: HTMLElement, state: ProfileDrawerState): void {
  const profile = state.profile;
  const relationship = relationshipFromStatus(profile.follow_status);
  const inRoom = state.showVolume || state.canInvite;
  drawer.innerHTML = markup(html`
    <div class="person-sheet-head">
      <div>
        <div class="person-sheet-kicker">${t('userProfile')}</div>
        <p class="person-sheet-note">${t('personSheetNote', { section: state.placeLabel })}</p>
      </div>
      <button class="modal-close-btn" type="button" data-action="close-profile">✕</button>
    </div>
    <div class="person-sheet-identity">
      ${avatarHtml(profile, 64, 'person-sheet-avatar')}
      <div>
        <div class="person-sheet-name">${profile.name}</div>
        ${aliasLine(profile.displayname, 'person-sheet-alias')}
        <div class="person-sheet-handle">@${profile.username}</div>
        ${state.loading ? html`<div class="profile-loading">${t('loadingProfile')}</div>` : ''}
      </div>
    </div>
    ${stats(profile, state.listEnabled)}
    ${bio(profile)}
    ${relationshipControl(relationship, state.canChangeRelationship)}
    ${inRoom ? html`
      <section class="person-sheet-room">
        <h3>${t('inThisRoom')}</h3>
        ${state.showVolume ? html`
          <div class="form-group">
            <label class="form-label" for="profile-vol-slider">${t('speakerVolume')}</label>
            <input type="range" id="profile-vol-slider" data-user-id="${profile.user_id}" min="0" max="1" step="0.05" value="${state.remoteVolume}" />
          </div>
        ` : ''}
        ${state.canInvite ? html`<button class="btn btn-secondary" type="button" data-action="profile-invite">${t('inviteToSpeak')}</button>` : ''}
      </section>
    ` : ''}
    ${state.canMessage ? html`
      <section class="person-sheet-room">
        <h3>${t('privateMessage')}</h3>
        <div class="thread-actions">
          <button class="btn btn-secondary ${state.voiceMode ? '' : 'is-active'}" type="button" data-action="private-mode" data-mode="text">${t('textMode')}</button>
          <button class="btn btn-secondary ${state.voiceMode ? 'is-active' : ''}" type="button" data-action="private-mode" data-mode="voice">${t('voiceMode')}</button>
        </div>
        ${state.voiceMode ? html`<p class="list-note">${t('voiceModeOn')}</p>` : ''}
        ${state.privateLines.map((line) => html`<div class="conversation-preview">${line.voice ? t('voicePreview') : line.text}</div>`)}
        ${state.voiceMode ? html`
          <button class="btn btn-primary" type="button" data-action="private-send" data-voice="1">${t('sendVoice')}</button>
        ` : html`
          <div class="thread-composer">
            <input class="form-input" id="private-message-input" placeholder="${t('chatPlaceholder')}" />
            <button class="btn btn-primary" type="button" data-action="private-send">${t('send')}</button>
          </div>
        `}
      </section>
    ` : ''}
  `);
  drawer.classList.add('open');
}

function stats(profile: CHUser, listEnabled: ProfileDrawerState['listEnabled']): SafeHtml {
  return html`
    <div class="profile-stats-row">
      ${statBox(profile.num_followers, t('followers'), listEnabled.followers ? 'followers' : null, profile.user_id)}
      ${statBox(profile.num_following, t('following'), listEnabled.following ? 'following' : null, profile.user_id)}
      ${statBox(profile.num_cofollows, t('profileFriends'), listEnabled.friends ? 'friends' : null, profile.user_id)}
    </div>
  `;
}

function bio(profile: CHUser): SafeHtml {
  if (!profile.bio) return html``;
  return html`<div class="profile-bio">${profile.bio}</div>`;
}

function statBox(value: number | undefined, label: string, list: 'followers' | 'following' | 'friends' | null, userId: number): SafeHtml {
  const body = html`
    <span class="stat-value">${value == null ? '—' : value}</span>
    <span class="stat-label">${label}</span>
  `;
  if (!list) return html`<div class="profile-stat-box">${body}</div>`;
  return html`
    <button class="profile-stat-box" type="button" data-action="open-people-list" data-list="${list}" data-user-id="${userId}">
      ${body}
    </button>
  `;
}

function aliasLine(displayname: string | null | undefined, className: string): SafeHtml {
  const alias = displayname?.trim();
  if (!alias) return html``;
  return html`<div class="${className}">${alias}</div>`;
}

function relationshipLabel(relationship: Relationship): MessageKey | null {
  if (relationship === 'none') return 'relationshipNone';
  if (relationship === 'following') return 'relationshipFollowing';
  if (relationship === 'follower') return 'followsYou';
  if (relationship === 'friends') return 'relationshipFriends';
  if (relationship === 'requested') return 'relationshipRequested';
  return null;
}

function relationshipControl(relationship: Relationship, canChange: boolean): SafeHtml {
  const key = relationshipLabel(relationship);
  if (!key) return html``;
  const label = t(key);
  if (canChange && (relationship === 'none' || relationship === 'follower')) {
    return html`<button class="btn btn-primary" type="button" data-action="toggle-follow">${label}</button>`;
  }
  return html`<div class="profile-relationship">${label}</div>`;
}

function shareButton(profile: CHUser): SafeHtml {
  const share = safeUrl(profile.share_url);
  if (!share) return html``;
  return html`<button class="btn btn-secondary" type="button" data-action="copy-profile-share">${t('shareProfile')}</button>`;
}
