import { t } from '../../i18n';
import { followControlLabel, mutualParts, shouldOfferFollowBack } from '../../api/relationship';
import type { CHUser } from '../../api/types';
import { avatarHtml } from '../avatar';
import { html, markup, safeUrl, type SafeHtml } from '../html';

export interface ProfileDrawerState {
  profile: CHUser;
  canChangeRelationship: boolean;
  canInvite: boolean;
  /** When canInvite is true but host tools are out of scope. */
  hostToolsCallable?: boolean;
  loading: boolean;
  showVolume: boolean;
  remoteVolume: number;
  requestedFollowingCount: number | null;
  placeLabel: string;
  /** In-room private chat composer (RL-9). */
  canMessage: boolean;
  /** Global DM via Messages (can_dm). */
  canDm: boolean;
  canWave: boolean;
  voiceMode: boolean;
  privateLines: { text: string; voice: boolean }[];
  listEnabled: { followers: boolean; following: boolean };
  /** Hallway room the person is in, if known. */
  inRoomNow: { title: string; channel: string } | null;
  isSelf: boolean;
  isPrivateLocked: boolean;
}

export function selfProfilePage(state: ProfileDrawerState): SafeHtml {
  const profile = state.profile;
  const sent = state.requestedFollowingCount;
  return html`
    <div class="profile-page" data-profile="self">
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
        ${stats(profile, state.listEnabled, true)}
        ${bio(profile)}
        ${housesSection(profile)}
        ${recentlyChatting(profile)}
        ${sent != null && sent > 0 ? html`
          <div class="profile-setting-row"><span>${t('sentFollowRequests')}</span><span>${sent}</span></div>
        ` : ''}
        <div class="profile-page-actions">
          ${shareButton(profile)}
          <button class="btn btn-primary" type="button" data-action="profile-settings">${t('accountSettings')}</button>
        </div>
        <p class="list-note" data-profile-web-limit>${t('profileWebOnlyNote')}</p>
      </section>
    </div>
  `;
}

