import { ClubhouseApiError, clubhouseClient } from '../api/client';
import { emptyRoomSession } from '../api/guards';
import type { CreateChannelTargets } from '../api/createComposer';
import { conversationKind } from '../api/roomActions';
import { talkPartners, type PeopleListKind } from '../api/relationship';
import type { ClubboxAppCtlMethods } from './ctlMethods.ts';
import { electronAPI } from './electronApi.ts';
import { stageControlFlags } from './roomCtl.ts';
import { wireAppControllers } from './wireControllers.ts';

import { PubNubRoomSource } from '../api/pubnubRoomSource';
import { roomSync } from '../api/roomSync';
import { audioEngine } from '../audio/audioEngine';
import { readAudioPrefs, type AudioPrefs } from '../audio/audioPrefs';
import { SYSTEM_AUDIO_DEVICE_ID } from '../audio/externalConstraints';
import { systemAudioCaptureAllowed } from '../audio/externalDuck';
import { readAppPrefs, syncSystemThemeListener, zoomFactorFromPercent } from './appPrefs';
import { popView, pushView, type ViewSnapshot } from './viewStack';
import { readShortcuts, type ShortcutAction, type ShortcutMap } from '../shortcuts';
import { agoraVoice } from '../audio/agoraVoice';
import type { ActivityItem } from '../api/activityFeed';
import type { EventListItem, HouseChatMessage, HouseListItem, HouseMemberItem } from '../api/communityLists';
import type { PingCandidate } from '../api/pingInvites';
import type { ReplayPlayback } from '../api/replayPlayback';
import type { CHChannel, CHChannelDetail, CHChatMessage, CHConversation, ConversationThread, CHUser, FeedTopic, MeSettings, SearchHit } from '../api/types';
import { housesView } from '../ui/views/houses';
import { replayView } from '../ui/views/replay';
import { setLanguage, t } from '../i18n';
import { installAvatarFallback } from '../ui/avatar';
import { cockpitBar } from '../ui/components/cockpitBar';
import { mountCreateModal } from '../ui/components/createModal';
import { selfProfilePage } from '../ui/components/profileDrawer';
import { roomDetailsPanel } from '../ui/components/roomDetailsPanel';
import { showToast } from '../ui/components/toast';
import { html, markup, safeUrl } from '../ui/html';
import { icon } from '../ui/icons';
import { renderSidebarChrome } from '../ui/shellChrome';
import { activityView } from '../ui/views/activity';
import { exploreView } from '../ui/views/explore';
import { peopleListView } from '../ui/views/peopleList';
import { discoverView, type DiscoverTab } from '../ui/views/discover';
import { loginView } from '../ui/views/login';
import { messagesView } from '../ui/views/messages';
import { chatList, emptyStageView, stageColumn, stageView } from '../ui/views/stage';
import { readHallwayPrefs, type HallwayPrefs } from '../hallway/hallwayPrefs';
import { usableFeedTopics } from '../hallway/hallwayDisplay';
import type { RecordingChapter } from '../studio/recordingChapters';

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- merged with ClubboxAppCtlMethods below (Task 13.1)
export class ClubboxApp {
  currentTab: 'stage' | 'explore' | 'discover' | 'friends' | 'messages' | 'activity' | 'houses' | 'events' | 'replay' | 'soundboard' | 'settings' | 'login' = 'explore';
  viewStack: ViewSnapshot[] = [];
  roomDetailsOpen = false;
  reactionsOpen = false;
  soundsOpen = false;
  roomBarOverflowOpen = false;
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
  currentChannel: CHChannelDetail | null = null;
  channelsList: CHChannel[] = [];
  feedTopics: FeedTopic[] = [];
  selectedTopicKey: string | null = null;
  conversations: CHConversation[] = [];
  conversationsLoaded = false;
  conversationUnreadById: Record<string, number> = {};
  messageFilter: 'all' | 'house' | 'vm' = 'all';
  openConversationId: string | null = null;
  openConversationThreadData: ConversationThread | null = null;
  threadLiveNote = '';
  previewMember: string | null = null;
  voiceRate = 1;
  privateVoice = false;
  privateLines: { userId: number; text: string; voice: boolean }[] = [];
  activityCount: number | null = null;
  activityItems: ActivityItem[] | null = null;
  suggestionsCount: number | null = null;
  discoverQuery = '';
  discoverTab: DiscoverTab = 'top';
  discoverHits: SearchHit[] | null = null;
  discoverLoading = false;
  discoverTimer: number | null = null;
  discoverSeq = 0;
  me: CHUser | null = null;
  meSettings: MeSettings | null = null;
  unreadNotifications = false;
  unreadConversations = 0;
  selectedProfile: CHUser | null = null;
  loginBusy = false;
  loginNotice = '';
  adoptRetryTimer: number | null = null;
  adoptRetryCount = 0;
  adoptInFlight = false;
  /** True after we have asked Electron to open the Clubhouse sign-in window. */
  signInWindowSynced = false;
  guidelinesOpen = false;
  pendingLive = false;
  isCreateModalOpen: boolean = false;
  isSettingsModalOpen: boolean = false;
  isProfileDrawerOpen: boolean = false;
  selfProfileOpen = false;
  recordTimerInterval: number | null = null;
  recordDurationSec: number = 0;
  pingTimer: number | null = null;
  chatTimer: number | null = null;
  activityTimer: number | null = null;
  roomTitleOptions: string[] = [];
  createChannelTargets: CreateChannelTargets | null = null;
  notificationsEnabled: boolean | null = null;
  soundEffectsEnabled: boolean | null = null;
  anonymousEnabled: boolean | null = null;
  needsAgeVerification = false;
  isOnboarding = false;
  publicHallway: boolean | null = null;
  blockedCount: number | null = null;
  isAdmin = false;
  requestedFollowingCount: number | null = null;
  dmRequestCount = 0;
  profileLoading = false;
  peopleList: {
    kind: PeopleListKind;
    userId: number;
    users: CHUser[] | null;
    nextCursor: string | null;
    loadingMore: boolean;
    unavailable?: boolean;
    moreNotShown?: number;
  } | null = null;
  peopleListSeq = 0;
  openSpeakerMenuId: number | null = null;
  speakerInviteVisible = false;
  dismissedSpeakerInvite = false;
  audioConnected: boolean | null = null;
  agoraRoleSyncing = false;
  agoraPromoteFailures = 0;
  roomSession = emptyRoomSession();
  joinInFlight = false;
  authCleanupStarted = false;
  hiddenPauseTimer: number | null = null;
  pollsPaused = false;
  rateLimitNotices = new Set<string>();
  musicModeChain: Promise<void> = Promise.resolve();
  eventsBound = false;

