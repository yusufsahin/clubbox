import { ClubhouseApiError, clubhouseClient } from '../api/client.ts';
import { isLiveUpdatesUnavailable } from '../api/liveUpdates.ts';
import type { CHChannel, FeedTopic, SearchObjectType } from '../api/types.ts';
import { t } from '../i18n/index.ts';
import { html, safeUrl } from '../ui/html.ts';
import { FEED_MAX_PAGES } from '../api/feedPagination.ts';
import {
  hallwayPrivacyCounts,
  prepareHallwayChannels,
  shouldAutoLoadMorePrivacy,
  type HallwayPrivacy,
} from '../hallway/hallwayDisplay.ts';
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



export async function reloadChannels(this: ClubboxApp) : Promise<void> {
    const res = await clubhouseClient.getChannelsPage();
    this.channelsList = res.channels || [];
    this.feedNextCursor = res.next_cursor ?? null;
    this.feedPagesLoaded = 1;
    this.feedTopics = Array.isArray(res.available_topics)
      ? res.available_topics.filter((topic): topic is FeedTopic => !!topic && typeof topic.key === 'string' && typeof topic.display_name === 'string')
      : [];
  }

/** Append the next feed page. Returns false when there is nothing to load or the request failed. */
export async function loadMoreChannels(this: ClubboxApp): Promise<boolean> {
    if (!this.feedNextCursor || this.feedLoadingMore) return false;
    this.feedLoadingMore = true;
    if (this.currentTab === 'explore') this.render();
    try {
      const res = await clubhouseClient.getChannelsPage({ nextCursor: this.feedNextCursor });
      const merged = new Map<string, CHChannel>();
      for (const channel of [...this.channelsList, ...(res.channels || [])]) {
        const key = channel.channel || String(channel.channel_id);
        merged.set(key, channel);
      }
      this.channelsList = [...merged.values()];
      this.feedNextCursor = res.next_cursor ?? null;
      this.feedPagesLoaded += 1;
      return true;
    } catch (err) {
      this.reportApiError(err);
      // Keep the cursor so the user can retry; only drop it on rate-limit (client already backs off).
      if (err instanceof ClubhouseApiError && err.kind === 'rate-limit') {
        this.feedNextCursor = null;
      }
      return false;
    } finally {
      this.feedLoadingMore = false;
      if (this.currentTab === 'explore') this.render();
    }
  }

export async function ensureSparsePrivacyLoaded(this: ClubboxApp): Promise<void> {
    const privacy = this.hallwayPrefs.selectedPrivacy;
    if (!privacy) return;
    while (shouldAutoLoadMorePrivacy({
      privacy,
      countOfType: hallwayPrivacyCounts(this.channelsList)[privacy],
      hasNextCursor: !!this.feedNextCursor,
      pagesLoaded: this.feedPagesLoaded,
      maxPages: FEED_MAX_PAGES,
    })) {
      const before = this.feedNextCursor;
      const ok = await this.loadMoreChannels();
      if (!ok || !this.feedNextCursor || this.feedNextCursor === before) break;
    }
  }

export function selectHallwayPrivacy(this: ClubboxApp, privacy: HallwayPrivacy | null): void {
    this.hallwayPrefs.selectedPrivacy = privacy;
    this.persistHallwayPrefs();
    if (this.currentTab === 'explore') this.render();
    if (privacy) void this.ensureSparsePrivacyLoaded().then(() => {
      if (this.currentTab === 'explore') this.render();
    });
  }

export function hallwayPrivacyEmptyMessage(this: ClubboxApp): string | null {
    const privacy = this.hallwayPrefs.selectedPrivacy;
    if (!privacy) return null;
    if (this.displayedHallwayChannels().length > 0) return null;
    if (privacy === 'friend') return t('roomTypeEmptyFriend');
    const typeLabel = privacy === 'public' ? t('roomTypePublic')
      : privacy === 'friend_of_friend' ? t('roomTypeFriendOfFriend')
        : privacy === 'house' ? t('roomTypeHouse')
          : t('roomTypeFriend');
    return t('roomTypeEmptyOther', { type: typeLabel, count: this.feedPagesLoaded || 1 });
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
    const hubFailed = typeof this.pubnubSource.getLastFailureReason === 'function'
      ? !!this.pubnubSource.getLastFailureReason()
      : false;
    return isLiveUpdatesUnavailable({
      webSession: !!config.webSession,
      inRoom: !!this.currentChannel,
      hasPubnubToken: !!this.currentChannel?.pubnub_token,
      supportsGetChannel: clubhouseClient.supports('get_channel'),
      pubnubSubscribeFailed: hubFailed,
    });
  }

export async function refreshCurrentRoom(this: ClubboxApp) : Promise<void> {
    if (!this.currentChannel) return;
    // Web has no get_channel (G-03). PubNub is the room source; resubscribe pulls the latest stream.
    if (clubhouseClient.supports('get_channel')) {
      const detail = await clubhouseClient.getChannel(this.channelApiId(this.currentChannel));
      this.applyRoomUpdate(detail);
      return;
    }
    await this.pubnubSource.resubscribe();
    if (this.currentTab === 'stage') this.renderStage();
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
    return prepareHallwayChannels(
      this.channelsList,
      this.hallwayPrefs,
      this.selectedTopicKey,
      this.hallwayPrefs.selectedPrivacy,
    );
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

export function setHallwayOnlyKeywordMatches(this: ClubboxApp, enabled: boolean): void {
    this.hallwayPrefs.onlyKeywordMatches = enabled;
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
      const chunkCount = item.chunkCount ?? 0;
      if (chunkCount > 0 && clubhouseClient.supports('get_replay_channel_chunk')) {
        const chunk = await clubhouseClient.getReplayChannelChunk(replayId, 0);
        const chunkUrl = readReplayPayload(chunk, replayId)?.audioUrl;
        if (chunkUrl) item = { ...item, audioUrl: chunkUrl };
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
    document.querySelectorAll<HTMLElement>('[data-action="set-replay-rate"]').forEach((btn) => {
      const active = Number(btn.dataset.rate) === rate;
      btn.classList.toggle('btn-primary', active);
      btn.classList.toggle('btn-secondary', !active);
    });
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
    if (link.kind !== 'profile') return;
    try {
      const res = await clubhouseClient.getProfileByUsername(link.username);
      this.inspectProfile(res.user_profile);
    } catch (err) {
      this.reportApiError(err);
      this.showToast(t('somethingWrong'), '⚠️');
    }
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
  proto.loadMoreChannels = loadMoreChannels;
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
  proto.selectHallwayPrivacy = selectHallwayPrivacy;
  proto.ensureSparsePrivacyLoaded = ensureSparsePrivacyLoaded;
  proto.hallwayPrivacyEmptyMessage = hallwayPrivacyEmptyMessage;
  proto.persistHallwayPrefs = persistHallwayPrefs;
  proto.addHallwayKeyword = addHallwayKeyword;
  proto.removeHallwayKeyword = removeHallwayKeyword;
  proto.setHallwayShowNsfw = setHallwayShowNsfw;
  proto.setHallwayOnlyKeywordMatches = setHallwayOnlyKeywordMatches;
  proto.openClubhouseLink = openClubhouseLink;
  proto.openReplay = openReplay;
  proto.openHighlight = openHighlight;
  proto.closeReplay = closeReplay;
  proto.applyReplayRate = applyReplayRate;
  proto.setReplayRate = setReplayRate;
  proto.skipReplay = skipReplay;
  proto.hideHallwayRoom = hideHallwayRoom;
}
