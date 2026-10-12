export { RoomEffectRunner, type RoomEffectDeps } from './roomEffectRunner.ts';
import { ClubhouseApiError, clubhouseClient } from '../api/client.ts';
import {
  createDefaults,
  resolveCreateReplayEnabled,
  type CreateAudience,
} from '../api/createComposer.ts';
import { beginJoin, commitJoin, finishLeave, localClipAllowed, roleSyncDecision, roomAudience } from '../api/guards.ts';
import { visibilityChangeEndpoint } from '../api/moderationExtras.ts';
import { mergePingCandidates, readSearchPingCandidates, readSuggestedInvites } from '../api/pingInvites.ts';
import {
  isChannelModerator,
  readUserCapabilities,
  roomControlFlags,
  stageAccessMode,
} from '../api/roomControls.ts';
import { mergeRoomDetailFields } from '../api/roomDetailMerge.ts';
import { mergeRoomState } from '../api/roomStateMerge.ts';
import { roomSync } from '../api/roomSync.ts';
import { audioEngine } from '../audio/audioEngine.ts';
import { agoraVoice } from '../audio/agoraVoice.ts';
import type { CHChannelDetail, CHChatMessage } from '../api/types.ts';
import { t } from '../i18n/index.ts';
import { closePingPanel, mountPingPanel, refreshPingPanel } from '../ui/components/pingPanel.ts';
import { mountSpeakerInvite } from '../ui/components/speakerInvite.ts';
import { safeUrl } from '../ui/html.ts';
import type { ClubboxApp } from './clubboxApp.ts';
import { electronAPI } from './electronApi.ts';
import { recordingFilename } from './recordingFilename.ts';
import { popView } from './viewStack.ts';

const CHAT_POLL_MS = 15_000;

/** One in-flight quit/close leave. A later beforeunload shares it so leave_channel is sent once. */
let roomShutdown: Promise<void> | null = null;

export function resetRoomShutdownForTests(): void {
  roomShutdown = null;
}

function notifyRoomPresence(payload: { channel?: string; left?: boolean }): void {
  if (typeof window === 'undefined') return;
  electronAPI()?.reportRoomPresence?.(payload);
}

/**
 * Quit/close/beforeunload: stop presence first, then Agora leave and leave_channel together.
 * Suspend stays Agora-only so resume can rejoin the same Clubhouse presence.
 */
function shutdownRoom(this: ClubboxApp, reason: string): Promise<void> {
  if (roomShutdown) return roomShutdown;
  roomShutdown = performRoomShutdown.call(this, reason);
  return roomShutdown;
}

async function performRoomShutdown(this: ClubboxApp, reason: string): Promise<void> {
  const channel = this.currentChannel;
  const channelId = channel ? this.channelApiId(channel) : '';
  console.warn(`[Clubbox] lifecycle shutdown leave reason=${reason}`);
  this.roomSession = finishLeave(this.roomSession);
  this.joinInFlight = false;
  this.stopRoomPresence();
  audioEngine.stopRecording();
  audioEngine.armClip(false);
  audioEngine.stopMicrophone();
  audioEngine.releaseExternal();
  const leaves: Array<Promise<unknown>> = [
    agoraVoice.leave().catch(() => undefined),
  ];
  if (channelId && clubhouseClient.supports('leave_channel')) {
    leaves.push(
      clubhouseClient.leaveChannel(channelId).catch(() => undefined),
    );
  }
  await Promise.all(leaves);
  notifyRoomPresence({ left: true });
}

function reportMicFailure(app: ClubboxApp): void {
  if (audioEngine.lastMicError === 'system') {
    app.showToast(t('micPermissionDenied'), '🔇');
    void electronAPI()?.openMicrophoneSettings?.();
    return;
  }
  app.showToast(t('micStageFailed'), '🔇');
}


/** Phase 25.1: quit/close leave Agora and Clubhouse together. Suspend is Agora-only. */
export async function handleAgoraLifecycle(this: ClubboxApp, reason: string): Promise<void> {
  const why = String(reason || '').toLowerCase();
  if (why === 'resume') {
    if (!this.currentChannel || !this.roomSession.inRoom) return;
    if (agoraVoice.getIsJoined()) return;
    console.warn('[Clubbox] power resume — rejoining Agora');
    await this.rejoinAgoraAudio();
    return;
  }
  if (why === 'quit' || why === 'close') {
    await shutdownRoom.call(this, why);
    return;
  }
  // suspend (and anything else): drop Agora only. Resume rejoins the same presence.
  if (agoraVoice.getIsJoined()) {
    console.warn(`[Clubbox] Agora lifecycle leave reason=${why || 'unknown'}`);
    await agoraVoice.leave();
  }
}

export function handleBeforeUnload(this: ClubboxApp): Promise<void> {
  return shutdownRoom.call(this, 'beforeunload');
}

export function startRoomPresence(this: ClubboxApp, channelId: string) : void {
    this.stopRoomPresence();
    // active_ping lives in RealtimeRoomCoordinator only (avoid double 30s pings).
    const channel = this.currentChannel;
    if (channel) this.pubnubSource.setChannel(channel);
    const pubnubToken = channel?.pubnub_token;
    this.pubnubSource.setToken(pubnubToken);
    this.pubnubSource.setChatOpen(this.chatOpen);
    this.pubnubSource.start(channelId);
    // Authoritative roster via mobile get_channel (graceful no-op on 401).
    if (!this.pollsPaused) roomSync.start(channelId);
    // PubNub subscribe is async; surface missing crawl keys so the stage is not a silent empty room.
    window.setTimeout(() => {
      if (!this.currentChannel) return;
      if (this.pubnubSource.getLastFailureReason() === 'missing_subscribe_key') {
        this.showToast(t('realtimeKeysMissing'), '⚠️');
        void electronAPI()?.ensureRealtimeConfig?.();
      }
    }, 800);
    if (this.pollsPaused) return;
    this.syncChatPolling();
  }

export function stopChatPolling(this: ClubboxApp) : void {
    if (this.chatTimer !== null) {
      clearInterval(this.chatTimer);
      this.chatTimer = null;
    }
  }

