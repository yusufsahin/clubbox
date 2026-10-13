import { setLanguage, t } from '../../src/i18n/index.ts';
import { markup } from '../../src/ui/html.ts';
import { renderSidebarChrome } from '../../src/ui/shellChrome.ts';
import { discoverView } from '../../src/ui/views/discover.ts';
import { activityView } from '../../src/ui/views/activity.ts';
import { settingsView } from '../../src/ui/views/settings.ts';
import { cockpitBar } from '../../src/ui/components/cockpitBar.ts';
import { exploreView } from '../../src/ui/views/explore.ts';
import { messagesView } from '../../src/ui/views/messages.ts';
import { defaultHallwayPrefs } from '../../src/hallway/hallwayPrefs.ts';
import { DEFAULT_SHORTCUTS } from '../../src/shortcuts.ts';
import type { ClubboxWorld } from './world.ts';

export type NavUi = {
  root: HTMLElement;
  currentTab: string;
  selfProfileOpen: boolean;
  settingsOpen: boolean;
  roomTopic: string | null;
  unreadConversations: number;
  unreadNotifications: boolean;
  createModalOpen: boolean;
};

export function ensureNavUi(world: ClubboxWorld): NavUi {
  const w = world as ClubboxWorld & { navUi?: NavUi };
  if (!w.navUi) {
    setLanguage('en');
    const root = world.dom.window.document.createElement('div');
    root.id = 'nav-ui-root';
    world.dom.window.document.body.replaceChildren(root);
    w.navUi = {
      root,
      currentTab: 'explore',
      selfProfileOpen: false,
      settingsOpen: false,
      roomTopic: null,
      unreadConversations: 0,
      unreadNotifications: false,
      createModalOpen: false,
    };
  }
  return w.navUi;
}

export function paintNavUi(world: ClubboxWorld): NavUi {
  const ui = ensureNavUi(world);
  const sidebar = markup(renderSidebarChrome({
    currentTab: ui.settingsOpen ? 'settings' : ui.currentTab,
    selfProfileOpen: ui.selfProfileOpen,
    settingsOpen: ui.settingsOpen,
    unreadConversations: ui.unreadConversations,
    unreadNotifications: ui.unreadNotifications,
    me: { user_id: 1, name: 'Yusuf Sahin', username: 'yusuf_sahin', photo_url: null },
  }));
  const onRoomPage = !!ui.roomTopic && ui.currentTab === 'stage' && !ui.selfProfileOpen;
  const topTitle = ui.selfProfileOpen
    ? t('yourProfile')
    : ui.settingsOpen
      ? t('settings')
      : onRoomPage && ui.roomTopic
        ? ui.roomTopic
        : ui.currentTab === 'discover'
          ? t('discover')
          : ui.currentTab === 'messages'
            ? t('messages')
            : ui.currentTab === 'activity'
              ? t('activity')
              : ui.currentTab === 'stage'
                  ? t('liveStage')
                  : t('hallway');
  const topBar = onRoomPage
    ? `<div class="top-bar"><div data-topbar-title>${topTitle}</div></div>`
    : `<div class="top-bar"><div data-topbar-title>${topTitle}</div>
        <button data-action="create-room" data-start-room="top">${t('startRoom')}</button></div>`;
  const page = ui.settingsOpen
    ? markup(settingsView(
      {
        userId: null,
        deviceId: 'clubbox-test',
        appBuild: '1',
        appVersion: '1',
        agoraAppId: '',
        useSandbox: true,
        webSession: false,
        language: 'en',
        allowUnverified: false,
        allowLocalRecording: false,
        experimentalActions: false,
        requestLogging: false,
        unsupportedRoutes: {},
        evidenceOverrides: {},
        confirmedExperimentalRoutes: [],
      },
      DEFAULT_SHORTCUTS,
      null,
      false,
      null,
      [],
      null,
      [],
      null,
    ))
    : ui.currentTab === 'discover'
      ? markup(discoverView('', 'top', null, false, { suggestions: 0, talkPartners: [], houses: [] }))
      : ui.currentTab === 'activity'
        ? markup(activityView({
          items: [],
          unread: ui.unreadNotifications,
          experimentalOn: false,
          notificationsSupported: true,
          events: [],
          eventsSupported: true,
        }))
        : ui.currentTab === 'messages'
          ? markup(messagesView({
            items: [],
            dmRequests: 0,
            filter: 'all',
            openId: null,
            thread: null,
            previewMember: null,
            playbackRate: 1,
            canLoadMore: false,
            loadingMore: false,
            presence: [],
            canCreateVm: false,
            canReact: false,
            threadNote: '',
            unreadById: {},
          }))
          : ui.currentTab === 'explore'
              ? markup(exploreView([], [], [], {
                canJoin: true,
                canCreate: true,
                canHide: false,
                canLoadMore: false,
                loadingMore: false,
              }, defaultHallwayPrefs(), null))
              : '<div data-page="stage"></div>';
  const cockpit = ui.roomTopic
    ? markup(cockpitBar({
      muted: true,
      mixerMic: false,
      showMusicMute: false,
      musicMuted: false,
      recording: false,
      handRaised: false,
      handDisabled: false,
      canRaiseHand: true,
      canJoinStage: false,
      showAudioRetry: false,
      isSpeaker: false,
      inRoom: true,
      roomTitle: ui.roomTopic,
      effects: [{ id: 'applause', name: 'Applause', icon: '👏', hotkey: '1', type: 'synth', synthType: 'applause', volume: 1 }],
      latestChat: '',
      unreadChat: 0,
      chatOpen: false,
      canChat: true,
      canClip: true,
      canRecord: true,
      recordHint: '',
      reactionsOpen: false,
      soundsOpen: false,
      canReact: true,
      canGifReact: true,
      overflowOpen: false,
    }))
    : '';
  ui.root.innerHTML = `${sidebar}${topBar}<div id="view-root">${page}</div>${cockpit}`;
  return ui;
}
