import './style.css';
import { ClubhouseApiError, clubhouseClient } from './api/client';
import { roomSync } from './api/roomSync';
import { audioEngine } from './audio/audioEngine';
import { agoraVoice } from './audio/agoraVoice';
import type { CHAuthResponse, CHChannel, CHChannelDetail, CHUser, CHChatMessage } from './api/types';

interface CapturedAuth {
  token: string;
  userId: number | null;
}

interface ElectronAPI {
  isElectron: boolean;
  openTokenCapture: () => void;
  onTokenCaptured: (callback: (payload: CapturedAuth) => void) => void;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function normalizePhone(input: string): string | null {
  const compact = input.replace(/[\s().-]/g, '');
  if (compact.startsWith('+')) {
    return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
  }
  if (/^0\d{10}$/.test(compact)) return `+90${compact.slice(1)}`;
  if (/^5\d{9}$/.test(compact)) return `+90${compact}`;
  return null;
}

function electronAPI(): ElectronAPI | null {
  return (window as Window & { electronAPI?: ElectronAPI }).electronAPI ?? null;
}

const FALLBACK_AVATAR = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200';

class ClubdeckApp {
  private currentTab: 'stage' | 'explore' | 'soundboard' | 'settings' | 'login' = 'stage';
  private currentChannel: CHChannelDetail | null = null;
  private channelsList: CHChannel[] = [];
  private me: CHUser | null = null;
  private selectedProfile: CHUser | null = null;
  private loginPhone = '';
  private loginCode = '';
  private loginStep: 'phone' | 'code' = 'phone';
  private loginBusy = false;
  private loginNotice = '';
  private isCreateModalOpen: boolean = false;
  private isSettingsModalOpen: boolean = false;
  private isProfileDrawerOpen: boolean = false;
  private recordTimerInterval: number | null = null;
  private recordDurationSec: number = 0;
  private pingTimer: number | null = null;
  private exploreTimer: number | null = null;
  private profileLoading = false;
  private openSpeakerMenuId: number | null = null;
  private speakerInviteVisible = false;
  private dismissedSpeakerInvite = false;

  private chatMessages: CHChatMessage[] = [
    {
      id: 'msg-1',
      user_id: 201,
      name: 'Elena Rostova',
      username: 'elena_ai',
      photo_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
      message: 'Welcome everyone! Drop your questions for our speakers here 🎧',
      timestamp: '2m ago',
    },
    {
      id: 'msg-2',
      user_id: 202,
      name: 'Marcus Vance',
      username: 'marcus_v',
      photo_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
      message: 'Testing audio routing from Clubdeck, sounds super clean!',
      timestamp: '1m ago',
    },
  ];

  constructor() {
    clubhouseClient.onAuthExpired(() => this.handleAuthExpired());
    roomSync.onUpdate((detail) => this.applyRoomUpdate(detail));
    window.addEventListener('beforeunload', () => this.handleBeforeUnload());
    this.init();
  }

  private async init() {
    this.setupHotkeys();

    if (electronAPI()?.isElectron) {
      await clubhouseClient.adoptWebSession();
    }
    await this.refreshMe();

    try {
      const res = await clubhouseClient.getChannels();
      this.channelsList = res.channels || [];
    } catch (err) {
      this.reportApiError(err);
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

    electronAPI()?.onTokenCaptured((payload) => {
      const userId = typeof payload.userId === 'number' && Number.isFinite(payload.userId) ? payload.userId : null;
      clubhouseClient.updateConfig({
        authToken: payload.token,
        ...(userId != null ? { userId } : {}),
        useSandbox: false,
        webSession: false,
      });
      void this.finishSignIn();
    });

    if (this.currentTab === 'stage') {
      const config = clubhouseClient.getConfig();
      const signedIn = config.webSession || (!config.useSandbox && !!config.authToken);
      const needsLiveLogin = !!electronAPI()?.isElectron && !signedIn;
      this.currentTab = needsLiveLogin ? 'login' : 'explore';
    }

    // Render even when the network failed so the shell is never blank.
    this.render();
    if (this.currentTab === 'explore') {
      this.startExploreRefresh();
    }

    // Start microphone monitoring smoothly (starts suspended until user interacts)
    document.addEventListener('click', () => {
      audioEngine.startMicrophone();
    }, { once: true });
  }

  private handleAuthExpired(): void {
    this.stopRoomPresence();
    this.me = null;
    this.showToast('Session expired. Sign in again.', '🔑');
    this.currentTab = 'login';
    this.render();
  }

  private async refreshMe(): Promise<void> {
    try {
      const res = await clubhouseClient.getMe();
      this.me = res.user_profile ?? null;
      if (this.me && !clubhouseClient.getConfig().useSandbox) {
        clubhouseClient.updateConfig({ userId: this.me.user_id });
      }
    } catch (err) {
      this.me = null;
      this.reportApiError(err);
    }
  }

  private async reloadChannels(): Promise<void> {
    const res = await clubhouseClient.getChannels();
    this.channelsList = res.channels || [];
  }

  private async finishSignIn(): Promise<void> {
    await this.refreshMe();
    try {
      await this.reloadChannels();
    } catch (err) {
      this.reportApiError(err);
    }
    this.loginStep = 'phone';
    this.loginCode = '';
    this.loginNotice = '';
    this.currentTab = 'explore';
    this.startExploreRefresh();
    this.render();
    if (this.me) {
      this.showToast(`Signed in as ${this.me.name}`, '🔑');
    }
  }

  private async submitPhoneLogin(): Promise<void> {
    const rawPhone = (document.getElementById('login-phone') as HTMLInputElement | null)?.value.trim() ?? '';
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      this.showToast('Enter a full number, for example +90 5xx xxx xx xx', '⚠️');
      return;
    }
    this.loginPhone = phone;
    this.loginBusy = true;
    this.render();
    try {
      const res = (await clubhouseClient.startPhoneNumberAuth(phone)) as CHAuthResponse;
      if (res.is_blocked) {
        this.loginNotice = res.error_message || 'Clubhouse blocked this number.';
        this.showToast(this.loginNotice, '⚠️');
        return;
      }
      if (res.is_waitlisted) {
        this.loginNotice = res.error_message || "You're on the waitlist.";
        this.showToast(this.loginNotice, '⏳');
        return;
      }
      if (res.send_rc_token) {
        this.loginNotice = `Clubhouse must check ${phone} before it sends the SMS. Use the Clubhouse window and enter the same number.`;
        this.showToast('Clubhouse sign-in window opened', '🌐');
        electronAPI()?.openTokenCapture();
        return;
      }
      if (res.error_message) {
        this.loginNotice = res.error_message;
        this.showToast(res.error_message, '⚠️');
        return;
      }
      this.loginStep = 'code';
      this.loginNotice = `Code sent to ${phone}`;
    } catch (err) {
      this.reportApiError(err);
    } finally {
      this.loginBusy = false;
      this.render();
    }
  }

