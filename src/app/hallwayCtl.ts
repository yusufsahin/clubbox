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
import { prepareHallwayChannels } from '../hallway/hallwayDisplay.ts';
import { type HallwayPrefs, readHallwayPrefs, writeHallwayPrefs } from '../hallway/hallwayPrefs.ts';
import { encodeStereoWav } from '../audio/wav.ts';
import { readHighlightPayload, readReplayPayload } from '../api/replayPlayback.ts';
import { parseClubhouseLink, type ParsedClubhouseLink } from '../studio/clubhouseLink.ts';
import type { ClubboxApp } from './clubboxApp.ts';

function sandboxToneUrl(): string {
  const sampleRate = 44100;
  const frames = sampleRate; // 1s
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.18;
    left[i] = sample;
    right[i] = sample;
  }
  return URL.createObjectURL(encodeStereoWav(left, right, sampleRate));
}

function revokeReplayBlob(app: ClubboxApp): void {
  const url = app.replayPlayback?.audioUrl;
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
}

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


export async function reloadChannels(this: ClubboxApp) : Promise<void> {
    const res = await clubhouseClient.getChannels();
    this.channelsList = res.channels || [];
    this.feedTopics = Array.isArray(res.available_topics)
      ? res.available_topics.filter((topic): topic is FeedTopic => !!topic && typeof topic.key === 'string' && typeof topic.display_name === 'string')
      : [];
  }

export async function refreshExplore(this: ClubboxApp) : Promise<void> {
    try {
      await this.reloadChannels();
      if (this.currentTab === 'explore') this.render();
    } catch (err) {
      this.reportApiError(err);
    }
  }

export function liveUpdatesUnavailable(this: ClubboxApp) : boolean {
    const config = clubhouseClient.getConfig();
    return config.webSession && !clubhouseClient.supports('get_channel');
  }

export async function refreshCurrentRoom(this: ClubboxApp) : Promise<void> {
    if (!this.currentChannel || !clubhouseClient.supports('get_channel')) return;
    const detail = await clubhouseClient.getChannel(this.channelApiId(this.currentChannel));
    this.applyRoomUpdate(detail);
  }

export function hallwayNotices(this: ClubboxApp) : string[] {
    const notices: string[] = [];
    if (this.needsAgeVerification) notices.push(t('ageCheck'));
    if (this.isOnboarding) notices.push(t('onboardingNote'));
    if (this.publicHallway === false) notices.push(t('hallwayHidden'));
    if (!clubhouseClient.supports('join_channel')) notices.push(t('notVerifiedHint'));
    return notices;
  }

export function roomHousePhoto(this: ClubboxApp) : ReturnType<typeof html> | string {
    const photo = safeUrl(this.currentChannel?.club_photo_url);
    if (!photo) return '🏛️';
    return html`<img class="house-photo" src="${photo}" alt="" />`;
  }

export function discoverTypes(this: ClubboxApp) : SearchObjectType[] {
    if (this.discoverTab === 'people') return ['UserProfile'];
    if (this.discoverTab === 'rooms') return ['LiveChannel', 'Replay'];
    if (this.discoverTab === 'houses') return ['SocialClub'];
    return ['LiveChannel', 'Replay', 'SegmentTranscription', 'SocialClub', 'UserProfile'];
  }