export function paintPersonSheet(drawer: HTMLElement, state: ProfileDrawerState): void {
  const profile = state.profile;
  const inRoom = state.showVolume || state.canInvite;
  const followLabel = followControlLabel(profile);
  const followClickable = state.canChangeRelationship
    && (followLabel === 'Follow' || followLabel === 'Follow back' || followLabel === 'Request');
  drawer.innerHTML = markup(html`
    <div class="person-sheet" data-profile="other">
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
          ${state.isPrivateLocked ? html`<p class="list-note" data-private-profile>${t('privateProfile')}</p>` : ''}
        </div>
      </div>
      ${stats(profile, state.listEnabled, false)}
      ${actionRow(profile, state, followLabel, followClickable)}
      ${state.isPrivateLocked ? '' : html`
        ${mutualBlock(profile)}
        ${bio(profile)}
        ${housesSection(profile)}
        ${recentlyChatting(profile)}
        ${socialLinks(profile)}
        ${inRoomNow(state)}
      `}
      ${inRoom ? html`
        <section class="person-sheet-room">
          <h3>${t('inThisRoom')}</h3>
          ${state.showVolume ? html`
            <div class="form-group">
              <label class="form-label" for="profile-vol-slider">${t('speakerVolume')}</label>
              <input type="range" id="profile-vol-slider" data-user-id="${profile.user_id}" min="0" max="1" step="0.05" value="${state.remoteVolume}" />
            </div>
          ` : ''}
          ${state.canInvite ? html`<button class="btn btn-secondary" type="button" data-action="profile-invite" ${state.hostToolsCallable !== false ? '' : `disabled title="${t('hostToolsAppOnlyLearnMore')}"`}>${t('inviteToSpeak')}</button>` : ''}
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
    </div>
  `);
  drawer.classList.add('open');
}

function actionRow(
  profile: CHUser,
  state: ProfileDrawerState,
  followLabel: string,
  followClickable: boolean,
): SafeHtml {
  return html`
    <div class="profile-action-row" data-profile-actions>
      ${state.canDm ? html`
        <button class="btn btn-primary" type="button" data-action="profile-message" data-user-id="${profile.user_id}">${t('message')}</button>
      ` : ''}
      ${state.canWave ? html`
        <button class="btn btn-secondary" type="button" data-action="profile-talk-live" data-user-id="${profile.user_id}" data-name="${profile.name}" data-username="${profile.username}">${t('talkLive')}</button>
      ` : ''}
      ${followClickable
        ? html`<button class="btn btn-secondary" type="button" data-action="toggle-follow" data-follow-label="${followLabel}">${followLabel}</button>`
        : html`<div class="profile-relationship" data-follow-label="${followLabel}" title="${followLabel === 'Following' || followLabel === 'Friends' ? t('unfollowUnavailable') : ''}">${followLabel}</div>`}
      ${shareButton(profile)}
    </div>
  `;
}

function stats(profile: CHUser, listEnabled: ProfileDrawerState['listEnabled'], _self: boolean): SafeHtml {
  return html`
    <div class="profile-stats-row">
      ${statBox(profile.num_followers, t('followers'), 'followers', profile.user_id, listEnabled.followers)}
      ${statBox(profile.num_following, t('following'), 'following', profile.user_id, listEnabled.following)}
      ${statBox(profile.num_cofollows, t('profileFriends'), 'friends', profile.user_id, false)}
    </div>
  `;
}

function mutualBlock(profile: CHUser): SafeHtml {
  return html`
    ${mutualButton(t('mutualFollows'), 'mutual_follows', profile.mutual_follows, profile.mutual_follows_count, profile.user_id)}
    ${mutualButton(t('mutualFriends'), 'mutual_friends', profile.mutual_cofollows, profile.mutual_cofollows_count, profile.user_id)}
  `;
}

function mutualButton(
  label: string,
  list: 'mutual_friends' | 'mutual_follows',
  people: CHUser[] | undefined,
  count: number | undefined,
  userId: number,
): SafeHtml {
  const parts = mutualParts(people, count);
  if (!parts) return html``;
  return html`
    <button class="mutual-line mutual-list-btn" type="button" data-action="open-people-list" data-list="${list}" data-user-id="${userId}">
      ${label}
    </button>
  `;
}

function housesSection(profile: CHUser): SafeHtml {
  const clubs = profile.social_clubs ?? [];
  if (clubs.length === 0) return html``;
  return html`
    <section class="profile-section" data-profile-section="houses">
      <h3>${t('houses')}</h3>
      <div class="house-list">
        ${clubs.map((club) => html`
          <button class="house-list-row" type="button" data-action="open-house" data-house-slug="${club.slug ?? ''}" data-house-id="${club.social_club_id}">
            <span class="discover-copy"><strong>${club.name}</strong></span>
          </button>
        `)}
      </div>
    </section>
  `;
}

function recentlyChatting(profile: CHUser): SafeHtml {
  const people = profile.chatting_with ?? [];
  if (people.length === 0) return html``;
  return html`
    <section class="profile-section" data-profile-section="chatting">
      <h3>${t('recentlyChattingWith')}</h3>
      ${people.map((person) => html`
        <button class="discover-row discover-main" type="button" data-action="open-profile" data-user-id="${person.user_id}">
          ${avatarHtml(person, 40, 'sidebar-user-avatar')}
          <span class="discover-copy"><strong>${person.name}</strong><span class="list-empty">@${person.username}</span></span>
        </button>
      `)}
    </section>
  `;
}

function socialLinks(profile: CHUser): SafeHtml {
  const x = profile.twitter?.trim();
  const ig = profile.instagram?.trim();
  if (!x && !ig) return html``;
  return html`
    <section class="profile-section" data-profile-section="links">
      ${x ? html`<a class="btn btn-secondary" href="https://x.com/${x.replace(/^@/, '')}" target="_blank" rel="noreferrer" data-action="open-external">${t('profileLinkX')}</a>` : ''}
      ${ig ? html`<a class="btn btn-secondary" href="https://instagram.com/${ig.replace(/^@/, '')}" target="_blank" rel="noreferrer" data-action="open-external">${t('profileLinkInstagram')}</a>` : ''}
    </section>
  `;
}

function inRoomNow(state: ProfileDrawerState): SafeHtml {
  if (!state.inRoomNow) return html``;
  return html`
    <section class="profile-section" data-profile-section="in-room">
      <p>${t('inARoomNow', { title: state.inRoomNow.title })}</p>
      <button class="btn btn-primary" type="button" data-action="join-room" data-channel-id="${state.inRoomNow.channel}">${t('join')}</button>
    </section>
  `;
}

function bio(profile: CHUser): SafeHtml {
  if (!profile.bio) return html``;
  return html`<div class="profile-bio">${profile.bio}</div>`;
}

function statBox(
  value: number | undefined,
  label: string,
  list: 'followers' | 'following' | 'friends',
  userId: number,
  remoteList: boolean,
): SafeHtml {
  const body = html`
    <span class="stat-value">${value == null ? '—' : value}</span>
    <span class="stat-label">${label}</span>
  `;
  // Always clickable: remote list when supported, otherwise show honest unavailable note.
  return html`
    <button class="profile-stat-box" type="button" data-action="open-people-list" data-list="${list}" data-user-id="${userId}" data-list-remote="${remoteList ? '1' : '0'}">
      ${body}
    </button>
  `;
}

function aliasLine(displayname: string | null | undefined, className: string): SafeHtml {
  const alias = displayname?.trim();
  if (!alias) return html``;
  return html`<div class="${className}">${alias}</div>`;
}

function shareButton(profile: CHUser): SafeHtml {
  const share = safeUrl(profile.share_url);
  if (!share) return html``;
  return html`<button class="btn btn-secondary" type="button" data-action="copy-profile-share" data-url="${share}">${t('shareProfile')}</button>`;
}

/** Keep for Discover follow-back detection. */
export { shouldOfferFollowBack };
