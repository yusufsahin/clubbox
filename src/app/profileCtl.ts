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


export function inspectProfile(this: ClubboxApp, user: CHUser) {
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

export async function loadFullProfile(this: ClubboxApp, userId: number) : Promise<void> {
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

export function clearPeopleList(this: ClubboxApp) : void {
    this.peopleList = null;
    this.peopleListSeq += 1;
  }

export async function openPeopleList(this: ClubboxApp, kind: PeopleListKind, userId: number, cursor: string | null) : Promise<void> {
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

export function paintPeopleList(this: ClubboxApp) : void {
    if (this.peopleList && this.selfProfileOpen && this.peopleList.userId === this.me?.user_id) {
      this.render();
      return;
    }
    if (this.isProfileDrawerOpen) this.renderProfileDrawer();
  }

export function closeProfileDrawer(this: ClubboxApp) {
    this.clearPeopleList();
    this.isProfileDrawerOpen = false;
    document.getElementById('profile-drawer')?.classList.remove('open');
    document.getElementById('profile-scrim')?.classList.remove('open');
  }

export async function followUser(this: ClubboxApp, userId: number) : Promise<void> {
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

export async function toggleFollow(this: ClubboxApp) : Promise<void> {
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

export function profileState(this: ClubboxApp, profile: CHUser) {
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
      },
    };
  }

export function renderProfileDrawer(this: ClubboxApp) {
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

export async function talkLive(this: ClubboxApp, userId: string | undefined, name: string | undefined, username: string | undefined) : Promise<void> {
    if (!clubhouseClient.getConfig().useSandbox) {
      this.showToast(t('unverifiedAction'), '🔒');
      return;
    }
    const id = Number(userId);
    if (!name || !username || !Number.isFinite(id)) return;
    try {
      const created = await clubhouseClient.createChannel(`Talk Live ┬╖ ${name}`, {
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

export async function sendVm(this: ClubboxApp, userId: string | undefined, name: string | undefined, username: string | undefined) : Promise<void> {
    const id = Number(userId);
    if (!name || !username || !Number.isFinite(id)) return;
    const sandbox = clubhouseClient.getSandbox();
    if (sandbox) {
      this.openConversationId = sandbox.startVm({ userId: id, name, username }) ?? null;
      this.messageFilter = 'vm';
      this.previewMember = null;
      this.currentTab = 'messages';
      await this.loadConversations();
      return;
    }
    if (!clubhouseClient.supports('create_conversation')) {
      this.liveMessageBlocked();
      return;
    }
    try {
      await clubhouseClient.createConversation([id]);
      this.messageFilter = 'vm';
      this.previewMember = null;
      this.currentTab = 'messages';
      await this.loadConversations();
      this.showToast(t('sendVm'), '💬');
    } catch (err) {
      this.reportApiError(err);
    }
  }

export function sendPrivateMessage(this: ClubboxApp, voice: boolean) : void {
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

export function findKnownUser(this: ClubboxApp, uid: string) : CHUser | undefined {
    const hit = this.discoverHits?.find((entry) => entry.kind === 'user' && entry.user.user_id.toString() === uid);
    const mutual = [
      ...(this.selectedProfile?.mutual_follows ?? []),
      ...(this.selectedProfile?.mutual_cofollows ?? []),
    ];
    return this.currentChannel?.users.find((entry) => entry.user_id.toString() === uid)
      ?? (hit?.kind === 'user' ? hit.user : undefined)
      ?? this.peopleList?.users?.find((entry) => entry.user_id.toString() === uid)
      ?? talkPartners(this.conversations, null).find((entry) => entry.user_id.toString() === uid)
      ?? mutual.find((entry) => entry.user_id.toString() === uid);
  }

export function wireProfileCtl(proto: ClubboxApp): void {
  proto.inspectProfile = inspectProfile;
  proto.loadFullProfile = loadFullProfile;
  proto.clearPeopleList = clearPeopleList;
  proto.openPeopleList = openPeopleList;
  proto.paintPeopleList = paintPeopleList;
  proto.closeProfileDrawer = closeProfileDrawer;
  proto.followUser = followUser;
  proto.toggleFollow = toggleFollow;
  proto.profileState = profileState;
  proto.renderProfileDrawer = renderProfileDrawer;
  proto.talkLive = talkLive;
  proto.sendVm = sendVm;
  proto.sendPrivateMessage = sendPrivateMessage;
  proto.findKnownUser = findKnownUser;
}
