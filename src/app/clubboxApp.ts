// @ts-nocheck
import { ClubhouseApiError, clubhouseClient } from '../api/client';
import { beginJoin, commitJoin, emptyRoomSession, finishLeave, localClipAllowed, roleSyncDecision, roomAudience } from '../api/guards';
import type { CreateChannelTargets } from '../api/createComposer';
import { conversationKind, leaveClosesRoom, roomHasOthers } from '../api/roomActions';
import { applyFollowResponse, mergeProfile, PEOPLE_LIST_ENDPOINTS, profileCountsMissing, readProfile, relationshipFromStatus, talkPartners, type PeopleListKind } from '../api/relationship';

const CHAT_POLL_MS = 15_000;
const GUIDELINES_KEY = 'clubbox-guidelines-accepted';
import { PubNubRoomSource } from '../api/pubnubRoomSource';
import { roomSync } from '../api/roomSync';
import { audioEngine } from '../audio/audioEngine';
import { readAudioPrefs, writeAudioPrefs, type AudioPrefs } from '../audio/audioPrefs';
import { applyThemeToDocument, readAppPrefs, writeAppPrefs, zoomFactorFromPercent } from './appPrefs';
import { eventToAccelerator, normalizeShortcuts, readShortcuts, writeShortcuts, type ShortcutAction, type ShortcutMap } from '../shortcuts';
import { agoraVoice } from '../audio/agoraVoice';
import type { ActivityItem } from '../api/activityFeed';
import type { EventListItem, HouseChatMessage, HouseListItem, HouseMemberItem } from '../api/communityLists';
import type { PingCandidate } from '../api/pingInvites';
import type { ReplayPlayback } from '../api/replayPlayback';
import type { CHChannel, CHChannelDetail, CHChatMessage, CHConversation, ConversationThread, CHUser, FeedTopic, MeSettings, SearchHit, SearchObjectType } from '../api/types';
import { eventsView } from '../ui/views/events';
import { housesView } from '../ui/views/houses';
import { replayView } from '../ui/views/replay';
import { setLanguage, t } from '../i18n';
import { avatarHtml, installAvatarFallback } from '../ui/avatar';
import { cockpitBar } from '../ui/components/cockpitBar';
import { mountCreateModal } from '../ui/components/createModal';
import { paintPersonSheet, selfProfilePage } from '../ui/components/profileDrawer';
import { mountSpeakerInvite } from '../ui/components/speakerInvite';
import { showToast } from '../ui/components/toast';
import { html, markup, safeUrl } from '../ui/html';
import { activityView } from '../ui/views/activity';
import { exploreView } from '../ui/views/explore';
import { friendsView } from '../ui/views/friends';
import { peopleListView } from '../ui/views/peopleList';
import { discoverView, type DiscoverTab } from '../ui/views/discover';
import { loginView } from '../ui/views/login';
import { messagesView } from '../ui/views/messages';
import { settingsView } from '../ui/views/settings';
import { soundboardView } from '../ui/views/soundboard';
import { chatList, emptyStageView, stageColumn, stageView } from '../ui/views/stage';
import { readHallwayPrefs, type HallwayPrefs } from '../hallway/hallwayPrefs';
import { usableFeedTopics } from '../hallway/hallwayDisplay';
import type { RecordingChapter } from '../studio/recordingChapters';

