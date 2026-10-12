import { clubhouseClient } from '../api/client.ts';
import { needsAuthGate } from './authGate.ts';
import { readAppPrefs, syncSystemThemeListener, writeAppPrefs } from './appPrefs.ts';
import { electronAPI } from './electronApi.ts';
import { mergeProfile, profileCountsMissing, readProfile } from '../api/relationship.ts';
import { audioEngine } from '../audio/audioEngine.ts';
import { agoraVoice } from '../audio/agoraVoice.ts';
import { setLanguage, t } from '../i18n/index.ts';
import { html, markup } from '../ui/html.ts';
import { settingsView } from '../ui/views/settings.ts';
import type { ClubboxApp } from './clubboxApp.ts';

const GUIDELINES_KEY = 'clubbox-guidelines-accepted';
const ADOPT_RETRY_MS = 2500;
/** ~3 minutes — SMS entry + Clubhouse redirects can be slow. */
const ADOPT_RETRY_MAX = 72;

export function isAuthGated(this: ClubboxApp): boolean {
    const api = electronAPI();
    const config = clubhouseClient.getConfig();
    return needsAuthGate({
      isElectron: !!api?.isElectron,
      forceSandbox: api?.forceSandbox === true,
      useSandbox: config.useSandbox,
      webSession: config.webSession,
    });
  }

export function stopAdoptRetry(this: ClubboxApp): void {
  if (this.adoptRetryTimer != null) {
    window.clearInterval(this.adoptRetryTimer);
    this.adoptRetryTimer = null;
  }
  this.adoptRetryCount = 0;
}

export function startAdoptRetry(this: ClubboxApp): void {
  if (this.adoptRetryTimer != null) return;
  if (!this.isAuthGated() || !this.guidelinesAccepted()) return;
  this.adoptRetryTimer = window.setInterval(() => {
    void this.tryAdoptOfficialSession({ fromRetry: true });
  }, ADOPT_RETRY_MS);
}

export async function syncEmbeddedSignIn(this: ClubboxApp): Promise<void> {
  const api = electronAPI();
  if (!api?.isElectron) return;
  if (!this.isAuthGated() || this.currentTab !== 'login' || !this.guidelinesAccepted()) {
    this.stopAdoptRetry();
    this.signInWindowSynced = false;
    await api.hideEmbeddedSignIn?.();
    return;
  }
  this.loginNotice = this.loginNotice || t('officialSignInWaiting');
  const show = api.showEmbeddedSignIn ?? api.openOfficialSignIn;
  if (!show) {
    this.loginNotice = t('embeddedSignInUnavailable');
    return;
  }
  // First sync resets the adopt counter; later render() calls only ensure the
  // window is up (main process reuses it). Never create two windows in parallel.
  const first = !this.signInWindowSynced;
  this.signInWindowSynced = true;
  if (first) this.adoptRetryCount = 0;
  await show();
  this.startAdoptRetry();
}

export async function finishSignIn(this: ClubboxApp) : Promise<void> {
    this.stopAdoptRetry();
    await electronAPI()?.hideEmbeddedSignIn?.();
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
    await clubhouseClient.updateConfig({ useSandbox: false });
    audioEngine.setSimulateMeterOnFailure(false);
    this.updateModeBadge();
    this.currentTab = 'login';
    this.render();
    if (electronAPI()?.isElectron) {
      const adopted = await clubhouseClient.adoptWebSession();
      if (adopted) {
        await this.finishSignIn();
        return;
      }
      await this.syncEmbeddedSignIn();
      this.render();
    }
  }

export function declineGuidelines(this: ClubboxApp) : void {
    this.guidelinesOpen = false;
    this.pendingLive = false;
    this.currentTab = 'login';
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
    this.currentTab = 'login';
    this.loginNotice = t('officialSignInWaiting');
    // Allow a fresh window if the user closed the previous Clubhouse window.
    this.signInWindowSynced = false;
    this.render();
    await this.syncEmbeddedSignIn();
  }

export async function tryAdoptOfficialSession(this: ClubboxApp, options?: { fromRetry?: boolean }) : Promise<void> {
    if (!this.guidelinesAccepted()) return;
    if (this.adoptInFlight || clubhouseClient.getConfig().webSession) return;
    this.adoptInFlight = true;
    if (!options?.fromRetry) this.loginBusy = true;
    try {
      const adopted = await clubhouseClient.adoptWebSession();
      if (!adopted) {
        // Stay calm while the user is still typing the SMS code on /signin.
        // Only the timed-out retry loop (or a late manual retry) shows the hard fail.
        if (options?.fromRetry) {
          this.adoptRetryCount += 1;
          if (this.adoptRetryCount >= ADOPT_RETRY_MAX) {
            this.stopAdoptRetry();
            this.loginNotice = t('signInAdoptFailed');
            this.render();
          } else if (this.loginNotice !== t('officialSignInWaiting')) {
            this.loginNotice = t('officialSignInWaiting');
          }
        } else if (this.adoptRetryCount >= ADOPT_RETRY_MAX) {
          this.loginNotice = t('signInAdoptFailed');
          this.render();
        } else {
          this.loginNotice = t('officialSignInWaiting');
          this.startAdoptRetry();
        }
        return;
      }
      this.stopAdoptRetry();
      await electronAPI()?.hideEmbeddedSignIn?.();
      await this.finishSignIn();
    } finally {
      this.adoptInFlight = false;
      this.loginBusy = false;
    }
  }