export function syncChatPolling(this: ClubboxApp) : void {
    this.pubnubSource.setChatOpen(this.chatOpen);
    // roomSession.inRoom is false as soon as leave starts — blocks PubNub
    // onReconnecting from restarting HTTP chat after stopRoomPresence().
    const open = !!this.currentChannel
      && this.roomSession.inRoom
      && !this.pollsPaused
      && this.chatOpen
      && this.currentChannel.is_chat_enabled !== false
      && this.pubnubSource.shouldPollChat();
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

export function stopRoomPresence(this: ClubboxApp) : void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.stopChatPolling();
    this.pubnubSource.stop();
    roomSync.stop();
  }

export async function refreshChat(this: ClubboxApp) : Promise<void> {
    const chatEvidence = clubhouseClient.evidence('get_channel_messages');
    const channel = this.currentChannel;
    if (!channel || !this.roomSession.inRoom || (chatEvidence !== 'observed' && chatEvidence !== 'bundle')) {
      return;
    }
    const generation = this.roomSession.generation;
    const channelId = this.channelApiId(channel);
    try {
      const chat = await clubhouseClient.getChannelMessages(channelId);
      // Leave raced ahead — drop the response (and never apply UI).
      if (!this.roomSession.inRoom || this.roomSession.generation !== generation || !this.currentChannel) {
        return;
      }
      if (this.channelApiId(this.currentChannel) !== channelId) return;
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
      // Expected when leave_channel wins the race against an in-flight poll.
      if (!this.roomSession.inRoom || this.roomSession.generation !== generation) return;
      console.warn('[Clubbox] chat refresh failed:', err);
    }
  }

export function channelApiId(this: ClubboxApp, channel: { channel?: string; channel_id: string | number }) : string {
    return channel.channel || String(channel.channel_id);
  }

export function applyRoomUpdate(this: ClubboxApp, detail: CHChannelDetail) : void {
    if (!this.currentChannel) return;
    const sameRoom =
      String(detail.channel_id) === String(this.currentChannel.channel_id) ||
      detail.channel === this.currentChannel.channel;
    if (!sameRoom) return;

    // Snapshot → PubNub-shaped detail → Agora mute overlay (Task 28.1).
    const merged = mergeRoomState(this.currentChannel, detail);
    mergeRoomDetailFields(this.currentChannel, {
      ...merged,
      users: this.pubnubSource.overlayMutes(merged.users),
    });
    this.pubnubSource.setChannel(this.currentChannel);
    this.syncClipArm();
    this.syncSelectedProfileFromRoom();
    this.maybeShowSpeakerInvite();
    this.syncAgoraRole();
    const mine = this.currentChannel.users.find((user) => user.user_id === this.me?.user_id);
    if (typeof mine?.is_hand_raised === 'boolean') clubhouseClient.setHandRaised(mine.is_hand_raised);

    if (this.isProfileDrawerOpen) this.renderProfileDrawer();
    if (this.roomDetailsOpen) this.renderRoomDetails();
    if (this.selfProfileOpen || this.currentTab !== 'stage') return;
    this.renderStage();
    this.renderCockpit();
  }

export function isMeSpeaker(this: ClubboxApp) : boolean {
    if (!this.currentChannel || !this.me) return false;
    const meId = String(this.me.user_id);
    return this.currentChannel.users.some(
      (user) => String(user.user_id) === meId && (!!user.is_speaker || !!user.is_moderator),
    );
  }

export function isMeModerator(this: ClubboxApp) : boolean {
    return isChannelModerator(this.currentChannel, this.me?.user_id);
  }