interface ElectronAPI {
  isElectron: boolean;
  getGlobalShortcuts: () => Promise<ShortcutMap | null>;
  setGlobalShortcuts: (shortcuts: ShortcutMap) => Promise<{ ok: boolean; failed: string[] }>;
  onGlobalShortcut: (callback: (action: string) => void) => void;
  openOfficialSignIn?: () => Promise<{ ok: boolean }>;
  closeOfficialSignIn?: () => Promise<{ ok: boolean }>;
  onWebSessionMaybe?: (callback: () => void) => void;
  onAgoraAppId?: (callback: (appId: string) => void) => () => void;
  pubnubSubscribe?: (params: import('../api/realtimeHub.ts').PubNubSubscribeParams) => Promise<{ ok: boolean }>;
  pubnubResubscribe?: () => Promise<{ ok: boolean }>;
  pubnubUnsubscribe?: () => Promise<{ ok: boolean }>;
  onPubNubMessage?: (callback: (message: Record<string, unknown>) => void) => () => void;
  onPubNubStatus?: (callback: (status: import('../api/realtimeHub.ts').RealtimeHubStatus) => void) => () => void;
  clearWebSession?: () => Promise<{ ok: boolean }>;
  appendApiLog?: (record: {
    endpoint: string;
    status: number;
    ok?: boolean;
    bodyKeys?: string[];
    error?: string;
    kind?: string;
    appVersion?: string;
    timestamp?: string;
  }) => Promise<{ ok: boolean }>;
  runApiTriage?: () => Promise<{
    ok: boolean;
    promotions?: string[];
    failures?: Array<{ endpoint: string; status: number; error?: string; bodyKeys?: string[] }>;
  }>;
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

export class ClubboxApp {
  private currentTab: 'stage' | 'explore' | 'discover' | 'friends' | 'messages' | 'activity' | 'houses' | 'events' | 'replay' | 'soundboard' | 'settings' | 'login' = 'stage';
  housesList: HouseListItem[] | null = null;
  selectedHouse: HouseListItem | null = null;
  houseChatOpen = false;
  houseChatMessages: HouseChatMessage[] | null = null;
  houseChatCanPost = false;
  houseChatThreadId: string | null = null;
  houseChatThreadMessages: HouseChatMessage[] | null = null;
  houseMembersOpen = false;
  houseMembers: HouseMemberItem[] | null = null;
  eventsList: EventListItem[] | null = null;
  replayPlayback: ReplayPlayback | null = null;
  replayRate = 1;
  pingPanelOpen = false;
  pingQuery = '';
  pingCandidates: PingCandidate[] = [];
  pingSelectedIds: number[] = [];
  pingLoading = false;
  private currentChannel: CHChannelDetail | null = null;
  private channelsList: CHChannel[] = [];
  private feedTopics: FeedTopic[] = [];
  selectedTopicKey: string | null = null;
  private conversations: CHConversation[] = [];
  private conversationsLoaded = false;
  conversationUnreadById: Record<string, number> = {};
  private messageFilter: 'all' | 'house' | 'vm' = 'all';
  private openConversationId: string | null = null;
  openConversationThreadData: ConversationThread | null = null;
  threadLiveNote = '';
  private previewMember: string | null = null;
  private voiceRate = 1;
  private privateVoice = false;
  private privateLines: { userId: number; text: string; voice: boolean }[] = [];
  private activityCount: number | null = null;
  activityItems: ActivityItem[] | null = null;
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
  private createChannelTargets: CreateChannelTargets | null = null;
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
  private pubnubSource = new PubNubRoomSource({
    onUnknownMessage: ({ type, keys }) => {
      clubhouseClient.noteApiHealth('pubnub', `Unknown realtime message type: ${type}`, keys);
      void electronAPI()?.appendApiLog?.({
        endpoint: type,
        status: 0,
        ok: false,
        bodyKeys: keys,
        error: 'unknown pubnub type',
        kind: 'pubnub-unknown',
        appVersion: clubhouseClient.getConfig().appVersion,
      });
    },
    onChatMessage: (message) => {
      if (this.chatMessages.some((entry) => entry.id === message.id)) return;
      this.chatMessages.push(message);
      if (this.currentTab === 'stage' && this.chatOpen) this.renderChat();
      else this.unreadChat += 1;
    },
    onReaction: (emoji, targetName) => {
      this.showToast(`${emoji} → ${targetName}`, emoji);
    },
    onReconnecting: (reconnecting) => {
      const banner = document.getElementById('realtime-banner');
      if (banner) banner.hidden = !reconnecting;
    },
    onRoomEnded: () => {
      void this.releaseRoomLocally({ skipServer: true }).then(() => {
        this.afterRoomExit(true, false, true);
        this.showToast(t('roomEndedByHost'), '🏁');
      });
    },
  });
  private audioPrefs: AudioPrefs = readAudioPrefs();
  private shortcuts: ShortcutMap = readShortcuts();
  private recordingShortcut: ShortcutAction | null = null;
  private editingSoundId: string | null = null;
  hallwayPrefs: HallwayPrefs = readHallwayPrefs();
  feedNextCursor: string | null = null;
  feedLoadingMore = false;
  conversationsNextCursor: string | null = null;
  conversationsLoadingMore = false;
  audienceSearchQuery = '';
  recordingChapters: RecordingChapter[] = [];