  private async submitLoginCode(): Promise<void> {
    const code = (document.getElementById('login-code') as HTMLInputElement | null)?.value.trim() ?? '';
    this.loginCode = code;
    if (!code || !this.loginPhone) {
      this.showToast('Enter the verification code', '⚠️');
      return;
    }
    this.loginBusy = true;
    this.render();
    try {
      const res = await clubhouseClient.completePhoneNumberAuth(this.loginPhone, code);
      if (res.is_waitlisted) {
        this.loginNotice = res.error_message || "You're on the waitlist.";
        this.showToast(this.loginNotice, '⏳');
        return;
      }
      if (!res.success || res.error_message) {
        this.loginNotice = res.error_message || 'Could not verify that code';
        this.showToast(this.loginNotice, '⚠️');
        return;
      }
      const token = res.auth_token || res.access_token;
      if (!token) {
        if (!res.user_profile && !res.is_verified) {
          this.loginNotice = 'No auth token was returned';
          this.showToast(this.loginNotice, '⚠️');
          return;
        }
        clubhouseClient.updateConfig({
          authToken: null,
          webSession: true,
          useSandbox: false,
          ...(res.user_profile ? { userId: res.user_profile.user_id } : {}),
        });
        await this.finishSignIn();
        return;
      }
      if (!res.user_profile) {
        await this.finishSignIn();
        return;
      }
      clubhouseClient.updateConfig({
        authToken: token,
        userId: res.user_profile.user_id,
        useSandbox: false,
        webSession: false,
      });
      this.me = res.user_profile;
      await this.reloadChannels();
      this.loginStep = 'phone';
      this.loginCode = '';
      this.loginNotice = '';
      this.currentTab = 'explore';
      this.startExploreRefresh();
      this.showToast(`Signed in as ${res.user_profile.name}`, '🔑');
    } catch (err) {
      this.reportApiError(err);
    } finally {
      this.loginBusy = false;
      this.render();
    }
  }

  private async resendLoginCode(): Promise<void> {
    if (!this.loginPhone) return;
    this.loginBusy = true;
    this.render();
    try {
      const res = (await clubhouseClient.resendPhoneNumberAuth(this.loginPhone)) as CHAuthResponse;
      if (res.error_message) {
        this.loginNotice = res.error_message;
        this.showToast(res.error_message, '⚠️');
        return;
      }
      this.loginNotice = 'Code sent again';
      this.showToast('Code sent again', '📨');
    } catch (err) {
      this.reportApiError(err);
    } finally {
      this.loginBusy = false;
      this.render();
    }
  }

  private reportApiError(err: unknown): void {
    if (err instanceof ClubhouseApiError && (err.status === 401 || err.status === 403)) {
      return;
    }
    const message = err instanceof Error ? err.message : 'Something went wrong';
    this.showToast(message, '⚠️');
  }

  private handleBeforeUnload(): void {
    const channel = this.currentChannel;
    this.stopRoomPresence();
    if (!channel) return;
    void clubhouseClient.leaveChannel(channel.channel_id.toString()).catch(() => {
      // Page is going away; the leave request is best-effort.
    });
  }

  private startRoomPresence(channelId: string): void {
    this.stopRoomPresence();
    this.pingTimer = window.setInterval(() => {
      void clubhouseClient.activePing(channelId).catch((err) => {
        console.warn('[Clubdeck] active_ping failed:', err);
      });
    }, 30000);
    roomSync.start(channelId);
  }

  private stopRoomPresence(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    roomSync.stop();
  }

  private applyRoomUpdate(detail: CHChannelDetail): void {
    if (!this.currentChannel) return;
    const sameRoom =
      String(detail.channel_id) === String(this.currentChannel.channel_id) ||
      detail.channel === this.currentChannel.channel;
    if (!sameRoom || !detail.users) return;

    const chatInput = document.getElementById('chat-input') as HTMLInputElement | null;
    const chatScroll = document.getElementById('chat-scroll');
    const draft = chatInput?.value ?? '';
    const scrollTop = chatScroll?.scrollTop ?? 0;
    const wasFocused = document.activeElement === chatInput;

    this.currentChannel.users = detail.users;
    this.currentChannel.num_all = detail.num_all;
    this.currentChannel.num_speakers = detail.num_speakers;
    this.currentChannel.has_raised_hands = detail.has_raised_hands;
    this.maybeShowSpeakerInvite();

    if (this.currentTab !== 'stage') return;
    this.render();

    const nextInput = document.getElementById('chat-input') as HTMLInputElement | null;
    const nextScroll = document.getElementById('chat-scroll');
    if (nextInput) {
      nextInput.value = draft;
      if (wasFocused) nextInput.focus();
    }
    if (nextScroll) nextScroll.scrollTop = scrollTop;
  }

  private updateModeBadge(): void {
    const badge = document.querySelector('.mode-badge');
    if (!badge) return;
    const sandbox = clubhouseClient.getConfig().useSandbox;
    badge.textContent = sandbox ? 'SANDBOX' : 'LIVE';
    badge.classList.toggle('sandbox', sandbox);
    badge.classList.toggle('live', !sandbox);
  }

  private isMeSpeaker(): boolean {
    if (!this.currentChannel || !this.me) return false;
    return this.currentChannel.users.some((user) => user.user_id === this.me?.user_id && !!user.is_speaker);
  }

  private isMeModerator(): boolean {
    if (!this.currentChannel || !this.me) return false;
    return this.currentChannel.users.some((user) => user.user_id === this.me?.user_id && !!user.is_moderator);
  }

  private startExploreRefresh(): void {
    this.stopExploreRefresh();
    this.exploreTimer = window.setInterval(() => {
      if (this.currentTab !== 'explore') {
        this.stopExploreRefresh();
        return;
      }
      void this.refreshExplore();
    }, 60000);
  }

  private stopExploreRefresh(): void {
    if (this.exploreTimer !== null) {
      clearInterval(this.exploreTimer);
      this.exploreTimer = null;
    }
  }

  private async refreshExplore(): Promise<void> {
    try {
      await this.reloadChannels();
      if (this.currentTab === 'explore') this.render();
    } catch (err) {
      this.reportApiError(err);
    }
  }

  private async refreshCurrentRoom(): Promise<void> {
    if (!this.currentChannel) return;
    const detail = await clubhouseClient.getChannel(this.currentChannel.channel_id.toString());
    this.applyRoomUpdate(detail);
  }

  private async inviteToStage(userId: number): Promise<void> {
    if (!this.currentChannel || !this.isMeModerator()) return;
    try {
      await clubhouseClient.inviteSpeaker(this.currentChannel.channel_id.toString(), userId);
      this.showToast('Invited to speak', '🎙️');
      await this.refreshCurrentRoom();
    } catch (err) {
      this.reportApiError(err);
    }
  }

  private async moderateSpeaker(userId: number, action: 'mute' | 'moderator' | 'audience'): Promise<void> {
    if (!this.currentChannel || !this.isMeModerator()) return;
    const channelId = this.currentChannel.channel_id.toString();
    try {
      if (action === 'mute') await clubhouseClient.muteSpeaker(channelId, userId);
      else if (action === 'moderator') await clubhouseClient.makeModerator(channelId, userId);
      else await clubhouseClient.uninviteSpeaker(channelId, userId);
      this.openSpeakerMenuId = null;
      await this.refreshCurrentRoom();
    } catch (err) {
      this.reportApiError(err);
    }
  }