export function scheduleDiscoverSearch(this: ClubboxApp) : void {
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

export function displayedHallwayChannels(this: ClubboxApp): CHChannel[] {
    return prepareHallwayChannels(this.channelsList, this.hallwayPrefs, this.selectedTopicKey);
  }

export function selectHallwayTopic(this: ClubboxApp, topicKey: string | null): void {
    this.selectedTopicKey = topicKey;
    if (this.currentTab === 'explore') this.render();
  }

export function persistHallwayPrefs(this: ClubboxApp): void {
    writeHallwayPrefs(this.hallwayPrefs);
  }

export function addHallwayKeyword(this: ClubboxApp): void {
    const input = document.getElementById('hallway-keyword-input') as HTMLInputElement | null;
    const word = input?.value.trim();
    if (!word) return;
    if (!this.hallwayPrefs.keywords.includes(word)) {
      this.hallwayPrefs.keywords.push(word);
    }
    this.persistHallwayPrefs();
    if (input) input.value = '';
    if (this.currentTab === 'explore') this.render();
  }

export function removeHallwayKeyword(this: ClubboxApp, keyword: string): void {
    this.hallwayPrefs.keywords = this.hallwayPrefs.keywords.filter((entry) => entry !== keyword);
    this.persistHallwayPrefs();
    if (this.currentTab === 'explore') this.render();
  }

export function setHallwayShowNsfw(this: ClubboxApp, enabled: boolean): void {
    this.hallwayPrefs.showNsfw = enabled;
    this.persistHallwayPrefs();
    if (this.currentTab === 'explore') this.render();
  }

export async function openReplay(this: ClubboxApp, replayId: string | undefined): Promise<void> {
    if (!replayId || !clubhouseClient.supports('get_replay_channel')) {
      this.showToast(t('unverifiedAction'), '🔒');
      return;
    }
    try {
      const res = await clubhouseClient.getReplayChannel(replayId);
      let item = readReplayPayload(res, replayId);
      if (!item) {
        this.showToast(t('somethingWrong'), '⚠️');
        return;
      }
      if (!item.audioUrl && clubhouseClient.getConfig().useSandbox) {
        item = { ...item, audioUrl: sandboxToneUrl() };
      }
      revokeReplayBlob(this);
      this.replayPlayback = item;
      this.replayRate = 1;
      this.currentTab = 'replay';
      this.render();
      this.showToast(t('replayOpened'), '▶');
      queueMicrotask(() => this.applyReplayRate());
    } catch (err) {
      this.reportApiError(err);
    }
  }

export async function openHighlight(this: ClubboxApp, highlightId: string | undefined): Promise<void> {
    if (!highlightId || !clubhouseClient.supports('get_highlight')) {
      this.showToast(t('unverifiedAction'), '🔒');
      return;
    }
    try {
      const res = await clubhouseClient.getHighlight(highlightId);
      let item = readHighlightPayload(res, highlightId);
      if (!item) {
        this.showToast(t('somethingWrong'), '⚠️');
        return;
      }
      if (!item.audioUrl && clubhouseClient.getConfig().useSandbox) {
        item = { ...item, audioUrl: sandboxToneUrl() };
      }
      revokeReplayBlob(this);
      this.replayPlayback = item;
      this.replayRate = 1;
      this.currentTab = 'replay';
      this.render();
      this.showToast(t('highlightOpened'), '▶');
      queueMicrotask(() => this.applyReplayRate());
    } catch (err) {
      this.reportApiError(err);
    }
  }

export function closeReplay(this: ClubboxApp): void {
    revokeReplayBlob(this);
    this.replayPlayback = null;
    this.replayRate = 1;
    if (this.currentTab === 'replay') {
      this.currentTab = 'explore';
      this.render();
    }
  }

export function applyReplayRate(this: ClubboxApp): void {
    const audio = document.getElementById('replay-audio') as HTMLAudioElement | null;
    if (audio) audio.playbackRate = this.replayRate;
  }

export function setReplayRate(this: ClubboxApp, rateRaw: string | undefined): void {
    const rate = Number(rateRaw);
    if (![1, 1.5, 2].includes(rate)) return;
    this.replayRate = rate;
    this.applyReplayRate();
    if (this.currentTab === 'replay') this.render();
    queueMicrotask(() => this.applyReplayRate());
  }

export function skipReplay(this: ClubboxApp, secondsRaw: string | undefined): void {
    const seconds = Number(secondsRaw);
    if (!Number.isFinite(seconds)) return;
    const audio = document.getElementById('replay-audio') as HTMLAudioElement | null;
    if (!audio) return;
    audio.currentTime = Math.max(0, audio.currentTime + seconds);
  }

export async function openClubhouseLink(this: ClubboxApp, link: ParsedClubhouseLink): Promise<void> {
    if (link.kind === 'replay') {
      await this.openReplay(link.replayId);
      return;
    }
    if (link.kind === 'room') {
      await this.joinRoom(link.channelId);
      return;
    }
    if (link.kind === 'event') {
      this.currentTab = 'events';
      this.render();
      void this.loadEvents();
      return;
    }
    const res = await clubhouseClient.search(link.username, ['UserProfile']);
    const user = res.hits?.find((hit) => hit.kind === 'user' && hit.user.username === link.username)?.user
      ?? res.users.find((entry) => entry.username === link.username);
    if (user) {
      this.inspectProfile(user);
      return;
    }
    this.showToast(t('somethingWrong'), '⚠️');
  }

export async function runDiscoverSearch(this: ClubboxApp) : Promise<void> {
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
    const link = parseClubhouseLink(query);
    if (/^https?:\/\//i.test(query) && !link) {
      this.discoverSeq += 1;
      this.discoverHits = null;
      this.discoverLoading = false;
      this.showToast(t('onlyClubhouseLinks'), '🔗');
      this.render();
      return;
    }
    if (link) {
      this.discoverSeq += 1;
      this.discoverHits = null;
      this.discoverLoading = false;
      try {
        await this.openClubhouseLink(link);
      } catch (err) {
        this.reportApiError(err);
      }
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

export async function hideHallwayRoom(this: ClubboxApp, channelId: string): Promise<void> {
    if (!clubhouseClient.supports('hide_channel')) {
      this.showToast(t('unverifiedAction'), '🔒');
      return;
    }
    try {
      await clubhouseClient.hideChannel(channelId, true);
      this.channelsList = this.channelsList.filter(
        (channel) => channel.channel !== channelId && String(channel.channel_id) !== channelId,
      );
      if (this.currentTab === 'explore') this.render();
    } catch (err) {
      this.reportApiError(err);
    }
  }

export function wireHallwayCtl(proto: ClubboxApp): void {
  if (!('hallwayPrefs' in proto)) {
    (proto as ClubboxApp & { hallwayPrefs: HallwayPrefs }).hallwayPrefs = readHallwayPrefs();
  }
  proto.reloadChannels = reloadChannels;
  proto.refreshExplore = refreshExplore;
  proto.liveUpdatesUnavailable = liveUpdatesUnavailable;
  proto.refreshCurrentRoom = refreshCurrentRoom;
  proto.hallwayNotices = hallwayNotices;
  proto.roomHousePhoto = roomHousePhoto;
  proto.discoverTypes = discoverTypes;
  proto.scheduleDiscoverSearch = scheduleDiscoverSearch;
  proto.runDiscoverSearch = runDiscoverSearch;
  proto.displayedHallwayChannels = displayedHallwayChannels;
  proto.selectHallwayTopic = selectHallwayTopic;
  proto.persistHallwayPrefs = persistHallwayPrefs;
  proto.addHallwayKeyword = addHallwayKeyword;
  proto.removeHallwayKeyword = removeHallwayKeyword;
  proto.setHallwayShowNsfw = setHallwayShowNsfw;
  proto.openClubhouseLink = openClubhouseLink;
  proto.openReplay = openReplay;
  proto.openHighlight = openHighlight;
  proto.closeReplay = closeReplay;
  proto.applyReplayRate = applyReplayRate;
  proto.setReplayRate = setReplayRate;
  proto.skipReplay = skipReplay;
  proto.hideHallwayRoom = hideHallwayRoom;
}