export async function continueInSandbox(this: ClubboxApp): Promise<void> {
    this.stopAdoptRetry();
    await electronAPI()?.hideEmbeddedSignIn?.();
    if (this.currentChannel || this.joinInFlight) {
      await this.leaveRoom({ silent: true });
    }
    await clubhouseClient.updateConfig({ useSandbox: true, webSession: false });
    audioEngine.setSimulateMeterOnFailure(true);
    this.loginNotice = '';
    this.authCleanupStarted = false;
    this.currentTab = 'explore';
    await this.refreshMe();
    try {
      await this.reloadChannels();
    } catch (err) {
      this.reportApiError(err);
    }
    this.updateModeBadge();
    this.showToast(t('sandboxSwitched'), '🧪');
    this.render();
  }

export async function logOut(this: ClubboxApp) : Promise<void> {
    if (!window.confirm(t('logOutConfirm'))) return;
    if (this.currentChannel || this.joinInFlight) {
      await this.leaveRoom({ silent: true });
    }
    this.stopRoomPresence();
    this.stopAdoptRetry();
    await electronAPI()?.clearWebSession?.();
    await clubhouseClient.updateConfig({ webSession: false, useSandbox: false });
    audioEngine.setSimulateMeterOnFailure(false);
    this.me = null;
    this.authCleanupStarted = false;
    this.currentTab = 'login';
    this.loginNotice = '';
    this.render();
    if (this.guidelinesAccepted()) await this.syncEmbeddedSignIn();
  }

export async function saveSettings(this: ClubboxApp) : Promise<void> {
    const appBuild = (document.getElementById('cfg-app-build') as HTMLInputElement)?.value;
    const appVersion = (document.getElementById('cfg-app-version') as HTMLInputElement)?.value;
    const agoraAppId = (document.getElementById('cfg-agora-app-id') as HTMLInputElement)?.value;
    // Desktop may enter sandbox from the login CTA; keep that choice unless the live radio is selected.
    const sandboxRadio = (document.getElementById('radio-sandbox') as HTMLInputElement | null)?.checked === true;
    const liveRadio = (document.getElementById('radio-live') as HTMLInputElement | null)?.checked === true;
    const isSandbox = electronAPI()?.isElectron
      ? (liveRadio ? false : (sandboxRadio || clubhouseClient.getConfig().useSandbox))
      : sandboxRadio;
    const experimentalActions = (document.getElementById('cfg-experimental-actions') as HTMLInputElement | null)?.checked === true;
    const requestLogging = (document.getElementById('cfg-request-logging') as HTMLInputElement | null)?.checked === true;
    const allowLocalRecording = (document.getElementById('cfg-allow-recording') as HTMLInputElement | null)?.checked === true;
    const verboseVoiceLog = (document.getElementById('cfg-verbose-voice-log') as HTMLInputElement | null)?.checked === true;
    agoraVoice.setVerboseLog(verboseVoiceLog);
    const languageValue = (document.getElementById('cfg-language') as HTMLSelectElement | null)?.value;
    const language = languageValue === 'tr' ? 'tr' : 'en';
    const themeValue = (document.getElementById('cfg-theme') as HTMLSelectElement | null)?.value;
    const theme = themeValue === 'light' || themeValue === 'system' ? themeValue : 'dark';
    const desktopNotifications = (document.getElementById('cfg-desktop-notifications') as HTMLInputElement | null)?.checked === true;
    const prefs = readAppPrefs();
    writeAppPrefs({ ...prefs, theme, desktopNotifications });
    syncSystemThemeListener(theme);
    void electronAPI()?.setNativeThemeSource?.(theme);
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
    if (!useSandbox && !this.guidelinesAccepted()) {
      this.pendingLive = true;
      this.guidelinesOpen = true;
      this.render();
      return;
    }
    if (this.currentChannel || this.joinInFlight) await this.leaveRoom({ silent: true });
    this.stopAdoptRetry();
    if (useSandbox) await electronAPI()?.hideEmbeddedSignIn?.();
    await clubhouseClient.updateConfig({ useSandbox, webSession: useSandbox ? false : clubhouseClient.getConfig().webSession });
    audioEngine.setSimulateMeterOnFailure(useSandbox);
    this.updateModeBadge();
    this.showToast(useSandbox ? t('sandboxSwitched') : t('liveSwitched'), useSandbox ? '🧪' : '🌐');
    if (!useSandbox && this.isAuthGated()) {
      this.currentTab = 'login';
      this.render();
      await this.syncEmbeddedSignIn();
      return;
    }
    this.render();
  }