  private maybeShowSpeakerInvite(): void {
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

  private renderSpeakerInvite(): void {
    if (document.getElementById('speaker-invite-overlay')) return;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'speaker-invite-overlay';
    overlay.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">You've been invited to speak</h3>
        </div>
        <p style="color:var(--text-muted); font-size:14px; margin-bottom:20px;">Accept to join the stage. Your microphone stays muted until you unmute it.</p>
        <div style="display:flex; justify-content:flex-end; gap:12px;">
          <button class="btn btn-secondary" id="decline-speak-btn">Not now</button>
          <button class="btn btn-primary" id="accept-speak-btn">Accept</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#decline-speak-btn')?.addEventListener('click', () => this.closeSpeakerInvite());
    overlay.querySelector('#accept-speak-btn')?.addEventListener('click', () => {
      void this.acceptSpeakerInvite();
    });
  }

  private closeSpeakerInvite(dismiss = true): void {
    this.speakerInviteVisible = false;
    if (dismiss) this.dismissedSpeakerInvite = true;
    document.getElementById('speaker-invite-overlay')?.remove();
  }

  private async acceptSpeakerInvite(): Promise<void> {
    if (!this.currentChannel || !this.me) return;
    const acceptBtn = document.getElementById('accept-speak-btn') as HTMLButtonElement | null;
    if (acceptBtn) acceptBtn.disabled = true;
    try {
      await clubhouseClient.acceptSpeakerInvite(this.currentChannel.channel_id.toString(), this.me.user_id);
      this.closeSpeakerInvite();
      await this.refreshCurrentRoom();
      if (!clubhouseClient.getConfig().useSandbox && agoraVoice.getIsJoined()) {
        await agoraVoice.promoteToSpeaker();
      }
      this.showToast("You're on stage", '🎙️');
    } catch (err) {
      this.reportApiError(err);
      if (acceptBtn) acceptBtn.disabled = false;
    }
  }

  private showToast(message: string, icon: string = '✨') {
    const container = document.getElementById('toast-container') || this.createToastContainer();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      toast.style.transition = 'all 0.2s ease';
      setTimeout(() => toast.remove(), 250);
    }, 2800);
  }

  private createToastContainer(): HTMLElement {
    const el = document.createElement('div');
    el.id = 'toast-container';
    el.className = 'toast-container';
    document.body.appendChild(el);
    return el;
  }

