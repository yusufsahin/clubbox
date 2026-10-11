import './style.css';
import { ClubhouseApiError, clubhouseClient } from './api/client';
import { beginJoin, commitJoin, emptyRoomSession, finishLeave, localClipAllowed, roleSyncDecision, roomAudience } from './api/guards';
import { leaveClosesRoom, roomHasOthers } from './api/roomActions';
import { applyFollowResponse, mergeProfile, PEOPLE_LIST_ENDPOINTS, profileCountsMissing, readProfile, relationshipFromStatus, type PeopleListKind } from './api/relationship';

const CHAT_POLL_MS = 15_000;
const GUIDELINES_KEY = 'clubbox-guidelines-accepted';
import { roomSync } from './api/roomSync';
import { audioEngine } from './audio/audioEngine';
import { readAudioPrefs, writeAudioPrefs, type AudioPrefs } from './audio/audioPrefs';
import { eventToAccelerator, normalizeShortcuts, readShortcuts, writeShortcuts, type ShortcutAction, type ShortcutMap } from './shortcuts';
import { agoraVoice } from './audio/agoraVoice';
import type { CHChannel, CHChannelDetail, CHChatMessage, CHConversation, CHUser, FeedTopic, MeSettings, SearchHit, SearchObjectType } from './api/types';
import { setLanguage, t } from './i18n';
import { avatarHtml, installAvatarFallback } from './ui/avatar';
import { cockpitBar } from './ui/components/cockpitBar';
import { mountCreateModal } from './ui/components/createModal';
import { paintPersonSheet, selfProfilePage } from './ui/components/profileDrawer';
import { mountSpeakerInvite } from './ui/components/speakerInvite';
import { showToast } from './ui/components/toast';
import { html, markup, safeUrl } from './ui/html';
import { activityView } from './ui/views/activity';
import { exploreView } from './ui/views/explore';
import { friendsView } from './ui/views/friends';
import { peopleListView } from './ui/views/peopleList';
import { discoverView, type DiscoverTab } from './ui/views/discover';
import { loginView } from './ui/views/login';
import { messagesView } from './ui/views/messages';
import { settingsView } from './ui/views/settings';
import { soundboardView } from './ui/views/soundboard';
import { chatList, emptyStageView, stageColumn, stageView } from './ui/views/stage';

interface ElectronAPI {
  isElectron: boolean;
  getGlobalShortcuts: () => Promise<ShortcutMap | null>;
  setGlobalShortcuts: (shortcuts: ShortcutMap) => Promise<{ ok: boolean; failed: string[] }>;
  onGlobalShortcut: (callback: (action: string) => void) => void;
  openOfficialSignIn?: () => Promise<{ ok: boolean }>;
  closeOfficialSignIn?: () => Promise<{ ok: boolean }>;
  onWebSessionMaybe?: (callback: () => void) => void;
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

function electronAPI(): ElectronAPI | null {
  return (window as Window & { electronAPI?: ElectronAPI }).electronAPI ?? null;
}

class ClubboxApp {
  private currentTab: 'stage' | 'explore' | 'discover' | 'friends' | 'messages' | 'activity' | 'soundboard' | 'settings' | 'login' = 'stage';
  private currentChannel: CHChannelDetail | null = null;
  private channelsList: CHChannel[] = [];
  private feedTopics: FeedTopic[] = [];
  private conversations: CHConversation[] = [];
  private conversationsLoaded = false;
  private messageFilter: 'all' | 'house' | 'vm' = 'all';
  private openConversationId: string | null = null;
  private previewMember: string | null = null;
  private voiceRate = 1;
  private privateVoice = false;
  private privateLines: { userId: number; text: string; voice: boolean }[] = [];
  private activityCount: number | null = null;
  private suggestionsCount: number | null = null;
  private discoverQuery = '';
  private discoverTab: DiscoverTab = 'top';
  private discoverHits: SearchHit[] | null = null;
  private discoverLoading = false;
  private discoverTimer: number | null = null;
  private discoverSeq = 0;
  private me: CHUser | null = null;
  private meSettings: MeSettings | null = null;
  private unreadNotifications = false;
  private unreadConversations = 0;
  private selectedProfile: CHUser | null = null;
  private loginBusy = false;
  private loginNotice = '';
  private adoptInFlight = false;
  private guidelinesOpen = false;
  private pendingLive = false;
  private isCreateModalOpen: boolean = false;
  private isSettingsModalOpen: boolean = false;
  private isProfileDrawerOpen: boolean = false;
  private selfProfileOpen = false;
  private recordTimerInterval: number | null = null;
  private recordDurationSec: number = 0;
  private pingTimer: number | null = null;
  private chatTimer: number | null = null;
  private activityTimer: number | null = null;
  private roomTitleOptions: string[] = [];
  private notificationsEnabled: boolean | null = null;
  private soundEffectsEnabled: boolean | null = null;
  private anonymousEnabled: boolean | null = null;
  private needsAgeVerification = false;
  private isOnboarding = false;
  private publicHallway: boolean | null = null;
  private blockedCount: number | null = null;
  private isAdmin = false;
  private requestedFollowingCount: number | null = null;
  private dmRequestCount = 0;
  private profileLoading = false;
  private peopleList: {
    kind: PeopleListKind;
    userId: number;
    users: CHUser[] | null;
    nextCursor: string | null;
    loadingMore: boolean;
  } | null = null;
  private peopleListSeq = 0;
  private openSpeakerMenuId: number | null = null;
  private speakerInviteVisible = false;
  private dismissedSpeakerInvite = false;
  private audioConnected: boolean | null = null;
  private agoraRoleSyncing = false;
  private agoraPromoteFailures = 0;
  private roomSession = emptyRoomSession();
  private joinInFlight = false;
  private authCleanupStarted = false;
  private hiddenPauseTimer: number | null = null;
  private pollsPaused = false;
  private rateLimitNotices = new Set<string>();
  private musicModeChain: Promise<void> = Promise.resolve();
  private eventsBound = false;

  private chatMessages: CHChatMessage[] = [];
  private unreadChat = 0;
  private chatOpen = true;
  private audioPrefs: AudioPrefs = readAudioPrefs();
  private shortcuts: ShortcutMap = readShortcuts();
  private recordingShortcut: ShortcutAction | null = null;
  private editingSoundId: string | null = null;

  constructor() {
    installAvatarFallback();
    this.ensureProfileDrawer();
    clubhouseClient.onAuthExpired(() => this.handleAuthExpired());
    roomSync.onUpdate((detail) => this.applyRoomUpdate(detail));
    window.addEventListener('beforeunload', () => this.handleBeforeUnload());
    document.addEventListener('visibilitychange', () => this.onVisibilityChange());
    this.init();
  }

  private async init() {
    setLanguage(clubhouseClient.getConfig().language);
    this.applyAudioPrefs();
    navigator.mediaDevices?.addEventListener('devicechange', () => {
      if (this.currentTab === 'settings') void this.fillAudioDevices();
    });
    this.setupHotkeys();
    electronAPI()?.onGlobalShortcut((action) => {
      if (typeof action === 'string') this.handleGlobalShortcut(action);
    });
    electronAPI()?.onWebSessionMaybe?.(() => {
      void this.tryAdoptOfficialSession();
    });

    const desktop = !!electronAPI()?.isElectron;
    if (desktop) {
      await clubhouseClient.updateConfig({ useSandbox: false, allowUnverified: true });
      if (!this.guidelinesAccepted()) {
        this.pendingLive = true;
        this.guidelinesOpen = true;
      } else {
        await clubhouseClient.adoptWebSession();
      }
    } else if (!this.guidelinesAccepted() && !clubhouseClient.getConfig().useSandbox) {
      this.pendingLive = true;
      this.guidelinesOpen = true;
      await clubhouseClient.updateConfig({ useSandbox: true });
    }
    if (!(desktop && !this.guidelinesAccepted())) {
      await this.refreshMe();
      try {
        await this.reloadChannels();
      } catch (err) {
        this.reportApiError(err);
      }
    }

    // Hook audio engine callbacks
    audioEngine.onVolumeLevel((vol) => {
      this.updateVuMeter(vol);
    });

    audioEngine.onRecordingState((isRec, blobUrl) => {
      this.handleRecordingStateChange(isRec, blobUrl);
    });

    // Hook Agora remote speaker volume indicator
    agoraVoice.onVolumeLevels((speakers) => {
      speakers.forEach((s) => {
        const card = document.querySelector(`[data-user-id="${s.uid}"]`);
        if (card) {
          if (s.level > 0.15) {
            card.classList.add('speaking');
          } else {
            card.classList.remove('speaking');
          }
        }
      });
    });

    audioEngine.setSimulateMeterOnFailure(clubhouseClient.getConfig().useSandbox);

    if (this.currentTab === 'stage') {
      const config = clubhouseClient.getConfig();
      const needsLiveLogin = !!electronAPI()?.isElectron && !config.useSandbox && !config.webSession;
      this.currentTab = needsLiveLogin ? 'login' : 'explore';
    }

    try {
      await audioEngine.loadStoredPads();
    } catch {
      // IndexedDB can be unavailable. The built-in pads still play.
    }
    await this.syncShortcuts();

    // Render even when the network failed so the shell is never blank.
    this.render();

  }

  private handleAuthExpired(): void {
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

  private async refreshMe(options?: { quiet?: boolean }): Promise<void> {
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

  private async reloadChannels(): Promise<void> {
    const res = await clubhouseClient.getChannels();
    this.channelsList = res.channels || [];
    this.feedTopics = Array.isArray(res.available_topics)
      ? res.available_topics.filter((topic): topic is FeedTopic => !!topic && typeof topic.key === 'string' && typeof topic.display_name === 'string')
      : [];
  }

  private async loadConversations(): Promise<void> {
    try {
      const res = await clubhouseClient.getConversations();
      this.conversations = res.conversations || [];
      this.conversationsLoaded = true;
      this.dmRequestCount = typeof res.new_dm_requests_count === 'number' ? res.new_dm_requests_count : 0;
    } catch (err) {
      this.conversations = [];
      this.conversationsLoaded = true;
      this.dmRequestCount = 0;
      this.reportApiError(err);
    }
    if (this.currentTab === 'messages') this.render();
  }

  private async loadActivity(): Promise<void> {
    try {
      const res = await clubhouseClient.getEdgeStories();
      this.activityCount = Array.isArray(res.activities) ? res.activities.length : 0;
    } catch (err) {
      this.activityCount = 0;
      this.reportApiError(err);
    }
    if (this.currentTab === 'activity') this.render();
  }

  private async loadSuggestions(): Promise<void> {
    try {
      const res = await clubhouseClient.getGroupSuggestedInvites();
      this.suggestionsCount = Array.isArray(res.suggestions) ? res.suggestions.length : 0;
    } catch (err) {
      this.suggestionsCount = 0;
      this.reportApiError(err);
    }
    if (this.currentTab === 'friends') this.render();
  }

  private onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      this.schedulePollPause();
      return;
    }
    if (this.hiddenPauseTimer !== null) {
      window.clearTimeout(this.hiddenPauseTimer);
      this.hiddenPauseTimer = null;
    }
    if (this.pollsPaused) this.resumePolls();
  }

  private schedulePollPause(): void {
    if (this.hiddenPauseTimer !== null || this.pollsPaused) return;
    this.hiddenPauseTimer = window.setTimeout(() => {
      this.hiddenPauseTimer = null;
      if (document.visibilityState === 'hidden') this.pausePolls();
    }, 2 * 60 * 1000);
  }

  private pausePolls(): void {
    this.pollsPaused = true;
    this.stopActivityRefresh();
    this.stopChatPolling();
    roomSync.pause();
  }

  private resumePolls(): void {
    this.pollsPaused = false;
    if (this.me && this.currentTab !== 'login') {
      void this.refreshMe({ quiet: true });
    }
    if (this.currentTab === 'activity') {
      void this.loadActivity();
      this.startActivityRefresh();
    }
    if (this.currentTab === 'explore') {
      void this.refreshExplore();
    }
    if (!this.currentChannel) return;
    const channelId = this.channelApiId(this.currentChannel);
    this.syncChatPolling();
    if (!roomSync.resume()) roomSync.start(channelId);
  }