  constructor() {
    installAvatarFallback();
    this.ensureProfileDrawer();
    clubhouseClient.onAuthExpired(() => this.handleAuthExpired());
    roomSync.onUpdate((detail) => this.applyRoomUpdate(detail));
    this.pubnubSource.onUpdate((detail) => this.applyRoomUpdate(detail));
    window.addEventListener('beforeunload', () => this.handleBeforeUnload());
    document.addEventListener('visibilitychange', () => this.onVisibilityChange());
    this.init();
  }

  private async runStartupApiTriage(): Promise<void> {
    const run = electronAPI()?.runApiTriage;
    if (!run) return;
    try {
      const result = await run();
      if (!result?.ok) return;
      const applied = clubhouseClient.promoteEndpointsLocally(result.promotions ?? []);
      if (applied.length) {
        this.showToast(t('evidenceLogPromoted', { endpoints: applied.join(', ') }), '📋');
      }
      const failures = result.failures ?? [];
      if (failures.length) {
        clubhouseClient.importTriageFailures(failures);
        this.showToast(t('evidenceLogPending', { count: failures.length }), '⚠️');
      }
    } catch (err) {
      console.warn('[Clubbox] startup triage failed', err);
    }
  }

  private async init() {
    setLanguage(clubhouseClient.getConfig().language);
    applyThemeToDocument(readAppPrefs().theme, window.matchMedia('(prefers-color-scheme: dark)').matches);
    void electronAPI()?.setZoomFactor?.(zoomFactorFromPercent(readAppPrefs().zoomPercent));
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
    electronAPI()?.onAgoraAppId?.((appId) => {
      if (!appId || typeof appId !== 'string') return;
      void clubhouseClient.updateConfig({ agoraAppId: appId }).then(() => {
        agoraVoice.appId = appId;
      });
    });

    const desktop = !!electronAPI()?.isElectron;
    const forceSandbox = electronAPI()?.forceSandbox === true;
    if (forceSandbox) {
      await clubhouseClient.updateConfig({ useSandbox: true });
    } else if (desktop) {
      await clubhouseClient.updateConfig({
        useSandbox: false,
        requestLogging: clubhouseClient.getConfig().requestLogging !== false,
      });
      if (!this.guidelinesAccepted()) {
        this.pendingLive = true;
        this.guidelinesOpen = true;
      } else {
        await clubhouseClient.adoptWebSession();
      }
      await this.runStartupApiTriage();
    } else if (!this.guidelinesAccepted() && !clubhouseClient.getConfig().useSandbox) {
      this.pendingLive = true;
      this.guidelinesOpen = true;
      await clubhouseClient.updateConfig({ useSandbox: true });
    }
    if (forceSandbox || !(desktop && !this.guidelinesAccepted())) {
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



























































  // Capture before any live route: Talk Live on an online friend, send a VM, open a conversation, reply to a segment.






























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

          <div class="nav-item ${this.currentTab === 'houses' ? 'active' : ''}" data-action="nav" data-tab="houses">
            <span class="icon">🏛</span>
            <span>${t('houses')}</span>
          </div>

          <div class="nav-item ${this.currentTab === 'events' ? 'active' : ''}" data-action="nav" data-tab="events">
            <span class="icon">📅</span>
            <span>${t('events')}</span>
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
            <button class="top-icon-btn" type="button" data-action="nav" data-tab="messages" title="${t('messages')}">
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
    if (this.currentTab === 'houses') return t('houses');
    if (this.currentTab === 'events') return t('events');
    if (this.currentTab === 'replay') return this.replayPlayback?.kind === 'highlight' ? t('highlight') : t('replay');
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
      return friendsView(
        this.suggestionsCount,
        this.conversationsLoaded ? talkPartners(this.conversations, this.me?.user_id ?? null) : null,
      );
    } else if (this.currentTab === 'messages') {
      return messagesView({
        items: this.conversationsLoaded ? this.conversations : null,
        dmRequests: this.dmRequestCount,
        filter: this.messageFilter,
        openId: this.openConversationId,
        thread: this.activeConversationThread(),
        previewMember: this.previewMember,
        playbackRate: this.voiceRate,
        canLoadMore: !!this.conversationsNextCursor,
        loadingMore: this.conversationsLoadingMore,
        presence: clubhouseClient.getSandbox()?.presence() ?? [],
        canCreateVm: !!clubhouseClient.getSandbox() || clubhouseClient.supports('create_conversation'),
        canReact: clubhouseClient.supports('send_conversation_emoji_reaction'),
        threadNote: this.threadLiveNote,
        unreadById: this.conversationUnreadById,
      });
    } else if (this.currentTab === 'activity') {
      return activityView({
        items: this.activityItems,
        unread: this.unreadNotifications,
        experimentalOn: clubhouseClient.getConfig().experimentalActions === true,
        notificationsSupported: clubhouseClient.supports('get_notifications'),
      });
    } else if (this.currentTab === 'houses') {
      return housesView({
        items: this.housesList,
        open: this.selectedHouse,
        canHost: clubhouseClient.supports('create_channel'),
        canChat: clubhouseClient.supports('get_social_club_messages'),
        canMembers: clubhouseClient.supports('get_social_club_members'),
        chatOpen: this.houseChatOpen,
        chatMessages: this.houseChatMessages,
        canPost: this.houseChatCanPost && clubhouseClient.supports('send_social_club_message'),
        canThread: clubhouseClient.supports('get_social_club_message_thread'),
        canReact: clubhouseClient.supports('send_social_club_message_emoji_reaction'),
        canReplyThread: this.houseChatCanPost
          && clubhouseClient.supports('send_social_club_threaded_message'),
        threadId: this.houseChatThreadId,
        threadMessages: this.houseChatThreadMessages,
        membersOpen: this.houseMembersOpen,
        members: this.houseMembers,
      });
    } else if (this.currentTab === 'events') {
      return eventsView({
        items: this.eventsList,
        experimentalOn: clubhouseClient.getConfig().experimentalActions === true,
        supported: clubhouseClient.supports('get_events'),
      });
    } else if (this.currentTab === 'replay' && this.replayPlayback) {
      return replayView({ item: this.replayPlayback, rate: this.replayRate });
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
    const controls = stageControlFlags(this);
    const handraiseOn = this.currentChannel.is_handraise_enabled !== false;
    const permission = this.currentChannel.handraise_permission;
    const handraiseMode: 'off' | '1' | '2' = !handraiseOn
      ? 'off'
      : (permission === 2 ? '2' : '1');
    const visibilityMode: 'open' | 'social' | 'other' = this.currentChannel.is_private
      ? 'other'
      : (this.currentChannel.is_social_mode ? 'social' : 'open');
    return stageColumn({
      channel: this.currentChannel,
      me: this.me,
      openSpeakerMenuId: this.openSpeakerMenuId,
      audioDisconnected: this.audioConnected === false,
      moderator: this.isMeModerator(),
      ...controls,
      canFollow: clubhouseClient.supports('follow'),
      audienceSearch: this.audienceSearchQuery,
      handraiseMode,
      visibilityMode,
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



  private renderExploreView(): ReturnType<typeof html> {
    return exploreView(this.displayedHallwayChannels(), usableFeedTopics(this.channelsList, this.feedTopics), this.hallwayNotices(), {
      canJoin: clubhouseClient.supports('join_channel'),
      canCreate: clubhouseClient.supports('create_channel'),
      canHide: clubhouseClient.supports('hide_channel'),
      canLoadMore: !!this.feedNextCursor,
      loadingMore: this.feedLoadingMore,
    }, this.hallwayPrefs, this.selectedTopicKey);
  }











  private renderSettingsView(): ReturnType<typeof html> {
    return settingsView(
      clubhouseClient.getConfig(),
      this.shortcuts,
      this.recordingShortcut,
      !!electronAPI()?.isElectron,
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
      this.audioPrefs.spatialAudioEnabled === true,
      audioEngine.getBroadcastEffect(),
    );
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





  private renderCreateModal() {
    document.body.appendChild(mountCreateModal({
      titleSuggestions: this.roomTitleOptions,
      targets: this.createChannelTargets,
    }));
  }












  private bindEvents(): void {
    if (this.eventsBound) return;
    this.eventsBound = true;
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      const actionEl = target?.closest('[data-action]') as HTMLElement | null;
      if (!actionEl || (actionEl instanceof HTMLButtonElement && actionEl.disabled)) return;
      if (actionEl.dataset.action === 'duck-sounds') return;
      this.handleAction(actionEl.dataset.action || '', actionEl);
    });
    document.addEventListener('pointerdown', (event) => {
      const target = event.target as HTMLElement | null;
      const duck = target?.closest('[data-action="duck-sounds"]') as HTMLElement | null;
      if (!duck) return;
      event.preventDefault();
      audioEngine.setDuckHeld(true);
    });
    document.addEventListener('pointerup', () => audioEngine.setDuckHeld(false));
    document.addEventListener('pointercancel', () => audioEngine.setDuckHeld(false));
    document.addEventListener('input', (event) => {
      const target = event.target as HTMLInputElement | null;
      if (!target) return;
      if (target.id === 'discover-query') {
        this.discoverQuery = target.value;
        this.scheduleDiscoverSearch();
        return;
      }
      if (target.id === 'audience-search') {
        this.audienceSearchQuery = target.value;
        this.renderStage();
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
      const target = event.target as HTMLInputElement | HTMLSelectElement | null;
      if (!target) return;
      const action = target.getAttribute('data-action');
      if (action === 'set-handraise' && target instanceof HTMLSelectElement) {
        void this.setHandRaisePermission(target.value);
        return;
      }
      if (action === 'set-room-visibility' && target instanceof HTMLSelectElement) {
        void this.setRoomVisibility(target.value);
        return;
      }
      if (action === 'toggle-ping-select' && target instanceof HTMLInputElement) {
        this.togglePingSelect(target.dataset.userId);
        return;
      }
      if (target.id === 'cfg-spatial-audio' && target instanceof HTMLInputElement) {
        this.audioPrefs.spatialAudioEnabled = target.checked === true;
        audioEngine.setSpatialAudioEnabled(this.audioPrefs.spatialAudioEnabled);
        this.saveAudioPrefs();
        this.showToast(
          this.audioPrefs.spatialAudioEnabled ? t('spatialAudioOn') : t('spatialAudioOff'),
          '🎧',
        );
        return;
      }
      if (action === 'pick-voice-effect' && target instanceof HTMLSelectElement) {
        const value = target.value;
        if (value === 'none' || value === 'radio' || value === 'deep' || value === 'robot' || value === 'echo') {
          audioEngine.pickVoiceEffect(value);
        }
        return;
      }
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
      } else if (target.id === 'hallway-show-nsfw') {
        this.setHallwayShowNsfw(target.checked);
      } else if (target.id === 'hallway-only-keywords') {
        this.setHallwayOnlyKeywordMatches(target.checked);
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
    if (action === 'nav' && (tab === 'stage' || tab === 'explore' || tab === 'discover' || tab === 'friends' || tab === 'messages' || tab === 'activity' || tab === 'houses' || tab === 'events' || tab === 'soundboard' || tab === 'settings' || tab === 'login')) {
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
        if (tab === 'friends') {
          void this.loadSuggestions();
          void this.loadConversations();
        }
        if (tab === 'houses') void this.loadHouses();
        if (tab === 'events') void this.loadEvents();
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
      case 'load-more-hallway':
        void this.loadMoreChannels();
        break;
      case 'select-hallway-topic': {
        const key = el.dataset.topicKey;
        this.selectHallwayTopic(key || null);
        break;
      }
      case 'leave-room':
        void this.leaveRoom();
        break;
      case 'end-room':
        void this.endRoom();
        break;
      case 'mute-everyone':
        void this.muteEveryone();
        break;
      case 'rename-room':
        void this.renameRoom();
        break;
      case 'send-reaction':
        void this.sendReaction(el.dataset.emoji);
        break;
      case 'send-gif-reaction':
        void this.sendGifReaction();
        break;
      case 'open-ping-panel':
        void this.openPingPanel();
        break;
      case 'close-ping-panel':
        this.closePingInvitePanel();
        break;
      case 'ping-panel-root':
        break;
      case 'search-ping':
        void this.searchPingCandidates();
        break;
      case 'send-pings':
        void this.sendPings();
        break;
      case 'refresh-stage':
        void this.refreshStageManual();
        break;
      case 'log-out':
        void this.logOut();
        break;
      case 'messages-filter': {
        const filter = el.dataset.filter;
        if (filter === 'all' || filter === 'house' || filter === 'vm') {
          this.messageFilter = filter;
          if (this.openConversationId) {
            const openItem = this.conversations.find((entry) => entry.conversation_id === this.openConversationId);
            const kind = openItem ? conversationKind(openItem) : null;
            const visible = !!openItem && (
              filter === 'all'
                ? kind !== null
                : kind === filter
            );
            if (!visible) {
              this.openConversationId = null;
              this.openConversationThreadData = null;
              this.threadLiveNote = '';
              this.previewMember = null;
            }
          }
          this.render();
        }
        break;
      }
      case 'open-conversation': {
        const conversationId = el.dataset.conversationId;
        if (!conversationId) break;
        this.currentTab = 'messages';
        const known = this.conversations.find((entry) => entry.conversation_id === conversationId);
        if (known) {
          const kind = conversationKind(known);
          this.messageFilter = kind === 'house' || kind === 'vm' ? kind : 'all';
        } else {
          this.messageFilter = 'all';
        }
        void this.openConversationThread(conversationId);
        void this.loadConversations().then(() => {
          if (this.openConversationId !== conversationId || this.currentTab !== 'messages') return;
          const loaded = this.conversations.find((entry) => entry.conversation_id === conversationId);
          if (!loaded) return;
          const kind = conversationKind(loaded);
          const nextFilter = kind === 'house' || kind === 'vm' ? kind : 'all';
          if (this.messageFilter === nextFilter) return;
          this.messageFilter = nextFilter;
          this.render();
        });
        break;
      }
      case 'hide-room': {
        const channelId = el.dataset.channelId;
        if (channelId) void this.hideHallwayRoom(channelId);
        break;
      }
      case 'close-conversation':
        this.openConversationId = null;
        this.openConversationThreadData = null;
        this.threadLiveNote = '';
        this.previewMember = null;
        this.render();
        break;
      case 'thread-speed': {
        const rate = Number(el.dataset.rate);
        if (rate === 1 || rate === 1.5 || rate === 2) this.voiceRate = rate;
        this.render();
        break;
      }
      case 'play-thread-voice': {
        audioEngine.playVoiceNote(this.voiceRate);
        const conversationId = el.dataset.conversationId;
        const segmentId = el.dataset.segmentId;
        if (conversationId && segmentId && clubhouseClient.supports('mark_conversation_segment_listened')) {
          void clubhouseClient.markConversationSegmentListened(conversationId, segmentId).catch((err) => this.reportApiError(err));
        }
        break;
      }
      case 'react-thread-segment':
        void this.reactToThreadSegment(el.dataset.conversationId, el.dataset.segmentId, el.dataset.emoji);
        break;
      case 'refresh-messages':
        void this.loadConversations();
        if (this.openConversationId) void this.openConversationThread(this.openConversationId);
        break;
      case 'load-more-conversations':
        void this.loadMoreConversations();
        break;
      case 'refresh-activity':
        void this.loadActivity();
        break;
      case 'activity-join':
        if (el.dataset.channelId) void this.joinRoom(el.dataset.channelId);
        break;
      case 'refresh-houses':
        void this.loadHouses();
        break;
      case 'open-house':
        void this.openHouse(el.dataset.houseSlug);
        break;
      case 'open-house-members':
        void this.loadHouseMembers(el.dataset.houseId);
        break;
      case 'close-house-members':
        this.closeHouseMembers();
        break;
      case 'open-house-chat':
        void this.loadHouseChat(el.dataset.houseId, el.dataset.houseSlug);
        break;
      case 'close-house-chat':
        this.closeHouseChat();
        break;
      case 'send-house-chat':
        void this.sendHouseChat(el.dataset.houseId, el.dataset.houseSlug);
        break;
      case 'open-house-thread':
        void this.openHouseChatThread(el.dataset.houseId, el.dataset.messageId);
        break;
      case 'close-house-thread':
        this.closeHouseChatThread();
        break;
      case 'send-house-thread':
        void this.sendHouseChatThreadReply(el.dataset.houseId);
        break;
      case 'react-house-message':
        void this.reactHouseChatMessage(el.dataset.houseId, el.dataset.messageId, el.dataset.emoji);
        break;
      case 'open-replay':
        void this.openReplay(el.dataset.replayId);
        break;
      case 'open-highlight':
        void this.openHighlight(el.dataset.highlightId);
        break;
      case 'close-replay':
        this.closeReplay();
        break;
      case 'set-replay-rate':
        this.setReplayRate(el.dataset.rate);
        break;
      case 'skip-replay':
        this.skipReplay(el.dataset.seconds);
        break;
      case 'host-house-room': {
        const houseId = Number(el.dataset.houseId);
        if (!Number.isFinite(houseId) || !clubhouseClient.supports('create_channel')) {
          this.showToast(t('unverifiedAction'), '🔒');
          break;
        }
        void clubhouseClient.createChannel(t('hostInHouse'), {
          audience: 'house',
          socialClubId: houseId,
          replayEnabled: true,
          chatEnabled: true,
        }).then((created) => this.joinRoom(created.channel || String(created.channel_id)))
          .catch((err) => this.reportApiError(err));
        break;
      }
      case 'refresh-events':
        void this.loadEvents();
        break;
      case 'copy-event-link': {
        const link = safeUrl(el.dataset.eventUrl);
        if (!link) {
          this.showToast(t('noShareLink'), '🔗');
          break;
        }
        void navigator.clipboard.writeText(link).then(() => this.showToast(t('copiedLink'), '🔗'))
          .catch(() => this.showToast(t('somethingWrong'), '⚠️'));
        break;
      }
      case 'add-event-calendar':
        this.downloadEventIcs({
          id: el.dataset.eventId || 'event',
          title: el.dataset.eventTitle || t('events'),
          timeStart: el.dataset.eventStart || '',
          timeEnd: el.dataset.eventEnd || '',
          url: el.dataset.eventUrl || '',
          houseName: el.dataset.eventHouse || '',
        });
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
        void navigator.clipboard?.writeText(link).then(() => {
          this.showToast(t('linkCopied'), '📋');
        }).catch(() => {
          this.showToast(t('somethingWrong'), '🔗');
        });
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
      case 'pick-voice-effect': {
        const select = el as HTMLSelectElement;
        const value = select.value;
        if (value === 'none' || value === 'radio' || value === 'deep' || value === 'robot' || value === 'echo') {
          audioEngine.pickVoiceEffect(value);
        }
        break;
      }
      case 'preview-voice-effect':
        audioEngine.previewVoiceEffect();
        void audioEngine.ensureMicrophone().then(() => {
          if (!this.audioPrefs.monitorEnabled) {
            this.audioPrefs.monitorEnabled = true;
            audioEngine.setMonitorEnabled(true);
            this.saveAudioPrefs();
          }
          this.showToast(t('voiceEffectPreview'), '🎧');
          this.renderCockpit();
        });
        break;
      case 'apply-voice-effect': {
        audioEngine.applyVoiceEffect();
        const applied = audioEngine.getBroadcastEffect();
        this.audioPrefs.voiceEffectApplied = applied;
        this.saveAudioPrefs();
        this.showToast(t('voiceEffectApply'), '🎙️');
        break;
      }
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
      case 'add-hallway-keyword':
        this.addHallwayKeyword();
        break;
      case 'remove-hallway-keyword': {
        const keyword = el.dataset.keyword;
        if (keyword) this.removeHallwayKeyword(keyword);
        break;
      }
      case 'open-profile': {
        const uid = el.dataset.userId;
        const known = uid ? this.findKnownUser(uid) : undefined;
        if (known) {
          this.inspectProfile(known);
          break;
        }
        const numericId = Number(uid);
        if (Number.isFinite(numericId)) {
          this.inspectProfile({
            user_id: numericId,
            name: el.dataset.userName || el.dataset.name || '',
            username: el.dataset.username || String(numericId),
            photo_url: null,
          });
        }
        break;
      }
      case 'open-people-list': {
        const kind = el.dataset.list;
        const userId = Number(el.dataset.userId);
        if ((kind === 'followers' || kind === 'following') && Number.isFinite(userId)) {
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
        if (!Number.isFinite(uid) || (kind !== 'mute' && kind !== 'moderator' && kind !== 'audience' && kind !== 'block')) return;
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
      case 'copy-api-health-report': {
        const report = clubhouseClient.copyHealthReport();
        if (!report) break;
        void navigator.clipboard?.writeText(report).then(
          () => this.showToast(t('apiHealthCopied'), '📋'),
          () => this.showToast(t('somethingWrong'), '⚠️'),
        );
        break;
      }
      case 'reset-unsupported-routes':
        clubhouseClient.resetUnsupportedRoutes();
        this.showToast(t('apiHealthResetUnsupported'), '✅');
        this.render();
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
        void this.declineSpeakerInvite();
        break;
      case 'accept-invite':
        void this.acceptSpeakerInvite();
        break;
      default:
        break;
    }
  }





}


import { stageControlFlags, wireRoomCtl } from './roomCtl.ts';
import { wireHallwayCtl } from './hallwayCtl.ts';
import { wireMessagesCtl } from './messagesCtl.ts';
import { wireProfileCtl } from './profileCtl.ts';
import { wireActivityCtl } from './activityCtl.ts';
import { wireStudioCtl } from './studioCtl.ts';
import { wireSettingsCtl } from './settingsCtl.ts';

export function wireAppControllers(ClubboxAppClass: typeof ClubboxApp): void {
  const proto = ClubboxAppClass.prototype as ClubboxApp;
  wireRoomCtl(proto);
  wireHallwayCtl(proto);
  wireMessagesCtl(proto);
  wireProfileCtl(proto);
  wireActivityCtl(proto);
  wireStudioCtl(proto);
  wireSettingsCtl(proto);
}

wireAppControllers(ClubboxApp);
