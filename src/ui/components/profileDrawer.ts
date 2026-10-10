import { t } from '../../i18n';
import type { CHUser, MeSettings } from '../../api/types';
import { avatarHtml } from '../avatar';
import { html, markup, safeUrl } from '../html';

export interface ProfileDrawerState {
  profile: CHUser;
  isSelf: boolean;
  canUnfollow: boolean;
  canInvite: boolean;
  loading: boolean;
  showVolume: boolean;
  remoteVolume: number;
  settings: MeSettings | null;
  notificationsEnabled: boolean | null;
  soundEffectsEnabled: boolean | null;
  anonymousEnabled: boolean | null;
  blockedCount: number | null;
  isAdmin: boolean;
  requestedFollowingCount: number | null;
}

export function paintProfileDrawer(drawer: HTMLElement, state: ProfileDrawerState): void {
  const profile = state.profile;
  const following = !!profile.is_following;
  drawer.innerHTML = markup(html`
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
      <span style="font-size:12px; font-weight:700; color:var(--text-dim); text-transform:uppercase;">${t('userProfile')}</span>
      <button class="modal-close-btn" data-action="close-profile">✕</button>
    </div>

    <div class="profile-cover">
      ${avatarHtml(profile, 100, 'profile-drawer-avatar')}
      <div class="profile-drawer-name">${profile.name}</div>
      <div class="profile-drawer-handle">@${profile.username}</div>
      ${state.loading ? html`<div class="profile-loading">${t('loadingProfile')}</div>` : ''}
    </div>

    <div class="profile-stats-row">
      <div class="profile-stat-box">
        <span class="stat-value">${profile.num_followers == null ? '—' : profile.num_followers}</span>
        <span class="stat-label">${t('followers')}</span>
      </div>
      <div class="profile-stat-box">
        <span class="stat-value">${profile.num_following == null ? '—' : profile.num_following}</span>
        <span class="stat-label">${t('following')}</span>
      </div>
    </div>

    ${profile.bio ? html`<div class="profile-bio">${profile.bio}</div>` : ''}

    ${state.isSelf && state.settings ? html`
      <div class="profile-settings">
        ${settingRow(t('followerRequests'), state.settings.follower_requests_enabled)}
        ${settingRow(t('privateConversations'), state.settings.private_conversations_enabled)}
        ${settingRow(t('contactUpload'), state.settings.contact_upload_enabled)}
        ${state.notificationsEnabled == null ? '' : settingRow(t('notifications'), state.notificationsEnabled)}
        ${state.soundEffectsEnabled == null ? '' : settingRow(t('soundEffectsSetting'), state.soundEffectsEnabled)}
        ${state.anonymousEnabled == null ? '' : settingRow(t('anonymousMode'), state.anonymousEnabled)}
        ${state.isAdmin ? html`<div class="profile-setting-row"><span>${t('accountAdmin')}</span><span>${t('settingOn')}</span></div>` : ''}
        ${state.requestedFollowingCount && state.requestedFollowingCount > 0 ? html`<div class="profile-setting-row"><span>${t('sentFollowRequests')}</span><span>${state.requestedFollowingCount}</span></div>` : ''}
        ${state.blockedCount && state.blockedCount > 0 ? html`<div class="profile-setting-row"><span>${t('blocked')}</span><span>${state.blockedCount}</span></div>` : ''}
      </div>
    ` : ''}

    ${state.showVolume ? html`
      <div class="form-group">
        <label class="form-label" for="profile-vol-slider">${t('speakerVolume')}</label>
        <input type="range" id="profile-vol-slider" data-user-id="${profile.user_id}" min="0" max="1" step="0.05" value="${state.remoteVolume}" />
      </div>
    ` : ''}

    <div style="margin-top:auto; display:flex; flex-direction:column; gap:10px;">
      ${state.isSelf ? selfActions(profile) : following && !state.canUnfollow ? html`
        <span title="${t('unfollowUnavailable')}">
          <button class="btn btn-primary" data-action="toggle-follow" disabled>${t('following')} @${profile.username}</button>
        </span>
      ` : html`
        <button class="btn btn-primary" data-action="toggle-follow">${following ? t('following') : t('follow')} @${profile.username}</button>
      `}
      ${state.canInvite ? html`<button class="btn btn-secondary" data-action="profile-invite">${t('inviteToSpeak')}</button>` : ''}
    </div>
  `);
  drawer.classList.add('open');
}

function settingRow(label: string, enabled: boolean): ReturnType<typeof html> {
  return html`<div class="profile-setting-row"><span>${label}</span><span>${enabled ? t('settingOn') : t('settingOff')}</span></div>`;
}

function selfActions(profile: CHUser): ReturnType<typeof html> {
  const share = safeUrl(profile.share_url);
  if (!share) return html``;
  return html`<button class="btn btn-secondary" type="button" data-action="copy-profile-share">${t('shareProfile')}</button>`;
}
