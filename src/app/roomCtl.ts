export { RoomEffectRunner, type RoomEffectDeps } from './roomEffectRunner.ts';
import { ClubhouseApiError, clubhouseClient } from '../api/client.ts';
import { beginJoin, commitJoin, finishLeave, localClipAllowed, roleSyncDecision, roomAudience } from '../api/guards.ts';
import { leaveClosesRoom, planLeaveServer, roomHasOthers } from '../api/roomActions.ts';
import { visibilityChangeEndpoint } from '../api/moderationExtras.ts';
import { mergePingCandidates, readSearchPingCandidates, readSuggestedInvites } from '../api/pingInvites.ts';
import { readUserCapabilities, roomControlFlags } from '../api/roomControls.ts';
import { roomSync } from '../api/roomSync.ts';
import { audioEngine } from '../audio/audioEngine.ts';
import { agoraVoice } from '../audio/agoraVoice.ts';
import type { CHChannelDetail, CHChatMessage } from '../api/types.ts';
import { t } from '../i18n/index.ts';
import { closePingPanel, mountPingPanel, refreshPingPanel } from '../ui/components/pingPanel.ts';
import { mountSpeakerInvite } from '../ui/components/speakerInvite.ts';
import { safeUrl } from '../ui/html.ts';
import type { ClubboxApp } from './clubboxApp.ts';
import { recordingFilename } from './recordingFilename.ts';
import { popView } from './viewStack.ts';

const CHAT_POLL_MS = 15_000;


export function handleBeforeUnload(this: ClubboxApp) : void {
    const channel = this.currentChannel;
    this.roomSession = finishLeave(this.roomSession);
    this.joinInFlight = false;
    this.stopRoomPresence();
    audioEngine.stopRecording();
    audioEngine.armClip(false);
    audioEngine.stopMicrophone();
    audioEngine.releaseExternal();
    void agoraVoice.leave();
    if (!channel || !clubhouseClient.supports('leave_channel')) return;
    void clubhouseClient.leaveChannel(this.channelApiId(channel)).catch(() => {
      // Page is going away; the leave request is best-effort.
    });
  }