  chatMessages: CHChatMessage[] = [];
  unreadChat = 0;
  chatOpen = true;
  pubnubSource = new PubNubRoomSource({
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
      // Hub connect/fail toggles shouldPollChat — arm HTTP chat fallback when PubNub is down.
      this.syncChatPolling();
    },
    onRoomEnded: () => {
      void this.releaseRoomLocally({ skipServer: true }).then(() => {
        this.afterRoomExit(true, false, true);
        this.showToast(t('roomEndedByHost'), '🚪');
      });
    },
  });
  audioPrefs: AudioPrefs = readAudioPrefs();
  externalInputOptions: { id: string; label: string }[] = [];
  systemAudioAvailable = false;
  systemAudioBlockedReason = '';
  shortcuts: ShortcutMap = readShortcuts();
  recordingShortcut: ShortcutAction | null = null;
  editingSoundId: string | null = null;
  connectionStatus: {
    webSession: boolean;
    realtimeKeys: boolean;
    pubnubConnected: boolean;
    agoraJoined: boolean;
    agoraResult: string | null;
    broadcastExtras: boolean | null;
    verboseVoiceLog: boolean;
    rtc?: {
      rtt: number;
      sendBitrate: number;
      recvBitrate: number;
      duration: number;
      remotes: { uid: string; packetLoss: number; e2eDelay: number }[];
    } | null;
  } | null = null;
  hallwayPrefs: HallwayPrefs = readHallwayPrefs();
  feedNextCursor: string | null = null;
  feedPagesLoaded = 0;
  feedLoadingMore = false;
  conversationsNextCursor: string | null = null;
  conversationsLoadingMore = false;
  audienceSearchQuery = '';
  recordingChapters: RecordingChapter[] = [];
  networkQualityTone: 'good' | 'ok' | 'poor' | 'unknown' = 'unknown';
  networkQualityUp = 0;
  networkQualityDown = 0;
  agoraRejoinTimer: ReturnType<typeof setTimeout> | null = null;
  rtcStatsTimer: ReturnType<typeof setInterval> | null = null;

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

  async runStartupApiTriage(): Promise<void> {
    const run = electronAPI()?.runApiTriage;
    if (!run) return;
    try {
      const result = await run();
      if (!result?.ok) return;
      const applied = clubhouseClient.promoteEndpointsLocally(result.promotions ?? []);
      if (applied.length) {
        this.showToast(t('evidenceLogPromoted', { endpoints: applied.join(', ') }), '🚪');
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

  async init() {
    setLanguage(clubhouseClient.getConfig().language);
    {
      const theme = readAppPrefs().theme;
      syncSystemThemeListener(theme);
      void electronAPI()?.setNativeThemeSource?.(theme);
    }
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
    electronAPI()?.onSignInProgress?.((payload) => {
      const step = payload?.step;
      if (step === 'otp') {
        this.loginNotice = t('officialSignInOtpWaiting');
        this.render();
      } else if (step === 'phone') {
        this.loginNotice = t('officialSignInWaiting');
        this.render();
      }
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
        this.currentTab = 'login';
      } else {
        const adopted = await clubhouseClient.adoptWebSession();
        if (!adopted) this.currentTab = 'login';
      }
      await this.runStartupApiTriage();
    } else if (!this.guidelinesAccepted() && !clubhouseClient.getConfig().useSandbox) {
      this.pendingLive = true;
      this.guidelinesOpen = true;
      await clubhouseClient.updateConfig({ useSandbox: true });
    }
    if (!this.isAuthGated() && (forceSandbox || !(desktop && !this.guidelinesAccepted()))) {
      await this.refreshMe();
      try {
        await this.reloadChannels();
      } catch (err) {
        this.reportApiError(err);
      }
    } else if (this.isAuthGated()) {
      this.currentTab = 'login';
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

    // Mute badges: Agora uid = Clubhouse user_id (not PubNub). Same room-update path as PubNub stage events.
    agoraVoice.onRemoteMute(({ uid, muted }) => {
      if (!this.currentChannel?.users) return;
      this.pubnubSource.applyAgoraMute(uid, muted);
    });
    agoraVoice.onReconnectUi((reconnecting) => {
      const banner = document.getElementById('realtime-banner');
      if (banner) banner.hidden = !reconnecting;
    });
    agoraVoice.onBanned((reason) => {
      if (!this.currentChannel || clubhouseClient.getConfig().useSandbox) return;
      this.showToast(t('agoraBannedFromRoom', { reason }), '🔇');
      void this.releaseRoomLocally().then(() => this.afterRoomExit(true, false, true));
    });
    agoraVoice.onNeedRejoin((delayMs, attempt) => {
      if (!this.currentChannel || clubhouseClient.getConfig().useSandbox) return;
      if (this.agoraRejoinTimer) clearTimeout(this.agoraRejoinTimer);
      console.warn(`[Clubbox] Agora rejoin scheduled attempt=${attempt} in ${delayMs}ms`);
      this.agoraRejoinTimer = setTimeout(() => {
        this.agoraRejoinTimer = null;
        void this.rejoinAgoraAudio();
      }, delayMs);
    });
    agoraVoice.onNeedToken((kind) => {
      void this.handleAgoraTokenEvent(kind);
    });
    agoraVoice.onMicrophoneChanged((label) => {
      this.audioPrefs.inputDeviceId = audioEngine.getInputDeviceId();
      this.saveAudioPrefs();
      this.showToast(t('microphoneChangedTo', { label }), '🎙️');
      if (this.currentTab === 'settings') void this.fillAudioDevices();
    });
    agoraVoice.onNetworkQuality((tone, uplink, downlink) => {
      this.networkQualityTone = tone;
      this.networkQualityUp = uplink;
      this.networkQualityDown = downlink;
      const dot = document.querySelector('[data-network-quality]') as HTMLElement | null;
      if (dot) {
        dot.dataset.tone = tone;
        dot.title = t('networkQualityTitle', { up: String(uplink), down: String(downlink) });
      }
    });
    agoraVoice.onConnectionProblem((reason) => {
      if (!this.currentChannel || clubhouseClient.getConfig().useSandbox) return;
      this.audioConnected = false;
      console.warn('[Clubbox] Agora connection problem (retries exhausted):', reason);
      this.showToast(t('agoraDnsFailed'), '🔇');
      this.render();
    });

    audioEngine.setSimulateMeterOnFailure(clubhouseClient.getConfig().useSandbox);

    if (this.isAuthGated()) {
      this.currentTab = 'login';
    } else if (this.currentTab === 'stage' || this.currentTab === 'login') {
      this.currentTab = 'explore';
    }

    try {
      await audioEngine.loadStoredPads();
    } catch {
      // IndexedDB can be unavailable. The built-in pads still play.
    }
    await this.syncShortcuts();

    // Render even when the network failed so the shell is never blank.
    // render() already syncs the Clubhouse sign-in window when gated — do not
    // call syncEmbeddedSignIn again here (double-open race → WidgetHost).
    this.render();
  }

























  accountStamp(): string {
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

















  reportApiError(err: unknown): void {
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

















  updateModeBadge(): void {
    const badge = document.querySelector('.mode-badge');
    if (!badge) return;
    const sandbox = clubhouseClient.getConfig().useSandbox;
    badge.textContent = sandbox ? t('sandboxBadge') : t('liveBadge');
    badge.classList.toggle('sandbox', sandbox);
    badge.classList.toggle('live', !sandbox);
  }

  syncSelectedProfileFromRoom(): void {
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



































  showToast(message: string, icon = '✨') {
    showToast(message, icon);
  }

  ensureProfileDrawer(): HTMLElement {
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
    const gated = this.isAuthGated();
    if (gated) {
      this.currentTab = 'login';
      this.selfProfileOpen = false;
    }
    document.getElementById('app')?.classList.toggle('app-login-only', gated);
    this.renderSidebar();
    this.renderTopBar();
    this.renderView();
    if (this.currentTab === 'settings') void this.fillAudioDevices();
    this.renderCockpit();
    this.syncRecBanner();
    this.renderGuidelines();
    if (this.isProfileDrawerOpen) this.renderProfileDrawer();
    this.renderRoomDetails();
    // Open the Clubhouse window once; re-running show() on every render stole
    // focus mid-OTP. openOfficialSignIn() resets the flag to reopen it.
    if (gated && this.guidelinesAccepted() && this.currentTab === 'login') {
      if (!this.signInWindowSynced) void this.syncEmbeddedSignIn();
    } else if (!gated) {
      this.stopAdoptRetry();
      this.signInWindowSynced = false;
      void electronAPI()?.hideEmbeddedSignIn?.();
    }
  }

  renderRoomDetails(): void {
    const existing = document.getElementById('room-details-root');
    if (!this.roomDetailsOpen || !this.currentChannel) {
      existing?.remove();
      return;
    }
    let root = existing;
    if (!root) {
      root = document.createElement('div');
      root.id = 'room-details-root';
      document.querySelector('.studio-main')?.appendChild(root);
    }
    const music = audioEngine.getIsMusicMode();
    const flags = stageControlFlags(this);
    const mod = this.isMeModerator();
    const speaker = this.isMeSpeaker();
    root.innerHTML = markup(roomDetailsPanel({
      topic: this.currentChannel.topic,
      replaysOn: this.currentChannel.is_replay_enabled !== false,
      audioQuality: music ? 'music' : 'normal',
      monitorEnabled: audioEngine.getMonitorEnabled(),
      voiceEffect: audioEngine.getBroadcastEffect(),
      voiceEffectOptions: [
        { id: 'none', label: t('voiceEffectNone') },
        { id: 'radio', label: t('voiceEffectRadio') },
        { id: 'deep', label: t('voiceEffectDeep') },
        { id: 'robot', label: t('voiceEffectRobot') },
        { id: 'echo', label: t('voiceEffectEcho') },
      ],
      spatialAudio: this.audioPrefs.spatialAudioEnabled === true,
      canMuteAll: mod && flags.canMuteEveryone,
      canShare: !!safeUrl(this.currentChannel.url),
      canModerate: mod,
      canRename: mod && flags.canRename,
      canPing: mod && flags.canPing,
      canEnd: mod && flags.canEnd,
      canChangeVisibility: mod && flags.canChangeVisibility,
      canHandraise: mod && flags.canHandraise,
      visibilityMode: 'open',
      handraiseMode: this.currentChannel.is_handraise_enabled === false ? 'off' : '1',
      helpUrl: 'https://support.clubhouse.com/hc/en-us/articles/360059385913',
      showExternalAudio: speaker,
      externalDevices: this.externalInputOptions,
      externalDeviceId: audioEngine.getExternalDeviceId() || this.audioPrefs.externalDeviceId || '',
      externalVolume: audioEngine.getExternalVolume(),
      externalMuted: audioEngine.getExternalMuted(),
      externalMonitor: audioEngine.getExternalMonitor(),
      externalDuck: audioEngine.getExternalDuckEnabled(),
      externalDuckDb: audioEngine.getExternalDuckDb(),
      externalActive: audioEngine.isExternalActive(),
      systemAudioAvailable: this.systemAudioAvailable,
      systemAudioBlockedReason: this.systemAudioBlockedReason,
    }));
    if (speaker) void this.refreshExternalAudioOptions();
  }

  async refreshExternalAudioOptions(): Promise<void> {
    const micId = audioEngine.getInputDeviceId() || this.audioPrefs.inputDeviceId || '';
    let devices: MediaDeviceInfo[];
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch {
      devices = [];
    }
    const nextOptions = devices
      .filter((device) => device.kind === 'audioinput' && device.deviceId && device.deviceId !== micId)
      .map((device, index) => ({
        id: device.deviceId,
        label: device.label || `${t('unnamedDevice')} ${index + 1}`,
      }));
    const platform = electronAPI()?.platform;
    const outputId = audioEngine.getOutputDeviceId() || this.audioPrefs.outputDeviceId || '';
    const defaultOut = devices.find((device) => device.kind === 'audiooutput' && device.deviceId === 'default')?.deviceId
      || 'default';
    let systemOk = false;
    let systemReason = '';
    if (platform === 'win32') {
      if (systemAudioCaptureAllowed(outputId, defaultOut)) {
        systemOk = true;
      } else {
        systemReason = t('externalSystemAudioEchoGuard');
      }
    } else if (platform === 'darwin' || platform === 'linux') {
      systemReason = t('externalSystemAudioMacHint');
    } else {
      systemReason = t('externalSystemAudioDesktopOnly');
    }
    const optionsChanged = JSON.stringify(nextOptions) !== JSON.stringify(this.externalInputOptions)
      || systemOk !== this.systemAudioAvailable
      || systemReason !== this.systemAudioBlockedReason;
    this.externalInputOptions = nextOptions;
    this.systemAudioAvailable = systemOk;
    this.systemAudioBlockedReason = systemReason;
    if (!this.roomDetailsOpen || !document.querySelector('[data-external-audio]')) return;
    if (optionsChanged) {
      // Re-paint once with the enumerated list (guarded by optionsChanged).
      const music = audioEngine.getIsMusicMode();
      const flags = stageControlFlags(this);
      const mod = this.isMeModerator();
      const root = document.getElementById('room-details-root');
      if (!root || !this.currentChannel) return;
      root.innerHTML = markup(roomDetailsPanel({
        topic: this.currentChannel.topic,
        replaysOn: this.currentChannel.is_replay_enabled !== false,
        audioQuality: music ? 'music' : 'normal',
        monitorEnabled: audioEngine.getMonitorEnabled(),
        voiceEffect: audioEngine.getBroadcastEffect(),
        voiceEffectOptions: [
          { id: 'none', label: t('voiceEffectNone') },
          { id: 'radio', label: t('voiceEffectRadio') },
          { id: 'deep', label: t('voiceEffectDeep') },
          { id: 'robot', label: t('voiceEffectRobot') },
          { id: 'echo', label: t('voiceEffectEcho') },
        ],
        spatialAudio: this.audioPrefs.spatialAudioEnabled === true,
        canMuteAll: mod && flags.canMuteEveryone,
        canShare: !!safeUrl(this.currentChannel.url),
        canModerate: mod,
        canRename: mod && flags.canRename,
        canPing: mod && flags.canPing,
        canEnd: mod && flags.canEnd,
        canChangeVisibility: mod && flags.canChangeVisibility,
        canHandraise: mod && flags.canHandraise,
        visibilityMode: 'open',
        handraiseMode: this.currentChannel.is_handraise_enabled === false ? 'off' : '1',
        helpUrl: 'https://support.clubhouse.com/hc/en-us/articles/360059385913',
        showExternalAudio: true,
        externalDevices: this.externalInputOptions,
        externalDeviceId: audioEngine.getExternalDeviceId() || this.audioPrefs.externalDeviceId || '',
        externalVolume: audioEngine.getExternalVolume(),
        externalMuted: audioEngine.getExternalMuted(),
        externalMonitor: audioEngine.getExternalMonitor(),
        externalDuck: audioEngine.getExternalDuckEnabled(),
        externalDuckDb: audioEngine.getExternalDuckDb(),
        externalActive: audioEngine.isExternalActive(),
        systemAudioAvailable: this.systemAudioAvailable,
        systemAudioBlockedReason: this.systemAudioBlockedReason,
      }));
    }
  }

  async setExternalAudioDevice(deviceId: string): Promise<void> {
    if (!deviceId) {
      audioEngine.releaseExternal();
      audioEngine.setExternalDeviceId('');
      this.audioPrefs.externalDeviceId = '';
      this.saveAudioPrefs();
      this.renderRoomDetails();
      return;
    }
    if (deviceId === SYSTEM_AUDIO_DEVICE_ID) {
      await this.refreshExternalAudioOptions();
      if (!this.systemAudioAvailable) {
        this.showToast(this.systemAudioBlockedReason || t('externalSystemAudioEchoGuard'), '🔊');
        this.renderRoomDetails();
        return;
      }
    }
    if (!this.audioPrefs.externalCopyrightSeen) {
      this.showToast(t('externalCopyrightReminder'), '©️');
      this.audioPrefs.externalCopyrightSeen = true;
      this.saveAudioPrefs();
    }
    if (!audioEngine.getIsMusicMode()) {
      const offer = window.confirm(t('externalOfferMusic'));
      if (offer) {
        await audioEngine.toggleMusicMode();
        this.showToast(t('musicHeadphones'), '🎧');
      }
    }
    const ok = await audioEngine.startExternal(deviceId);
    if (!ok) {
      this.showToast(t('externalAudioOff'), '🔊');
      this.renderRoomDetails();
      return;
    }
    this.audioPrefs.externalDeviceId = deviceId;
    this.saveAudioPrefs();
    this.renderRoomDetails();
  }

  ensureShell(): void {
    if (document.getElementById('shell-sidebar')) return;
    const app = document.getElementById('app');
    if (!app) return;
    app.innerHTML = '<aside class="sidebar" id="shell-sidebar"></aside><main class="studio-main"><header class="top-bar" id="shell-topbar"></header><div class="rec-banner" id="rec-banner" hidden></div><div class="content-area" id="view-root"></div><div id="cockpit-root"></div></main>';
    this.bindEvents();
  }

  renderSidebar(): void {
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
        ${renderSidebarChrome({
          currentTab: this.currentTab,
          selfProfileOpen: this.selfProfileOpen,
          settingsOpen: this.currentTab === 'settings',
          unreadConversations: this.unreadConversations,
          unreadNotifications: this.unreadNotifications,
          me: this.me,
        })}
    `);
  }

  snapshotView(): ViewSnapshot {
    return {
      tab: this.currentTab,
      selfProfileOpen: this.selfProfileOpen,
      settingsOpen: this.currentTab === 'settings',
      openConversationId: this.openConversationId,
      selectedHouseId: this.selectedHouse?.id ?? null,
      peopleListOpen: !!this.peopleList,
    };
  }

  pushCurrentView(): void {
    this.viewStack = pushView(this.viewStack, this.snapshotView());
  }

  restoreView(snap: ViewSnapshot): void {
    this.selfProfileOpen = snap.selfProfileOpen;
    this.openConversationId = snap.openConversationId;
    if (snap.settingsOpen) this.currentTab = 'settings';
    else this.currentTab = snap.tab as typeof this.currentTab;
    if (!snap.selectedHouseId) {
      this.selectedHouse = null;
      this.houseChatOpen = false;
      this.houseMembersOpen = false;
    }
    if (!snap.peopleListOpen) this.clearPeopleList();
  }

  goBack(): void {
    if (this.roomDetailsOpen) {
      this.roomDetailsOpen = false;
      this.render();
      return;
    }
    if (this.isProfileDrawerOpen) {
      this.closeProfileDrawer();
      return;
    }
    if (this.isCreateModalOpen) {
      this.closeCreateModal();
      return;
    }
    if (this.speakerInviteVisible) {
      this.closeSpeakerInvite();
      return;
    }
    if (this.openSpeakerMenuId != null) {
      this.openSpeakerMenuId = null;
      this.render();
      return;
    }
    const { stack, previous } = popView(this.viewStack);
    this.viewStack = stack;
    if (!previous) {
      if (this.selfProfileOpen) {
        this.selfProfileOpen = false;
        this.render();
      }
      return;
    }
    this.restoreView(previous);
    this.render();
  }

  canGoBack(): boolean {
    return this.viewStack.length > 0
      || this.selfProfileOpen
      || this.currentTab === 'settings'
      || this.currentTab === 'houses'
      || this.currentTab === 'replay'
      || !!this.openConversationId
      || !!this.peopleList;
  }

  renderTopBar(): void {
    const el = document.getElementById('shell-topbar');
    if (!el) return;
    const onRoomPage = !!this.currentChannel && this.currentTab === 'stage' && !this.selfProfileOpen;
    const showBack = !onRoomPage && this.canGoBack();
    el.innerHTML = markup(html`
          <div class="room-meta">
            ${showBack ? html`
              <button class="top-back-btn" type="button" data-action="nav-back" aria-label="${t('back')}">←</button>
            ` : ''}
            ${onRoomPage ? html`
              <div class="live-indicator">
                <span class="pulse-dot"></span> ${t('onAir')}
              </div>
              <div class="room-title-group">
                <div class="room-club-badge">${this.roomHousePhoto()} ${this.currentChannel!.club_name || t('publicStage')}</div>
                <div class="room-topic" data-topbar-title>${this.currentChannel!.topic}</div>
                ${this.currentChannel!.privacy_tooltip ? html`<span class="live-updates-note">${this.currentChannel!.privacy_tooltip}</span>` : ''}
                ${this.currentChannel!.is_active_trending_topic_channel ? html`<span class="live-updates-note">${t('trending')}</span>` : ''}
                ${this.currentChannel!.is_replay_enabled ? html`<span class="live-updates-note">${t('replayAvailable')}</span>` : ''}
                ${this.liveUpdatesUnavailable() ? html`<span class="live-updates-note">${this.pubnubSource.getLastFailureReason?.() ? t('liveUpdatesRetrying') : t('liveUpdatesNote')}</span>` : ''}
                <span class="recording-badge" id="clip-armed-badge" ${audioEngine.isClipArmed() ? '' : 'hidden'}>● ${t('clipArmed')}</span>
                <span class="recording-badge" id="recording-badge" ${audioEngine.getIsRecording() ? '' : 'hidden'}>● ${t('recording')}</span>
              </div>
            ` : html`
              <div class="topbar-title" data-topbar-title style="font-weight:700; font-size:16px;">${this.sectionTitle()}</div>
            `}
          </div>

          <div class="top-actions">
            ${onRoomPage ? html`
              <button class="btn btn-secondary" type="button" data-action="minimize-room">${t('minimize')}</button>
            ` : this.isAuthGated() ? '' : html`
              ${clubhouseClient.supports('create_channel') ? html`
                <button class="btn btn-primary" data-action="create-room" data-start-room="top">${icon('plus')} ${t('startRoom')}</button>
              ` : html`
                <button class="btn btn-secondary" type="button" disabled title="${t('notVerifiedHint')}">${t('notVerifiedYet')}</button>
              `}
            `}
          </div>
    `);
  }

  renderView(): void {
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

  sectionTitle(): string {
    if (this.selfProfileOpen) return t('yourProfile');
    return this.placeTitle();
  }

  placeTitle(): string {
    if (this.currentTab === 'discover') return t('discover');
    if (this.currentTab === 'friends') return t('friends');
    if (this.currentTab === 'houses') return t('houses');
    if (this.currentTab === 'events') return t('events');
    if (this.currentTab === 'replay') return this.replayPlayback?.kind === 'highlight' ? t('highlight') : t('replay');
    if (this.currentTab === 'messages') return t('messages');
    if (this.currentTab === 'activity') return t('activity');
    if (this.currentTab === 'soundboard') return t('soundboard');
    if (this.currentTab === 'settings') return t('settings');
    if (this.currentTab === 'stage') return t('liveStage');
    if (this.currentTab === 'login') return t('signIn');
    return t('hallway');
  }

  renderCurrentView(): ReturnType<typeof html> {
    if (this.selfProfileOpen && this.me) {
      if (this.peopleList && this.peopleList.userId === this.me.user_id) {
        return peopleListView(this.peopleList);
      }
      const self = this.selectedProfile?.user_id === this.me.user_id
        ? this.selectedProfile
        : this.me;
      return selfProfilePage(this.profileState(self));
    }
    if (this.currentTab === 'login') {
      return this.renderLoginView();
    } else if (this.currentTab === 'stage') {
      return this.renderStageView();
    } else if (this.currentTab === 'explore') {
      return this.renderExploreView();
    } else if (this.currentTab === 'discover' || this.currentTab === 'friends') {
      return discoverView(
        this.discoverQuery,
        this.discoverTab,
        this.discoverHits,
        this.discoverLoading,
        {
          suggestions: this.suggestionsCount,
          talkPartners: this.conversationsLoaded ? talkPartners(this.conversations, this.me?.user_id ?? null) : null,
          houses: this.housesList,
        },
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
    } else if (this.currentTab === 'activity' || this.currentTab === 'events') {
      return activityView({
        items: this.activityItems,
        unread: this.unreadNotifications,
        experimentalOn: clubhouseClient.getConfig().experimentalActions === true,
        notificationsSupported: clubhouseClient.supports('get_notifications'),
        events: this.eventsList,
        eventsSupported: clubhouseClient.supports('get_events'),
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
    } else if (this.currentTab === 'replay' && this.replayPlayback) {
      return replayView({ item: this.replayPlayback, rate: this.replayRate });
    } else if (this.currentTab === 'soundboard') {
      return this.renderSoundboardView();
    } else {
      return this.renderSettingsView();
    }
  }

  renderLoginView(): ReturnType<typeof html> {
    return loginView({
      busy: this.loginBusy,
      notice: this.loginNotice,
      desktop: !!electronAPI()?.isElectron,
    });
  }

  renderStageView(): ReturnType<typeof html> {
    if (!this.currentChannel) return emptyStageView();
    return stageView(this.stageColumn(), this.chatList(), this.chatOpen && this.currentChannel.is_chat_enabled !== false);
  }

  stageColumn(): ReturnType<typeof html> {
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

  chatList(): ReturnType<typeof html> {
    return chatList(this.chatMessages);
  }

  latestChatLine(): string {
    if (this.currentChannel?.is_chat_enabled === false) return '';
    const last = this.chatMessages[this.chatMessages.length - 1];
    if (!last) return '';
    return `${last.name}: ${last.message}`;
  }



  renderExploreView(): ReturnType<typeof html> {
    return exploreView(this.displayedHallwayChannels(), usableFeedTopics(this.channelsList, this.feedTopics), this.hallwayNotices(), {
      canJoin: clubhouseClient.supports('join_channel'),
      canCreate: clubhouseClient.supports('create_channel'),
      canHide: clubhouseClient.supports('hide_channel'),
      canLoadMore: !!this.feedNextCursor,
      loadingMore: this.feedLoadingMore,
    }, this.hallwayPrefs, this.selectedTopicKey, {
      allChannels: this.channelsList,
      selectedPrivacy: this.hallwayPrefs.selectedPrivacy,
      pagesChecked: this.hallwayPrefs.selectedPrivacy ? this.feedPagesLoaded : 0,
      emptyMessage: this.hallwayPrivacyEmptyMessage(),
    });
  }











  renderCockpitBar(): ReturnType<typeof html> {
    const flags = stageControlFlags(this);
    return cockpitBar({
      muted: audioEngine.getIsMuted(),
      recording: audioEngine.getIsRecording(),
      handRaised: clubhouseClient.isHandRaised(),
      handDisabled: !this.currentChannel || this.isMeSpeaker() || this.currentChannel.is_handraise_enabled === false,
      canRaiseHand: clubhouseClient.supports('audience_reply'),
      showAudioRetry: !!this.currentChannel && this.audioConnected === false && !clubhouseClient.getConfig().useSandbox,
      isSpeaker: this.isMeSpeaker(),
      inRoom: !!this.currentChannel,
      roomTitle: this.currentChannel?.topic ?? '',
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
      reactionsOpen: this.reactionsOpen,
      soundsOpen: this.soundsOpen,
      canReact: flags.canReact,
      canGifReact: flags.canGifReact,
      overflowOpen: this.roomBarOverflowOpen,
      networkQualityTone: this.networkQualityTone,
      networkQualityTitle: t('networkQualityTitle', {
        up: String(this.networkQualityUp),
        down: String(this.networkQualityDown),
      }),
    });
  }





  renderCreateModal() {
    document.body.appendChild(mountCreateModal({
      titleSuggestions: this.roomTitleOptions,
      targets: this.createChannelTargets,
    }));
  }












  bindEvents(): void {
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
      if (target.id === 'room-external-vol') {
        const val = parseFloat(target.value);
        if (!Number.isFinite(val)) return;
        audioEngine.setExternalVolume(val);
        this.audioPrefs.externalVolume = val;
        this.saveAudioPrefs();
      }
      if (target.id === 'room-external-duck-db') {
        const val = parseFloat(target.value);
        if (!Number.isFinite(val)) return;
        audioEngine.setExternalDuckDb(val);
        this.audioPrefs.externalDuckDb = val;
        this.saveAudioPrefs();
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
          '✨',
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
      if (action === 'set-external-device' && target instanceof HTMLSelectElement) {
        void this.setExternalAudioDevice(target.value);
        return;
      }
      if (action === 'toggle-external-mute' && target instanceof HTMLInputElement) {
        audioEngine.setExternalMuted(target.checked);
        return;
      }
      if (action === 'toggle-external-monitor' && target instanceof HTMLInputElement) {
        audioEngine.setExternalMonitor(target.checked);
        this.audioPrefs.externalMonitor = target.checked;
        this.saveAudioPrefs();
        return;
      }
      if (action === 'toggle-external-duck' && target instanceof HTMLInputElement) {
        audioEngine.setExternalDuckEnabled(target.checked);
        this.audioPrefs.externalDuck = target.checked;
        this.saveAudioPrefs();
        this.renderRoomDetails();
        return;
      }
      if (target.id === 'radio-sandbox' || target.id === 'radio-live') {
        void this.switchRuntimeMode(target.id === 'radio-sandbox');
      } else if (target.id === 'cfg-input-device') {
        this.audioPrefs.inputDeviceId = target.value;
        this.saveAudioPrefs();
        audioEngine.setInputDeviceId(target.value);
        // In a room: switch the live Agora mic track (Phase 24.4) — no republish.
        if (agoraVoice.getIsJoined() && agoraVoice.getIsSpeaker()) {
          void agoraVoice.setMicrophoneDevice(target.value);
        } else {
          void audioEngine.restartMicrophone();
        }
      } else if (target.id === 'cfg-output-device') {
        this.audioPrefs.outputDeviceId = target.value;
        this.saveAudioPrefs();
        audioEngine.setOutputDevice(target.value);
      } else if (
        target instanceof HTMLInputElement
        && (target.id === 'sound-name' || target.id === 'sound-icon' || target.id === 'sound-hotkey'
          || target.id === 'sound-loop' || target.id === 'sound-volume')
      ) {
        void this.commitSoundEdit(target);
      } else if (target instanceof HTMLInputElement && target.id === 'hallway-show-nsfw') {
        this.setHallwayShowNsfw(target.checked);
      } else if (target instanceof HTMLInputElement && target.id === 'hallway-only-keywords') {
        this.setHallwayOnlyKeywordMatches(target.checked);
      } else if (target instanceof HTMLInputElement && target.id === 'sound-upload-input' && target.files?.[0]) {
        const file = target.files[0];
        void audioEngine.loadCustomAudioFile(file, file.name.split('.')[0]).then(() => {
          this.showToast(t('uploadedSound', { name: file.name }), '⚠️');
          this.render();
        });
      }
    });
  }

  handleAction(action: string, el: HTMLElement): void {
    if (this.isAuthGated()
      && action !== 'accept-guidelines'
      && action !== 'decline-guidelines'
      && action !== 'continue-sandbox'
      && action !== 'retry-adopt-session'
      && action !== 'open-official-signin'
      && action !== 'log-out') {
      this.currentTab = 'login';
      this.render();
      return;
    }
    const tab = el.dataset.tab;
    if (action === 'nav' && (tab === 'stage' || tab === 'explore' || tab === 'discover' || tab === 'friends' || tab === 'messages' || tab === 'activity' || tab === 'houses' || tab === 'events' || tab === 'soundboard' || tab === 'settings' || tab === 'login')) {
      this.selfProfileOpen = false;
      this.closeProfileDrawer();
      if (tab !== 'settings') this.stopRtcStatsPolling();
      if (tab === 'explore') {
        this.currentTab = 'explore';
        this.render();
        void this.refreshExplore();
        this.stopActivityRefresh();
      } else {
        // Merged places (NAV-2): Friends → Discover, Events → Activity.
        // Houses tab still opens house sub-pages; Discover is the list entry.
        if (tab === 'friends') this.currentTab = 'discover';
        else if (tab === 'events') this.currentTab = 'activity';
        else this.currentTab = tab;
        if (this.currentTab === 'stage') this.unreadChat = 0;
        this.render();
        if (this.currentTab === 'messages') void this.loadConversations();
        if (this.currentTab === 'activity') {
          void this.loadActivity();
          void this.loadEvents();
          this.startActivityRefresh();
        } else {
          this.stopActivityRefresh();
        }
        if (this.currentTab === 'discover') {
          void this.loadSuggestions();
          void this.loadConversations();
          void this.loadHouses();
        }
        if (this.currentTab === 'houses') void this.loadHouses();
      }
      return;
    }
    switch (action) {
      case 'nav-back':
        this.goBack();
        break;
      case 'open-room-details':
        this.roomDetailsOpen = true;
        this.reactionsOpen = false;
        this.soundsOpen = false;
        this.render();
        break;
      case 'toggle-reactions':
        this.reactionsOpen = !this.reactionsOpen;
        this.soundsOpen = false;
        this.render();
        break;
      case 'toggle-sounds':
        this.soundsOpen = !this.soundsOpen;
        this.reactionsOpen = false;
        this.render();
        break;
      case 'toggle-room-bar-more':
        this.roomBarOverflowOpen = !this.roomBarOverflowOpen;
        this.render();
        break;
      case 'set-audio-quality': {
        const quality = (el as HTMLSelectElement).value;
        if (quality === 'music') {
          if (!audioEngine.getIsMusicMode()) audioEngine.toggleMusicMode();
        } else if (audioEngine.getIsMusicMode()) {
          audioEngine.toggleMusicMode();
        }
        this.render();
        break;
      }
      case 'preview-sound': {
        const fxId = el.getAttribute('data-fx-id');
        if (fxId) audioEngine.playSoundEffect(fxId, { localOnly: true });
        break;
      }
      case 'close-room-details':
        this.roomDetailsOpen = false;
        this.render();
        break;
      case 'open-settings':
      case 'profile-settings':
        this.pushCurrentView();
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
        const link = safeUrl(el.dataset.url) || safeUrl(this.selectedProfile?.share_url) || safeUrl(this.me?.share_url);
        if (!link) return;
        void navigator.clipboard.writeText(link).then(() => {
          this.showToast(t('copiedProfile'), '🔗');
        }).catch(() => {
          this.showToast(t('somethingWrong'), '⚠️');
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
          this.showToast(t('somethingWrong'), '⚠️');
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
      case 'select-hallway-privacy': {
        const raw = el.dataset.privacy || '';
        const privacy = raw === 'public' || raw === 'friend' || raw === 'friend_of_friend' || raw === 'house' || raw === 'dm' || raw === 'other'
          ? raw
          : null;
        this.selectHallwayPrivacy(privacy);
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
          this.showToast(t('noShareLink'), '⚠️');
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
      case 'profile-talk-live':
        void this.talkLive(el.dataset.userId, el.dataset.name, el.dataset.username);
        break;
      case 'profile-message': {
        const uid = Number(el.dataset.userId || this.selectedProfile?.user_id);
        if (Number.isFinite(uid)) void this.messageFromProfile(uid);
        break;
      }
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
          this.showToast(t('noShareLink'), '⚠️');
          return;
        }
        void navigator.clipboard.writeText(link).then(() => {
          this.showToast(t('linkCopied'), '🔗');
        }).catch(() => {
          this.showToast(t('somethingWrong'), '⚠️');
        });
        break;
      }
      case 'share-room': {
        const link = safeUrl(this.currentChannel?.url);
        if (!link) {
          this.showToast(t('noShareLink'), '⚠️');
          return;
        }
        void navigator.clipboard?.writeText(link).then(() => {
          this.showToast(t('linkCopied'), '🔗');
        }).catch(() => {
          this.showToast(t('somethingWrong'), '⚠️');
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
          this.showToast(t('voiceEffectPreview'), '🎙️');
          this.renderCockpit();
        });
        break;
      case 'apply-voice-effect': {
        audioEngine.applyVoiceEffect();
        const applied = audioEngine.getBroadcastEffect();
        this.audioPrefs.voiceEffectApplied = applied;
        this.saveAudioPrefs();
        void agoraVoice.syncVoiceEffectPublish();
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
      case 'minimize-room': {
        if (!this.currentChannel) return;
        const { stack, previous } = popView(this.viewStack);
        this.viewStack = stack;
        if (previous) this.restoreView(previous);
        else this.currentTab = 'explore';
        this.render();
        if (this.currentTab === 'explore') void this.refreshExplore();
        break;
      }
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
        this.showToast(t('soundsStopped'), '🎵');
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
        const allowed: PeopleListKind[] = [
          'followers', 'following', 'friends', 'mutual_friends', 'mutual_follows',
        ];
        if (kind && (allowed as string[]).includes(kind) && Number.isFinite(userId)) {
          void this.openPeopleList(kind as PeopleListKind, userId, null);
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
      case 'continue-sandbox':
        void this.continueInSandbox();
        break;
      case 'retry-adopt-session':
        void this.tryAdoptOfficialSession();
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
          () => this.showToast(t('apiHealthCopied'), '🔗'),
          () => this.showToast(t('somethingWrong'), '⚠️'),
        );
        break;
      }
      case 'open-agora-ab-room': {
        const channel = this.currentChannel?.channel;
        if (!channel) {
          this.showToast(t('openRoomOnClubhouseNeedRoom'), '🎙️');
          break;
        }
        void electronAPI()?.openAgoraAbRoom?.(channel).then((res) => {
          if (res?.ok) this.showToast(t('openRoomOnClubhouseOpened'), '🌐');
          else this.showToast(t('somethingWrong'), '⚠️');
        });
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

// Prototype methods are wired by wire*Ctl (Task 13.1). Declaration merging keeps
// controller `this: ClubboxApp` typed without duplicating 150+ method bodies.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- intentional ClubboxApp + ClubboxAppCtlMethods merge
export interface ClubboxApp extends ClubboxAppCtlMethods {}

wireAppControllers(ClubboxApp);