  private setupHotkeys() {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (!this.isMeSpeaker()) {
          this.showToast("You're in the audience", '🎙️');
          return;
        }
        this.toggleMute();
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        this.toggleHandRaise();
      } else if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        if (audioEngine.soundEffects[idx]) {
          audioEngine.playSoundEffect(audioEngine.soundEffects[idx].id);
          this.showToast(`Sound: ${audioEngine.soundEffects[idx].name}`, audioEngine.soundEffects[idx].icon);
        }
      } else if (e.key === 'r' || e.key === 'R') {
        this.toggleRecording();
      } else if (e.key === 'Escape') {
        if (this.isProfileDrawerOpen) {
          this.closeProfileDrawer();
        } else if (this.isCreateModalOpen) {
          this.closeCreateModal();
        } else if (this.speakerInviteVisible) {
          this.closeSpeakerInvite();
        } else if (this.openSpeakerMenuId != null) {
          this.openSpeakerMenuId = null;
          this.render();
        } else if (this.isSettingsModalOpen) {
          this.closeSettingsModal();
        } else if (this.currentChannel && window.confirm('Leave this room?')) {
          void this.leaveRoom();
        }
      }
    });
  }

  private updateVuMeter(vol: number) {
    const fill = document.getElementById('vu-meter-fill');
    if (fill) {
      fill.style.width = `${Math.min(100, Math.round(vol * 100))}%`;
    }

    const mySpeakerCard = document.querySelector('.speaker-card.me-speaker');
    if (mySpeakerCard) {
      if (vol > 0.12 && !audioEngine.getIsMuted()) {
        mySpeakerCard.classList.add('speaking');
      } else {
        mySpeakerCard.classList.remove('speaking');
      }
    }
  }

  private handleRecordingStateChange(isRecording: boolean, blobUrl?: string) {
    const recBtn = document.getElementById('record-btn');
    const recTimerEl = document.getElementById('record-timer');

    if (isRecording) {
      recBtn?.classList.add('record-active');
      this.recordDurationSec = 0;
      this.recordTimerInterval = window.setInterval(() => {
        this.recordDurationSec++;
        const mins = Math.floor(this.recordDurationSec / 60).toString().padStart(2, '0');
        const secs = (this.recordDurationSec % 60).toString().padStart(2, '0');
        if (recTimerEl) recTimerEl.textContent = `${mins}:${secs}`;
      }, 1000);
      this.showToast('Stage Recording Started (HQ Opus)', '🔴');
    } else {
      recBtn?.classList.remove('record-active');
      if (this.recordTimerInterval) {
        clearInterval(this.recordTimerInterval);
        this.recordTimerInterval = null;
      }
      if (recTimerEl) recTimerEl.textContent = 'REC';

      if (blobUrl) {
        this.showToast('Recording ready for download!', '💾');
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `clubdeck-recording-${Date.now()}.webm`;
        a.click();
      }
    }
  }

  private toggleMute() {
    const isMuted = audioEngine.toggleMute();
    agoraVoice.setMuted(isMuted);

    const micBtn = document.getElementById('mic-toggle-btn');
    if (micBtn) {
      if (isMuted) {
        micBtn.classList.remove('unmuted');
        micBtn.innerHTML = '🔇';
        this.showToast('Microphone Muted (Space)', '🔇');
      } else {
        micBtn.classList.add('unmuted');
        micBtn.innerHTML = '🎙️';
        this.showToast('Microphone Live (Space)', '🎙️');
      }
    }
  }

  private async toggleMusicMode() {
    const isMusic = audioEngine.toggleMusicMode();
    if (agoraVoice.getIsJoined() && agoraVoice.getIsSpeaker()) {
      await agoraVoice.republish(isMusic);
    }
    const btn = document.getElementById('music-mode-btn');
    if (btn) {
      if (isMusic) {
        btn.classList.add('active');
        this.showToast('Music Mode ON (Stereo 48kHz, DSP bypass)', '🎵');
      } else {
        btn.classList.remove('active');
        this.showToast('Music Mode OFF (Voice filter)', '🎙️');
      }
    }
  }

  private async toggleHandRaise() {
    if (!this.currentChannel) return;
    if (this.isMeSpeaker()) return;
    const isRaised = clubhouseClient.isHandRaised();
    try {
      await clubhouseClient.raiseHand(this.currentChannel.channel_id.toString(), !isRaised);
    } catch (err) {
      this.reportApiError(err);
      return;
    }
    const handBtn = document.getElementById('hand-btn');
    if (handBtn) {
      if (!isRaised) {
        handBtn.classList.add('active');
        this.showToast('Hand Raised to Speak (H)', '✋');
      } else {
        handBtn.classList.remove('active');
        this.showToast('Hand Lowered', '👇');
      }
    }
  }

  private toggleRecording() {
    audioEngine.toggleRecording();
  }

  private async joinRoom(channelId: string) {
    try {
      this.currentChannel = await clubhouseClient.joinChannel(channelId);
    } catch (err) {
      this.reportApiError(err);
      this.render();
      return;
    }

    // If live channel has Agora token, connect to Agora voice room
    if (this.currentChannel.token && !clubhouseClient.getConfig().useSandbox) {
      if (!this.me) {
        this.showToast('Sign in to speak on stage', '🔑');
      } else {
        try {
          const myId = this.me.user_id;
          const isSpeaker = this.currentChannel.users.some(
            (user) => user.user_id === myId && !!user.is_speaker
          );
          await agoraVoice.join(this.currentChannel.channel, this.currentChannel.token, myId, {
            isSpeaker,
            isMusicMode: audioEngine.getIsMusicMode(),
          });
        } catch (err) {
          this.reportApiError(err);
        }
      }
    }

    this.startRoomPresence(this.currentChannel.channel_id.toString());
    this.currentTab = 'stage';
    this.render();
    this.showToast(`Joined: ${this.currentChannel.topic}`, '🎙️');
  }

  private async leaveRoom() {
    if (!this.currentChannel) return;
    const channelId = this.currentChannel.channel_id.toString();
    if (audioEngine.getIsRecording()) {
      audioEngine.stopRecording();
    }
    this.stopRoomPresence();
    this.dismissedSpeakerInvite = false;
    this.closeSpeakerInvite(false);
    try {
      await agoraVoice.leave();
      await clubhouseClient.leaveChannel(channelId);
    } catch (err) {
      this.reportApiError(err);
    }
    this.currentChannel = null;
    this.currentTab = 'explore';
    this.render();
    this.showToast('Left room', '👋');
  }

  private inspectProfile(user: CHUser) {
    this.selectedProfile = { ...user };
    this.profileLoading = true;
    this.isProfileDrawerOpen = true;
    this.renderProfileDrawer();
    void this.loadFullProfile(user.user_id);
  }

  private async loadFullProfile(userId: number): Promise<void> {
    try {
      const res = await clubhouseClient.getProfile(userId);
      if (this.selectedProfile?.user_id !== userId) return;
      this.selectedProfile = { ...this.selectedProfile, ...res.user_profile };
    } catch (err) {
      this.reportApiError(err);
    } finally {
      if (this.selectedProfile?.user_id === userId) {
        this.profileLoading = false;
        this.renderProfileDrawer();
      }
    }
  }

  private closeProfileDrawer() {
    this.isProfileDrawerOpen = false;
    const drawer = document.getElementById('profile-drawer');
    if (drawer) drawer.classList.remove('open');
  }

  private openCreateModal() {
    this.isCreateModalOpen = true;
    this.renderCreateModal();
  }

  private closeCreateModal() {
    this.isCreateModalOpen = false;
    document.getElementById('create-modal-overlay')?.remove();
  }

  public openSettingsModal() {
    this.isSettingsModalOpen = true;
    this.currentTab = 'settings';
    this.render();
  }

  private closeSettingsModal() {
    this.isSettingsModalOpen = false;
  }

  private sendChatMessage() {
    const input = document.getElementById('chat-input') as HTMLInputElement;
    if (!input || !input.value.trim()) return;

    if (!this.me) {
      this.showToast('Sign in to send a message', '🔑');
      this.currentTab = 'login';
      this.render();
      return;
    }

    const newMsg: CHChatMessage = {
      id: 'msg-' + Date.now(),
      user_id: this.me.user_id,
      name: this.me.name,
      username: this.me.username,
      photo_url: this.me.photo_url,
      message: input.value.trim(),
      timestamp: 'Just now',
    };

    this.chatMessages.push(newMsg);
    input.value = '';
    this.render();

    // Scroll chat to bottom
    const scrollEl = document.getElementById('chat-scroll');
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
  }

  // --- Rendering Functions ---

  public render() {
    const app = document.getElementById('app');
    if (!app) return;

    app.innerHTML = `
      <!-- Left Sidebar -->
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-icon">🎙️</div>
          <div>
            <div style="display:flex; align-items:center;">
              <span class="brand-title">Clubdeck</span>
              <span class="brand-badge">PRO v2</span>
              <span class="mode-badge ${clubhouseClient.getConfig().useSandbox ? 'sandbox' : 'live'}">${clubhouseClient.getConfig().useSandbox ? 'SANDBOX' : 'LIVE'}</span>
            </div>
            <div style="font-size:11px; color:var(--text-dim); margin-top:2px;">Desktop Audio Studio</div>
          </div>
        </div>

        <nav class="nav-section">
          <div class="nav-label">Navigation</div>
          
          <div class="nav-item ${this.currentTab === 'stage' ? 'active' : ''}" id="nav-stage">
            <span class="icon">📻</span>
            <span>Live Stage</span>
            ${this.currentChannel ? '<span class="count-badge" style="background:var(--accent-emerald); color:#000;">LIVE</span>' : ''}
          </div>

          <div class="nav-item ${this.currentTab === 'explore' ? 'active' : ''}" id="nav-explore">
            <span class="icon">🧭</span>
            <span>Explore Rooms</span>
            <span class="count-badge">${this.channelsList.length}</span>
          </div>

          <div class="nav-item ${this.currentTab === 'soundboard' ? 'active' : ''}" id="nav-soundboard">
            <span class="icon">🎛️</span>
            <span>Soundboard Rack</span>
            <span class="count-badge">${audioEngine.soundEffects.length}</span>
          </div>

          <div class="nav-label" style="margin-top:14px;">Studio Tools</div>

          <div class="nav-item" id="nav-create-room">
            <span class="icon">➕</span>
            <span>Start a Room</span>
          </div>

          <div class="nav-item ${this.currentTab === 'settings' ? 'active' : ''}" id="nav-settings">
            <span class="icon">⚙️</span>
            <span>API & Config</span>
          </div>
        </nav>

        ${this.renderSidebarUser()}
      </aside>

      <!-- Main Studio Stage -->
      <main class="studio-main">
        <!-- Top Studio Bar -->
        <header class="top-bar">
          <div class="room-meta">
            ${this.currentChannel ? `
              <div class="live-indicator">
                <span class="pulse-dot"></span> ON AIR
              </div>
              <div class="room-title-group">
                <div class="room-club-badge">🏛️ ${this.currentChannel.club_name || 'Public Stage'}</div>
                <div class="room-topic">${this.currentChannel.topic}</div>
              </div>
            ` : `
              <div style="font-weight:700; font-size:16px;">Explore Active Stages</div>
            `}
          </div>

          <div class="top-actions">
            ${this.currentChannel ? `
              <button class="btn btn-secondary" id="top-share-btn">🔗 Link</button>
              <button class="btn btn-danger" id="top-leave-btn">Leave Quietly</button>
            ` : `
              <button class="btn btn-primary" id="top-start-btn">➕ Start a Room</button>
            `}
          </div>
        </header>

        <!-- Central Dynamic Content Area -->
        <div class="content-area" id="content-area">
          ${this.renderCurrentView()}
        </div>

        <!-- Bottom Studio Cockpit Bar -->
        ${this.renderCockpitBar()}
      </main>

      <!-- Profile Drawer -->
      <div class="profile-drawer" id="profile-drawer"></div>
    `;

    this.attachEventListeners();
  }

  private renderSidebarUser(): string {
    if (!this.me) {
      return `
        <div class="sidebar-user" id="sidebar-user-btn">
          <div class="sidebar-user-avatar sidebar-user-placeholder" aria-hidden="true">?</div>
          <div class="sidebar-user-info">
            <div class="sidebar-user-name">Sign in</div>
            <div class="sidebar-user-role">Live Clubhouse account</div>
          </div>
        </div>
      `;
    }

    return `
      <div class="sidebar-user" id="sidebar-user-btn">
        <img class="sidebar-user-avatar" src="${this.me.photo_url || FALLBACK_AVATAR}" alt="" />
        <div class="sidebar-user-info">
          <div class="sidebar-user-name">${escapeHtml(this.me.name)}</div>
          <div class="sidebar-user-role">@${escapeHtml(this.me.username)}</div>
        </div>
      </div>
    `;
  }

  private renderCurrentView(): string {
    if (this.currentTab === 'login') {
      return this.renderLoginView();
    } else if (this.currentTab === 'stage') {
      return this.renderStageView();
    } else if (this.currentTab === 'explore') {
      return this.renderExploreView();
    } else if (this.currentTab === 'soundboard') {
      return this.renderSoundboardView();
    } else {
      return this.renderSettingsView();
    }
  }

  private renderLoginView(): string {
    const busy = this.loginBusy ? 'disabled' : '';
    return `
      <div style="max-width:460px; margin:40px auto;">
        <h2 style="font-size:22px; font-weight:700; margin-bottom:4px;">Sign in to Clubhouse</h2>
        <p style="color:var(--text-muted); font-size:13px; margin-bottom:24px;">Enter your real number, for example +90 5xx xxx xx xx. A leading 0 is treated as a Turkey number. The code is requested from the current Clubhouse sign-in.</p>
        ${this.loginNotice ? `<div class="login-notice">${escapeHtml(this.loginNotice)}</div>` : ''}
        ${this.loginStep === 'phone' ? `
          <div class="form-group">
            <label class="form-label" for="login-phone">Phone number</label>
            <input class="form-input" id="login-phone" inputmode="tel" autocomplete="tel" placeholder="+1 555 0100" value="${escapeHtml(this.loginPhone)}" ${busy} />
          </div>
          <div style="display:flex; gap:12px; flex-wrap:wrap;">
            <button class="btn btn-primary" id="login-send-code" ${busy}>Send code</button>
            ${electronAPI()?.isElectron ? '<button class="btn btn-secondary" id="login-web-capture" ' + busy + '>Open Clubhouse sign-in</button>' : ''}
          </div>
        ` : `
          <div class="form-group">
            <label class="form-label" for="login-code">Verification code</label>
            <input class="form-input" id="login-code" inputmode="numeric" autocomplete="one-time-code" placeholder="1234" value="${escapeHtml(this.loginCode)}" ${busy} />
          </div>
          <div style="display:flex; gap:12px; flex-wrap:wrap;">
            <button class="btn btn-primary" id="login-verify" ${busy}>Verify</button>
            <button class="btn btn-secondary" id="login-resend" ${busy}>Resend code</button>
            <button class="btn btn-secondary" id="login-back" ${busy}>Change number</button>
          </div>
        `}
      </div>
    `;
  }

  private renderStageView(): string {
    if (!this.currentChannel) {
      return `
        <div style="text-align:center; padding: 80px 20px;">
          <div style="font-size:48px; margin-bottom:16px;">📻</div>
          <h2 style="font-size:22px; font-weight:700; margin-bottom:8px;">You're not in any room right now</h2>
          <p style="color:var(--text-muted); max-width:440px; margin:0 auto 24px;">Browse the live Clubhouse channels in Explore, or spin up your own custom broadcast stage.</p>
          <button class="btn btn-primary" id="empty-explore-btn">🧭 Explore Live Rooms</button>
        </div>
      `;
    }

    const speakers = this.currentChannel.users.filter((u) => u.is_speaker);
    const raisedHands = this.currentChannel.users.filter((u) => !u.is_speaker && u.is_hand_raised);
    const audience = this.currentChannel.users.filter((u) => !u.is_speaker && !u.is_hand_raised);
    const moderator = this.isMeModerator();

    return `
      <div class="stage-main-wrapper">
        <div class="stage-content-col">
          <div class="stage-section">
            <!-- Stage Speakers Section -->
            <div>
              <div class="stage-header" style="margin-bottom:16px;">
                <div class="section-title">
                  <span>Stage Speakers</span>
                  <span class="badge">${speakers.length}</span>
                </div>
                <span style="font-size:12px; color:var(--text-dim);">Live Agora Voice Mesh</span>
              </div>

              <div class="speakers-grid">
                ${speakers.map((speaker) => `
                  <div class="speaker-card ${speaker.is_speaking ? 'speaking' : ''} ${speaker.user_id === this.me?.user_id ? 'me-speaker' : ''}" data-user-id="${speaker.user_id}">
                    <div class="avatar-wrapper">
                      <img class="avatar-img" src="${speaker.photo_url || FALLBACK_AVATAR}" alt="${speaker.name}" />
                      ${speaker.is_moderator ? '<span class="badge-crown" title="Moderator">👑</span>' : ''}
                      ${speaker.is_muted ? '<span class="badge-mute" title="Muted">🔇</span>' : ''}
                    </div>
                    <div class="speaker-name">${speaker.name}</div>
                    <div class="speaker-handle">@${speaker.username}</div>
                    ${moderator && speaker.user_id !== this.me?.user_id ? `
                      <button class="speaker-menu-btn" data-speaker-menu="${speaker.user_id}" title="Speaker actions">⋯</button>
                      ${this.openSpeakerMenuId === speaker.user_id ? `
                        <div class="speaker-menu">
                          <button type="button" data-mod-action="mute" data-user-id="${speaker.user_id}">${speaker.is_muted ? 'Unmute' : 'Mute'}</button>
                          ${speaker.is_moderator ? '' : `<button type="button" data-mod-action="moderator" data-user-id="${speaker.user_id}">Make Moderator</button>`}
                          <button type="button" data-mod-action="audience" data-user-id="${speaker.user_id}">Move to Audience</button>
                        </div>
                      ` : ''}
                    ` : ''}
                  </div>
                `).join('')}
              </div>
            </div>

            ${raisedHands.length > 0 ? `
              <div>
                <div class="stage-header" style="margin-bottom:16px;">
                  <div class="section-title">
                    <span>Raised Hands</span>
                    <span class="badge">${raisedHands.length}</span>
                  </div>
                </div>
                <div class="audience-grid">
                  ${raisedHands.map((listener) => `
                    <div class="audience-card" data-user-id="${listener.user_id}">
                      <div class="audience-avatar-wrapper">
                        <img class="audience-avatar-img" src="${listener.photo_url || FALLBACK_AVATAR}" alt="${escapeHtml(listener.name)}" />
                      </div>
                      <div class="audience-name">${escapeHtml(listener.name)} ✋</div>
                      ${listener.is_invited_to_speak ? '<div class="invited-tag">Invited</div>' : ''}
                      ${moderator ? `<button class="invite-stage-btn" data-invite-id="${listener.user_id}">Invite to Stage</button>` : ''}
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <!-- Audience Section -->
            <div>
              <div class="stage-header" style="margin-bottom:16px;">
                <div class="section-title">
                  <span>Audience & Listeners</span>
                  <span class="badge">${audience.length}</span>
                </div>
              </div>

              <div class="audience-grid">
                ${audience.map((listener) => `
                  <div class="audience-card" data-user-id="${listener.user_id}">
                    <div class="audience-avatar-wrapper">
                      <img class="audience-avatar-img" src="${listener.photo_url || FALLBACK_AVATAR}" alt="${escapeHtml(listener.name)}" />
                    </div>
                    <div class="audience-name">${escapeHtml(listener.name)}</div>
                    ${listener.is_invited_to_speak ? '<div class="invited-tag">Invited</div>' : ''}
                    ${moderator ? `<button class="invite-stage-btn" data-invite-id="${listener.user_id}">Invite to Stage</button>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- In-Room Live Chat Panel -->
        <aside class="stage-chat-panel">
          <div class="chat-panel-header">
            <span>💬 Room Backchannel</span>
            <span style="font-size:11px; color:var(--accent-emerald);">● Live</span>
          </div>

          <div class="chat-messages-scroll" id="chat-scroll">
            ${this.chatMessages.map((msg) => `
              <div class="chat-message-bubble">
                <img class="chat-msg-avatar" src="${msg.photo_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200'}" alt="${msg.name}" />
                <div class="chat-msg-content">
                  <div class="chat-msg-author">${msg.name}</div>
                  <div class="chat-msg-text">${msg.message}</div>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="chat-input-bar">
            <input class="form-input" id="chat-input" placeholder="Type a message to the room..." style="padding: 8px 12px; font-size: 13px;" />
            <button class="btn btn-primary" id="chat-send-btn" style="padding: 8px 12px;">Send</button>
          </div>
        </aside>
      </div>
    `;
  }

  private renderExploreView(): string {
    return `
      <div style="max-width:1100px; margin:0 auto;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
          <div>
            <h2 style="font-size:22px; font-weight:700;">Live Community Rooms</h2>
            <p style="color:var(--text-muted); font-size:13px; margin-top:4px;">Discovered via Clubhouse API (/api/get_channels)</p>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-secondary" id="explore-refresh-btn">Refresh</button>
            <button class="btn btn-primary" id="explore-create-btn">➕ Start a Room</button>
          </div>
        </div>

        <div class="rooms-grid">
          ${this.channelsList.map((ch) => `
            <div class="room-card" data-channel-id="${ch.channel_id}">
              <div>
                <div class="room-card-header">
                  <span class="room-card-club">🏛️ ${ch.club_name || 'Clubhouse'}</span>
                  <div class="room-card-stats">
                    <span>👥 ${ch.num_all}</span>
                    <span>🎙️ ${ch.num_speakers}</span>
                  </div>
                </div>
                <div class="room-card-topic">${ch.topic}</div>
              </div>

              <div>
                <div class="room-card-speakers">
                  <div class="speaker-avatar-overlap">
                    ${ch.users.slice(0, 3).map((u) => `
                      <img src="${u.photo_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200'}" alt="${u.name}" />
                    `).join('')}
                  </div>
                  <div class="speaker-names-list">
                    ${ch.users.slice(0, 3).map((u) => u.name).join(', ')}
                  </div>
                </div>
                <button class="btn btn-secondary" style="width:100%;" data-join-btn="${ch.channel_id}">
                  Join Stage
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  private renderSoundboardView(): string {
    return `
      <div style="max-width:1000px; margin:0 auto;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
          <div>
            <h2 style="font-size:22px; font-weight:700;">Clubdeck Soundboard Sampler</h2>
            <p style="color:var(--text-muted); font-size:13px; margin-top:4px;">Web Audio API low-latency synthesis & custom audio triggers. Broadcasts directly to your stage!</p>
          </div>
          <label class="btn btn-primary" style="cursor:pointer;">
            📁 Upload Sound File
            <input type="file" id="sound-upload-input" accept="audio/*" style="display:none;" />
          </label>
        </div>

        <div class="soundboard-grid">
          ${audioEngine.soundEffects.map((fx) => `
            <div class="soundpad-tile" data-fx-id="${fx.id}">
              <span class="soundpad-hotkey">${fx.hotkey}</span>
              <span class="soundpad-icon">${fx.icon}</span>
              <span class="soundpad-name">${fx.name}</span>
            </div>
          `).join('')}
        </div>

        <div style="margin-top:32px; background:var(--bg-card); padding:20px; border-radius:var(--radius-lg); border:1px solid var(--border-subtle);">
          <h3 style="font-size:15px; font-weight:700; margin-bottom:12px;">Soundpad Master Volume</h3>
          <div style="display:flex; align-items:center; gap:16px;">
            <span style="font-size:20px;">🔊</span>
            <input type="range" id="soundpad-vol-slider" min="0" max="1" step="0.05" value="0.8" style="flex:1; accent-color:var(--accent-purple);" />
            <span id="soundpad-vol-label" style="font-size:13px; font-weight:600; width:45px;">80%</span>
          </div>
        </div>
      </div>
    `;
  }

  private renderSettingsView(): string {
    const config = clubhouseClient.getConfig();
    const isElectron = !!electronAPI()?.isElectron;

    return `
      <div style="max-width:780px; margin:0 auto;">
        <h2 style="font-size:22px; font-weight:700; margin-bottom:4px;">Clubhouse API & Studio Settings</h2>
        <p style="color:var(--text-muted); font-size:13px; margin-bottom:28px;">Configure reverse-engineered endpoints, headers, and authentication.</p>

        <!-- Auto Token Capture Banner for Electron -->
        <div style="background: linear-gradient(135deg, rgba(121, 82, 245, 0.18), rgba(16, 185, 129, 0.12)); border: 1px solid rgba(121, 82, 245, 0.4); border-radius: var(--radius-lg); padding: 22px; margin-bottom: 24px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:16px;">
            <div>
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:18px;">⚡</span>
                <h3 style="font-size:15px; font-weight:700; color:#fff;">Otomatik Token Yakalayıcı (Auto-Capture Helper)</h3>
              </div>
              <p style="font-size:12px; color:var(--text-muted); margin-top:6px; line-height:1.5;">
                SMS/SafetyNet cihaz doğrulama engelini aşmak için resmi Clubhouse web arayüzünü açar ve hesabınıza giriş yaptığınızda oturum anahtarınızı (Auth Token) otomatik olarak buraya aktarır.
              </p>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px; flex-shrink:0;">
              <button class="btn btn-primary" id="auto-capture-token-btn">
                ${isElectron ? '🌐 Web Girişi Aç & Yakala' : '🔑 Token Yakala (Electron)'}
              </button>
              <button class="btn btn-secondary" id="open-phone-login-btn">Phone sign in</button>
            </div>
          </div>
        </div>

        <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:24px; margin-bottom:20px;">
          <h3 style="font-size:16px; font-weight:700; margin-bottom:16px;">Runtime Mode</h3>
          <div style="display:flex; gap:16px; margin-bottom:16px;">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="radio" name="runtime-mode" value="sandbox" ${config.useSandbox ? 'checked' : ''} id="radio-sandbox" />
              <span><strong>Sandbox Simulation Mode</strong> (Safe testing, active mock stages & audio)</span>
            </label>
          </div>
          <div style="display:flex; gap:16px;">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="radio" name="runtime-mode" value="live" ${!config.useSandbox ? 'checked' : ''} id="radio-live" />
              <span><strong>Live Clubhouse API Mode</strong> (Connects to https://www.clubhouseapi.com/api)</span>
            </label>
          </div>
        </div>

        <div style="background:var(--bg-card); border:1px solid var(--border-subtle); border-radius:var(--radius-lg); padding:24px; margin-bottom:20px;">
          <h3 style="font-size:16px; font-weight:700; margin-bottom:16px;">API Gateway & Reverse Engineering Headers</h3>
          
          <div class="form-group">
            <label class="form-label">Base API URL</label>
            <input class="form-input" id="cfg-base-url" value="${config.baseUrl}" />
          </div>

          <div class="form-group">
            <label class="form-label">CORS Proxy (Optional for web browser clients)</label>
            <input class="form-input" id="cfg-cors-proxy" placeholder="e.g. https://cors-anywhere.herokuapp.com" value="${config.corsProxy}" />
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
            <div class="form-group">
              <label class="form-label">CH-AppBuild Header</label>
              <input class="form-input" id="cfg-app-build" value="${config.appBuild}" />
            </div>
            <div class="form-group">
              <label class="form-label">CH-AppVersion Header</label>
              <input class="form-input" id="cfg-app-version" value="${config.appVersion}" />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">Authorization Token (from /complete_phone_number_auth)</label>
            <input class="form-input" id="cfg-auth-token" placeholder="Token e.g. 5f9e8a7b..." value="${config.authToken || ''}" />
          </div>

          <div class="form-group">
            <label class="form-label">Agora App ID</label>
            <input class="form-input" id="cfg-agora-app-id" placeholder="Agora project App ID" value="${config.agoraAppId}" />
          </div>

          <button class="btn btn-primary" id="save-cfg-btn" style="margin-top:8px;">Save Settings</button>
        </div>
      </div>
    `;
  }

  private renderCockpitBar(): string {
    const isMuted = audioEngine.getIsMuted();
    const isMusic = audioEngine.getIsMusicMode();
    const isRecording = audioEngine.getIsRecording();
    const isHandRaised = clubhouseClient.isHandRaised();
    const handDisabled = this.isMeSpeaker();

    return `
      <div class="cockpit-bar">
        <div class="cockpit-left">
          <!-- Mic & VU Meter cluster -->
          <div class="mic-control-cluster">
            <button class="mic-toggle-btn ${!isMuted ? 'unmuted' : ''}" id="mic-toggle-btn" title="Toggle Mic (Spacebar)">
              ${!isMuted ? '🎙️' : '🔇'}
            </button>
            <div class="mic-meter-box">
              <span class="mic-meter-label">${!isMuted ? 'LIVE' : 'MUTED'}</span>
              <div class="meter-bar-track">
                <div class="meter-bar-fill" id="vu-meter-fill"></div>
              </div>
            </div>
          </div>

          <!-- Music Mode button -->
          <button class="toggle-state-btn ${isMusic ? 'active' : ''}" id="music-mode-btn" title="High fidelity 48kHz stereo streaming">
            <span>🎵</span>
            <span>Music Mode</span>
          </button>
        </div>

        <!-- Quick Soundboard Triggers -->
        <div class="cockpit-center">
          ${audioEngine.soundEffects.slice(0, 5).map((fx) => `
            <button class="soundpad-quick-btn" data-fx-id="${fx.id}">
              <span>${fx.icon}</span>
              <span>${fx.name}</span>
              <span class="key-tag">${fx.hotkey}</span>
            </button>
          `).join('')}
        </div>

        <div class="cockpit-right">
          <!-- Hand Raise button -->
          <button class="toggle-state-btn ${isHandRaised ? 'active' : ''}" id="hand-btn" title="Raise hand to request speaking (Hotkey H)" ${handDisabled ? 'disabled' : ''}>
            <span>✋</span>
            <span>Raise Hand</span>
          </button>

          <!-- Record Room button -->
          <button class="toggle-state-btn ${isRecording ? 'record-active' : ''}" id="record-btn" title="Record room to Opus audio file (Hotkey R)">
            <span>🔴</span>
            <span id="record-timer">REC</span>
          </button>

          ${this.currentChannel ? `
            <button class="btn btn-danger" id="bottom-leave-btn" style="padding: 9px 16px;">Leave</button>
          ` : ''}
        </div>
      </div>
    `;
  }

  private renderProfileDrawer() {
    const drawer = document.getElementById('profile-drawer');
    const profile = this.selectedProfile;
    if (!drawer || !profile) return;
    const isSelf = profile.user_id === this.me?.user_id;
    const following = !!profile.is_following;
    const canInvite = this.isMeModerator() && !!this.currentChannel && !profile.is_speaker && !isSelf;

    drawer.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
        <span style="font-size:12px; font-weight:700; color:var(--text-dim); text-transform:uppercase;">User Profile</span>
        <button class="modal-close-btn" id="close-profile-btn">✕</button>
      </div>

      <div class="profile-cover">
        <img class="profile-drawer-avatar" src="${profile.photo_url || FALLBACK_AVATAR}" alt="" />
        <div class="profile-drawer-name">${escapeHtml(profile.name)}</div>
        <div class="profile-drawer-handle">@${escapeHtml(profile.username)}</div>
        ${this.profileLoading ? '<div class="profile-loading">Loading profile…</div>' : ''}
      </div>

      <div class="profile-stats-row">
        <div class="profile-stat-box">
          <span class="stat-value">${profile.num_followers == null ? '—' : profile.num_followers}</span>
          <span class="stat-label">Followers</span>
        </div>
        <div class="profile-stat-box">
          <span class="stat-value">${profile.num_following == null ? '—' : profile.num_following}</span>
          <span class="stat-label">Following</span>
        </div>
      </div>

      <div class="profile-bio">
        ${profile.bio ? escapeHtml(profile.bio) : '—'}
      </div>

      <div style="margin-top:auto; display:flex; flex-direction:column; gap:10px;">
        ${isSelf ? '' : `
          <button class="btn btn-primary" id="profile-follow-btn">${following ? 'Following' : 'Follow'} @${escapeHtml(profile.username)}</button>
        `}
        ${canInvite ? `<button class="btn btn-secondary" id="profile-invite-stage-btn">Invite to Speak</button>` : ''}
      </div>
    `;

    drawer.classList.add('open');

    document.getElementById('close-profile-btn')?.addEventListener('click', () => {
      this.closeProfileDrawer();
    });

    document.getElementById('profile-follow-btn')?.addEventListener('click', () => {
      void this.toggleFollow();
    });

    document.getElementById('profile-invite-stage-btn')?.addEventListener('click', () => {
      if (!this.selectedProfile) return;
      void this.inviteToStage(this.selectedProfile.user_id);
      this.closeProfileDrawer();
    });
  }

  private async toggleFollow(): Promise<void> {
    const profile = this.selectedProfile;
    if (!profile) return;
    const next = !profile.is_following;
    try {
      if (next) await clubhouseClient.follow(profile.user_id);
      else await clubhouseClient.unfollow(profile.user_id);
      if (this.selectedProfile?.user_id !== profile.user_id) return;
      this.selectedProfile = { ...profile, is_following: next };
      this.renderProfileDrawer();
      this.showToast(next ? `Following @${profile.username}` : `Unfollowed @${profile.username}`, '🤝');
    } catch (err) {
      this.reportApiError(err);
    }
  }

  private renderCreateModal() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'create-modal-overlay';
    overlay.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">Start a Clubhouse Room</h3>
          <button class="modal-close-btn" id="close-create-btn">✕</button>
        </div>

        <div class="form-group">
          <label class="form-label">Room Topic / Title</label>
          <input class="form-input" id="new-room-topic" placeholder="e.g. 🎧 Sound Design Workshop & Live AMA" />
        </div>

        <div class="form-group">
          <label class="form-label">Room Privacy</label>
          <select class="form-input" id="new-room-privacy">
            <option value="public">🌐 Open to Public</option>
            <option value="social">👥 Social (People you follow)</option>
            <option value="private">🔒 Closed (Invite only)</option>
          </select>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:24px;">
          <button class="btn btn-secondary" id="cancel-create-btn">Cancel</button>
          <button class="btn btn-primary" id="confirm-create-btn">Let's Go Live</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#close-create-btn')?.addEventListener('click', () => this.closeCreateModal());
    overlay.querySelector('#cancel-create-btn')?.addEventListener('click', () => this.closeCreateModal());
    overlay.querySelector('#confirm-create-btn')?.addEventListener('click', async () => {
      const topic = (overlay.querySelector('#new-room-topic') as HTMLInputElement)?.value.trim();
      const privacy = (overlay.querySelector('#new-room-privacy') as HTMLSelectElement)?.value;
      const confirmBtn = overlay.querySelector('#confirm-create-btn') as HTMLButtonElement | null;
      if (!topic) {
        this.showToast('Please enter a room topic', '⚠️');
        return;
      }
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Starting…';
      }
      try {
        const newChan = await clubhouseClient.createChannel(topic, {
          isPrivate: privacy === 'private',
          isSocial: privacy === 'social',
        });
        this.channelsList.unshift(newChan);
        this.closeCreateModal();
        await this.joinRoom(newChan.channel_id.toString());
      } catch (err) {
        this.reportApiError(err);
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = "Let's Go Live";
        }
      }
    });
  }

  private attachEventListeners() {
    // Navigation
    document.getElementById('nav-stage')?.addEventListener('click', () => {
      this.stopExploreRefresh();
      this.currentTab = 'stage';
      this.render();
    });
    document.getElementById('nav-explore')?.addEventListener('click', () => {
      this.currentTab = 'explore';
      this.render();
      this.startExploreRefresh();
    });
    document.getElementById('nav-soundboard')?.addEventListener('click', () => {
      this.stopExploreRefresh();
      this.currentTab = 'soundboard';
      this.render();
    });
    document.getElementById('nav-settings')?.addEventListener('click', () => {
      this.stopExploreRefresh();
      this.currentTab = 'settings';
      this.render();
    });
    document.getElementById('sidebar-user-btn')?.addEventListener('click', () => {
      if (!this.me) {
        this.stopExploreRefresh();
        this.currentTab = 'login';
        this.render();
        return;
      }
      this.inspectProfile(this.me);
    });
    document.getElementById('login-send-code')?.addEventListener('click', () => {
      void this.submitPhoneLogin();
    });
    document.getElementById('login-web-capture')?.addEventListener('click', () => {
      electronAPI()?.openTokenCapture();
      this.showToast('Enter your phone number in the Clubhouse window', '🌐');
    });
    document.getElementById('login-verify')?.addEventListener('click', () => {
      void this.submitLoginCode();
    });
    document.getElementById('login-resend')?.addEventListener('click', () => {
      void this.resendLoginCode();
    });
    document.getElementById('login-back')?.addEventListener('click', () => {
      this.stopExploreRefresh();
      this.loginStep = 'phone';
      this.loginNotice = '';
      this.render();
    });
    document.getElementById('nav-create-room')?.addEventListener('click', () => {
      this.openCreateModal();
    });
    document.getElementById('explore-create-btn')?.addEventListener('click', () => {
      this.openCreateModal();
    });
    document.getElementById('top-start-btn')?.addEventListener('click', () => {
      this.openCreateModal();
    });
    document.getElementById('empty-explore-btn')?.addEventListener('click', () => {
      this.currentTab = 'explore';
      this.render();
      this.startExploreRefresh();
    });
    document.getElementById('explore-refresh-btn')?.addEventListener('click', () => {
      void this.refreshExplore();
    });

    // Room actions
    document.getElementById('top-leave-btn')?.addEventListener('click', () => this.leaveRoom());
    document.getElementById('bottom-leave-btn')?.addEventListener('click', () => this.leaveRoom());
    document.getElementById('top-share-btn')?.addEventListener('click', () => {
      const channel = this.currentChannel?.channel;
      if (!channel) return;
      void navigator.clipboard?.writeText(`https://www.clubhouse.com/room/${channel}`);
      this.showToast('Room link copied to clipboard!', '📋');
    });

    // Cockpit buttons
    document.getElementById('mic-toggle-btn')?.addEventListener('click', () => this.toggleMute());
    document.getElementById('music-mode-btn')?.addEventListener('click', () => this.toggleMusicMode());
    document.getElementById('hand-btn')?.addEventListener('click', () => this.toggleHandRaise());
    document.getElementById('record-btn')?.addEventListener('click', () => this.toggleRecording());

    // Chat events
    document.getElementById('chat-send-btn')?.addEventListener('click', () => this.sendChatMessage());
    document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.sendChatMessage();
      }
    });

    // Soundboard triggers
    document.querySelectorAll('.soundpad-quick-btn, .soundpad-tile').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-fx-id');
        if (id) {
          audioEngine.playSoundEffect(id);
          const fx = audioEngine.soundEffects.find((s) => s.id === id);
          if (fx) this.showToast(`Sound: ${fx.name}`, fx.icon);
        }
      });
    });

    // Soundboard Master Volume
    const volSlider = document.getElementById('soundpad-vol-slider') as HTMLInputElement;
    if (volSlider) {
      volSlider.addEventListener('input', () => {
        const val = parseFloat(volSlider.value);
        audioEngine.setSoundpadVolume(val);
        const label = document.getElementById('soundpad-vol-label');
        if (label) label.textContent = `${Math.round(val * 100)}%`;
      });
    }

    // Custom sound file upload
    const uploadInput = document.getElementById('sound-upload-input') as HTMLInputElement;
    if (uploadInput) {
      uploadInput.addEventListener('change', async () => {
        if (uploadInput.files && uploadInput.files[0]) {
          const file = uploadInput.files[0];
          await audioEngine.loadCustomAudioFile(file, file.name.split('.')[0]);
          this.showToast(`Uploaded sound: ${file.name}`, '🎵');
          this.render();
        }
      });
    }

    // Join room card clicks
    document.querySelectorAll('[data-join-btn]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cid = btn.getAttribute('data-join-btn');
        if (cid) this.joinRoom(cid);
      });
    });

    document.querySelectorAll('.room-card').forEach((card) => {
      card.addEventListener('click', () => {
        const cid = card.getAttribute('data-channel-id');
        if (cid) this.joinRoom(cid);
      });
    });

    // Speaker / Audience card inspection
    document.querySelectorAll('.speaker-card, .audience-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.invite-stage-btn, .speaker-menu, .speaker-menu-btn')) return;
        const uid = card.getAttribute('data-user-id');
        if (uid && this.currentChannel) {
          const u = this.currentChannel.users.find((user) => user.user_id.toString() === uid);
          if (u) this.inspectProfile(u);
        }
      });
    });

    // Invite to stage buttons
    document.querySelectorAll('.invite-stage-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const uid = Number(btn.getAttribute('data-invite-id'));
        if (Number.isFinite(uid)) void this.inviteToStage(uid);
      });
    });

    document.querySelectorAll('.speaker-menu-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const uid = Number(btn.getAttribute('data-speaker-menu'));
        this.openSpeakerMenuId = this.openSpeakerMenuId === uid ? null : uid;
        this.render();
      });
    });

    document.querySelectorAll('[data-mod-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const uid = Number(btn.getAttribute('data-user-id'));
        const action = btn.getAttribute('data-mod-action');
        if (!Number.isFinite(uid) || (action !== 'mute' && action !== 'moderator' && action !== 'audience')) return;
        void this.moderateSpeaker(uid, action);
      });
    });

    // Auto capture token button
    document.getElementById('open-phone-login-btn')?.addEventListener('click', () => {
      this.stopExploreRefresh();
      this.currentTab = 'login';
      this.render();
    });

    document.getElementById('auto-capture-token-btn')?.addEventListener('click', () => {
      if (electronAPI()?.openTokenCapture) {
        electronAPI()?.openTokenCapture();
        this.showToast('Clubhouse giriş penceresi açıldı, oturum açtığınızda token yakalanacak...', '🌐');
      } else {
        this.showToast('Bu özellik Electron masaüstü modunda aktiftir (npm run desktop)', 'ℹ️');
      }
    });

    // Settings save
    document.getElementById('save-cfg-btn')?.addEventListener('click', () => {
      const baseUrl = (document.getElementById('cfg-base-url') as HTMLInputElement)?.value;
      const corsProxy = (document.getElementById('cfg-cors-proxy') as HTMLInputElement)?.value;
      const appBuild = (document.getElementById('cfg-app-build') as HTMLInputElement)?.value;
      const appVersion = (document.getElementById('cfg-app-version') as HTMLInputElement)?.value;
      const authToken = (document.getElementById('cfg-auth-token') as HTMLInputElement)?.value;
      const agoraAppId = (document.getElementById('cfg-agora-app-id') as HTMLInputElement)?.value;
      const isSandbox = (document.getElementById('radio-sandbox') as HTMLInputElement)?.checked;

      clubhouseClient.updateConfig({
        baseUrl,
        corsProxy,
        appBuild,
        appVersion,
        authToken: authToken || null,
        agoraAppId: agoraAppId || clubhouseClient.getConfig().agoraAppId,
        useSandbox: isSandbox,
      });
      if (agoraAppId) {
        agoraVoice.appId = agoraAppId;
      }

      this.showToast('Clubhouse API Settings Saved!', '✅');
      this.updateModeBadge();
    });

    // Radio button changes in settings
    document.getElementById('radio-sandbox')?.addEventListener('change', () => {
      clubhouseClient.updateConfig({ useSandbox: true });
      this.updateModeBadge();
      this.showToast('Switched to Sandbox Mode', '🧪');
    });
    document.getElementById('radio-live')?.addEventListener('change', () => {
      clubhouseClient.updateConfig({ useSandbox: false });
      this.updateModeBadge();
      this.showToast('Switched to Live API Mode', '🌐');
    });
  }
}

// Instantiate App
new ClubdeckApp();