export function startRoomPresence(this: ClubboxApp, channelId: string) : void {
    this.stopRoomPresence();
    const pingEvidence = clubhouseClient.evidence('active_ping');
    // Bundle or observed: keep the official-client cadence (30s), including while hidden.
    if (pingEvidence === 'observed' || pingEvidence === 'bundle') {
      this.pingTimer = window.setInterval(() => {
        void clubhouseClient.activePing(channelId).catch((err) => {
          console.warn('[Clubbox] active_ping failed:', err);
        });
      }, 30000);
    }
    const channel = this.currentChannel;
    if (channel) this.pubnubSource.setChannel(channel);
    const pubnubToken = channel?.pubnub_token;
    this.pubnubSource.setToken(pubnubToken);
    this.pubnubSource.setChatOpen(this.chatOpen);
    this.pubnubSource.start(channelId);
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
    const open = !!this.currentChannel
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
    if (!this.currentChannel || (chatEvidence !== 'observed' && chatEvidence !== 'bundle')) return;
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

export function channelApiId(this: ClubboxApp, channel: { channel?: string; channel_id: string | number }) : string {
    return channel.channel || String(channel.channel_id);
  }

export function applyRoomUpdate(this: ClubboxApp, detail: CHChannelDetail) : void {
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

export function isMeSpeaker(this: ClubboxApp) : boolean {
    if (!this.currentChannel || !this.me) return false;
    return this.currentChannel.users.some((user) => user.user_id === this.me?.user_id && !!user.is_speaker);
  }

export function isMeModerator(this: ClubboxApp) : boolean {
    if (!this.currentChannel || !this.me) return false;
    return this.currentChannel.users.some((user) => user.user_id === this.me?.user_id && !!user.is_moderator);
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

export async function runAgoraRoleSync(this: ClubboxApp) : Promise<void> {
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
            audioEngine.releaseExternal();
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

export async function inviteToStage(this: ClubboxApp, userId: number) : Promise<void> {
    if (!this.currentChannel || !this.isMeModerator()) return;
    if (!this.allowAction('invite_speaker')) return;
    try {
      await clubhouseClient.inviteSpeaker(this.channelApiId(this.currentChannel), userId);
      const invited = this.currentChannel.users.find((user) => user.user_id === userId);
      if (invited) invited.is_invited_to_speak = true;
      this.showToast(t('invitedToSpeakToast'), '🎙️');
      await this.refreshCurrentRoom();
    } catch (err) {
      this.reportApiError(err);
    }
  }

export async function moderateSpeaker(this: ClubboxApp, userId: number, action: 'mute' | 'moderator' | 'audience' | 'block') : Promise<void> {
    if (!this.currentChannel || !this.isMeModerator()) return;
    const channelId = this.channelApiId(this.currentChannel);
    const endpoint = action === 'mute' ? 'mute_speaker'
      : action === 'moderator' ? 'make_moderator'
        : action === 'block' ? 'block_from_channel'
          : 'uninvite_speaker';
    if (!this.allowAction(endpoint)) return;
    if (action === 'block' && !window.confirm(t('blockFromRoomConfirm'))) return;
    try {
      if (action === 'mute') await clubhouseClient.muteSpeaker(channelId, userId);
      else if (action === 'moderator') await clubhouseClient.makeModerator(channelId, userId);
      else if (action === 'block') await clubhouseClient.blockFromChannel(channelId, userId);
      else await clubhouseClient.uninviteSpeaker(channelId, userId);
      this.openSpeakerMenuId = null;
      const target = this.currentChannel.users.find((user) => user.user_id === userId);
      if (action === 'block') {
        this.currentChannel.users = this.currentChannel.users.filter((user) => user.user_id !== userId);
      } else if (target) {
        if (action === 'mute') target.is_muted = true;
        else if (action === 'moderator') target.is_moderator = true;
        else if (action === 'audience') {
          target.is_speaker = false;
          target.is_moderator = false;
        }
      }
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
    if (!this.currentChannel || !this.me) return;
    if (!this.allowAction('become_speaker')) return;
    const acceptBtn = document.getElementById('accept-speak-btn') as HTMLButtonElement | null;
    if (acceptBtn) acceptBtn.disabled = true;
    try {
      await clubhouseClient.becomeSpeaker(this.channelApiId(this.currentChannel));
      this.closeSpeakerInvite();
      const mine = this.currentChannel.users.find((user) => user.user_id === this.me?.user_id);
      if (mine) {
        mine.is_speaker = true;
        mine.is_invited_to_speak = false;
      }
      await this.refreshCurrentRoom();
      if (!clubhouseClient.getConfig().useSandbox && agoraVoice.getIsJoined()) {
        await agoraVoice.promoteToSpeaker();
      }
      audioEngine.setMuted(true);
      this.showToast(t('onStage'), '🎙️');
    } catch (err) {
      this.reportApiError(err);
      if (acceptBtn) acceptBtn.disabled = false;
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
      const key = evidence === 'unsupported'
        ? 'unsupportedAction'
        : evidence === 'community'
          ? 'availableInClubhouseApp'
          : 'unverifiedAction';
      this.showToast(t(key), '🔒');
      return false;
    }
    if (clubhouseClient.needsExperimentalConfirmation(endpoint)) {
      if (!window.confirm(t('experimentalConfirm'))) return false;
      clubhouseClient.confirmExperimental(endpoint);
    }
    return true;
  }

export async function joinRoom(this: ClubboxApp, channelId: string, preset?: CHChannelDetail) {
    if (!preset && !this.allowAction('join_channel')) return;
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
      const joined = preset ?? await clubhouseClient.joinChannel(channelId);
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
      this.pubnubSource.setChannel(joined);
      if (joined.agora_native_mute === true) agoraVoice.setNativeMuteSignalling(true);
      if (joined.is_chat_enabled === false) this.chatOpen = false;
      if (joined.should_join_muted === true) audioEngine.setMuted(true);
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
    this.syncClipArm();
    this.audioConnected = clubhouseClient.getConfig().useSandbox ? null : false;
    if (this.isMeSpeaker()) void audioEngine.startMicrophone();
    await this.connectRoomAudio(generation);

    if (this.roomSession.generation !== generation || !this.currentChannel) return;
    this.startRoomPresence(this.channelApiId(this.currentChannel));
    this.chatMessages = [];
    {
      const chatEvidence = clubhouseClient.evidence('get_channel_messages');
      if (chatEvidence === 'observed' || chatEvidence === 'bundle') {
        try {
          const chat = await clubhouseClient.getChannelMessages(this.channelApiId(this.currentChannel));
          this.chatMessages = chat.messages || [];
        } catch (err) {
          this.reportApiError(err);
        }
      }
    }
    if (this.roomSession.generation !== generation || !this.currentChannel) return;
    if (this.currentTab !== 'stage') this.pushCurrentView();
    this.currentTab = 'stage';
    this.unreadChat = 0;
    if (this.currentChannel.is_chat_enabled !== false) this.chatOpen = true;
    this.render();
    if (clubhouseClient.getConfig().useSandbox || this.audioConnected) {
      this.showToast(t('joinedRoom', { topic: this.currentChannel.topic }), '🎙️');
    }
    if (this.currentChannel.should_join_muted === true) this.showToast(t('joinMuted'), '🔇');
  }

export async function connectRoomAudio(this: ClubboxApp, generation: number) : Promise<void> {
    if (this.roomSession.generation !== generation || !this.currentChannel || clubhouseClient.getConfig().useSandbox) return;
    if (!this.me) {
      this.audioConnected = false;
      this.showToast(t('signInToHear'), '🔑');
      return;
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

export async function releaseRoomLocally(this: ClubboxApp, options: { skipServer?: boolean } = {}) : Promise<void> {
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
    this.currentChannel = null;
    this.chatMessages = [];
    this.unreadChat = 0;
    this.audioConnected = null;
    this.openSpeakerMenuId = null;
  }

export async function leaveRoom(this: ClubboxApp, options: { silent?: boolean; end?: boolean } = {}) {
    const channel = this.currentChannel;
    const hadRoom = !!channel;
    if (!hadRoom && !this.joinInFlight && !agoraVoice.getIsJoined() && !audioEngine.getIsRecording()) return;
    const myId = this.me?.user_id ?? clubhouseClient.getCurrentUserId();
    const closes = !!channel && myId != null && leaveClosesRoom(channel.users, myId);
    const sandbox = clubhouseClient.getConfig().useSandbox;
    let wantEnd = options.end === true;
    if (!options.silent && !options.end && closes) {
      if (!window.confirm(t('leaveEndsRoomConfirm'))) return;
      wantEnd = true;
    } else if (!options.silent && !options.end && hadRoom) {
      if (!window.confirm(t('leaveRoomConfirm'))) return;
    } else if (options.silent && !options.end && closes && sandbox) {
      wantEnd = true;
    }

    const endSupported = sandbox || clubhouseClient.supports('end_channel');
    const plan = planLeaveServer({ wantEnd, endSupported });

    if (plan.action === 'end_then_local' && channel) {
      try {
        await clubhouseClient.endChannel(this.channelApiId(channel));
        await this.releaseRoomLocally({ skipServer: true });
        this.afterRoomExit(hadRoom, options.silent === true, true);
        return;
      } catch (err) {
        this.reportApiError(err);
        // Fall through: leave_channel so we do not stay ghosted in the room.
      }
    } else if (wantEnd && !endSupported) {
      this.showToast(t('availableInClubhouseApp'), '📱');
    }

    // Always best-effort leave_channel (never skipServer on Leave quietly).
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
    if (roomHasOthers(channel.users, myId) && !window.confirm(t('endRoomConfirm'))) return;
    await this.leaveRoom({ silent: true, end: true });
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
    const audience = privacy === 'friends' || privacy === 'friends-of-friends' || privacy === 'house'
      || privacy === 'social' || privacy === 'closed' ? privacy : 'public';
    const clubField = document.getElementById('new-room-house') as HTMLInputElement | HTMLSelectElement | null;
    const socialClubId = audience === 'house' && clubField?.value ? Number(clubField.value) : undefined;
    const disableReplay = document.getElementById('new-room-disable-replay') as HTMLInputElement | null;
    const replaysEl = document.getElementById('new-room-replays') as HTMLInputElement | null;
    const replayEnabled = disableReplay
      ? !disableReplay.checked
      : replaysEl
        ? (replaysEl.type === 'checkbox' ? replaysEl.checked : replaysEl.value !== '0')
        : true;
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
  proto.runAgoraRoleSync = runAgoraRoleSync;
  proto.inviteToStage = inviteToStage;
  proto.moderateSpeaker = moderateSpeaker;
  proto.maybeShowSpeakerInvite = maybeShowSpeakerInvite;
  proto.renderSpeakerInvite = renderSpeakerInvite;
  proto.closeSpeakerInvite = closeSpeakerInvite;
  proto.acceptSpeakerInvite = acceptSpeakerInvite;
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
  proto.joinRoom = joinRoom;
  proto.connectRoomAudio = connectRoomAudio;
  proto.releaseRoomLocally = releaseRoomLocally;
  proto.leaveRoom = leaveRoom;
  proto.afterRoomExit = afterRoomExit;
  proto.endRoom = endRoom;
  proto.sendChatMessage = sendChatMessage;
  proto.confirmCreateRoom = confirmCreateRoom;
}