export function syncAgoraRole(this: ClubboxApp) : void {
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

/** Agora audience + local mic/external cleanup shared by role-sync and loop demote. */
export async function demoteLocalSpeaker(
  this: ClubboxApp,
  opts: { toastMoved?: boolean } = {},
): Promise<void> {
    await agoraVoice.demoteToAudience();
    audioEngine.releaseExternal();
    audioEngine.setMuted(true);
    // syncSelfMuteFromEngine → renderCockpit keeps the SVG mic button intact.
    this.syncSelfMuteFromEngine();
    void this.queueMuteSync();
    if (this.roomDetailsOpen) this.renderRoomDetails();
    if (opts.toastMoved !== false) this.showToast(t('movedToAudience'), '🎙️');
  }

export async function runAgoraRoleSync(this: ClubboxApp) : Promise<void> {
    try {
      if (this.currentChannel && agoraVoice.getIsJoined()) {
        const wantSpeaker = this.isMeSpeaker();
        if (wantSpeaker !== agoraVoice.getIsSpeaker()) {
          if (wantSpeaker) {
            if (!this.applyLoopGuard().blockStage) {
              const ok = await agoraVoice.promoteToSpeaker();
              this.audioConnected = ok;
              if (!ok) this.showToast(t('micStageFailed'), '🔇');
            }
          } else {
            await this.demoteLocalSpeaker();
          }
        }
      }
    } catch (err) {
      this.reportApiError(err);
    }
    this.agoraRoleSyncing = false;
    if (this.loopGuard.blockStage && this.isMeSpeaker() && !agoraVoice.getIsSpeaker()) return;
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

export async function inviteToStage(this: ClubboxApp, userId: number) : Promise<void> {
    if (!this.currentChannel || !this.isMeModerator()) return;
    if (!this.allowAction('invite_speaker')) return;
    try {
      await clubhouseClient.inviteSpeaker(this.channelApiId(this.currentChannel), userId);
      const invited = this.currentChannel.users.find((user) => user.user_id === userId);
      if (invited) invited.is_invited_to_speak = true;
      this.showToast(t('invitedToSpeakToast'), '🎙️');
      roomSync.scheduleAfterHostAction?.();
      await this.refreshCurrentRoom();
    } catch (err) {
      this.reportApiError(err);
    }
  }

export async function moderateSpeaker(this: ClubboxApp, userId: number, action: 'mute' | 'moderator' | 'audience' | 'block') : Promise<void> {
    if (!this.currentChannel) return;
    if (!this.isMeModerator()) {
      this.showToast(t('permissionDenied'), '🔒');
      return;
    }
    const channelId = this.channelApiId(this.currentChannel);
    if (action === 'audience') {
      if (!this.allowAction('mute_speaker')) return;
      if (!this.allowAction('uninvite_speaker')) return;
    } else {
      const endpoint = action === 'mute' ? 'mute_speaker'
        : action === 'moderator' ? 'make_moderator'
          : 'block_from_channel';
      if (!this.allowAction(endpoint)) return;
    }
    if (action === 'block' && !window.confirm(t('blockFromRoomConfirm'))) return;
    try {
      if (action === 'mute') await clubhouseClient.muteSpeaker(channelId, userId);
      else if (action === 'moderator') await clubhouseClient.makeModerator(channelId, userId);
      else if (action === 'block') await clubhouseClient.blockFromChannel(channelId, userId);
      else await clubhouseClient.moveToAudience(channelId, userId);
      this.openSpeakerMenuId = null;
      const target = this.currentChannel.users.find((user) => user.user_id === userId);
      if (action === 'block') {
        this.currentChannel.users = this.currentChannel.users.filter((user) => user.user_id !== userId);
      } else if (target) {
        if (action === 'mute') {
          target.is_muted = true;
          if (this.me && userId === this.me.user_id) {
            audioEngine.setMuted(true);
            this.syncSelfMuteFromEngine();
            void this.queueMuteSync();
          }
        }
        else if (action === 'moderator') target.is_moderator = true;
        else if (action === 'audience') {
          target.is_speaker = false;
          target.is_moderator = false;
        }
      }
      roomSync.scheduleAfterHostAction?.();
      await this.refreshCurrentRoom();
    } catch (err) {
      this.reportApiError(err);
    }
  }

export function maybeShowSpeakerInvite(this: ClubboxApp) : void {
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

export function renderSpeakerInvite(this: ClubboxApp) : void {
    mountSpeakerInvite();
  }

export function closeSpeakerInvite(this: ClubboxApp, dismiss = true) : void {
    this.speakerInviteVisible = false;
    if (dismiss) this.dismissedSpeakerInvite = true;
    document.getElementById('speaker-invite-overlay')?.remove();
  }

export async function acceptSpeakerInvite(this: ClubboxApp) : Promise<void> {
    await this.promoteToStage({ fromInvite: true });
  }

/** Open-stage rooms: audience joins the stage without a moderator invite. */
export async function joinOpenStage(this: ClubboxApp): Promise<void> {
    if (!this.currentChannel || this.isMeSpeaker()) return;
    if (stageAccessMode(this.currentChannel) !== 'open') {
      this.showToast(t('stageInviteOnly'), '✋');
      return;
    }
    await this.promoteToStage({ fromInvite: false });
  }

export async function promoteToStage(
    this: ClubboxApp,
    options: { fromInvite: boolean },
  ): Promise<void> {
    if (!this.currentChannel || !this.me) return;
    if (this.applyLoopGuard().blockStage) {
      this.showToast(t('loopBlockStage'), '🔊');
      return;
    }
    if (!this.allowAction('become_speaker')) return;
    if (this.isMeSpeaker() && agoraVoice.getIsSpeaker()) return;
    const acceptBtn = document.getElementById('accept-speak-btn') as HTMLButtonElement | null;
    const joinBtns = document.querySelectorAll<HTMLButtonElement>('[data-action="join-open-stage"]');
    if (acceptBtn) acceptBtn.disabled = true;
    joinBtns.forEach((btn) => { btn.disabled = true; });
    // Block PubNub role-sync from a parallel promote (double publish → UID_BANNED).
    this.agoraRoleSyncing = true;
    // Stage etiquette: Accept / open-stage join always start muted.
    audioEngine.setMuted(true);
    this.syncSelfMuteFromEngine();
    try {
      await clubhouseClient.becomeSpeaker(this.channelApiId(this.currentChannel));
      if (options.fromInvite) this.closeSpeakerInvite(false);
      const mine = this.currentChannel.users.find((user) => user.user_id === this.me?.user_id);
      if (mine) {
        mine.is_speaker = true;
        mine.is_invited_to_speak = false;
      }
      await this.refreshCurrentRoom();
      if (!clubhouseClient.getConfig().useSandbox && agoraVoice.getIsJoined()) {
        const ok = await agoraVoice.promoteToSpeaker();
        this.audioConnected = ok;
        await this.queueMuteSync();
        if (!ok) {
          this.showToast(t('micStageFailed'), '🔇');
          return;
        }
      }
      this.agoraPromoteFailures = 0;
      this.showToast(t('onStage'), '🎙️');
      this.render();
    } catch (err) {
      this.reportApiError(err);
      if (acceptBtn) acceptBtn.disabled = false;
      joinBtns.forEach((btn) => { btn.disabled = false; });
    } finally {
      this.agoraRoleSyncing = false;
    }
  }

export async function declineSpeakerInvite(this: ClubboxApp) : Promise<void> {
    if (!this.currentChannel || !this.me) return;
    if (!this.allowAction('reject_speaker_invite')) {
      this.closeSpeakerInvite();
      return;
    }
    try {
      await clubhouseClient.rejectSpeakerInvite(this.channelApiId(this.currentChannel), this.me.user_id);
      this.closeSpeakerInvite();
    } catch (err) {
      this.reportApiError(err);
    }
  }

export async function setHandRaisePermission(this: ClubboxApp, mode: string): Promise<void> {
    if (!this.currentChannel || !this.isMeModerator()) return;
    if (!this.allowAction('change_handraise_settings')) return;
    const isEnabled = mode !== 'off';
    const handraisePermission = mode === '2' ? 2 : 1;
    try {
      await clubhouseClient.changeHandraiseSettings(this.channelApiId(this.currentChannel), {
        isEnabled,
        handraisePermission,
      });
      this.currentChannel = {
        ...this.currentChannel,
        is_handraise_enabled: isEnabled,
        handraise_permission: handraisePermission,
      };
      this.renderStage();
      this.showToast(
        !isEnabled ? t('handRaiseOff') : handraisePermission === 2 ? t('handRaiseFriendsOfSpeakers') : t('handRaiseEveryone'),
        '✋',
      );
      roomSync.scheduleAfterHostAction?.();
    } catch (err) {
      this.reportApiError(err);
    }
  }

export async function renameRoom(this: ClubboxApp): Promise<void> {
    if (!this.currentChannel || !this.isMeModerator()) return;
    if (!this.allowAction('set_channel_title')) return;
    const next = window.prompt(t('renameRoomPrompt'), this.currentChannel.topic || '');
    if (next == null) return;
    const title = next.trim();
    if (!title || title === this.currentChannel.topic) return;
    try {
      await clubhouseClient.setChannelTitle(this.channelApiId(this.currentChannel), title);
      this.currentChannel = { ...this.currentChannel, topic: title };
      this.render();
      this.showToast(t('roomRenamed'), '✏️');
    } catch (err) {
      this.reportApiError(err);
    }
  }

export async function sendReaction(this: ClubboxApp, emoji: string | undefined): Promise<void> {
    if (!this.currentChannel || !emoji) return;
    if (!this.allowAction('emoji_reaction')) return;
    try {
      await clubhouseClient.emojiReaction(this.channelApiId(this.currentChannel), emoji);
      this.showToast(emoji, emoji);
    } catch (err) {
      this.reportApiError(err);
    }
  }

export async function sendGifReaction(this: ClubboxApp): Promise<void> {
  if (!this.currentChannel) return;
  if (!this.allowAction('gif_reaction')) return;
  const input = document.getElementById('gif-reaction-input') as HTMLInputElement | null;
  const pasted = input?.value.trim() || '';
  if (!pasted) return;
  try {
    await clubhouseClient.gifReaction(this.channelApiId(this.currentChannel), pasted);
    if (input) input.value = '';
    this.showToast(t('gifReactionSent'), '🎞');
  } catch (err) {
    this.reportApiError(err);
  }
}

function pingPanelState(app: ClubboxApp) {
  return {
    query: app.pingQuery,
    candidates: app.pingCandidates,
    selectedIds: app.pingSelectedIds,
    loading: app.pingLoading,
  };
}

export async function openPingPanel(this: ClubboxApp): Promise<void> {
    if (!this.currentChannel || !this.isMeModerator()) return;
    if (!this.allowAction('invite_to_existing_channel')) return;
    this.pingPanelOpen = true;
    this.pingQuery = '';
    this.pingSelectedIds = [];
    this.pingLoading = true;
    mountPingPanel(pingPanelState(this));
    try {
      const suggested = clubhouseClient.supports('get_group_suggested_invites')
        ? readSuggestedInvites(await clubhouseClient.getGroupSuggestedInvites())
        : [];
      this.pingCandidates = suggested;
    } catch (err) {
      this.pingCandidates = [];
      this.reportApiError(err);
    } finally {
      this.pingLoading = false;
      if (this.pingPanelOpen) refreshPingPanel(pingPanelState(this));
    }
  }

export function closePingInvitePanel(this: ClubboxApp): void {
    this.pingPanelOpen = false;
    this.pingLoading = false;
    closePingPanel();
  }

export async function searchPingCandidates(this: ClubboxApp): Promise<void> {
    if (!this.pingPanelOpen) return;
    const input = document.getElementById('ping-search-input') as HTMLInputElement | null;
    const query = (input?.value || this.pingQuery).trim();
    this.pingQuery = query;
    this.pingLoading = true;
    refreshPingPanel(pingPanelState(this));
    try {
      const suggested = clubhouseClient.supports('get_group_suggested_invites')
        ? readSuggestedInvites(await clubhouseClient.getGroupSuggestedInvites())
        : [];
      let searched = [] as ReturnType<typeof readSearchPingCandidates>;
      if (query) {
        const res = await clubhouseClient.search(query, ['UserProfile']);
        searched = readSearchPingCandidates(res.hits?.length ? res.hits : res.users);
      }
      this.pingCandidates = mergePingCandidates(suggested, searched);
    } catch (err) {
      this.reportApiError(err);
    } finally {
      this.pingLoading = false;
      if (this.pingPanelOpen) refreshPingPanel(pingPanelState(this));
    }
  }

export function togglePingSelect(this: ClubboxApp, userIdRaw: string | undefined): void {
    const userId = Number(userIdRaw);
    if (!Number.isFinite(userId)) return;
    if (this.pingSelectedIds.includes(userId)) {
      this.pingSelectedIds = this.pingSelectedIds.filter((id) => id !== userId);
    } else {
      this.pingSelectedIds = [...this.pingSelectedIds, userId];
    }
    if (this.pingPanelOpen) refreshPingPanel(pingPanelState(this));
  }

export async function sendPings(this: ClubboxApp): Promise<void> {
    if (!this.currentChannel || this.pingSelectedIds.length === 0) return;
    if (!this.allowAction('invite_to_existing_channel')) return;
    const channelId = this.channelApiId(this.currentChannel);
    let sent = 0;
    for (const userId of this.pingSelectedIds) {
      try {
        await clubhouseClient.inviteToExistingChannel(channelId, userId);
        sent += 1;
        await new Promise((resolve) => window.setTimeout(resolve, 300));
      } catch (err) {
        this.reportApiError(err);
      }
    }
    this.closePingInvitePanel();
    if (sent > 0) this.showToast(t('pingSent', { count: sent }), '📣');
  }

export async function setRoomVisibility(this: ClubboxApp, visibility: string): Promise<void> {
    if (!this.currentChannel || !this.isMeModerator()) return;
    if (visibility !== 'open' && visibility !== 'social') return;
    const endpoint = visibilityChangeEndpoint(visibility);
    if (!endpoint || !this.allowAction(endpoint)) return;
    try {
      if (visibility === 'open') await clubhouseClient.makeChannelPublic(this.channelApiId(this.currentChannel));
      else await clubhouseClient.makeChannelSocial(this.channelApiId(this.currentChannel));
      this.currentChannel = {
        ...this.currentChannel,
        is_private: false,
        is_social_mode: visibility === 'social',
      };
      this.renderStage();
      this.showToast(t('roomVisibilityChanged'), '👁');
    } catch (err) {
      this.reportApiError(err);
    }
  }

export async function muteEveryone(this: ClubboxApp) : Promise<void> {
    if (!this.currentChannel || !this.isMeModerator()) return;
    if (!this.allowAction('mute_speaker')) return;
    const myId = this.me?.user_id ?? clubhouseClient.getCurrentUserId();
    const speakers = this.currentChannel.users.filter(
      (user) => user.is_speaker && user.user_id !== myId && !user.is_muted,
    );
    for (const speaker of speakers) {
      try {
        await clubhouseClient.muteSpeaker(this.channelApiId(this.currentChannel), speaker.user_id);
        speaker.is_muted = true;
        await new Promise((resolve) => window.setTimeout(resolve, 300));
      } catch (err) {
        this.reportApiError(err);
      }
    }
    roomSync.scheduleAfterHostAction?.();
    await this.refreshCurrentRoom();
  }

export async function refreshStageManual(this: ClubboxApp) : Promise<void> {
    if (!this.currentChannel) return;
    try {
      await this.pubnubSource.resubscribe();
      await this.refreshChat();
      this.renderStage();
    } catch (err) {
      this.reportApiError(err);
    }
  }

export async function toggleHandRaise(this: ClubboxApp) {
    if (!this.currentChannel) return;
    if (!this.allowAction('audience_reply')) return;
    const access = stageAccessMode(this.currentChannel);
    if (access === 'open') {
      void this.joinOpenStage();
      return;
    }
    if (access === 'invite' || this.currentChannel.is_handraise_enabled === false) {
      this.showToast(t('stageInviteOnly'), '✋');
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

export function recordingAllowed(this: ClubboxApp) : boolean {
    const channel = this.currentChannel;
    if (!channel) return false;
    if (clubhouseClient.getConfig().allowLocalRecording !== true) return false;
    return channel.is_replay_enabled === true;
  }

export function syncRecBanner(this: ClubboxApp) : void {
    const banner = document.getElementById('rec-banner');
    if (!banner) return;
    banner.hidden = !audioEngine.getIsRecording();
    banner.textContent = t('recBanner');
  }

export function toggleRecording(this: ClubboxApp) {
    const starting = !audioEngine.getIsRecording();
    if (starting && !this.recordingAllowed()) {
      const allowed = clubhouseClient.getConfig().allowLocalRecording === true;
      this.showToast(t(allowed ? 'recordingNeedsReplay' : 'recordingNeedsConsent'), '🔴');
      return;
    }
    if (starting && !window.confirm(t('recordingConfirm'))) return;
    audioEngine.toggleRecording();
  }

export function clipsAllowed(this: ClubboxApp) : boolean {
    const channel = this.currentChannel;
    if (!channel) return false;
    return localClipAllowed({
      allowLocalRecording: clubhouseClient.getConfig().allowLocalRecording === true,
      replayEnabled: channel.is_replay_enabled === true,
      hostClipsEnabled: channel.is_clips_enabled === true,
      audience: roomAudience(channel),
    });
  }

export function syncClipArm(this: ClubboxApp) : void {
    audioEngine.armClip(this.clipsAllowed());
    const badge = document.getElementById('clip-armed-badge');
    if (badge) badge.hidden = !audioEngine.isClipArmed();
  }

export async function saveClip(this: ClubboxApp) : Promise<void> {
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

export function allowAction(this: ClubboxApp, endpoint: string) : boolean {
    if (!clubhouseClient.supports(endpoint)) {
      const evidence = clubhouseClient.evidence(endpoint);
      const key = evidence === 'mobile-spike'
        ? 'hostToolsNeedSession'
        : evidence === 'unsupported'
          ? 'unsupportedAction'
          : evidence === 'community'
            ? 'moderationNeedsExperimental'
            : 'temporarilyUnavailable';
      this.showToast(t(key), '🔒');
      return false;
    }
    if (clubhouseClient.needsExperimentalConfirmation(endpoint)) {
      if (!window.confirm(t('experimentalConfirm'))) return false;
      clubhouseClient.confirmExperimental(endpoint);
    }
    return true;
  }

export async function enableExperimentalActions(this: ClubboxApp): Promise<void> {
    await clubhouseClient.updateConfig({ experimentalActions: true });
    this.showToast(t('experimentalActionsEnabled'), '✅');
    this.render();
    if (document.getElementById('room-details-root')) this.renderRoomDetails();
  }

export async function joinRoom(this: ClubboxApp, channelId: string, preset?: CHChannelDetail) {
    if (!preset && !this.allowAction('join_channel')) return;
    if (this.currentChannel) {
      const currentId = this.channelApiId(this.currentChannel);
      // Already in this room but still on hallway (e.g. audio hung) — show the stage.
      if (currentId === channelId || String(this.currentChannel.channel_id) === channelId) {
        if (this.currentTab !== 'stage') this.pushCurrentView();
        this.currentTab = 'stage';
        this.render();
        if (this.audioConnected === false && !clubhouseClient.getConfig().useSandbox) {
          void this.connectRoomAudio(this.roomSession.generation);
        }
        return;
      }
      await this.leaveRoom({ silent: true });
    }

    const begun = beginJoin(this.roomSession);
    this.roomSession = begun.session;
    const generation = begun.generation;
    this.joinInFlight = true;
    let noteJoinMute = false;

    try {
      const joined = preset ?? await clubhouseClient.joinChannel(channelId);
      const committed = commitJoin(this.roomSession, generation);
      if (!committed) {
        // Leave raced ahead of join — drop the server-side ghost presence.
        if (!preset && clubhouseClient.supports('leave_channel')) {
          void clubhouseClient.leaveChannel(channelId).catch(() => undefined);
        }
        return;
      }
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
      roomShutdown = null;
      const joinedId = this.channelApiId(joined);
      if (joinedId) notifyRoomPresence({ channel: joinedId });
      this.pubnubSource.setChannel(joined);
      if (joined.agora_native_mute === true) agoraVoice.setNativeMuteSignalling(true);
      if (joined.is_chat_enabled === false) this.chatOpen = false;
      // Speakers/hosts default live in the studio. should_join_muted only for
      // non-moderator speakers (Clubhouse audience→stage etiquette).
      const asSpeaker = this.isMeSpeaker();
      const asMod = this.isMeModerator();
      console.log(
        '[Clubbox] join mute decision',
        `should_join_muted=${String(joined.should_join_muted)}`,
        `speaker=${asSpeaker}`,
        `mod=${asMod}`,
        `me=${String(this.me?.user_id ?? '')}`,
      );
      if (joined.should_join_muted === true && asSpeaker && !asMod) {
        audioEngine.setMuted(true);
        noteJoinMute = true;
      } else if (asSpeaker) {
        audioEngine.setMuted(false);
        noteJoinMute = true;
      }
    } catch (err) {
      if (this.roomSession.generation !== generation) return;
      if (err instanceof ClubhouseApiError && (err.status === 404 || err.status === 405)) {
        this.showToast(t('joinUnavailableOnWeb'), '🔒');
      } else {
        this.reportApiError(err);
      }
      this.render();
      return;
    } finally {
      if (this.roomSession.generation === generation) this.joinInFlight = false;
    }

    if (this.roomSession.generation !== generation || !this.currentChannel) return;
    // Enter the stage UI immediately — do not wait for Agora (DNS hangs left the
    // Clubhouse session joined while the desktop still showed the hallway card).
    this.syncClipArm();
    this.audioConnected = clubhouseClient.getConfig().useSandbox ? null : false;
    this.startRoomPresence(this.channelApiId(this.currentChannel));
    if (noteJoinMute) this.syncSelfMuteFromEngine();
    this.chatMessages = [];
    if (this.currentTab !== 'stage') this.pushCurrentView();
    this.currentTab = 'stage';
    this.unreadChat = 0;
    if (this.currentChannel.is_chat_enabled !== false) this.chatOpen = true;
    this.render();
    this.showToast(t('joinedRoom', { topic: this.currentChannel.topic }), '🎙️');
    if (audioEngine.getIsMuted() && this.isMeSpeaker()) {
      this.showToast(t('joinMuted'), '🔇');
    }

    void (async () => {
      // Re-apply after stage render — id/type mismatches can miss the earlier unmute.
      if (this.isMeSpeaker() && (this.isMeModerator() || this.currentChannel?.should_join_muted !== true)) {
        audioEngine.setMuted(false);
        this.syncSelfMuteFromEngine();
      }
      if (this.isMeSpeaker()) {
        const micOk = await audioEngine.startMicrophone();
        if (!micOk) {
          reportMicFailure(this);
          // OS denied mic — skip Agora publish retries (they cannot succeed).
          if (audioEngine.lastMicError === 'system') {
            await this.connectRoomAudio(generation);
            this.renderCockpit();
            return;
          }
        }
      }
      if (this.roomSession.generation !== generation || !this.currentChannel) return;
      await this.connectRoomAudio(generation);
      if (this.roomSession.generation !== generation || !this.currentChannel) return;
      // Host may have joined while mic was still denied — retry publish once.
      // Do not agoraVoice.setMuted() after publish — that was the regression (enabled=false).
      if (this.isMeSpeaker() && agoraVoice.getIsJoined()) {
        const published = await agoraVoice.ensurePublished(audioEngine.getAudioQuality());
        if (!published) reportMicFailure(this);
      }
      this.renderCockpit();
    })();

    {
      const chatEvidence = clubhouseClient.evidence('get_channel_messages');
      if (chatEvidence === 'observed' || chatEvidence === 'bundle') {
        try {
          const chat = await clubhouseClient.getChannelMessages(this.channelApiId(this.currentChannel));
          if (this.roomSession.generation !== generation || !this.currentChannel) return;
          this.chatMessages = chat.messages || [];
          if (this.chatOpen) this.renderChat();
        } catch (err) {
          this.reportApiError(err);
        }
      }
    }
  }

/** Fetch a fresh RTC token from join_channel (only observed Agora token source). */
export async function fetchFreshAgoraToken(this: ClubboxApp): Promise<string | null> {
  if (!this.currentChannel || !this.me || !this.roomSession.inRoom) return null;
  const channelId = this.channelApiId(this.currentChannel);
  const joined = await clubhouseClient.joinChannel(channelId);
  const token = joined.token ?? null;
  if (token && this.currentChannel) {
    this.currentChannel = { ...this.currentChannel, ...joined, token };
  }
  return token;
}

/** Phase 24.3: renewToken on will-expire; leave+join fallback on did-expire / renew failure. */
export async function handleAgoraTokenEvent(this: ClubboxApp, kind: 'will-expire' | 'did-expire'): Promise<void> {
  if (!this.currentChannel || clubhouseClient.getConfig().useSandbox) return;
  if (kind === 'will-expire') {
    try {
      const token = await this.fetchFreshAgoraToken();
      if (!token) {
        console.warn('[Clubbox] token will-expire: no token from join_channel');
        return;
      }
      const ok = await agoraVoice.renewToken(token);
      if (!ok) {
        console.warn('[Clubbox] renewToken failed — will rejoin on did-expire');
      }
    } catch (err) {
      console.warn('[Clubbox] token will-expire refresh failed:', err);
    }
    return;
  }
  // did-expire: clean leave + join preserving role/mute (join_channel side effects accepted for recovery).
  const wasMuted = audioEngine.getIsMuted();
  await this.rejoinAgoraAudio();
  if (wasMuted) {
    audioEngine.setMuted(true);
    this.syncSelfMuteFromEngine();
    void this.queueMuteSync();
  }
}

/** Phase 24.2: fetch a fresh join_channel token and rejoin Agora without leaving the Clubhouse room. */
export async function rejoinAgoraAudio(this: ClubboxApp): Promise<void> {
  if (!this.currentChannel || !this.me || clubhouseClient.getConfig().useSandbox) return;
  if (!this.roomSession.inRoom) return;
  const generation = this.roomSession.generation;
  try {
    console.warn('[Clubbox] Agora rejoin: fetching fresh join_channel token');
    const token = await this.fetchFreshAgoraToken();
    if (this.roomSession.generation !== generation || !this.currentChannel) return;
    if (!token && !this.currentChannel.token) {
      throw new Error('no_token');
    }
    await agoraVoice.leave();
    if (this.roomSession.generation !== generation) return;
    await this.connectRoomAudio(generation);
    if (agoraVoice.getIsJoined()) {
      agoraVoice.resetRejoinAttempts();
      const banner = document.getElementById('realtime-banner');
      if (banner) banner.hidden = true;
    }
  } catch (err) {
    console.warn('[Clubbox] Agora rejoin failed:', err);
    this.audioConnected = false;
    this.showToast(t('agoraDnsFailed'), '🔇');
    this.render();
  }
}

export async function connectRoomAudio(this: ClubboxApp, generation: number) : Promise<void> {
    if (this.roomSession.generation !== generation || !this.currentChannel || clubhouseClient.getConfig().useSandbox) return;
    if (!this.me) {
      this.audioConnected = false;
      this.showToast(t('signInToHear'), '🔑');
      return;
    }
    console.log(
      `[Clubbox] connectRoomAudio web_listening=${String(this.currentChannel.is_web_listening_enabled)}`
        + ` tokenLen=${this.currentChannel.token?.length ?? 0}`
        + ` channel=${this.currentChannel.channel}`,
    );
    if (this.currentChannel.is_web_listening_enabled === false) {
      // Soft notice only — live rooms with false still join Agora successfully.
      this.showToast(t('webListeningDisabled'), '🌐');
    }
    if (!clubhouseClient.getConfig().agoraAppId) {
      this.audioConnected = false;
      clubhouseClient.noteApiHealth('agora', t('audioKeyNotFound'));
      this.showToast(t('audioKeyNotFound'), '🔇');
      return;
    }
    if (!this.currentChannel.token) {
      this.audioConnected = false;
      this.showToast(t('noAudioToken'), '🔇');
      return;
    }
    // Agora UID: join_channel.user_profile_id when present (numeric token binding).
    const agoraUid = Number(this.currentChannel.user_profile_id) > 0
      ? Number(this.currentChannel.user_profile_id)
      : this.me.user_id;
    const speak = this.isMeSpeaker() && !this.applyLoopGuard().blockStage;
    if (this.isMeSpeaker() && !speak) this.showToast(t('loopBlockStage'), '🔊');
    const ok = await agoraVoice.join(
      this.currentChannel.channel,
      this.currentChannel.token,
      agoraUid,
      { isSpeaker: speak, quality: audioEngine.getAudioQuality() }
    );
    if (this.roomSession.generation !== generation) {
      await agoraVoice.leave();
      return;
    }
    this.audioConnected = ok;
    if (ok) {
      this.promptMixerMicIfKnown();
      this.renderCockpit();
    }
    if (!ok) {
      const reason = agoraVoice.getLastJoinResult();
      this.showToast(
        reason && reason !== 'join_failed'
          ? t('voiceFailureReason', { reason })
          : t('audioTokenGap'),
        '🔇',
      );
    }
  }

export async function releaseRoomLocally(this: ClubboxApp, options: { skipServer?: boolean } = {}) : Promise<void> {
    if (this.agoraRejoinTimer) {
      clearTimeout(this.agoraRejoinTimer);
      this.agoraRejoinTimer = null;
    }
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
    // Stop presence first so active_ping cannot re-assert us while we leave.
    this.stopRoomPresence();
    this.dismissedSpeakerInvite = false;
    this.closeSpeakerInvite(false);
    clubhouseClient.setHandRaised(false);
    audioEngine.stopRecording();
    audioEngine.armClip(false);
    audioEngine.stopMicrophone();
    audioEngine.releaseExternal();
    try {
      await agoraVoice.leave();
    } catch {
      // Local publishing still stops below if leave throws.
    }
    // Tell Clubhouse we left before clearing UI state so the request always has a channel id.
    if (!options.skipServer && channelId && clubhouseClient.supports('leave_channel')) {
      try {
        await clubhouseClient.leaveChannel(channelId);
      } catch (err) {
        this.reportApiError(err);
      }
    }
    notifyRoomPresence({ left: true });
    this.currentChannel = null;
    this.chatMessages = [];
    this.unreadChat = 0;
    this.audioConnected = null;
    this.openSpeakerMenuId = null;
  }

export async function leaveRoom(this: ClubboxApp, options: { silent?: boolean } = {}) {
    const channel = this.currentChannel;
    const hadRoom = !!channel;
    if (!hadRoom && !this.joinInFlight && !agoraVoice.getIsJoined() && !audioEngine.getIsRecording()) return;
    // Leave never calls end_channel — use Details › End room to close for everyone.
    if (!options.silent && hadRoom) {
      if (!window.confirm(t('leaveRoomConfirm'))) return;
    }

    await this.releaseRoomLocally();
    this.afterRoomExit(hadRoom, options.silent === true, false);
  }

export function afterRoomExit(this: ClubboxApp, hadRoom: boolean, silent: boolean, ended: boolean) : void {
    const { stack, previous } = popView(this.viewStack);
    this.viewStack = stack;
    if (previous) this.restoreView(previous);
    else this.currentTab = 'explore';
    this.chatOpen = true;
    this.audienceSearchQuery = '';
    this.render();
    if (hadRoom && !silent) this.showToast(ended ? t('endedRoom') : t('leftRoom'), ended ? '⏹' : '👋');
    if (!hadRoom) return;
    void this.reloadChannels().then(() => {
      if (this.currentTab === 'explore') this.render();
    }).catch((err) => this.reportApiError(err));
  }

export async function endRoom(this: ClubboxApp) : Promise<void> {
    const channel = this.currentChannel;
    const myId = this.me?.user_id ?? clubhouseClient.getCurrentUserId();
    if (!channel || !this.isMeModerator() || myId == null) return;
    if (!this.allowAction('end_channel')) return;
    if (!window.confirm(t('endRoomConfirm'))) return;
    const channelCode = this.channelApiId(channel);
    try {
      await clubhouseClient.endChannel(channelCode, channel.channel_id);
      await this.releaseRoomLocally({ skipServer: true });
      this.afterRoomExit(true, false, true);
    } catch (err) {
      // Explicit End must not degrade to Leave — stay in the room and surface the error.
      if (err instanceof ClubhouseApiError && (err.status === 404 || err.status === 405)) {
        this.showToast(t('endRoomUnavailable'), '📱');
        return;
      }
      this.reportApiError(err);
    }
  }

export async function sendChatMessage(this: ClubboxApp) {
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

export async function confirmCreateRoom(this: ClubboxApp) : Promise<void> {
    const topic = (document.getElementById('new-room-topic') as HTMLInputElement | null)?.value.trim();
    const privacy = (document.getElementById('new-room-privacy') as HTMLInputElement | HTMLSelectElement | null)?.value;
    const audience: CreateAudience = privacy === 'friends' || privacy === 'friends-of-friends' || privacy === 'house'
      || privacy === 'social' || privacy === 'closed' ? privacy : 'public';
    const clubField = document.getElementById('new-room-house') as HTMLInputElement | HTMLSelectElement | null;
    const socialClubId = audience === 'house' && clubField?.value ? Number(clubField.value) : undefined;
    const disableReplay = document.getElementById('new-room-disable-replay') as HTMLInputElement | null;
    const replaysEl = document.getElementById('new-room-replays') as HTMLInputElement | null;
    const replayDefaults = createDefaults(this.createChannelTargets, audience);
    const replayEnabled = resolveCreateReplayEnabled({
      disableReplayChecked: disableReplay ? disableReplay.checked : null,
      replaysField: replaysEl
        ? (replaysEl.type === 'checkbox' ? replaysEl.checked : replaysEl.value)
        : null,
      defaultsReplayEnabled: replayDefaults.replayEnabled,
    });
    const chatEnabled = (document.getElementById('new-room-chat') as HTMLInputElement | null)?.checked !== false;
    const handraiseRaw = (document.getElementById('new-room-handraise') as HTMLSelectElement | null)?.value;
    const handraisePermission = handraiseRaw === '2' ? 2 : handraiseRaw === '1' ? 1 : undefined;
    const link = (document.getElementById('new-room-link') as HTMLInputElement | null)?.value.trim() || undefined;
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
        ...(typeof socialClubId === 'number' && Number.isFinite(socialClubId) ? { socialClubId } : {}),
        ...(handraisePermission != null ? { handraisePermission } : {}),
        ...(link ? { link } : {}),
      });
      if (!replayEnabled && newChan.is_replay_enabled === true) {
        this.showToast(t('replaysStillOnAfterCreate'), '⚠️');
      }
      this.channelsList.unshift(newChan);
      this.closeCreateModal();
      await this.joinRoom(newChan.channel || newChan.channel_id.toString(), newChan);
    } catch (err) {
      this.reportApiError(err);
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = t('goLive');
      }
    }
  }

export function stageControlFlags(app: ClubboxApp) {
  return roomControlFlags(
    readUserCapabilities(app.currentChannel),
    (endpoint) => clubhouseClient.supports(endpoint),
  );
}

export function wireRoomCtl(proto: ClubboxApp): void {
  proto.handleBeforeUnload = handleBeforeUnload;
  proto.handleAgoraLifecycle = handleAgoraLifecycle;
  proto.startRoomPresence = startRoomPresence;
  proto.stopChatPolling = stopChatPolling;
  proto.syncChatPolling = syncChatPolling;
  proto.stopRoomPresence = stopRoomPresence;
  proto.refreshChat = refreshChat;
  proto.channelApiId = channelApiId;
  proto.applyRoomUpdate = applyRoomUpdate;
  proto.isMeSpeaker = isMeSpeaker;
  proto.isMeModerator = isMeModerator;
  proto.syncAgoraRole = syncAgoraRole;
  proto.demoteLocalSpeaker = demoteLocalSpeaker;
  proto.runAgoraRoleSync = runAgoraRoleSync;
  proto.inviteToStage = inviteToStage;
  proto.moderateSpeaker = moderateSpeaker;
  proto.maybeShowSpeakerInvite = maybeShowSpeakerInvite;
  proto.renderSpeakerInvite = renderSpeakerInvite;
  proto.closeSpeakerInvite = closeSpeakerInvite;
  proto.acceptSpeakerInvite = acceptSpeakerInvite;
  proto.joinOpenStage = joinOpenStage;
  proto.promoteToStage = promoteToStage;
  proto.declineSpeakerInvite = declineSpeakerInvite;
  proto.muteEveryone = muteEveryone;
  proto.setHandRaisePermission = setHandRaisePermission;
  proto.renameRoom = renameRoom;
  proto.sendReaction = sendReaction;
  proto.sendGifReaction = sendGifReaction;
  proto.openPingPanel = openPingPanel;
  proto.closePingInvitePanel = closePingInvitePanel;
  proto.searchPingCandidates = searchPingCandidates;
  proto.togglePingSelect = togglePingSelect;
  proto.sendPings = sendPings;
  proto.setRoomVisibility = setRoomVisibility;
  proto.refreshStageManual = refreshStageManual;
  proto.toggleHandRaise = toggleHandRaise;
  proto.recordingAllowed = recordingAllowed;
  proto.syncRecBanner = syncRecBanner;
  proto.toggleRecording = toggleRecording;
  proto.clipsAllowed = clipsAllowed;
  proto.syncClipArm = syncClipArm;
  proto.saveClip = saveClip;
  proto.allowAction = allowAction;
  proto.enableExperimentalActions = enableExperimentalActions;
  proto.joinRoom = joinRoom;
  proto.connectRoomAudio = connectRoomAudio;
  proto.fetchFreshAgoraToken = fetchFreshAgoraToken;
  proto.handleAgoraTokenEvent = handleAgoraTokenEvent;
  proto.rejoinAgoraAudio = rejoinAgoraAudio;
  proto.releaseRoomLocally = releaseRoomLocally;
  proto.leaveRoom = leaveRoom;
  proto.afterRoomExit = afterRoomExit;
  proto.endRoom = endRoom;
  proto.sendChatMessage = sendChatMessage;
  proto.confirmCreateRoom = confirmCreateRoom;
}
