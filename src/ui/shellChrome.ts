import { t } from '../i18n';
import type { CHUser } from '../api/types';
import { avatarHtml } from './avatar';
import { html, type SafeHtml } from './html';
import { sidebarHighlightTab } from './navMap';

/** Ordered sidebar places (NAV-1). Tab ids stay as existing currentTab values. */
export const SIDEBAR_PLACES = [
  { tab: 'explore', icon: '🏠', labelKey: 'hallway' as const },
  { tab: 'discover', icon: '🔍', labelKey: 'discover' as const },
  { tab: 'messages', icon: '💬', labelKey: 'messages' as const },
  { tab: 'activity', icon: '🔔', labelKey: 'activity' as const },
] as const;

export type SidebarChromeState = {
  currentTab: string;
  selfProfileOpen: boolean;
  settingsOpen: boolean;
  unreadConversations: number;
  unreadNotifications: boolean;
  me: CHUser | null;
};

export function sidebarPlaceLabels(): string[] {
  return SIDEBAR_PLACES.map((place) => t(place.labelKey));
}

export function renderSidebarChrome(state: SidebarChromeState): SafeHtml {
  const placeActive = !state.selfProfileOpen && !state.settingsOpen;
  const highlight = sidebarHighlightTab(state.currentTab);
  return html`
    <nav class="nav-section" data-sidebar-places>
      ${SIDEBAR_PLACES.map((place) => {
        const active = placeActive && highlight === place.tab;
        const messagesBadge = place.tab === 'messages' && state.unreadConversations > 0
          ? html`<span class="count-badge" data-badge="messages">${state.unreadConversations}</span>`
          : '';
        const activityDot = place.tab === 'activity' && state.unreadNotifications
          ? html`<span class="nav-dot" data-badge="activity"></span>`
          : '';
        return html`
          <div
            class="nav-item ${active ? 'active' : ''}"
            data-action="nav"
            data-tab="${place.tab}"
            data-nav-place="${place.labelKey}"
          >
            <span class="icon">${place.icon}</span>
            <span class="nav-place-label">${t(place.labelKey)}</span>
            ${messagesBadge}
            ${activityDot}
          </div>
        `;
      })}
    </nav>

    <div class="sidebar-footer">
      <div class="sidebar-footer-row">
        ${renderSidebarProfile(state)}
        <button
          class="sidebar-settings-btn ${state.settingsOpen ? 'active' : ''}"
          type="button"
          data-action="open-settings"
          title="${t('settings')}"
          aria-label="${t('settings')}"
        >⚙</button>
      </div>
    </div>
  `;
}

function renderSidebarProfile(state: SidebarChromeState): SafeHtml {
  if (!state.me) {
    return html`
      <div class="sidebar-user" data-action="sidebar-user">
        <div class="sidebar-user-avatar sidebar-user-placeholder" aria-hidden="true">?</div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-name">${t('signIn')}</div>
          <div class="sidebar-user-role">${t('liveAccount')}</div>
        </div>
      </div>
    `;
  }
  return html`
    <div class="sidebar-user ${state.selfProfileOpen ? 'active' : ''}" data-action="sidebar-user">
      ${avatarHtml(state.me, 38, 'sidebar-user-avatar')}
      <div class="sidebar-user-info">
        <div class="sidebar-user-name">${state.me.name}</div>
        <div class="sidebar-user-role">@${state.me.username}</div>
      </div>
    </div>
  `;
}
