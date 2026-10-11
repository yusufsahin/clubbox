// @ts-nocheck — extracted controller; imports trimmed over time.
import { ClubhouseApiError, clubhouseClient } from '../api/client.ts';
import { beginJoin, commitJoin, finishLeave, localClipAllowed, roleSyncDecision, roomAudience } from '../api/guards.ts';
import { applyThemeToDocument, readAppPrefs, writeAppPrefs } from './appPrefs.ts';
import { capturedCreateBody, leaveClosesRoom, roomHasOthers } from '../api/roomActions.ts';
import { applyFollowResponse, mergeProfile, PEOPLE_LIST_ENDPOINTS, profileCountsMissing, readProfile, relationshipFromStatus, talkPartners, type PeopleListKind } from '../api/relationship.ts';
import { PubNubRoomSource } from '../api/pubnubRoomSource.ts';
import { roomSync } from '../api/roomSync.ts';
import { audioEngine } from '../audio/audioEngine.ts';
import { readAudioPrefs, writeAudioPrefs, type AudioPrefs } from '../audio/audioPrefs.ts';
import { eventToAccelerator, normalizeShortcuts, readShortcuts, writeShortcuts, type ShortcutAction, type ShortcutMap } from '../shortcuts.ts';
import { agoraVoice } from '../audio/agoraVoice.ts';
import type { CHChannel, CHChannelDetail, CHChatMessage, CHConversation, CHUser, FeedTopic, MeSettings, SearchHit, SearchObjectType } from '../api/types.ts';
import { setLanguage, t } from '../i18n/index.ts';
import { avatarHtml, installAvatarFallback } from '../ui/avatar.ts';
import { cockpitBar } from '../ui/components/cockpitBar.ts';
import { mountCreateModal } from '../ui/components/createModal.ts';
import { paintPersonSheet, selfProfilePage } from '../ui/components/profileDrawer.ts';
import { mountSpeakerInvite } from '../ui/components/speakerInvite.ts';
import { showToast } from '../ui/components/toast.ts';
import { html, markup, safeUrl } from '../ui/html.ts';
import { activityView } from '../ui/views/activity.ts';
import { exploreView } from '../ui/views/explore.ts';
import { friendsView } from '../ui/views/friends.ts';
import { peopleListView } from '../ui/views/peopleList.ts';
import { discoverView, type DiscoverTab } from '../ui/views/discover.ts';
import { loginView } from '../ui/views/login.ts';
import { messagesView } from '../ui/views/messages.ts';
import { settingsView } from '../ui/views/settings.ts';
import { soundboardView } from '../ui/views/soundboard.ts';
import { chatList, emptyStageView, stageColumn, stageView } from '../ui/views/stage.ts';
import type { ClubboxApp } from './clubboxApp.ts';

const CHAT_POLL_MS = 15_000;
const GUIDELINES_KEY = 'clubbox-guidelines-accepted';

function electronAPI() {
  return (window as Window & { electronAPI?: unknown }).electronAPI ?? null;
}

function recordingFilename(topic: string | undefined, kind: 'recording' | 'clip' = 'recording'): string {
  const slug = (topic || 'room')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '') || 'room';
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const extension = kind === 'clip' ? 'wav' : 'webm';
  return `clubbox-${kind}-${slug}-${stamp}.${extension}`;
}


export async function finishSignIn(this: ClubboxApp) : Promise<void> {
    await this.refreshMe();
    try {
      await this.reloadChannels();
    } catch (err) {
      this.reportApiError(err);
    }
    this.loginNotice = '';
    this.currentTab = 'explore';
    this.render();
    if (this.me) {
      this.showToast(t('signedInAs', { name: this.me.name }), '🔑');
    }
  }

export function guidelinesAccepted(this: ClubboxApp) : boolean {
    try {
      return localStorage.getItem(GUIDELINES_KEY) === '1';
    } catch {
      return false;
    }
  }