export function handleAuthExpired(this: ClubboxApp) : void {
    if (this.authCleanupStarted) return;
    this.authCleanupStarted = true;
    void this.releaseRoomLocally();
    this.stopActivityRefresh();
    this.me = null;
    this.stopAdoptRetry();
    void electronAPI()?.hideEmbeddedSignIn?.();
    void clubhouseClient.updateConfig({ webSession: false, useSandbox: false });
    this.showToast(t('sessionExpired'), '🔑');
    this.currentTab = 'login';
    this.render();
    if (this.guidelinesAccepted()) void this.syncEmbeddedSignIn();
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

export function renderSettingsView(this: ClubboxApp) {
  void this.refreshConnectionStatus();
  return settingsView(
    clubhouseClient.getConfig(),
    this.shortcuts,
    this.recordingShortcut,
    false,
    this.me ? {
      settings: this.meSettings,
      notificationsEnabled: this.notificationsEnabled,
      soundEffectsEnabled: this.soundEffectsEnabled,
      anonymousEnabled: this.anonymousEnabled,
      blockedCount: this.blockedCount,
      isAdmin: this.isAdmin,
    } : null,
    clubhouseClient.getApiHealth(),
    readAppPrefs(),
    audioEngine.soundEffects,
    this.editingSoundId,
    this.connectionStatus,
  );
}

export async function refreshConnectionStatus(this: ClubboxApp): Promise<void> {
  const api = electronAPI();
  const agoraJoined = agoraVoice.getIsJoined();
  const agoraResult = agoraVoice.getLastJoinResult();
  const broadcastExtras = agoraVoice.getExtrasSending();
  const verboseVoiceLog = agoraVoice.getVerboseLog();
  if (!api?.connectionStatus) {
    this.connectionStatus = {
      webSession: !!clubhouseClient.getConfig().webSession,
      realtimeKeys: false,
      pubnubConnected: this.pubnubSource.isConnected(),
      agoraJoined,
      agoraResult,
      broadcastExtras,
      verboseVoiceLog,
    };
    return;
  }
  try {
    const status = await api.connectionStatus();
    const next = {
      webSession: !!status.webSession || !!clubhouseClient.getConfig().webSession,
      realtimeKeys: !!status.realtimeKeys,
      pubnubConnected: !!status.pubnubConnected || this.pubnubSource.isConnected(),
      agoraJoined,
      agoraResult,
      broadcastExtras,
      verboseVoiceLog,
    };
    const prev = this.connectionStatus;
    if (
      prev
      && prev.webSession === next.webSession
      && prev.realtimeKeys === next.realtimeKeys
      && prev.pubnubConnected === next.pubnubConnected
      && prev.agoraJoined === next.agoraJoined
      && prev.agoraResult === next.agoraResult
      && prev.broadcastExtras === next.broadcastExtras
      && prev.verboseVoiceLog === next.verboseVoiceLog
    ) {
      return;
    }
    this.connectionStatus = next;
    if (this.currentTab === 'settings') this.render();
  } catch {
    this.connectionStatus = {
      webSession: !!clubhouseClient.getConfig().webSession,
      realtimeKeys: false,
      pubnubConnected: this.pubnubSource.isConnected(),
      agoraJoined,
      agoraResult,
      broadcastExtras,
      verboseVoiceLog,
    };
  }
}

export function wireSettingsCtl(proto: ClubboxApp): void {
  proto.isAuthGated = isAuthGated;
  proto.stopAdoptRetry = stopAdoptRetry;
  proto.startAdoptRetry = startAdoptRetry;
  proto.syncEmbeddedSignIn = syncEmbeddedSignIn;
  proto.finishSignIn = finishSignIn;
  proto.guidelinesAccepted = guidelinesAccepted;
  proto.acceptGuidelines = acceptGuidelines;
  proto.startLiveAfterGuidelines = startLiveAfterGuidelines;
  proto.declineGuidelines = declineGuidelines;
  proto.renderGuidelines = renderGuidelines;
  proto.openOfficialSignIn = openOfficialSignIn;
  proto.tryAdoptOfficialSession = tryAdoptOfficialSession;
  proto.continueInSandbox = continueInSandbox;
  proto.logOut = logOut;
  proto.saveSettings = saveSettings;
  proto.switchRuntimeMode = switchRuntimeMode;
  proto.handleAuthExpired = handleAuthExpired;
  proto.refreshMe = refreshMe;
  proto.openSettingsModal = openSettingsModal;
  proto.closeSettingsModal = closeSettingsModal;
  proto.openCreateModal = openCreateModal;
  proto.closeCreateModal = closeCreateModal;
  proto.renderSettingsView = renderSettingsView;
  proto.refreshConnectionStatus = refreshConnectionStatus;
}
