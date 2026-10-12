import { clubhouseClient } from '../api/client.ts';
import {
  applyFollowResponse,
  isPrivateLocked,
  mergeProfile,
  PEOPLE_LIST_ENDPOINTS,
  relationshipFromStatus,
  talkPartners,
  type PeopleListKind,
} from '../api/relationship.ts';
import { audioEngine } from '../audio/audioEngine.ts';
import type { CHUser } from '../api/types.ts';
import { t } from '../i18n/index.ts';
import { paintPersonSheet, type ProfileDrawerState } from '../ui/components/profileDrawer.ts';
import { markup } from '../ui/html.ts';
import { peopleListView } from '../ui/views/peopleList.ts';
import type { ClubboxApp } from './clubboxApp.ts';

export function inspectProfile(this: ClubboxApp, user: CHUser) {
  this.clearPeopleList();
  this.selectedProfile = { ...user };
  this.profileLoading = true;
  const isSelf = user.user_id === this.me?.user_id;
  if (isSelf) {
    this.closeProfileDrawer();
    if (!this.selfProfileOpen) this.pushCurrentView();
    this.selfProfileOpen = true;
    this.render();
  } else {
    this.isProfileDrawerOpen = true;
    this.render();
  }
  void this.loadFullProfile(user.user_id);
}