export function acceptGuidelines(this: ClubboxApp) : void {
    try {
      localStorage.setItem(GUIDELINES_KEY, '1');
    } catch {
      this.showToast(t('somethingWrong'), '⚠️');
      return;
    }
    this.guidelinesOpen = false;
    const goLive = this.pendingLive;
    this.pendingLive = false;
    this.render();
    if (goLive) void this.startLiveAfterGuidelines();
  }

export async function startLiveAfterGuidelines(this: ClubboxApp) : Promise<void> {
    await this.switchRuntimeMode(false);
    if (electronAPI()?.isElectron) await clubhouseClient.adoptWebSession();
    await this.finishSignIn();
  }

export function declineGuidelines(this: ClubboxApp) : void {
    this.guidelinesOpen = false;
    this.pendingLive = false;
    this.render();
  }

export function renderGuidelines(this: ClubboxApp) : void {
    const existing = document.getElementById('guidelines-gate');
    if (!this.guidelinesOpen) {
      existing?.remove();
      return;
    }
    const gate = existing ?? document.createElement('div');
    gate.id = 'guidelines-gate';
    gate.className = 'guidelines-gate';
    gate.innerHTML = markup(html`
      <div class="guidelines-card">
        <h2>${t('guidelinesTitle')}</h2>
        <p>${t('guidelinesBody')}</p>
        <div class="guidelines-actions">
          <button class="btn btn-primary" type="button" data-action="accept-guidelines">${t('guidelinesAccept')}</button>
          <button class="btn btn-secondary" type="button" data-action="decline-guidelines">${t('guidelinesDecline')}</button>
        </div>
      </div>
    `);
    if (!existing) document.body.appendChild(gate);
  }

export async function openOfficialSignIn(this: ClubboxApp) : Promise<void> {
    if (!this.guidelinesAccepted()) {
      this.pendingLive = true;
      this.guidelinesOpen = true;
      this.currentTab = 'login';
      this.render();
      return;
    }
    const api = electronAPI();
    this.currentTab = 'login';
    if (!api?.openOfficialSignIn) {
      this.loginNotice = t('signInHelperDesktop');
      this.render();
      return;
    }
    if (!window.confirm(t('oneDeviceWarning'))) {
      this.loginNotice = t('signInHelperDesktop');
      this.render();
      return;
    }
    this.loginNotice = t('officialSignInWaiting');
    this.render();
    await api.openOfficialSignIn();
  }

export async function tryAdoptOfficialSession(this: ClubboxApp) : Promise<void> {
    if (!this.guidelinesAccepted()) return;
    if (this.adoptInFlight || clubhouseClient.getConfig().webSession) return;
    this.adoptInFlight = true;
    this.loginBusy = true;
    try {
      const adopted = await clubhouseClient.adoptWebSession();
      if (!adopted) return;
      await electronAPI()?.closeOfficialSignIn?.();
      await this.finishSignIn();
    } finally {
      this.adoptInFlight = false;
      this.loginBusy = false;
    }
  }

export async function logOut(this: ClubboxApp) : Promise<void> {
    if (!window.confirm(t('logOutConfirm'))) return;
    if (this.currentChannel || this.joinInFlight) {
      await this.leaveRoom({ silent: true });
    }
    this.stopRoomPresence();
    await electronAPI()?.clearWebSession?.();
    await clubhouseClient.updateConfig({ webSession: false });
    this.me = null;
    this.currentTab = 'login';
    this.render();
  }

