// @ts-nocheck — extracted controller; imports trimmed over time.
import { ClubhouseApiError, clubhouseClient } from '../api/client.ts';
import { beginJoin, commitJoin, finishLeave, localClipAllowed, roleSyncDecision, roomAudience } from '../api/guards.ts';
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


export async function loadActivity(this: ClubboxApp) : Promise<void> {
    try {
      const res = await clubhouseClient.getEdgeStories();
      this.activityCount = Array.isArray(res.activities) ? res.activities.length : 0;
    } catch (err) {
      this.activityCount = 0;
      this.reportApiError(err);
    }
    if (this.currentTab === 'activity') this.render();
  }

export async function loadSuggestions(this: ClubboxApp) : Promise<void> {
    try {
      const res = await clubhouseClient.getGroupSuggestedInvites();
      this.suggestionsCount = Array.isArray(res.suggestions) ? res.suggestions.length : 0;
    } catch (err) {
      this.suggestionsCount = 0;
      this.reportApiError(err);
    }
    if (this.currentTab === 'friends') this.render();
  }

export function startActivityRefresh(this: ClubboxApp) : void {
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

export function stopActivityRefresh(this: ClubboxApp) : void {
    if (this.activityTimer !== null) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }
  }

export function onVisibilityChange(this: ClubboxApp) : void {
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

export function schedulePollPause(this: ClubboxApp) : void {
    if (this.hiddenPauseTimer !== null || this.pollsPaused) return;
    this.hiddenPauseTimer = window.setTimeout(() => {
      this.hiddenPauseTimer = null;
      if (document.visibilityState === 'hidden') this.pausePolls();
    }, 2 * 60 * 1000);
  }

export function pausePolls(this: ClubboxApp) : void {
    this.pollsPaused = true;
    this.stopActivityRefresh();
    this.stopChatPolling();
    roomSync.pause();
  }

export function resumePolls(this: ClubboxApp) : void {
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

export function wireActivityCtl(proto: ClubboxApp): void {
  proto.loadActivity = loadActivity;
  proto.loadSuggestions = loadSuggestions;
  proto.startActivityRefresh = startActivityRefresh;
  proto.stopActivityRefresh = stopActivityRefresh;
  proto.onVisibilityChange = onVisibilityChange;
  proto.schedulePollPause = schedulePollPause;
  proto.pausePolls = pausePolls;
  proto.resumePolls = resumePolls;
}