  private startActivityRefresh(): void {
    this.stopActivityRefresh();
    if (this.pollsPaused) return;
    this.activityTimer = window.setInterval(() => {
      if (this.currentTab !== 'activity') {
        this.stopActivityRefresh();
        return;
      }
      void this.loadActivity();
    }, 60000);
  }

  private stopActivityRefresh(): void {
    if (this.activityTimer !== null) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }
  }

  private accountStamp(): string {
    return [
      this.unreadNotifications,
      this.unreadConversations,
      this.needsAgeVerification,
      this.isOnboarding,
      this.publicHallway,
      this.blockedCount,
      this.isAdmin,
      this.requestedFollowingCount,
      this.notificationsEnabled,
      this.soundEffectsEnabled,
      this.anonymousEnabled,
    ].join('|');
  }

  private async finishSignIn(): Promise<void> {
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

  private guidelinesAccepted(): boolean {
    try {
      return localStorage.getItem(GUIDELINES_KEY) === '1';
    } catch {
      return false;
    }
  }

  private acceptGuidelines(): void {
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

  private async startLiveAfterGuidelines(): Promise<void> {
    await this.switchRuntimeMode(false);
    if (electronAPI()?.isElectron) await clubhouseClient.adoptWebSession();
    await this.finishSignIn();
  }

  private declineGuidelines(): void {
    this.guidelinesOpen = false;
    this.pendingLive = false;
    this.render();
  }

  private renderGuidelines(): void {
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
          ${electronAPI()?.isElectron ? '' : html`<button class="btn btn-secondary" type="button" data-action="decline-guidelines">${t('guidelinesDecline')}</button>`}
        </div>
      </div>
    `);
    if (!existing) document.body.appendChild(gate);
  }

  private async openOfficialSignIn(): Promise<void> {
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
    this.loginNotice = t('officialSignInWaiting');
    this.render();
    await api.openOfficialSignIn();
  }

  private async tryAdoptOfficialSession(): Promise<void> {
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

  private reportApiError(err: unknown): void {
    if (err instanceof ClubhouseApiError) {
      if (err.kind === 'auth' || err.status === 401) return;
      if (err.kind === 'permission') {
        this.showToast(t('permissionDenied'), '🔒');
        return;
      }
      if (err.status === 403) {
        this.showToast(t('requestForbidden'), '🔒');
        return;
      }
      if (err.kind === 'timeout') {
        this.showToast(t('requestTimedOut'), '⏱️');
        return;
      }
      if (err.kind === 'rate-limit') {
        if (!this.rateLimitNotices.has(err.endpoint)) {
          this.rateLimitNotices.add(err.endpoint);
          this.showToast(t('rateLimited'), '⏳');
        }
        return;
      }
    }
    const message = err instanceof Error ? err.message : t('somethingWrong');
    this.showToast(message, '⚠️');
  }

  private handleBeforeUnload(): void {
    const channel = this.currentChannel;
    this.roomSession = finishLeave(this.roomSession);
    this.joinInFlight = false;
    this.stopRoomPresence();
    audioEngine.stopRecording();
    audioEngine.armClip(false);
    audioEngine.stopMicrophone();
    void agoraVoice.leave();
    if (!channel || !clubhouseClient.supports('leave_channel')) return;
    void clubhouseClient.leaveChannel(this.channelApiId(channel)).catch(() => {
      // Page is going away; the leave request is best-effort.
    });
  }

  private startRoomPresence(channelId: string): void {
    this.stopRoomPresence();
    if (clubhouseClient.supports('active_ping')) {
      // docs/api/web-api.md has no captured active_ping interval, so this stays at 30s.
      this.pingTimer = window.setInterval(() => {
        void clubhouseClient.activePing(channelId).catch((err) => {
          console.warn('[Clubbox] active_ping failed:', err);
        });
      }, 30000);
    }
    if (this.pollsPaused) return;
    this.syncChatPolling();
    roomSync.start(channelId);
  }

  private stopChatPolling(): void {
    if (this.chatTimer !== null) {
      clearInterval(this.chatTimer);
      this.chatTimer = null;
    }
  }

  private syncChatPolling(): void {
    const open = !!this.currentChannel
      && !this.pollsPaused
      && this.chatOpen
      && this.currentChannel.is_chat_enabled !== false;
    if (!open) {
      this.stopChatPolling();
      return;
    }
    if (this.chatTimer !== null) return;
    void this.refreshChat();
    this.chatTimer = window.setInterval(() => {
      void this.refreshChat();
    }, CHAT_POLL_MS);
  }

  private stopRoomPresence(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.stopChatPolling();
    roomSync.stop();
  }

  private async refreshChat(): Promise<void> {
    if (!this.currentChannel || !clubhouseClient.supports('get_channel_messages')) return;
    try {
      const chat = await clubhouseClient.getChannelMessages(this.channelApiId(this.currentChannel));
      const next = chat.messages || [];
      const same = next.length === this.chatMessages.length
        && next.every((message, index) => message.id === this.chatMessages[index]?.id && message.message === this.chatMessages[index]?.message);
      if (same) return;
      const known = new Set(this.chatMessages.map((message) => message.id));
      const added = next.filter((message) => !known.has(message.id)).length;
      this.chatMessages = next;
      if (this.currentTab !== 'stage' || !this.chatOpen) {
        if (added > 0) {
          this.unreadChat += added;
          if (this.currentTab !== 'stage') this.renderSidebar();
        }
        this.renderCockpit();
        return;
      }
      this.renderChat();
    } catch (err) {
      console.warn('[Clubbox] chat refresh failed:', err);
    }
  }

  private channelApiId(channel: { channel?: string; channel_id: string | number }): string {
    return channel.channel || String(channel.channel_id);
  }

  private applyRoomUpdate(detail: CHChannelDetail): void {
    if (!this.currentChannel) return;
    const sameRoom =
      String(detail.channel_id) === String(this.currentChannel.channel_id) ||
      detail.channel === this.currentChannel.channel;
    if (!sameRoom || !detail.users) return;

    this.currentChannel.users = detail.users;
    this.currentChannel.num_all = detail.num_all;
    this.currentChannel.num_speakers = detail.num_speakers;
    this.currentChannel.has_raised_hands = detail.has_raised_hands;
    if (typeof detail.is_replay_enabled === 'boolean') this.currentChannel.is_replay_enabled = detail.is_replay_enabled;
    if (typeof detail.is_clips_enabled === 'boolean') this.currentChannel.is_clips_enabled = detail.is_clips_enabled;
    if (detail.privacy_settings) this.currentChannel.privacy_settings = detail.privacy_settings;
    this.syncClipArm();
    this.syncSelectedProfileFromRoom();
    this.maybeShowSpeakerInvite();
    this.syncAgoraRole();
    const mine = detail.users.find((user) => user.user_id === this.me?.user_id);
    if (typeof mine?.is_hand_raised === 'boolean') clubhouseClient.setHandRaised(mine.is_hand_raised);

    if (this.isProfileDrawerOpen) this.renderProfileDrawer();
    if (this.selfProfileOpen || this.currentTab !== 'stage') return;
    this.renderStage();
    this.renderCockpit();
  }

  private updateModeBadge(): void {
    const badge = document.querySelector('.mode-badge');
    if (!badge) return;
    const sandbox = clubhouseClient.getConfig().useSandbox;
    badge.textContent = sandbox ? t('sandboxBadge') : t('liveBadge');
    badge.classList.toggle('sandbox', sandbox);
    badge.classList.toggle('live', !sandbox);
  }

  private syncSelectedProfileFromRoom(): void {
    const profile = this.selectedProfile;
    const users = this.currentChannel?.users;
    if (!profile || !users) return;
    const inRoom = users.find((user) => user.user_id === profile.user_id);
    if (!inRoom) return;
    this.selectedProfile = {
      ...profile,
      is_speaker: inRoom.is_speaker,
      is_moderator: inRoom.is_moderator,
      is_muted: inRoom.is_muted,
    };
  }

  private isMeSpeaker(): boolean {
    if (!this.currentChannel || !this.me) return false;
    return this.currentChannel.users.some((user) => user.user_id === this.me?.user_id && !!user.is_speaker);
  }

  private isMeModerator(): boolean {
    if (!this.currentChannel || !this.me) return false;
    return this.currentChannel.users.some((user) => user.user_id === this.me?.user_id && !!user.is_moderator);
  }

  private async refreshExplore(): Promise<void> {
    try {
      await this.reloadChannels();
      if (this.currentTab === 'explore') this.render();
    } catch (err) {
      this.reportApiError(err);
    }
  }

  private liveUpdatesUnavailable(): boolean {
    const config = clubhouseClient.getConfig();
    return config.webSession && !clubhouseClient.supports('get_channel');
  }

  private async refreshCurrentRoom(): Promise<void> {
    if (!this.currentChannel || !clubhouseClient.supports('get_channel')) return;
    const detail = await clubhouseClient.getChannel(this.channelApiId(this.currentChannel));
    this.applyRoomUpdate(detail);
  }

  private syncAgoraRole(): void {
    if (clubhouseClient.getConfig().useSandbox || !agoraVoice.getIsJoined() || !this.me) return;
    if (this.agoraRoleSyncing) return;
    const decision = roleSyncDecision(this.agoraPromoteFailures, this.isMeSpeaker() === agoraVoice.getIsSpeaker());
    if (decision === 'reset') {
      this.agoraPromoteFailures = 0;
      return;
    }
    if (decision === 'give-up') return;
    this.agoraPromoteFailures += 1;
    this.agoraRoleSyncing = true;
    void this.runAgoraRoleSync();
  }

  private async runAgoraRoleSync(): Promise<void> {
    try {
      if (this.currentChannel && agoraVoice.getIsJoined()) {
        const wantSpeaker = this.isMeSpeaker();
        if (wantSpeaker !== agoraVoice.getIsSpeaker()) {
          if (wantSpeaker) {
            const ok = await agoraVoice.promoteToSpeaker();
            this.audioConnected = ok;
            if (!ok) this.showToast(t('micStageFailed'), '🔇');
          } else {
            await agoraVoice.demoteToAudience();
            audioEngine.setMuted(true);
            const micBtn = document.getElementById('mic-toggle-btn');
            if (micBtn) {
              micBtn.classList.remove('unmuted');
              micBtn.textContent = '🔇';
            }
            this.showToast(t('movedToAudience'), '🎙️');
          }
        }
      }
    } catch (err) {
      this.reportApiError(err);
    }
    this.agoraRoleSyncing = false;
    if (!this.currentChannel || !agoraVoice.getIsJoined() || clubhouseClient.getConfig().useSandbox) return;
    const decision = roleSyncDecision(this.agoraPromoteFailures, this.isMeSpeaker() === agoraVoice.getIsSpeaker());
    if (decision === 'reset') {
      this.agoraPromoteFailures = 0;
      return;
    }
    if (decision === 'give-up') {
      this.audioConnected = false;
      this.showToast(t('agoraPromoteStopped'), '🔇');
      return;
    }
    this.syncAgoraRole();
  }

  private async inviteToStage(userId: number): Promise<void> {
    if (!this.currentChannel || !this.isMeModerator()) return;
    if (!this.allowAction('invite_speaker')) return;
    try {
      await clubhouseClient.inviteSpeaker(this.channelApiId(this.currentChannel), userId);
      this.showToast(t('invitedToSpeakToast'), '🎙️');
      await this.refreshCurrentRoom();
    } catch (err) {
      this.reportApiError(err);
    }
  }

  private async moderateSpeaker(userId: number, action: 'mute' | 'moderator' | 'audience'): Promise<void> {
    if (!this.currentChannel || !this.isMeModerator()) return;
    const channelId = this.channelApiId(this.currentChannel);
    const endpoint = action === 'mute' ? 'mute_speaker' : action === 'moderator' ? 'make_moderator' : 'uninvite_speaker';
    if (!this.allowAction(endpoint)) return;
    try {
      if (action === 'mute') await clubhouseClient.muteSpeaker(channelId, userId);
      else if (action === 'moderator') await clubhouseClient.makeModerator(channelId, userId);
      else await clubhouseClient.uninviteSpeaker(channelId, userId);
      this.openSpeakerMenuId = null;
      await this.refreshCurrentRoom();
    } catch (err) {
      this.reportApiError(err);
    }
  }

  private maybeShowSpeakerInvite(): void {
    if (!this.me || !this.currentChannel || this.speakerInviteVisible) return;
    const mine = this.currentChannel.users.find((user) => user.user_id === this.me?.user_id);
    if (!mine?.is_invited_to_speak || mine.is_speaker) {
      this.dismissedSpeakerInvite = false;
      return;
    }
    if (this.dismissedSpeakerInvite) return;
    this.speakerInviteVisible = true;
    this.renderSpeakerInvite();
  }

  private renderSpeakerInvite(): void {
    mountSpeakerInvite();
  }

  private closeSpeakerInvite(dismiss = true): void {
    this.speakerInviteVisible = false;
    if (dismiss) this.dismissedSpeakerInvite = true;
    document.getElementById('speaker-invite-overlay')?.remove();
  }

  private async acceptSpeakerInvite(): Promise<void> {
    if (!this.currentChannel || !this.me) return;
    if (!this.allowAction('accept_speaker_invite')) return;
    const acceptBtn = document.getElementById('accept-speak-btn') as HTMLButtonElement | null;
    if (acceptBtn) acceptBtn.disabled = true;
    try {
      await clubhouseClient.acceptSpeakerInvite(this.channelApiId(this.currentChannel), this.me.user_id);
      this.closeSpeakerInvite();
      await this.refreshCurrentRoom();
      if (!clubhouseClient.getConfig().useSandbox && agoraVoice.getIsJoined()) {
        await agoraVoice.promoteToSpeaker();
      }
      this.showToast(t('onStage'), '🎙️');
    } catch (err) {
      this.reportApiError(err);
      if (acceptBtn) acceptBtn.disabled = false;
    }
  }

  private showToast(message: string, icon = '✨') {
    showToast(message, icon);
  }

  private ensureProfileDrawer(): HTMLElement {
    if (!document.getElementById('profile-scrim')) {
      const scrim = document.createElement('div');
      scrim.id = 'profile-scrim';
      scrim.className = 'profile-scrim';
      scrim.dataset.action = 'close-profile';
      document.body.appendChild(scrim);
    }
    const existing = document.getElementById('profile-drawer');
    if (existing) return existing;
    const drawer = document.createElement('div');
    drawer.id = 'profile-drawer';
    drawer.className = 'profile-drawer person-sheet';
    document.body.appendChild(drawer);
    return drawer;
  }

  private isShortcutAction(action: string | undefined): action is ShortcutAction {
    return action === 'mute' || action === 'clip' || /^pad[1-9]$/.test(action || '');
  }

  private async assignShortcut(action: ShortcutAction, accelerator: string): Promise<void> {
    const next: ShortcutMap = { ...this.shortcuts, [action]: accelerator };
    if (accelerator) {
      for (const key of Object.keys(next) as ShortcutAction[]) {
        if (key !== action && next[key] === accelerator) next[key] = '';
      }
    }
    this.shortcuts = normalizeShortcuts(next);
    this.recordingShortcut = null;
    writeShortcuts(this.shortcuts);
    await this.publishShortcuts();
    if (this.currentTab === 'settings') this.render();
  }

  private async syncShortcuts(): Promise<void> {
    const api = electronAPI();
    if (api?.getGlobalShortcuts) {
      try {
        const stored = await api.getGlobalShortcuts();
        if (stored) {
          this.shortcuts = normalizeShortcuts(stored);
          writeShortcuts(this.shortcuts);
        }
      } catch {
        // The browser preview has no desktop bridge.
      }
    }
    await this.publishShortcuts();
  }

  private async publishShortcuts(): Promise<void> {
    const api = electronAPI();
    if (!api?.setGlobalShortcuts) return;
    try {
      const result = await api.setGlobalShortcuts(this.shortcuts);
      if (result.failed.length > 0) this.showToast(t('shortcutFailed'), '⌨️');
    } catch {
      // Registration is a desktop-app feature.
    }
  }

  private handleGlobalShortcut(action: string): void {
    if (action === 'mute') {
      this.toggleMute();
      return;
    }
    if (action === 'clip') {
      void this.saveClip();
      return;
    }
    const pad = /^pad([1-9])$/.exec(action);
    if (!pad) return;
    const fx = audioEngine.soundEffects.find((item) => item.hotkey === pad[1]);
    if (!fx) return;
    audioEngine.playSoundEffect(fx.id);
    this.showToast(t('soundNamed', { name: fx.name }), fx.icon);
  }

  private setupHotkeys() {
    window.addEventListener('keydown', (event) => {
      if (!this.recordingShortcut || event.repeat) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;
      if (event.key === 'Escape') {
        this.recordingShortcut = null;
        this.render();
        return;
      }
      const accelerator = eventToAccelerator(event);
      if (!accelerator) {
        this.showToast(t('shortcutNeedsModifier'), '⌨️');
        return;
      }
      void this.assignShortcut(this.recordingShortcut, accelerator);
    }, true);
    window.addEventListener('keydown', (e) => {
      if (this.recordingShortcut) return;
      const target = e.target as HTMLElement | null;
      if (target?.id === 'chat-input' && e.key === 'Enter') {
        e.preventDefault();
        this.sendChatMessage();
        return;
      }
      if (target?.id === 'discover-query' && e.key === 'Enter') {
        e.preventDefault();
        void this.runDiscoverSearch();
        return;
      }
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (!this.isMeSpeaker()) {
          this.showToast(t('inAudience'), '🎙️');
          return;
        }
        this.toggleMute();
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        this.toggleHandRaise();
      } else if ((e.key === 's' || e.key === 'S') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        audioEngine.stopAllSounds();
        this.showToast(t('soundsStopped'), '⏹');
      } else if (e.key === 'r' || e.key === 'R') {
        this.toggleRecording();
      } else if (e.key === 'c' || e.key === 'C') {
        void this.saveClip();
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        const fx = audioEngine.soundEffects.find((item) => item.hotkey === e.key);
        if (fx) {
          e.preventDefault();
          audioEngine.playSoundEffect(fx.id);
          this.showToast(t('soundNamed', { name: fx.name }), fx.icon);
        }
      }

      if (e.key === 'Escape') {
        if (this.isProfileDrawerOpen) {
          this.closeProfileDrawer();
        } else if (this.selfProfileOpen) {
          this.selfProfileOpen = false;
          this.render();
        } else if (this.isCreateModalOpen) {
          this.closeCreateModal();
        } else if (this.speakerInviteVisible) {
          this.closeSpeakerInvite();
        } else if (this.openSpeakerMenuId != null) {
          this.openSpeakerMenuId = null;
          this.renderStage();
        } else if (this.isSettingsModalOpen) {
          this.closeSettingsModal();
        } else if (this.currentChannel && window.confirm(t('leaveRoomConfirm'))) {
          void this.leaveRoom();
        }
      }
    });
  }

  private updateVuMeter(vol: number) {
    const fill = document.getElementById('vu-meter-fill');
    if (fill) {
      fill.style.width = `${Math.min(100, Math.round(vol * 100))}%`;
    }

    const mySpeakerCard = document.querySelector('.speaker-card.me-speaker');
    if (mySpeakerCard) {
      if (vol > 0.12 && !audioEngine.getIsMuted()) {
        mySpeakerCard.classList.add('speaking');
      } else {
        mySpeakerCard.classList.remove('speaking');
      }
    }
  }

  private handleRecordingStateChange(isRecording: boolean, blobUrl?: string) {
    const recBtn = document.getElementById('record-btn');
    const recTimerEl = document.getElementById('record-timer');

    if (isRecording) {
      recBtn?.classList.add('record-active');
      this.recordDurationSec = 0;
      this.recordTimerInterval = window.setInterval(() => {
        this.recordDurationSec++;
        const mins = Math.floor(this.recordDurationSec / 60).toString().padStart(2, '0');
        const secs = (this.recordDurationSec % 60).toString().padStart(2, '0');
        if (recTimerEl) recTimerEl.textContent = `${mins}:${secs}`;
      }, 1000);
      this.showToast(t('recordingStarted'), '🔴');
      document.getElementById('recording-badge')?.removeAttribute('hidden');
      this.syncRecBanner();
    } else {
      recBtn?.classList.remove('record-active');
      if (this.recordTimerInterval) {
        clearInterval(this.recordTimerInterval);
        this.recordTimerInterval = null;
      }
      if (recTimerEl) recTimerEl.textContent = 'REC';
      document.getElementById('recording-badge')?.setAttribute('hidden', '');
      this.syncRecBanner();

      if (blobUrl) {
        this.showToast(t('recordingReady'), '💾');
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = recordingFilename(this.currentChannel?.topic);
        a.click();
      }
    }
  }

  private toggleMute() {
    // Local gain only. A capture has not shown a server mute flag, so other listeners do not see this change.
    const isMuted = audioEngine.toggleMute();
    agoraVoice.setMuted(isMuted);

    const micBtn = document.getElementById('mic-toggle-btn');
    if (micBtn) {
      if (isMuted) {
        micBtn.classList.remove('unmuted');
        micBtn.textContent = '🔇';
        this.showToast(t('micMuted'), '🔇');
      } else {
        micBtn.classList.add('unmuted');
        micBtn.textContent = '🎙️';
        this.showToast(t('micLive'), '🎙️');
      }
    }
  }

  private toggleMusicMode(): void {
    this.musicModeChain = this.musicModeChain.then(() => this.applyMusicMode()).catch((err) => {
      this.reportApiError(err);
    });
  }

  private async applyMusicMode(): Promise<void> {
    await audioEngine.toggleMusicMode();
    if (agoraVoice.getIsJoined() && agoraVoice.getIsSpeaker()) {
      await agoraVoice.republish(audioEngine.getIsMusicMode());
    }
    const isMusic = audioEngine.getIsMusicMode();
    const btn = document.getElementById('music-mode-btn');
    if (btn) btn.classList.toggle('active', isMusic);
    this.showToast(
      isMusic ? t('musicOn') : t('musicOff'),
      isMusic ? '🎵' : '🎙️',
    );
  }

  private async toggleHandRaise() {
    if (!this.currentChannel) return;
    if (!this.allowAction('audience_reply')) return;
    if (this.currentChannel.is_handraise_enabled === false) {
      this.showToast(t('handOff'), '✋');
      return;
    }
    if (this.isMeSpeaker()) return;
    const isRaised = clubhouseClient.isHandRaised();
    try {
      await clubhouseClient.raiseHand(this.channelApiId(this.currentChannel), !isRaised);
    } catch (err) {
      this.reportApiError(err);
      return;
    }
    const handBtn = document.getElementById('hand-btn');
    if (handBtn) {
      if (!isRaised) {
        handBtn.classList.add('active');
        this.showToast(t('handRaisedToast'), '✋');
      } else {
        handBtn.classList.remove('active');
        this.showToast(t('handLowered'), '👇');
      }
    }
  }

  private recordingAllowed(): boolean {
    const channel = this.currentChannel;
    if (!channel) return false;
    if (clubhouseClient.getConfig().allowLocalRecording !== true) return false;
    return channel.is_replay_enabled === true;
  }

  private syncRecBanner(): void {
    const banner = document.getElementById('rec-banner');
    if (!banner) return;
    banner.hidden = !audioEngine.getIsRecording();
    banner.textContent = t('recBanner');
  }

  private toggleRecording() {
    const starting = !audioEngine.getIsRecording();
    if (starting && !this.recordingAllowed()) {
      const allowed = clubhouseClient.getConfig().allowLocalRecording === true;
      this.showToast(t(allowed ? 'recordingNeedsReplay' : 'recordingNeedsConsent'), '🔴');
      return;
    }
    if (starting && !window.confirm(t('recordingConfirm'))) return;
    audioEngine.toggleRecording();
  }

  private clipsAllowed(): boolean {
    const channel = this.currentChannel;
    if (!channel) return false;
    return localClipAllowed({
      allowLocalRecording: clubhouseClient.getConfig().allowLocalRecording === true,
      replayEnabled: channel.is_replay_enabled === true,
      hostClipsEnabled: channel.is_clips_enabled === true,
      audience: roomAudience(channel),
    });
  }

  private syncClipArm(): void {
    audioEngine.armClip(this.clipsAllowed());
    const badge = document.getElementById('clip-armed-badge');
    if (badge) badge.hidden = !audioEngine.isClipArmed();
  }

  private async saveClip(): Promise<void> {
    const channel = this.currentChannel;
    if (!channel) return;
    if (!this.clipsAllowed()) {
      this.showToast(t('clipUnavailable'), '✂');
      return;
    }
    const blob = await audioEngine.saveClip();
    if (!blob) {
      this.showToast(t('clipEmpty'), '✂');
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = recordingFilename(channel.topic, 'clip');
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    this.showToast(t('clipSaved'), '✂');
  }

  private allowAction(endpoint: string): boolean {
    if (clubhouseClient.supports(endpoint)) return true;
    const key = clubhouseClient.evidence(endpoint) === 'unsupported' ? 'unsupportedAction' : 'unverifiedAction';
    this.showToast(t(key), '🔒');
    return false;
  }

  private async joinRoom(channelId: string) {
    if (!this.allowAction('join_channel')) return;
    if (this.currentChannel) {
      const currentId = this.channelApiId(this.currentChannel);
      if (currentId === channelId || String(this.currentChannel.channel_id) === channelId) return;
      await this.leaveRoom({ silent: true });
    }

    const begun = beginJoin(this.roomSession);
    this.roomSession = begun.session;
    const generation = begun.generation;
    this.joinInFlight = true;

    try {
      const joined = await clubhouseClient.joinChannel(channelId);
      const committed = commitJoin(this.roomSession, generation);
      if (!committed) return;
      this.roomSession = committed;
      const listed = this.channelsList.find((channel) => channel.channel === channelId || String(channel.channel_id) === channelId);
      if (listed) {
        if (!safeUrl(joined.url) && safeUrl(listed.url)) joined.url = listed.url;
        if (!joined.club_name && listed.club_name) joined.club_name = listed.club_name;
        if (!joined.club_photo_url && listed.club_photo_url) joined.club_photo_url = listed.club_photo_url;
        if (!joined.privacy_tooltip && listed.privacy_tooltip) joined.privacy_tooltip = listed.privacy_tooltip;
        if (!joined.privacy_label && listed.privacy_label) joined.privacy_label = listed.privacy_label;
        if (joined.is_replay_enabled == null && listed.is_replay_enabled != null) joined.is_replay_enabled = listed.is_replay_enabled;
        if (joined.is_active_trending_topic_channel == null && listed.is_active_trending_topic_channel != null) {
          joined.is_active_trending_topic_channel = listed.is_active_trending_topic_channel;
        }
      }
      this.currentChannel = joined;
      if (joined.is_chat_enabled === false) this.chatOpen = false;
      if (joined.should_join_muted === true) audioEngine.setMuted(true);
    } catch (err) {
      if (this.roomSession.generation !== generation) return;
      this.reportApiError(err);
      this.render();
      return;
    } finally {
      if (this.roomSession.generation === generation) this.joinInFlight = false;
    }

    if (this.roomSession.generation !== generation || !this.currentChannel) return;
    this.syncClipArm();
    this.audioConnected = clubhouseClient.getConfig().useSandbox ? null : false;
    if (this.isMeSpeaker()) void audioEngine.startMicrophone();
    await this.connectRoomAudio(generation);

    if (this.roomSession.generation !== generation || !this.currentChannel) return;
    this.startRoomPresence(this.channelApiId(this.currentChannel));
    try {
      const chat = await clubhouseClient.getChannelMessages(this.channelApiId(this.currentChannel));
      this.chatMessages = chat.messages || [];
    } catch (err) {
      this.chatMessages = [];
      this.reportApiError(err);
    }
    if (this.roomSession.generation !== generation || !this.currentChannel) return;
    this.currentTab = 'stage';
    this.unreadChat = 0;
    if (this.currentChannel.is_chat_enabled !== false) this.chatOpen = true;
    this.render();
    if (clubhouseClient.getConfig().useSandbox || this.audioConnected) {
      this.showToast(t('joinedRoom', { topic: this.currentChannel.topic }), '🎙️');
    }
    if (this.currentChannel.should_join_muted === true) this.showToast(t('joinMuted'), '🔇');
  }

  private async connectRoomAudio(generation: number): Promise<void> {
    if (this.roomSession.generation !== generation || !this.currentChannel || clubhouseClient.getConfig().useSandbox) return;
    if (!this.me) {
      this.audioConnected = false;
      this.showToast(t('signInToHear'), '🔑');
      return;
    }
    if (!this.currentChannel.token) {
      this.audioConnected = false;
      this.showToast(t('noAudioToken'), '🔇');
      return;
    }
    const ok = await agoraVoice.join(
      this.currentChannel.channel,
      this.currentChannel.token,
      this.me.user_id,
      { isSpeaker: this.isMeSpeaker(), isMusicMode: audioEngine.getIsMusicMode() }
    );
    if (this.roomSession.generation !== generation) {
      await agoraVoice.leave();
      return;
    }
    this.audioConnected = ok;
    if (!ok) this.showToast(t('audioTokenGap'), '🔇');
  }

  private async releaseRoomLocally(options: { skipServer?: boolean } = {}): Promise<void> {
    const channel = this.currentChannel;
    const channelId = channel ? this.channelApiId(channel) : null;
    this.privateVoice = false;
    this.privateLines = [];
    this.closeProfileDrawer();
    audioEngine.setRoomHeard(true);
    audioEngine.stopVoiceNote();
    this.roomSession = finishLeave(this.roomSession);
    this.joinInFlight = false;
    this.agoraRoleSyncing = false;
    this.agoraPromoteFailures = 0;
    this.stopRoomPresence();
    this.dismissedSpeakerInvite = false;
    this.closeSpeakerInvite(false);
    this.currentChannel = null;
    this.chatMessages = [];
    this.unreadChat = 0;
    this.audioConnected = null;
    this.openSpeakerMenuId = null;
    clubhouseClient.setHandRaised(false);
    audioEngine.stopRecording();
    audioEngine.armClip(false);
    audioEngine.stopMicrophone();
    try {
      await agoraVoice.leave();
    } catch {
      // Local publishing still stops below if leave throws.
    }
    if (options.skipServer || !channelId || !clubhouseClient.supports('leave_channel')) return;
    try {
      await clubhouseClient.leaveChannel(channelId);
    } catch (err) {
      this.reportApiError(err);
    }
  }

  private async leaveRoom(options: { silent?: boolean; end?: boolean } = {}) {
    const channel = this.currentChannel;
    const hadRoom = !!channel;
    if (!hadRoom && !this.joinInFlight && !agoraVoice.getIsJoined() && !audioEngine.getIsRecording()) return;
    const myId = this.me?.user_id ?? clubhouseClient.getCurrentUserId();
    const closes = !!channel && myId != null && leaveClosesRoom(channel.users, myId);
    const sandbox = clubhouseClient.getConfig().useSandbox;
    let end = options.end === true;
    if (!options.silent && !options.end && closes) {
      if (!window.confirm(t('leaveEndsRoomConfirm'))) return;
      end = true;
    } else if (!options.silent && !options.end && hadRoom) {
      if (!window.confirm(t('leaveRoomConfirm'))) return;
    } else if (options.silent && !options.end && closes && sandbox) {
      end = true;
    }
    if (end && channel) {
      if (!sandbox) {
        this.showToast(t('unverifiedAction'), '🔒');
        return;
      }
      try {
        await clubhouseClient.endChannel(this.channelApiId(channel));
      } catch (err) {
        this.reportApiError(err);
        return;
      }
      await this.releaseRoomLocally({ skipServer: true });
      this.afterRoomExit(hadRoom, options.silent === true, true);
      return;
    }
    await this.releaseRoomLocally();
    this.afterRoomExit(hadRoom, options.silent === true, false);
  }

  private afterRoomExit(hadRoom: boolean, silent: boolean, ended: boolean): void {
    this.currentTab = 'explore';
    this.chatOpen = true;
    this.render();
    if (hadRoom && !silent) this.showToast(ended ? t('endedRoom') : t('leftRoom'), ended ? '⏹' : '👋');
    if (!hadRoom) return;
    void this.reloadChannels().then(() => {
      if (this.currentTab === 'explore') this.render();
    }).catch((err) => this.reportApiError(err));
  }

  private async endRoom(): Promise<void> {
    const channel = this.currentChannel;
    const myId = this.me?.user_id ?? clubhouseClient.getCurrentUserId();
    if (!channel || !this.isMeModerator() || myId == null) return;
    if (roomHasOthers(channel.users, myId) && !window.confirm(t('endRoomConfirm'))) return;
    await this.leaveRoom({ silent: true, end: true });
  }

  private liveMessageBlocked(): boolean {
    if (clubhouseClient.getConfig().useSandbox) return false;
    this.showToast(t('unverifiedAction'), '🔒');
    return true;
  }

  private sendThreadSegment(conversationId: string | undefined, kind: 'text' | 'voice'): void {
    if (!conversationId) return;
    const item = this.conversations.find((entry) => entry.conversation_id === conversationId);
    if (!item?.can_reply) return;
    if (this.liveMessageBlocked()) return;
    const input = document.getElementById('thread-input') as HTMLInputElement | null;
    const text = kind === 'voice' ? t('voicePreview') : (input?.value.trim() ?? '');
    if (!text) return;
    clubhouseClient.sandboxAppendSegment(conversationId, {
      kind,
      author_name: this.me?.name || 'Sandbox User',
      text,
    });
    if (kind === 'voice') audioEngine.playVoiceNote(this.voiceRate);
    void this.loadConversations();
  }

  private addThreadMember(conversationId: string | undefined): void {
    if (!conversationId) return;
    const item = this.conversations.find((entry) => entry.conversation_id === conversationId);
    if (!item?.can_add_members) return;
    if (this.liveMessageBlocked()) return;
    const count = (clubhouseClient.sandboxThread(conversationId)?.members.length ?? 0) + 1;
    const name = `New member ${count}`;
    if (!clubhouseClient.sandboxAddMember(conversationId, name)) return;
    this.showToast(t('memberAdded', { name }), '➕');
    this.render();
  }

  private runThreadPermission(conversationId: string | undefined, permission: string | undefined): void {
    if (!conversationId) return;
    const item = this.conversations.find((entry) => entry.conversation_id === conversationId);
    if (!item) return;
    const allowed = (permission === 'invite' && item.can_invite)
      || (permission === 'delete' && item.can_delete)
      || (permission === 'leave' && item.can_leave);
    if (!allowed) return;
    if (this.liveMessageBlocked()) return;
    if (permission === 'invite') {
      this.showToast(t('inviteMember'), '✉️');
      return;
    }
    clubhouseClient.sandboxRemoveConversation(conversationId);
    if (this.openConversationId === conversationId) {
      this.openConversationId = null;
      this.previewMember = null;
    }
    void this.loadConversations();
  }

  // Capture before any live route: Talk Live on an online friend, send a VM, open a conversation, reply to a segment.
  private async talkLive(userId: string | undefined, name: string | undefined, username: string | undefined): Promise<void> {
    if (!clubhouseClient.getConfig().useSandbox) {
      this.showToast(t('unverifiedAction'), '🔒');
      return;
    }
    const id = Number(userId);
    if (!name || !username || !Number.isFinite(id)) return;
    try {
      const created = await clubhouseClient.createChannel(`Talk Live · ${name}`, {
        audience: 'friends',
        replayEnabled: false,
        chatEnabled: false,
        talkWith: { userId: id, name, username },
      });
      this.showToast(t('talkLiveStarted'), '🎙');
      await this.joinRoom(created.channel || String(created.channel_id));
    } catch (err) {
      this.reportApiError(err);
    }
  }

  private async sendVm(userId: string | undefined, name: string | undefined, username: string | undefined): Promise<void> {
    if (this.liveMessageBlocked()) return;
    const id = Number(userId);
    if (!name || !username || !Number.isFinite(id)) return;
    this.openConversationId = clubhouseClient.sandboxStartVm({ userId: id, name, username });
    this.messageFilter = 'vm';
    this.previewMember = null;
    this.currentTab = 'messages';
    await this.loadConversations();
  }

  private sendPrivateMessage(voice: boolean): void {
    const profile = this.selectedProfile;
    if (!profile || !this.currentChannel) return;
    if (this.liveMessageBlocked()) return;
    const input = document.getElementById('private-message-input') as HTMLInputElement | null;
    const text = voice ? t('voicePreview') : (input?.value.trim() ?? '');
    if (!text) return;
    this.privateLines.push({ userId: profile.user_id, text, voice });
    this.showToast(t('privateSent'), '✉️');
    this.renderProfileDrawer();
  }

  private inspectProfile(user: CHUser) {
    this.clearPeopleList();
    this.selectedProfile = { ...user };
    this.profileLoading = true;
    const isSelf = user.user_id === this.me?.user_id;
    if (isSelf) {
      this.closeProfileDrawer();
      this.selfProfileOpen = true;
      this.render();
    } else {
      this.isProfileDrawerOpen = true;
      this.render();
    }
    void this.loadFullProfile(user.user_id);
  }

  private async loadFullProfile(userId: number): Promise<void> {
    try {
      const res = await clubhouseClient.getProfile(userId);
      const current = this.selectedProfile;
      if (!current || current.user_id !== userId) return;
      this.selectedProfile = mergeProfile(current, res.user_profile);
    } catch (err) {
      this.reportApiError(err);
    } finally {
      if (this.selectedProfile?.user_id === userId) {
        this.profileLoading = false;
        if (this.selfProfileOpen && userId === this.me?.user_id) this.renderView();
        else if (this.isProfileDrawerOpen) this.renderProfileDrawer();
      }
    }
  }

  private clearPeopleList(): void {
    this.peopleList = null;
    this.peopleListSeq += 1;
  }

  private async openPeopleList(kind: PeopleListKind, userId: number, cursor: string | null): Promise<void> {
    const endpoint = PEOPLE_LIST_ENDPOINTS[kind];
    if (!clubhouseClient.supports(endpoint)) return;
    const seq = ++this.peopleListSeq;
    const appending = cursor != null && this.peopleList?.kind === kind && this.peopleList.userId === userId;
    const previous = appending ? this.peopleList?.users ?? [] : null;
    this.peopleList = {
      kind,
      userId,
      users: previous,
      nextCursor: appending ? this.peopleList?.nextCursor ?? null : null,
      loadingMore: appending,
    };
    this.paintPeopleList();
    try {
      const page = await clubhouseClient.getPeopleList(kind, userId, cursor);
      if (seq !== this.peopleListSeq) return;
      const prior = previous ?? [];
      this.peopleList = {
        kind,
        userId,
        users: [...prior, ...page.users],
        nextCursor: page.nextCursor,
        loadingMore: false,
      };
    } catch (err) {
      if (seq !== this.peopleListSeq) return;
      this.reportApiError(err);
      this.peopleList = {
        kind,
        userId,
        users: previous ?? [],
        nextCursor: null,
        loadingMore: false,
      };
    }
    this.paintPeopleList();
  }

  private paintPeopleList(): void {
    if (this.peopleList && this.selfProfileOpen && this.peopleList.userId === this.me?.user_id) {
      this.render();
      return;
    }
    if (this.isProfileDrawerOpen) this.renderProfileDrawer();
  }

  private closeProfileDrawer() {
    this.clearPeopleList();
    this.isProfileDrawerOpen = false;
    document.getElementById('profile-drawer')?.classList.remove('open');
    document.getElementById('profile-scrim')?.classList.remove('open');
  }

  private openCreateModal() {
    this.isCreateModalOpen = true;
    this.renderCreateModal();
  }

  private closeCreateModal() {
    this.isCreateModalOpen = false;
    document.getElementById('create-modal-overlay')?.remove();
  }

  public openSettingsModal() {
    this.isSettingsModalOpen = true;
    this.currentTab = 'settings';
    this.render();
  }

  private closeSettingsModal() {
    this.isSettingsModalOpen = false;
  }

  private async sendChatMessage() {
    const input = document.getElementById('chat-input') as HTMLInputElement;
    if (!input || !input.value.trim() || !this.currentChannel) return;
    if (this.currentChannel.is_chat_enabled === false) {
      this.showToast(t('chatOff'), '💬');
      return;
    }

    if (!this.me) {
      this.showToast(t('signInToChat'), '🔑');
      this.currentTab = 'login';
      this.render();
      return;
    }

    const text = input.value.trim();
    if (!clubhouseClient.getConfig().useSandbox) {
      if (!this.allowAction('send_channel_message')) return;
      try {
        await clubhouseClient.sendChannelMessage(this.channelApiId(this.currentChannel), text);
      } catch (err) {
        this.reportApiError(err);
        return;
      }
      input.value = '';
      await this.refreshChat();
      return;
    }

    const newMsg: CHChatMessage = {
      id: 'msg-' + Date.now(),
      user_id: this.me.user_id,
      name: this.me.name,
      username: this.me.username,
      photo_url: this.me.photo_url,
      message: text,
      timestamp: 'Just now',
    };

    this.chatMessages.push(newMsg);
    input.value = '';
    this.renderChat();
    const scrollEl = document.getElementById('chat-scroll');
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
  }

  // --- Rendering Functions ---

  public render() {
    this.ensureShell();
    this.renderSidebar();
    this.renderTopBar();
    this.renderView();
    if (this.currentTab === 'settings') void this.fillAudioDevices();
    this.renderCockpit();
    this.syncRecBanner();
    this.renderGuidelines();
    if (this.isProfileDrawerOpen) this.renderProfileDrawer();
  }

  private ensureShell(): void {
    if (document.getElementById('shell-sidebar')) return;
    const app = document.getElementById('app');
    if (!app) return;
    app.innerHTML = '<aside class="sidebar" id="shell-sidebar"></aside><main class="studio-main"><header class="top-bar" id="shell-topbar"></header><div class="rec-banner" id="rec-banner" hidden></div><div class="content-area" id="view-root"></div><div id="cockpit-root"></div></main>';
    this.bindEvents();
  }

  private renderSidebar(): void {
    const el = document.getElementById('shell-sidebar');
    if (!el) return;
    const sandbox = clubhouseClient.getConfig().useSandbox;
    el.innerHTML = markup(html`
        <div class="brand">
          <div class="brand-icon">🎙️</div>
          <div>
            <div style="display:flex; align-items:center;">
              <span class="brand-title">Clubbox</span>
              <span class="mode-badge ${sandbox ? 'sandbox' : 'live'}">${sandbox ? t('sandboxBadge') : t('liveBadge')}</span>
            </div>
            <div style="font-size:11px; color:var(--text-dim); margin-top:2px;">${t('studioTagline')}</div>
          </div>
        </div>

        <nav class="nav-section">
          <div class="nav-label">${t('navigation')}</div>

          <div class="nav-item ${this.currentTab === 'explore' ? 'active' : ''}" data-action="nav" data-tab="explore">
            <span class="icon">🏠</span>
            <span>${t('hallway')}</span>
            <span class="count-badge">${this.channelsList.length}</span>
          </div>

          <div class="nav-item ${this.currentTab === 'discover' ? 'active' : ''}" data-action="nav" data-tab="discover">
            <span class="icon">🔍</span>
            <span>${t('discover')}</span>
          </div>

          <div class="nav-item ${this.currentTab === 'friends' ? 'active' : ''}" data-action="nav" data-tab="friends">
            <span class="icon">🤝</span>
            <span>${t('friends')}</span>
          </div>

          <div class="nav-item ${this.currentTab === 'messages' ? 'active' : ''}" data-action="nav" data-tab="messages">
            <span class="icon">💬</span>
            <span>${t('messages')}</span>
            ${this.unreadConversations > 0 ? html`<span class="count-badge">${this.unreadConversations}</span>` : ''}
          </div>

          <div class="nav-label" style="margin-top:14px;">${t('studioTools')}</div>

          <div class="nav-item ${this.currentTab === 'stage' ? 'active' : ''}" data-action="nav" data-tab="stage">
            <span class="icon">📻</span>
            <span>${t('liveStage')}</span>
            ${this.currentChannel ? html`<span class="count-badge" style="background:var(--accent-emerald); color:#000;">${t('liveBadge')}</span>` : ''}
          </div>

          <div class="nav-item ${this.currentTab === 'soundboard' ? 'active' : ''}" data-action="nav" data-tab="soundboard">
            <span class="icon">🎛️</span>
            <span>${t('soundboardRack')}</span>
            <span class="count-badge">${audioEngine.soundEffects.length}</span>
          </div>

          ${clubhouseClient.supports('create_channel') ? html`
            <div class="nav-item" data-action="create-room">
              <span class="icon">➕</span>
              <span>${t('startRoom')}</span>
            </div>
          ` : html`
            <div class="nav-item" title="${t('notVerifiedHint')}">
              <span class="icon">➕</span>
              <span>${t('notVerifiedYet')}</span>
            </div>
          `}

          <div class="nav-item ${this.currentTab === 'settings' ? 'active' : ''}" data-action="nav" data-tab="settings">
            <span class="icon">⚙️</span>
            <span>${t('apiConfig')}</span>
          </div>
        </nav>

        <div class="sidebar-footer">
          ${this.currentChannel && this.currentTab !== 'stage' ? html`
            <button class="mini-player" type="button" data-action="nav" data-tab="stage" title="${t('backToStage')}">
              <span class="pulse-dot"></span>
              <span class="mini-player-copy">
                <span class="mini-player-topic">${this.currentChannel.topic}</span>
                ${this.unreadChat > 0 ? html`<span class="mini-player-unread">${t('unreadChat', { count: this.unreadChat })}</span>` : ''}
              </span>
            </button>
          ` : ''}
          ${this.renderSidebarUser()}
        </div>
    `);
  }

  private renderTopBar(): void {
    const el = document.getElementById('shell-topbar');
    if (!el) return;
    el.innerHTML = markup(html`
          <div class="room-meta">
            ${this.currentChannel ? html`
              <div class="live-indicator">
                <span class="pulse-dot"></span> ${t('onAir')}
              </div>
              <div class="room-title-group">
                <div class="room-club-badge">${this.roomHousePhoto()} ${this.currentChannel.club_name || t('publicStage')}</div>
                <div class="room-topic">${this.currentChannel.topic}</div>
                ${this.currentChannel.privacy_tooltip ? html`<span class="live-updates-note">${this.currentChannel.privacy_tooltip}</span>` : ''}
                ${this.currentChannel.is_active_trending_topic_channel ? html`<span class="live-updates-note">${t('trending')}</span>` : ''}
                ${this.currentChannel.is_replay_enabled ? html`<span class="live-updates-note">${t('replayAvailable')}</span>` : ''}
                ${this.liveUpdatesUnavailable() ? html`<span class="live-updates-note">${t('liveUpdatesNote')}</span>` : ''}
                <span class="recording-badge" id="clip-armed-badge" ${audioEngine.isClipArmed() ? '' : 'hidden'}>● ${t('clipArmed')}</span>
                <span class="recording-badge" id="recording-badge" ${audioEngine.getIsRecording() ? '' : 'hidden'}>● ${t('recording')}</span>
              </div>
            ` : html`
              <div style="font-weight:700; font-size:16px;">${this.sectionTitle()}</div>
            `}
          </div>

          <div class="top-actions">
            <button class="top-icon-btn" type="button" data-action="nav" data-tab="messages" title="${t('newMessage')}">
              ✉️
              ${this.unreadConversations > 0 ? html`<span class="nav-dot">${this.unreadConversations}</span>` : ''}
            </button>
            <button class="top-icon-btn" type="button" data-action="nav" data-tab="activity" title="${t('activity')}">
              🔔
              ${this.unreadNotifications ? html`<span class="nav-dot"></span>` : ''}
            </button>
            <button class="top-avatar-btn ${this.selfProfileOpen ? 'active' : ''}" type="button" data-action="sidebar-user" title="${this.me ? this.me.name : t('signIn')}">
              ${this.me ? avatarHtml(this.me, 36, 'top-avatar') : html`<span class="sidebar-user-placeholder">?</span>`}
            </button>
            ${this.currentChannel ? html`
              ${this.currentTab === 'stage' ? html`<button class="btn btn-secondary" type="button" data-action="minimize-room">${t('minimize')}</button>` : ''}
              <button class="btn btn-secondary" data-action="share-room">🔗 ${t('link')}</button>
              <button class="btn btn-danger" data-action="leave-room">${t('leaveQuietly')}</button>
            ` : html`
              ${clubhouseClient.supports('create_channel') ? html`
                <button class="btn btn-primary" data-action="create-room">➕ ${t('startRoom')}</button>
              ` : html`
                <button class="btn btn-secondary" type="button" disabled title="${t('notVerifiedHint')}">${t('notVerifiedYet')}</button>
              `}
            `}
          </div>
    `);
  }

  private renderView(): void {
    const el = document.getElementById('view-root');
    if (!el) return;
    el.innerHTML = markup(this.renderCurrentView());
  }

  public renderStage(): void {
    if (this.selfProfileOpen || this.currentTab !== 'stage') return;
    const column = document.getElementById('stage-column');
    if (!column) {
      this.renderView();
      return;
    }
    column.innerHTML = markup(this.stageColumn());
  }

  public renderChat(): void {
    if (this.selfProfileOpen || this.currentTab !== 'stage' || !this.currentChannel) return;
    const scroll = document.getElementById('chat-scroll');
    if (!scroll) {
      this.renderView();
      return;
    }
    const previous = scroll.scrollTop;
    const distanceFromBottom = scroll.scrollHeight - previous - scroll.clientHeight;
    scroll.innerHTML = markup(this.chatList());
    scroll.scrollTop = distanceFromBottom < 48 ? scroll.scrollHeight : previous;
  }

  private applyAudioPrefs(): void {
    audioEngine.setMicVolume(this.audioPrefs.micVolume);
    audioEngine.setMonitorEnabled(this.audioPrefs.monitorEnabled);
    audioEngine.setInputDeviceId(this.audioPrefs.inputDeviceId);
    audioEngine.setOutputDevice(this.audioPrefs.outputDeviceId);
    for (const [uid, volume] of Object.entries(this.audioPrefs.remoteVolumes)) {
      audioEngine.setRemoteVolume(uid, volume);
    }
  }

  private saveAudioPrefs(): void {
    writeAudioPrefs(this.audioPrefs);
  }

  private async fillAudioDevices(): Promise<void> {
    let devices: MediaDeviceInfo[];
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch {
      return;
    }
    if (this.currentTab !== 'settings') return;
    this.fillDeviceSelect('cfg-input-device', devices.filter((device) => device.kind === 'audioinput'), audioEngine.getInputDeviceId());
    const output = document.getElementById('cfg-output-device') as HTMLSelectElement | null;
    const supported = audioEngine.canSelectOutput();
    if (output) output.disabled = !supported;
    this.fillDeviceSelect('cfg-output-device', devices.filter((device) => device.kind === 'audiooutput'), audioEngine.getOutputDeviceId());
    const note = document.getElementById('output-device-note');
    if (note) note.hidden = supported;
  }

  private fillDeviceSelect(id: string, devices: MediaDeviceInfo[], selected: string): void {
    const select = document.getElementById(id) as HTMLSelectElement | null;
    if (!select) return;
    select.replaceChildren();
    const fallback = document.createElement('option');
    fallback.value = '';
    fallback.textContent = t('systemDefault');
    select.append(fallback);
    devices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `${t('unnamedDevice')} ${index + 1}`;
      select.append(option);
    });
    select.value = [...select.options].some((option) => option.value === selected) ? selected : '';
  }

  public renderCockpit(): void {
    const el = document.getElementById('cockpit-root');
    const view = document.getElementById('view-root');
    if (!el) return;
    if (!this.currentChannel) {
      el.hidden = true;
      el.innerHTML = '';
      view?.classList.add('no-cockpit');
      return;
    }
    el.hidden = false;
    view?.classList.remove('no-cockpit');
    const timer = document.getElementById('record-timer')?.textContent;
    el.innerHTML = markup(this.renderCockpitBar());
    if (timer && timer !== t('recLabel')) {
      const next = document.getElementById('record-timer');
      if (next) next.textContent = timer;
    }
  }

  private sectionTitle(): string {
    if (this.selfProfileOpen) return t('yourProfile');
    return this.placeTitle();
  }

  private placeTitle(): string {
    if (this.currentTab === 'discover') return t('discover');
    if (this.currentTab === 'friends') return t('friends');
    if (this.currentTab === 'messages') return t('messages');
    if (this.currentTab === 'activity') return t('activity');
    if (this.currentTab === 'soundboard') return t('soundboard');
    if (this.currentTab === 'settings') return t('apiConfig');
    if (this.currentTab === 'stage') return t('liveStage');
    if (this.currentTab === 'login') return t('signIn');
    return t('hallway');
  }

  private renderSidebarUser(): ReturnType<typeof html> {
    if (!this.me) {
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
      <div class="sidebar-user ${this.selfProfileOpen ? 'active' : ''}" data-action="sidebar-user">
        ${avatarHtml(this.me, 38, 'sidebar-user-avatar')}
        <div class="sidebar-user-info">
          <div class="sidebar-user-name">${this.me.name}</div>
          <div class="sidebar-user-role">@${this.me.username}</div>
        </div>
      </div>
    `;
  }

  private renderCurrentView(): ReturnType<typeof html> {
    if (this.selfProfileOpen && this.me) {
      if (this.peopleList && this.peopleList.userId === this.me.user_id) {
        return peopleListView(this.peopleList);
      }
      const self = this.selectedProfile?.user_id === this.me.user_id ? this.selectedProfile : this.me;
      return selfProfilePage(this.profileState(self));
    }
    if (this.currentTab === 'login') {
      return this.renderLoginView();
    } else if (this.currentTab === 'stage') {
      return this.renderStageView();
    } else if (this.currentTab === 'explore') {
      return this.renderExploreView();
    } else if (this.currentTab === 'discover') {
      return discoverView(this.discoverQuery, this.discoverTab, this.discoverHits, this.discoverLoading);
    } else if (this.currentTab === 'friends') {
      return friendsView(this.suggestionsCount);
    } else if (this.currentTab === 'messages') {
      return messagesView({
        items: this.conversationsLoaded ? this.conversations : null,
        dmRequests: this.dmRequestCount,
        filter: this.messageFilter,
        openId: this.openConversationId,
        thread: this.openConversationId ? clubhouseClient.sandboxThread(this.openConversationId) : null,
        previewMember: this.previewMember,
        playbackRate: this.voiceRate,
        presence: clubhouseClient.sandboxPresence(),
      });
    } else if (this.currentTab === 'activity') {
      return activityView(this.activityCount);
    } else if (this.currentTab === 'soundboard') {
      return this.renderSoundboardView();
    } else {
      return this.renderSettingsView();
    }
  }

  private renderLoginView(): ReturnType<typeof html> {
    return loginView({
      busy: this.loginBusy,
      notice: this.loginNotice,
      desktop: !!electronAPI()?.isElectron,
    });
  }

  private renderStageView(): ReturnType<typeof html> {
    if (!this.currentChannel) return emptyStageView();
    return stageView(this.stageColumn(), this.chatList(), this.chatOpen && this.currentChannel.is_chat_enabled !== false);
  }

  private stageColumn(): ReturnType<typeof html> {
    if (!this.currentChannel) return html``;
    return stageColumn({
      channel: this.currentChannel,
      me: this.me,
      openSpeakerMenuId: this.openSpeakerMenuId,
      audioDisconnected: this.audioConnected === false,
      moderator: this.isMeModerator(),
      canMute: clubhouseClient.supports('mute_speaker'),
      canMod: clubhouseClient.supports('make_moderator'),
      canMoveToAudience: clubhouseClient.supports('uninvite_speaker'),
      canInvite: clubhouseClient.supports('invite_speaker'),
      canFollow: clubhouseClient.evidence('follow') === 'observed',
    });
  }

  private chatList(): ReturnType<typeof html> {
    return chatList(this.chatMessages);
  }

  private latestChatLine(): string {
    if (this.currentChannel?.is_chat_enabled === false) return '';
    const last = this.chatMessages[this.chatMessages.length - 1];
    if (!last) return '';
    return `${last.name}: ${last.message}`;
  }

  private async followUser(userId: number): Promise<void> {
    if (clubhouseClient.evidence('follow') !== 'observed') {
      this.allowAction('follow');
      return;
    }
    const roomUser = this.currentChannel?.users.find((entry) => entry.user_id === userId);
    const hit = this.discoverHits?.find((entry) => entry.kind === 'user' && entry.user.user_id === userId);
    const user = roomUser ?? (hit?.kind === 'user' ? hit.user : undefined);
    const rel = relationshipFromStatus(user?.follow_status);
    if (!user || user.user_id === this.me?.user_id || rel === 'unknown' || rel === 'following' || rel === 'friends' || rel === 'requested') return;
    try {
      const res = await clubhouseClient.follow(userId);
      const next = applyFollowResponse(user, res);
      if (roomUser) Object.assign(roomUser, next);
      if (this.selectedProfile?.user_id === userId) {
        this.selectedProfile = mergeProfile(this.selectedProfile, next);
        this.renderProfileDrawer();
      }
      if (roomUser) this.renderStage();
      if (hit?.kind === 'user') {
        hit.user = next;
        if (this.currentTab === 'discover') this.render();
      }
      const after = relationshipFromStatus(next.follow_status);
      if (after !== rel && after !== 'unknown') {
        this.showToast(t('nowFollowing', { username: user.username }), '🤝');
      }
    } catch (err) {
      this.reportApiError(err);
    }
  }

  private renderExploreView(): ReturnType<typeof html> {
    return exploreView(this.channelsList, this.feedTopics, this.hallwayNotices(), {
      canJoin: clubhouseClient.supports('join_channel'),
      canCreate: clubhouseClient.supports('create_channel'),
    });
  }

  private hallwayNotices(): string[] {
    const notices: string[] = [];
    if (this.needsAgeVerification) notices.push(t('ageCheck'));
    if (this.isOnboarding) notices.push(t('onboardingNote'));
    if (this.publicHallway === false) notices.push(t('hallwayHidden'));
    if (!clubhouseClient.supports('join_channel')) notices.push(t('notVerifiedHint'));
    return notices;
  }

  private roomHousePhoto(): ReturnType<typeof html> | string {
    const photo = safeUrl(this.currentChannel?.club_photo_url);
    if (!photo) return '🏛️';
    return html`<img class="house-photo" src="${photo}" alt="" />`;
  }

  private renderSoundboardView(): ReturnType<typeof html> {
    return soundboardView(audioEngine.soundEffects, this.editingSoundId, audioEngine.getSoundpadVolume());
  }

  private async commitSoundEdit(target: HTMLInputElement): Promise<void> {
    const id = target.dataset.fxId;
    if (!id) return;
    try {
      if (target.id === 'sound-name') await audioEngine.updateSound(id, { name: target.value });
      else if (target.id === 'sound-icon') await audioEngine.updateSound(id, { icon: target.value });
      else if (target.id === 'sound-hotkey') await audioEngine.updateSound(id, { hotkey: target.value });
      else if (target.id === 'sound-volume') await audioEngine.updateSound(id, { volume: parseFloat(target.value) });
      else if (target.id === 'sound-loop') await audioEngine.updateSound(id, { loop: target.checked });
      if (this.currentTab === 'soundboard' && target.id !== 'sound-volume') this.render();
    } catch {
      this.showToast(t('somethingWrong'), '⚠️');
    }
  }

  private async removeSound(id: string): Promise<void> {
    try {
      await audioEngine.deleteSound(id);
      if (this.editingSoundId === id) this.editingSoundId = null;
      this.render();
    } catch {
      this.showToast(t('somethingWrong'), '⚠️');
    }
  }

  private renderSettingsView(): ReturnType<typeof html> {
    return settingsView(clubhouseClient.getConfig(), this.shortcuts, this.recordingShortcut, !!electronAPI()?.isElectron, this.me ? {
      settings: this.meSettings,
      notificationsEnabled: this.notificationsEnabled,
      soundEffectsEnabled: this.soundEffectsEnabled,
      anonymousEnabled: this.anonymousEnabled,
      blockedCount: this.blockedCount,
      isAdmin: this.isAdmin,
    } : null);
  }

  private renderCockpitBar(): ReturnType<typeof html> {
    return cockpitBar({
      muted: audioEngine.getIsMuted(),
      musicMode: audioEngine.getIsMusicMode(),
      recording: audioEngine.getIsRecording(),
      handRaised: clubhouseClient.isHandRaised(),
      handDisabled: !this.currentChannel || this.isMeSpeaker() || this.currentChannel.is_handraise_enabled === false,
      canRaiseHand: clubhouseClient.supports('audience_reply'),
      showAudioRetry: !!this.currentChannel && this.audioConnected === false && !clubhouseClient.getConfig().useSandbox,
      isSpeaker: this.isMeSpeaker(),
      inRoom: !!this.currentChannel,
      effects: audioEngine.soundEffects,
      latestChat: this.currentTab === 'stage' && this.chatOpen ? '' : this.latestChatLine(),
      unreadChat: this.chatOpen && this.currentTab === 'stage' ? 0 : this.unreadChat,
      chatOpen: this.chatOpen,
      canChat: this.currentChannel?.is_chat_enabled !== false,
      canClip: this.clipsAllowed(),
      canRecord: this.recordingAllowed(),
      recordHint: this.recordingAllowed() || audioEngine.getIsRecording()
        ? t('recordTitle')
        : clubhouseClient.getConfig().allowLocalRecording === true
          ? t('recordingNeedsReplay')
          : t('recordingNeedsConsent'),
      micVolume: audioEngine.getMicVolume(),
      monitorEnabled: audioEngine.getMonitorEnabled(),
    });
  }

  private profileState(profile: CHUser) {
    const isSelf = profile.user_id === this.me?.user_id;
    return {
      profile,
      canChangeRelationship: clubhouseClient.evidence('follow') === 'observed',
      canInvite: !isSelf && this.isMeModerator() && clubhouseClient.supports('invite_speaker') && !!this.currentChannel && !profile.is_speaker,
      loading: this.profileLoading && profile.user_id === this.selectedProfile?.user_id,
      showVolume: !isSelf && !!this.currentChannel?.users.some((user) => user.user_id === profile.user_id),
      remoteVolume: audioEngine.getRemoteVolume(profile.user_id),
      requestedFollowingCount: isSelf ? this.requestedFollowingCount : null,
      placeLabel: this.placeTitle(),
      canMessage: !isSelf && !!this.currentChannel,
      voiceMode: this.privateVoice,
      privateLines: this.privateLines.filter((line) => line.userId === profile.user_id),
      listEnabled: {
        followers: clubhouseClient.supports(PEOPLE_LIST_ENDPOINTS.followers),
        following: clubhouseClient.supports(PEOPLE_LIST_ENDPOINTS.following),
        friends: clubhouseClient.supports(PEOPLE_LIST_ENDPOINTS.friends),
      },
    };
  }

  private renderProfileDrawer() {
    const drawer = this.ensureProfileDrawer();
    const profile = this.selectedProfile;
    if (!profile || profile.user_id === this.me?.user_id) return;
    if (this.peopleList && this.peopleList.userId === profile.user_id) {
      drawer.innerHTML = markup(peopleListView(this.peopleList));
      drawer.classList.add('open');
      document.getElementById('profile-scrim')?.classList.add('open');
      return;
    }
    paintPersonSheet(drawer, this.selfProfileOpen
      ? { ...this.profileState(profile), placeLabel: t('yourProfile') }
      : this.profileState(profile));
    document.getElementById('profile-scrim')?.classList.add('open');
  }

  private renderCreateModal() {
    document.body.appendChild(mountCreateModal(this.roomTitleOptions));
  }

  private discoverTypes(): SearchObjectType[] {
    if (this.discoverTab === 'people') return ['UserProfile'];
    if (this.discoverTab === 'rooms') return ['LiveChannel', 'Replay'];
    if (this.discoverTab === 'houses') return ['SocialClub'];
    return ['LiveChannel', 'Replay', 'SegmentTranscription', 'SocialClub', 'UserProfile'];
  }

  private scheduleDiscoverSearch(): void {
    if (this.discoverTimer != null) window.clearTimeout(this.discoverTimer);
    const input = document.getElementById('discover-query') as HTMLInputElement | null;
    this.discoverQuery = input?.value ?? this.discoverQuery;
    if (!this.discoverQuery.trim()) {
      this.discoverSeq += 1;
      this.discoverHits = null;
      this.discoverLoading = false;
      this.render();
      return;
    }
    this.discoverTimer = window.setTimeout(() => {
      this.discoverTimer = null;
      void this.runDiscoverSearch();
    }, 250);
  }

  private async runDiscoverSearch(): Promise<void> {
    if (this.discoverTimer != null) {
      window.clearTimeout(this.discoverTimer);
      this.discoverTimer = null;
    }
    const query = this.discoverQuery.trim();
    if (!query) {
      this.discoverHits = null;
      this.discoverLoading = false;
      this.render();
      return;
    }
    const seq = ++this.discoverSeq;
    this.discoverLoading = true;
    try {
      const res = await clubhouseClient.search(query, this.discoverTypes());
      if (seq !== this.discoverSeq) return;
      this.discoverHits = res.hits ?? [];
    } catch (err) {
      if (seq !== this.discoverSeq) return;
      this.discoverHits = [];
      this.reportApiError(err);
    } finally {
      if (seq === this.discoverSeq) {
        this.discoverLoading = false;
        this.render();
        const field = document.getElementById('discover-query') as HTMLInputElement | null;
        field?.focus();
        if (field) field.setSelectionRange(field.value.length, field.value.length);
      }
    }
  }

  private async toggleFollow(): Promise<void> {
    const profile = this.selectedProfile;
    if (!profile || profile.user_id === this.me?.user_id) return;
    const rel = relationshipFromStatus(profile.follow_status);
    if (rel !== 'none' && rel !== 'follower') return;
    if (clubhouseClient.evidence('follow') !== 'observed') {
      this.allowAction('follow');
      return;
    }
    try {
      const res = await clubhouseClient.follow(profile.user_id);
      if (this.selectedProfile?.user_id !== profile.user_id) return;
      const next = applyFollowResponse(profile, res);
      this.selectedProfile = next;
      const roomUser = this.currentChannel?.users.find((entry) => entry.user_id === profile.user_id);
      if (roomUser) Object.assign(roomUser, next);
      this.renderProfileDrawer();
      const after = relationshipFromStatus(next.follow_status);
      if (after !== rel && after !== 'unknown') {
        this.showToast(t('nowFollowing', { username: profile.username }), '🤝');
      }
    } catch (err) {
      this.reportApiError(err);
    }
  }


  private async confirmCreateRoom(): Promise<void> {
    const topic = (document.getElementById('new-room-topic') as HTMLInputElement | null)?.value.trim();
    const privacy = (document.getElementById('new-room-privacy') as HTMLSelectElement | null)?.value;
    const audience = privacy === 'friends' || privacy === 'friends-of-friends' || privacy === 'house' ? privacy : 'public';
    const replayEnabled = (document.getElementById('new-room-replays') as HTMLInputElement | null)?.checked !== false;
    const chatEnabled = (document.getElementById('new-room-chat') as HTMLInputElement | null)?.checked !== false;
    const confirmBtn = document.querySelector('[data-action="confirm-create"]') as HTMLButtonElement | null;
    if (!topic) {
      this.showToast(t('enterTopic'), '⚠️');
      return;
    }
    if (!this.allowAction('create_channel')) return;
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = t('starting');
    }
    try {
      const newChan = await clubhouseClient.createChannel(topic, {
        audience,
        replayEnabled,
        chatEnabled,
      });
      this.channelsList.unshift(newChan);
      this.closeCreateModal();
      await this.joinRoom(newChan.channel || newChan.channel_id.toString());
    } catch (err) {
      this.reportApiError(err);
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = t('goLive');
      }
    }
  }