export async function saveSettings(this: ClubboxApp) : Promise<void> {
    const appBuild = (document.getElementById('cfg-app-build') as HTMLInputElement)?.value;
    const appVersion = (document.getElementById('cfg-app-version') as HTMLInputElement)?.value;
    const agoraAppId = (document.getElementById('cfg-agora-app-id') as HTMLInputElement)?.value;
    const isSandbox = electronAPI()?.isElectron
      ? false
      : (document.getElementById('radio-sandbox') as HTMLInputElement)?.checked === true;
    const experimentalActions = (document.getElementById('cfg-experimental-actions') as HTMLInputElement | null)?.checked === true;
    const requestLogging = (document.getElementById('cfg-request-logging') as HTMLInputElement | null)?.checked === true;
    const allowLocalRecording = (document.getElementById('cfg-allow-recording') as HTMLInputElement | null)?.checked === true;
    const languageValue = (document.getElementById('cfg-language') as HTMLSelectElement | null)?.value;
    const language = languageValue === 'tr' ? 'tr' : 'en';
    const themeValue = (document.getElementById('cfg-theme') as HTMLSelectElement | null)?.value;
    const theme = themeValue === 'light' || themeValue === 'system' ? themeValue : 'dark';
    const desktopNotifications = (document.getElementById('cfg-desktop-notifications') as HTMLInputElement | null)?.checked === true;
    const prefs = readAppPrefs();
    writeAppPrefs({ ...prefs, theme, desktopNotifications });
    applyThemeToDocument(theme, window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (!isSandbox && !this.guidelinesAccepted()) {
      this.pendingLive = true;
      this.guidelinesOpen = true;
      this.render();
      return;
    }
    const previousSandbox = clubhouseClient.getConfig().useSandbox;
    if (isSandbox !== previousSandbox && (this.currentChannel || this.joinInFlight)) {
      await this.leaveRoom({ silent: true });
    }
    await clubhouseClient.updateConfig({
      appBuild,
      appVersion,
      agoraAppId: agoraAppId || clubhouseClient.getConfig().agoraAppId,
      useSandbox: isSandbox,
      experimentalActions,
      requestLogging,
      allowLocalRecording,
      language,
    });
    audioEngine.setSimulateMeterOnFailure(isSandbox);
    this.syncClipArm();
    setLanguage(language);
    if (agoraAppId) agoraVoice.appId = agoraAppId;
    this.showToast(t('settingsSaved'), '✅');
    this.render();
    this.updateModeBadge();
  }

export async function switchRuntimeMode(this: ClubboxApp, useSandbox: boolean) : Promise<void> {
    if (electronAPI()?.isElectron && useSandbox) return;
    if (!useSandbox && !this.guidelinesAccepted()) {
      this.pendingLive = true;
      this.guidelinesOpen = true;
      this.render();
      return;
    }
    if (this.currentChannel || this.joinInFlight) await this.leaveRoom({ silent: true });
    await clubhouseClient.updateConfig({ useSandbox });
    audioEngine.setSimulateMeterOnFailure(useSandbox);
    this.updateModeBadge();
    this.showToast(useSandbox ? t('sandboxSwitched') : t('liveSwitched'), useSandbox ? '🧪' : '🌐');
    this.render();
  }

export function handleAuthExpired(this: ClubboxApp) : void {
    if (this.authCleanupStarted) return;
    this.authCleanupStarted = true;
    void this.releaseRoomLocally();
    this.stopActivityRefresh();
    this.me = null;
    void clubhouseClient.updateConfig({ webSession: false });
    this.showToast(t('sessionExpired'), '🔑');
    this.currentTab = 'login';
    this.render();
  }

export async function refreshMe(this: ClubboxApp, options?: { quiet?: boolean }) : Promise<void> {
    const before = this.accountStamp();
    try {
      const res = await clubhouseClient.getMe();
      this.me = readProfile(res.user_profile);
      const settings = res.user_settings;
      this.meSettings = settings ? {
        contact_upload_enabled: settings.contact_upload_enabled === true,
        follower_requests_enabled: settings.follower_requests_enabled === true,
        private_conversations_enabled: settings.private_conversations_enabled === true,
      } : null;
      this.unreadNotifications = res.has_unread_notifications === true;
      // Nav badge: me.unread_conversations_count. Per-row counts: get_conversation_unread_summary
      // for visible conversations (max 10) in messagesCtl — body is {conversation_id} (bundle).
      this.unreadConversations = typeof res.unread_conversations_count === 'number' ? res.unread_conversations_count : 0;
      this.notificationsEnabled = typeof res.notifications_enabled === 'boolean' ? res.notifications_enabled : null;
      this.soundEffectsEnabled = typeof res.enable_sound_effect === 'boolean' ? res.enable_sound_effect : null;
      this.anonymousEnabled = res.anonymous_settings && typeof res.anonymous_settings.is_enabled === 'boolean'
        ? res.anonymous_settings.is_enabled
        : null;
      this.needsAgeVerification = res.needs_age_verification === true;
      this.isOnboarding = res.is_onboarding === true;
      this.publicHallway = typeof res.should_show_explore_public_hallway === 'boolean' ? res.should_show_explore_public_hallway : null;
      this.blockedCount = Array.isArray(res.blocked_ids) ? res.blocked_ids.length : null;
      this.isAdmin = res.is_admin === true;
      this.requestedFollowingCount = Array.isArray(res.requested_following_ids) ? res.requested_following_ids.length : null;
      this.roomTitleOptions = Array.isArray(res.default_room_title_options)
        ? res.default_room_title_options.filter((title): title is string => typeof title === 'string' && title.trim().length > 0).slice(0, 16)
        : [];
      try {
        this.createChannelTargets = await clubhouseClient.getCreateChannelTargets();
      } catch {
        this.createChannelTargets = null;
      }
      if (this.me && profileCountsMissing(this.me)) {
        try {
          const full = await clubhouseClient.getProfile(this.me.user_id);
          if (this.me?.user_id === full.user_profile.user_id) {
            this.me = mergeProfile(this.me, full.user_profile);
          }
        } catch (err) {
          if (!options?.quiet) this.reportApiError(err);
        }
      }
      if (this.me && !clubhouseClient.getConfig().useSandbox) {
        clubhouseClient.updateConfig({ userId: this.me.user_id });
      }
      if (res.force_refresh_feed === true) {
        void this.reloadChannels().then(() => {
          if (this.currentTab === 'explore') this.render();
        }).catch((err) => this.reportApiError(err));
      }
      if (options?.quiet && before !== this.accountStamp()) this.render();
    } catch (err) {
      if (options?.quiet) return;
      this.me = null;
      this.meSettings = null;
      this.unreadNotifications = false;
      this.unreadConversations = 0;
      this.notificationsEnabled = null;
      this.soundEffectsEnabled = null;
      this.anonymousEnabled = null;
      this.needsAgeVerification = false;
      this.isOnboarding = false;
      this.publicHallway = null;
      this.blockedCount = null;
      this.isAdmin = false;
      this.requestedFollowingCount = null;
      this.roomTitleOptions = [];
      this.reportApiError(err);
    }
  }

export function openSettingsModal(this: ClubboxApp) {
    this.isSettingsModalOpen = true;
    this.currentTab = 'settings';
    this.render();
  }

export function closeSettingsModal(this: ClubboxApp) {
    this.isSettingsModalOpen = false;
  }

export function openCreateModal(this: ClubboxApp) {
    this.isCreateModalOpen = true;
    this.renderCreateModal();
  }

export function closeCreateModal(this: ClubboxApp) {
    this.isCreateModalOpen = false;
    document.getElementById('create-modal-overlay')?.remove();
  }

export function wireSettingsCtl(proto: ClubboxApp): void {
  proto.finishSignIn = finishSignIn;
  proto.guidelinesAccepted = guidelinesAccepted;
  proto.acceptGuidelines = acceptGuidelines;
  proto.startLiveAfterGuidelines = startLiveAfterGuidelines;
  proto.declineGuidelines = declineGuidelines;
  proto.renderGuidelines = renderGuidelines;
  proto.openOfficialSignIn = openOfficialSignIn;
  proto.tryAdoptOfficialSession = tryAdoptOfficialSession;
  proto.logOut = logOut;
  proto.saveSettings = saveSettings;
  proto.switchRuntimeMode = switchRuntimeMode;
  proto.handleAuthExpired = handleAuthExpired;
  proto.refreshMe = refreshMe;
  proto.openSettingsModal = openSettingsModal;
  proto.closeSettingsModal = closeSettingsModal;
  proto.openCreateModal = openCreateModal;
  proto.closeCreateModal = closeCreateModal;
}