export async function loadFullProfile(
  this: ClubboxApp,
  userId: number,
  opts: { force?: boolean } = {},
): Promise<void> {
  const force = opts.force === true;
  if (!force) {
    const cached = this.roomProfileCache.get(userId);
    if (cached) {
      const current = this.selectedProfile;
      if (current?.user_id === userId) {
        this.selectedProfile = mergeProfile(current, cached);
        this.profileLoading = false;
        if (this.selfProfileOpen && userId === this.me?.user_id) this.renderView();
        else if (this.isProfileDrawerOpen) this.renderProfileDrawer();
      }
      return;
    }
  }
  try {
    const res = await clubhouseClient.getProfile(userId);
    const current = this.selectedProfile;
    if (!current || current.user_id !== userId) {
      // Still cache for later open in this room session.
      this.roomProfileCache.set(userId, res.user_profile);
      return;
    }
    let next = mergeProfile(current, res.user_profile);
    if (userId === this.me?.user_id && clubhouseClient.supports('get_user_social_clubs')) {
      try {
        const clubsRes = await clubhouseClient.getUserSocialClubs();
        const rows = Array.isArray(clubsRes.social_clubs) ? clubsRes.social_clubs : [];
        const clubs = rows
          .map((row) => {
            if (!row || typeof row !== 'object') return null;
            const club = row as Record<string, unknown>;
            const id = typeof club.social_club_id === 'number'
              ? club.social_club_id
              : typeof club.social_club_id === 'string' && /^\d+$/.test(club.social_club_id)
                ? Number(club.social_club_id)
                : null;
            if (id == null || typeof club.name !== 'string') return null;
            return {
              social_club_id: id,
              name: club.name,
              slug: typeof club.slug === 'string' ? club.slug : undefined,
              photo_url: typeof club.photo_url === 'string' ? club.photo_url : null,
              num_members: typeof club.num_members === 'number' ? club.num_members : undefined,
            };
          })
          .filter((club): club is NonNullable<typeof club> => club != null);
        if (clubs.length > 0) next = { ...next, social_clubs: clubs };
      } catch (err) {
        this.reportApiError(err);
      }
    }
    this.selectedProfile = next;
    this.roomProfileCache.set(userId, next);
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

/**
 * Role event (add_speaker / uninvite / make_moderator): re-fetch get_profile when the
 * drawer is open for that user; otherwise invalidate the room-session cache.
 */
export function refreshRoomProfile(this: ClubboxApp, userId: number): void {
  if (!Number.isFinite(userId) || userId <= 0) return;
  const openForUser = this.selectedProfile?.user_id === userId
    && (this.isProfileDrawerOpen || this.selfProfileOpen);
  if (openForUser) {
    this.profileLoading = true;
    void this.loadFullProfile(userId, { force: true });
    return;
  }
  this.roomProfileCache.invalidate(userId);
}

export function clearPeopleList(this: ClubboxApp): void {
  this.peopleList = null;
  this.peopleListSeq += 1;
}

function localMutualUsers(profile: CHUser | null, kind: PeopleListKind): CHUser[] {
  if (!profile) return [];
  if (kind === 'mutual_follows') return profile.mutual_follows ?? [];
  if (kind === 'mutual_friends') return profile.mutual_cofollows ?? [];
  return [];
}

function localMutualMore(profile: CHUser | null, kind: PeopleListKind, shown: number): number {
  if (!profile) return 0;
  const count = kind === 'mutual_follows'
    ? profile.mutual_follows_count
    : kind === 'mutual_friends'
      ? profile.mutual_cofollows_count
      : undefined;
  if (typeof count !== 'number' || !Number.isFinite(count)) return 0;
  return Math.max(0, Math.floor(count) - shown);
}

export async function openPeopleList(
  this: ClubboxApp,
  kind: PeopleListKind,
  userId: number,
  cursor: string | null,
): Promise<void> {
  if (kind === 'mutual_friends' || kind === 'mutual_follows') {
    const profile = this.selectedProfile?.user_id === userId ? this.selectedProfile : null;
    const users = localMutualUsers(profile, kind);
    this.peopleList = {
      kind,
      userId,
      users,
      nextCursor: null,
      loadingMore: false,
      moreNotShown: localMutualMore(profile, kind, users.length),
    };
    this.paintPeopleList();
    return;
  }

  const remoteKey = kind === 'followers' || kind === 'following' ? kind : null;
  const endpoint = remoteKey ? PEOPLE_LIST_ENDPOINTS[remoteKey] : null;
  if (!endpoint || !clubhouseClient.supports(endpoint)) {
    this.peopleList = {
      kind,
      userId,
      users: [],
      nextCursor: null,
      loadingMore: false,
      unavailable: true,
    };
    this.paintPeopleList();
    return;
  }

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
    const page = await clubhouseClient.getPeopleList(kind as 'followers' | 'following', userId, cursor);
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

export function paintPeopleList(this: ClubboxApp): void {
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

export async function followUser(this: ClubboxApp, userId: number): Promise<void> {
  if (!this.allowAction('follow')) return;
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

export async function toggleFollow(this: ClubboxApp): Promise<void> {
  const profile = this.selectedProfile;
  if (!profile || profile.user_id === this.me?.user_id) return;
  const rel = relationshipFromStatus(profile.follow_status);
  if (rel !== 'none' && rel !== 'follower') return;
  if (!this.allowAction('follow')) return;
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

function findInRoomNow(app: ClubboxApp, userId: number): { title: string; channel: string } | null {
  for (const channel of app.channelsList) {
    const hit = channel.users?.some((user) => user.user_id === userId);
    if (!hit) continue;
    const title = channel.topic?.trim() || channel.club_name?.trim() || channel.channel;
    return { title, channel: channel.channel };
  }
  return null;
}

export function profileState(this: ClubboxApp, profile: CHUser): ProfileDrawerState {
  const isSelf = profile.user_id === this.me?.user_id;
  const privateLocked = !isSelf && isPrivateLocked(profile);
  return {
    profile,
    canChangeRelationship: clubhouseClient.supports('follow'),
    canInvite: !isSelf && this.isMeModerator() && !!this.currentChannel && !profile.is_speaker,
    hostToolsCallable: clubhouseClient.supports('invite_speaker'),
    loading: this.profileLoading && profile.user_id === this.selectedProfile?.user_id,
    showVolume: !isSelf && !!this.currentChannel?.users.some((user) => user.user_id === profile.user_id),
    remoteVolume: audioEngine.getRemoteVolume(profile.user_id),
    requestedFollowingCount: isSelf ? this.requestedFollowingCount : null,
    placeLabel: this.placeTitle(),
    canMessage: !isSelf && !!this.currentChannel,
    canDm: !isSelf && profile.can_dm === true,
    canWave: !isSelf && profile.can_wave === true,
    voiceMode: this.privateVoice,
    privateLines: this.privateLines.filter((line) => line.userId === profile.user_id),
    listEnabled: {
      followers: clubhouseClient.supports(PEOPLE_LIST_ENDPOINTS.followers),
      following: clubhouseClient.supports(PEOPLE_LIST_ENDPOINTS.following),
    },
    inRoomNow: isSelf || privateLocked ? null : findInRoomNow(this, profile.user_id),
    isSelf,
    isPrivateLocked: privateLocked,
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

export async function talkLive(
  this: ClubboxApp,
  userId: string | undefined,
  name: string | undefined,
  username: string | undefined,
): Promise<void> {
  const id = Number(userId);
  if (!name || !username || !Number.isFinite(id)) return;
  if (!clubhouseClient.supports('create_channel')) {
    this.showToast(t('unverifiedAction'), '🔒');
    return;
  }
  try {
    const created = await clubhouseClient.createChannel(`Talk Live - ${name}`, {
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

export async function messageFromProfile(this: ClubboxApp, userId: number): Promise<void> {
  const profile = this.selectedProfile;
  if (!profile || profile.user_id !== userId || profile.can_dm !== true) return;
  const existing = this.conversations.find((item) =>
    item.participants.some((person) => person.user_id === userId));
  if (existing) {
    this.closeProfileDrawer();
    this.messageFilter = 'vm';
    this.previewMember = null;
    this.currentTab = 'messages';
    await this.openConversationThread(existing.conversation_id);
    return;
  }
  if (!clubhouseClient.supports('create_conversation')) {
    this.liveMessageBlocked();
    return;
  }
  try {
    const sandbox = clubhouseClient.getSandbox();
    if (sandbox) {
      const id = sandbox.startVm({
        userId: profile.user_id,
        name: profile.name,
        username: profile.username,
      });
      this.closeProfileDrawer();
      this.messageFilter = 'vm';
      this.previewMember = null;
      this.currentTab = 'messages';
      await this.loadConversations();
      await this.openConversationThread(id);
      return;
    }
    await clubhouseClient.createConversation([userId]);
    this.closeProfileDrawer();
    this.messageFilter = 'vm';
    this.previewMember = null;
    this.currentTab = 'messages';
    await this.loadConversations();
    const created = this.conversations.find((item) =>
      item.participants.some((person) => person.user_id === userId));
    if (created) await this.openConversationThread(created.conversation_id);
    else this.render();
  } catch (err) {
    this.reportApiError(err);
  }
}

export async function sendVm(
  this: ClubboxApp,
  userId: string | undefined,
  name: string | undefined,
  username: string | undefined,
): Promise<void> {
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

export function sendPrivateMessage(this: ClubboxApp, voice: boolean): void {
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

export function findKnownUser(this: ClubboxApp, uid: string): CHUser | undefined {
  const hit = this.discoverHits?.find((entry) => entry.kind === 'user' && entry.user.user_id.toString() === uid);
  const mutual = [
    ...(this.selectedProfile?.mutual_follows ?? []),
    ...(this.selectedProfile?.mutual_cofollows ?? []),
    ...(this.selectedProfile?.chatting_with ?? []),
  ];
  const activityUser = this.activityItems?.find((entry) => entry.user?.user_id.toString() === uid)?.user;
  const houseMember = this.houseMembers?.find((entry) => entry.userId.toString() === uid);
  const fromHouse = houseMember
    ? {
      user_id: houseMember.userId,
      name: houseMember.name,
      username: houseMember.username,
      photo_url: houseMember.photoUrl,
    } satisfies CHUser
    : undefined;
  return this.currentChannel?.users.find((entry) => entry.user_id.toString() === uid)
    ?? (hit?.kind === 'user' ? hit.user : undefined)
    ?? this.peopleList?.users?.find((entry) => entry.user_id.toString() === uid)
    ?? talkPartners(this.conversations, null).find((entry) => entry.user_id.toString() === uid)
    ?? mutual.find((entry) => entry.user_id.toString() === uid)
    ?? activityUser
    ?? fromHouse;
}

export function wireProfileCtl(proto: ClubboxApp): void {
  proto.inspectProfile = inspectProfile;
  proto.loadFullProfile = loadFullProfile;
  proto.refreshRoomProfile = refreshRoomProfile;
  proto.clearPeopleList = clearPeopleList;
  proto.openPeopleList = openPeopleList;
  proto.paintPeopleList = paintPeopleList;
  proto.closeProfileDrawer = closeProfileDrawer;
  proto.followUser = followUser;
  proto.toggleFollow = toggleFollow;
  proto.profileState = profileState;
  proto.renderProfileDrawer = renderProfileDrawer;
  proto.talkLive = talkLive;
  proto.messageFromProfile = messageFromProfile;
  proto.sendVm = sendVm;
  proto.sendPrivateMessage = sendPrivateMessage;
  proto.findKnownUser = findKnownUser;
}