  private bindEvents(): void {
    if (this.eventsBound) return;
    this.eventsBound = true;
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      const actionEl = target?.closest('[data-action]') as HTMLElement | null;
      if (!actionEl || (actionEl instanceof HTMLButtonElement && actionEl.disabled)) return;
      this.handleAction(actionEl.dataset.action || '', actionEl);
    });
    document.addEventListener('input', (event) => {
      const target = event.target as HTMLInputElement | null;
      if (!target) return;
      if (target.id === 'discover-query') {
        this.scheduleDiscoverSearch();
        return;
      }
      if (target.id === 'soundpad-vol-slider') {
        const val = parseFloat(target.value);
        audioEngine.setSoundpadVolume(val);
        const label = document.getElementById('soundpad-vol-label');
        if (label) label.textContent = `${Math.round(val * 100)}%`;
      }
      if (target.id === 'mic-vol-slider') {
        const val = parseFloat(target.value);
        if (!Number.isFinite(val)) return;
        audioEngine.setMicVolume(val);
        this.audioPrefs.micVolume = val;
        this.saveAudioPrefs();
      }
      if (target.id === 'profile-vol-slider') {
        const uid = target.dataset.userId;
        const val = parseFloat(target.value);
        if (!uid || !Number.isFinite(val)) return;
        audioEngine.setRemoteVolume(uid, val);
        this.audioPrefs.remoteVolumes[uid] = val;
        this.saveAudioPrefs();
      }
      if (target.id === 'sound-volume') {
        const fx = audioEngine.soundEffects.find((item) => item.id === target.dataset.fxId);
        const val = parseFloat(target.value);
        if (fx && Number.isFinite(val)) fx.volume = Math.max(0, Math.min(1, val));
      }
    });
    document.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement | null;
      if (!target) return;
      if (target.id === 'radio-sandbox' || target.id === 'radio-live') {
        void this.switchRuntimeMode(target.id === 'radio-sandbox');
      } else if (target.id === 'cfg-input-device') {
        this.audioPrefs.inputDeviceId = target.value;
        this.saveAudioPrefs();
        audioEngine.setInputDeviceId(target.value);
      } else if (target.id === 'cfg-output-device') {
        this.audioPrefs.outputDeviceId = target.value;
        this.saveAudioPrefs();
        audioEngine.setOutputDevice(target.value);
      } else if (target.id === 'sound-name' || target.id === 'sound-icon' || target.id === 'sound-hotkey' || target.id === 'sound-loop' || target.id === 'sound-volume') {
        void this.commitSoundEdit(target);
      } else if (target.id === 'sound-upload-input' && target.files?.[0]) {
        const file = target.files[0];
        void audioEngine.loadCustomAudioFile(file, file.name.split('.')[0]).then(() => {
          this.showToast(t('uploadedSound', { name: file.name }), '🎵');
          this.render();
        });
      }
    });
  }

  private handleAction(action: string, el: HTMLElement): void {
    const tab = el.dataset.tab;
    if (action === 'nav' && (tab === 'stage' || tab === 'explore' || tab === 'discover' || tab === 'friends' || tab === 'messages' || tab === 'activity' || tab === 'soundboard' || tab === 'settings' || tab === 'login')) {
      this.selfProfileOpen = false;
      this.closeProfileDrawer();
      if (tab === 'explore') {
        this.currentTab = 'explore';
        this.render();
        void this.refreshExplore();
        this.stopActivityRefresh();
      } else {
        this.currentTab = tab;
        if (tab === 'stage') this.unreadChat = 0;
        this.render();
        if (tab === 'messages') void this.loadConversations();
        if (tab === 'activity') {
          void this.loadActivity();
          this.startActivityRefresh();
        } else {
          this.stopActivityRefresh();
        }
        if (tab === 'friends') void this.loadSuggestions();
      }
      return;
    }
    switch (action) {
      case 'profile-settings':
        this.selfProfileOpen = false;
        this.closeProfileDrawer();
        this.currentTab = 'settings';
        this.render();
        break;
      case 'close-self-profile':
        this.clearPeopleList();
        this.selfProfileOpen = false;
        this.render();
        break;
      case 'sidebar-user':
        if (!this.me) {
          this.currentTab = 'login';
          this.render();
        } else {
          this.inspectProfile(this.me);
        }
        break;
      case 'copy-profile-share': {
        const link = safeUrl(this.me?.share_url);
        if (!link) return;
        void navigator.clipboard.writeText(link).then(() => {
          this.showToast(t('copiedProfile'), '🔗');
        }).catch(() => {
          this.showToast(t('somethingWrong'), '🔗');
        });
        break;
      }
      case 'pick-room-title': {
        const input = document.getElementById('new-room-topic') as HTMLInputElement | null;
        const title = el.dataset.title;
        if (input && title) input.value = title;
        break;
      }
      case 'copy-conversation-share': {
        const id = el.dataset.conversationId;
        const item = this.conversations.find((entry) => entry.conversation_id === id);
        const link = safeUrl(item?.share_url);
        if (!link) return;
        void navigator.clipboard.writeText(link).then(() => {
          this.showToast(t('copiedLink'), '🔗');
        }).catch(() => {
          this.showToast(t('somethingWrong'), '🔗');
        });
        break;
      }
      case 'create-room':
        this.openCreateModal();
        break;
      case 'refresh-explore':
        void this.refreshExplore();
        break;
      case 'leave-room':
        void this.leaveRoom();
        break;
      case 'end-room':
        void this.endRoom();
        break;
      case 'messages-filter': {
        const filter = el.dataset.filter;
        if (filter === 'all' || filter === 'house' || filter === 'vm') {
          this.messageFilter = filter;
          this.render();
        }
        break;
      }
      case 'open-conversation':
        this.openConversationId = el.dataset.conversationId || null;
        this.previewMember = null;
        this.render();
        break;
      case 'close-conversation':
        this.openConversationId = null;
        this.previewMember = null;
        this.render();
        break;
      case 'thread-speed': {
        const rate = Number(el.dataset.rate);
        if (rate === 1 || rate === 1.5 || rate === 2) this.voiceRate = rate;
        this.render();
        break;
      }
      case 'play-thread-voice':
        audioEngine.playVoiceNote(this.voiceRate);
        break;
      case 'send-thread-text':
        this.sendThreadSegment(el.dataset.conversationId, 'text');
        break;
      case 'send-thread-voice':
        this.sendThreadSegment(el.dataset.conversationId, 'voice');
        break;
      case 'add-thread-member':
        this.addThreadMember(el.dataset.conversationId);
        break;
      case 'thread-permission':
        this.runThreadPermission(el.dataset.conversationId, el.dataset.permission);
        break;
      case 'preview-member':
        this.previewMember = el.dataset.member || null;
        this.render();
        break;
      case 'presence-join':
        if (el.dataset.channelId) void this.joinRoom(el.dataset.channelId);
        break;
      case 'presence-talk':
        void this.talkLive(el.dataset.userId, el.dataset.name, el.dataset.username);
        break;
      case 'presence-vm':
        void this.sendVm(el.dataset.userId, el.dataset.name, el.dataset.username);
        break;
      case 'talk-live':
        this.showToast(t('unverifiedAction'), '🔒');
        break;
      case 'private-mode':
        this.privateVoice = el.dataset.mode === 'voice';
        audioEngine.setRoomHeard(!this.privateVoice);
        this.renderProfileDrawer();
        break;
      case 'private-send':
        this.sendPrivateMessage(el.dataset.voice === '1');
        break;
      case 'copy-room-link': {
        const id = el.dataset.channelId;
        const listed = this.channelsList.find((channel) => channel.channel === id || String(channel.channel_id) === id);
        const link = safeUrl(listed?.url);
        if (!link) {
          this.showToast(t('noShareLink'), '🔗');
          return;
        }
        void navigator.clipboard.writeText(link).then(() => {
          this.showToast(t('linkCopied'), '📋');
        }).catch(() => {
          this.showToast(t('somethingWrong'), '🔗');
        });
        break;
      }
      case 'share-room': {
        const link = safeUrl(this.currentChannel?.url);
        if (!link) {
          this.showToast(t('noShareLink'), '🔗');
          return;
        }
        void navigator.clipboard?.writeText(link);
        this.showToast(t('linkCopied'), '📋');
        break;
      }
      case 'toggle-mic':
        this.toggleMute();
        break;
      case 'toggle-music':
        this.toggleMusicMode();
        break;
      case 'toggle-monitor':
        this.audioPrefs.monitorEnabled = !audioEngine.getMonitorEnabled();
        audioEngine.setMonitorEnabled(this.audioPrefs.monitorEnabled);
        this.saveAudioPrefs();
        this.renderCockpit();
        break;
      case 'retry-audio':
        void this.connectRoomAudio(this.roomSession.generation).then(() => {
          this.renderStage();
          this.renderCockpit();
        });
        break;
      case 'toggle-hand':
        void this.toggleHandRaise();
        break;
      case 'toggle-record':
        this.toggleRecording();
        break;
      case 'save-clip':
        void this.saveClip();
        break;
      case 'minimize-room':
        if (!this.currentChannel) return;
        this.currentTab = 'explore';
        this.render();
        void this.refreshExplore();
        break;
      case 'toggle-chat':
        if (!this.currentChannel) return;
        if (this.currentChannel.is_chat_enabled === false) {
          this.showToast(t('chatOff'), '💬');
          return;
        }
        this.chatOpen = !this.chatOpen;
        if (this.chatOpen) this.unreadChat = 0;
        if (this.currentTab !== 'stage') {
          this.currentTab = 'stage';
          this.unreadChat = 0;
          this.chatOpen = true;
        }
        this.syncChatPolling();
        this.render();
        break;
      case 'send-chat':
        this.sendChatMessage();
        break;
      case 'play-sound': {
        const id = el.dataset.fxId;
        if (!id) return;
        audioEngine.playSoundEffect(id);
        const fx = audioEngine.soundEffects.find((item) => item.id === id);
        if (fx) this.showToast(t('soundNamed', { name: fx.name }), fx.icon);
        break;
      }
      case 'edit-sound': {
        const id = el.dataset.fxId || null;
        this.editingSoundId = this.editingSoundId === id ? null : id;
        if (this.currentTab === 'soundboard') this.render();
        break;
      }
      case 'delete-sound': {
        const id = el.dataset.fxId;
        if (!id || !window.confirm(t('deleteSoundConfirm'))) return;
        void this.removeSound(id);
        break;
      }
      case 'stop-sounds':
        audioEngine.stopAllSounds();
        this.showToast(t('soundsStopped'), '⏹');
        break;
      case 'record-shortcut': {
        const action = el.dataset.shortcut;
        if (!this.isShortcutAction(action)) return;
        this.recordingShortcut = action;
        if (this.currentTab === 'settings') this.render();
        break;
      }
      case 'clear-shortcut': {
        const action = el.dataset.shortcut;
        if (!this.isShortcutAction(action)) return;
        void this.assignShortcut(action, '');
        break;
      }
      case 'join-room': {
        const channelId = el.dataset.channelId;
        if (channelId) void this.joinRoom(channelId);
        break;
      }
      case 'follow-user': {
        const uid = Number(el.dataset.userId);
        if (Number.isFinite(uid)) void this.followUser(uid);
        break;
      }
      case 'discover-clear':
        this.discoverQuery = '';
        this.discoverHits = null;
        this.discoverSeq += 1;
        this.render();
        break;
      case 'discover-tab': {
        const next = el.dataset.discover;
        if (next === 'top' || next === 'people' || next === 'rooms' || next === 'houses') {
          this.discoverTab = next;
          void this.runDiscoverSearch();
        }
        break;
      }
      case 'search-discover':
        void this.runDiscoverSearch();
        break;
      case 'open-profile': {
        const uid = el.dataset.userId;
        const hit = this.discoverHits?.find((entry) => entry.kind === 'user' && entry.user.user_id.toString() === uid);
        const listed = this.peopleList?.users?.find((entry) => entry.user_id.toString() === uid);
        const user = this.currentChannel?.users.find((entry) => entry.user_id.toString() === uid)
          ?? (hit?.kind === 'user' ? hit.user : undefined)
          ?? listed;
        if (user) this.inspectProfile(user);
        break;
      }
      case 'open-people-list': {
        const kind = el.dataset.list;
        const userId = Number(el.dataset.userId);
        if ((kind === 'followers' || kind === 'following' || kind === 'friends') && Number.isFinite(userId)) {
          void this.openPeopleList(kind, userId, null);
        }
        break;
      }
      case 'close-people-list':
        this.clearPeopleList();
        if (this.selfProfileOpen || this.isProfileDrawerOpen) this.render();
        break;
      case 'people-list-more':
        if (this.peopleList?.nextCursor) {
          void this.openPeopleList(this.peopleList.kind, this.peopleList.userId, this.peopleList.nextCursor);
        }
        break;
      case 'invite-stage':
      case 'profile-invite': {
        const uid = Number(el.dataset.userId || this.selectedProfile?.user_id);
        if (Number.isFinite(uid)) {
          void this.inviteToStage(uid);
          if (action === 'profile-invite') this.closeProfileDrawer();
        }
        break;
      }
      case 'speaker-menu': {
        const uid = Number(el.dataset.userId);
        this.openSpeakerMenuId = this.openSpeakerMenuId === uid ? null : uid;
        this.renderStage();
        break;
      }
      case 'moderate': {
        const uid = Number(el.dataset.userId);
        const kind = el.dataset.modAction;
        if (!Number.isFinite(uid) || (kind !== 'mute' && kind !== 'moderator' && kind !== 'audience')) return;
        void this.moderateSpeaker(uid, kind);
        break;
      }
      case 'open-login':
      case 'open-official-signin':
        void this.openOfficialSignIn();
        break;
      case 'accept-guidelines':
        this.acceptGuidelines();
        break;
      case 'decline-guidelines':
        this.declineGuidelines();
        break;
      case 'save-settings':
        void this.saveSettings();
        break;
      case 'close-profile':
        this.closeProfileDrawer();
        if (this.selfProfileOpen) this.render();
        break;
      case 'toggle-follow':
        void this.toggleFollow();
        break;
      case 'close-create':
        this.closeCreateModal();
        break;
      case 'confirm-create':
        void this.confirmCreateRoom();
        break;
      case 'decline-invite':
        this.closeSpeakerInvite();
        break;
      case 'accept-invite':
        void this.acceptSpeakerInvite();
        break;
      default:
        break;
    }
  }

  private async switchRuntimeMode(useSandbox: boolean): Promise<void> {
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

  private async saveSettings(): Promise<void> {
    const appBuild = (document.getElementById('cfg-app-build') as HTMLInputElement)?.value;
    const appVersion = (document.getElementById('cfg-app-version') as HTMLInputElement)?.value;
    const agoraAppId = (document.getElementById('cfg-agora-app-id') as HTMLInputElement)?.value;
    const isSandbox = electronAPI()?.isElectron
      ? false
      : (document.getElementById('radio-sandbox') as HTMLInputElement)?.checked === true;
    const allowUnverified = (document.getElementById('cfg-allow-unverified') as HTMLInputElement | null)?.checked === true;
    const allowLocalRecording = (document.getElementById('cfg-allow-recording') as HTMLInputElement | null)?.checked === true;
    const languageValue = (document.getElementById('cfg-language') as HTMLSelectElement | null)?.value;
    const language = languageValue === 'tr' ? 'tr' : 'en';
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
      allowUnverified,
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

}

// Instantiate App
new ClubboxApp();
