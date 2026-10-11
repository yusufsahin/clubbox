import type { ClubhouseApiClient } from './client.ts';
import { ClubhouseApiError } from './client.ts';

export type AgoraFacade = {
  join(role: 'audience' | 'host', token: string): void;
  switchToHost(token: string): void;
  leave(): void;
  setBroadcastMix(options: { soundboard: boolean; mic: boolean }): void;
  lastJoin(): { role: string; token: string; published: boolean } | undefined;
  left: boolean;
};

export type RoomSessionDeps = {
  client: ClubhouseApiClient;
  agora: AgoraFacade;
  myUserId: number;
  setInterval: (fn: () => void, ms: number) => number;
  clearInterval: (id: number) => void;
};

/**
 * Testable room session for R1 listen/host flows.
 * ClubboxApp can delegate to this; BDD steps call it directly.
 */
export class RoomSessionController {
  channelId: string | null = null;
  role: 'audience' | 'host' | null = null;
  presenceActive = false;
  realtimeConnected = false;
  recording = false;
  micMuted = false;
  chatOpen = false;
  signedIn = true;
  cookiesCleared = false;
  lastJoinToken: string | null = null;
  lastCreateToken: string | null = null;
  uiMessages: string[] = [];
  pendingExperimental: string | null = null;
  private presenceTimer: number | null = null;
  private hidden = false;
  private readonly client: ClubhouseApiClient;
  private readonly agora: AgoraFacade;
  private readonly myUserId: number;
  private readonly setIntervalFn: (fn: () => void, ms: number) => number;
  private readonly clearIntervalFn: (id: number) => void;

  constructor(deps: RoomSessionDeps) {
    this.client = deps.client;
    this.agora = deps.agora;
    this.myUserId = deps.myUserId;
    this.setIntervalFn = deps.setInterval;
    this.clearIntervalFn = deps.clearInterval;
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
  }

  /** Attach without join_channel — for presence / leave scenarios that start mid-room. */
  attachAsListener(channelId: string, token = 'agora_rtc_token_fixture'): void {
    this.channelId = channelId;
    this.role = 'audience';
    this.lastJoinToken = token;
    this.startPresence(channelId);
    this.realtimeConnected = true;
  }

  attachAsHost(channelId: string, token = 'agora_create_token_fixture'): void {
    this.channelId = channelId;
    this.role = 'host';
    this.lastCreateToken = token;
    this.startPresence(channelId);
    this.realtimeConnected = true;
  }

  tickPresence(): void {
    if (!this.presenceActive || !this.channelId) return;
    void this.client.activePing(this.channelId);
  }

  async joinFromHallway(channelId: string): Promise<{ ok: boolean; message?: string }> {
    try {
      const joined = await this.client.joinChannel(channelId);
      this.channelId = channelId;
      this.role = 'audience';
      this.lastJoinToken = (joined as { token?: string }).token ?? '';
      if (!this.client.getConfig().agoraAppId) {
        this.uiMessages.push('Audio key not found');
        this.client.getApiHealth(); // ensure health store exists
      }
      this.agora.join('audience', this.lastJoinToken);
      this.startPresence(channelId);
      this.realtimeConnected = true;
      return { ok: true };
    } catch (err) {
      const status = err instanceof ClubhouseApiError ? err.status : 0;
      if (status === 404 || status === 405) {
        this.uiMessages.push('Joining rooms is not available on Clubhouse web yet');
        this.uiMessages.push('Available in the Clubhouse app');
        return { ok: false, message: 'Joining rooms is not available on Clubhouse web yet' };
      }
      const message = err instanceof Error ? err.message : 'Join failed';
      this.uiMessages.push(message);
      return { ok: false, message };
    }
  }

  async leaveQuietly(): Promise<void> {
    if (this.channelId) await this.client.leaveChannel(this.channelId);
    this.agora.leave();
    this.stopPresence();
    this.realtimeConnected = false;
    if (this.recording) this.recording = false;
    this.channelId = null;
    this.role = null;
  }

  async startFriendsOfFriendsRoom(
    title: string,
    options: { replayEnabled: boolean; chatEnabled: boolean },
  ): Promise<{ ok: boolean }> {
    try {
      const created = await this.client.createChannel(title, {
        audience: 'friends-of-friends',
        replayEnabled: options.replayEnabled,
        chatEnabled: options.chatEnabled,
      });
      this.channelId = (created as { channel?: string }).channel ?? title;
      this.role = 'host';
      this.lastCreateToken = (created as { token?: string }).token ?? '';
      this.agora.join('host', this.lastCreateToken);
      this.startPresence(this.channelId);
      this.realtimeConnected = true;
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  async raiseHand(raise: boolean): Promise<void> {
    if (!this.channelId) return;
    await this.client.raiseHand(this.channelId, raise);
  }

  async acceptInvite(): Promise<void> {
    if (!this.channelId) return;
    await this.client.becomeSpeaker(this.channelId);
    this.agora.switchToHost(this.lastJoinToken ?? this.lastCreateToken ?? '');
    this.micMuted = true;
    this.role = 'host';
  }

  async declineInvite(): Promise<void> {
    if (!this.channelId) return;
    await this.client.rejectSpeakerInvite(this.channelId, this.myUserId);
  }

  async sendChat(message: string): Promise<string> {
    if (!this.channelId) return '';
    await this.client.sendChannelMessage(this.channelId, message);
    return message;
  }

  shouldPollChat(): boolean {
    return this.chatOpen && !!this.channelId;
  }

  async rename(title: string): Promise<void> {
    if (!this.channelId) return;
    await this.client.setChannelTitle(this.channelId, title);
  }

  async inviteToStage(userId: number): Promise<{ ok?: boolean; needsConfirmation?: boolean }> {
    if (this.client.needsExperimentalConfirmation('invite_speaker')) {
      this.pendingExperimental = 'invite_speaker';
      this.uiMessages.push('Experimental: this action is guessed from older Clubhouse clients and may fail');
      return { needsConfirmation: true };
    }
    if (!this.channelId) return { ok: false };
    await this.client.inviteSpeaker(this.channelId, userId);
    return { ok: true };
  }

  async muteEveryone(speakerIds: number[]): Promise<void> {
    if (!this.channelId) return;
    for (const userId of speakerIds) {
      if (userId === this.myUserId) continue;
      await this.client.muteSpeaker(this.channelId, userId);
    }
  }

  async setHandRaiseFriendsOfSpeakers(): Promise<void> {
    if (!this.channelId) return;
    await this.client.changeHandraiseSettings(this.channelId, {
      isEnabled: true,
      handraisePermission: 'friends_of_speakers',
    });
  }

  async endRoom(): Promise<void> {
    if (!this.channelId) return;
    await this.client.endChannel(this.channelId);
    this.agora.leave();
    this.stopPresence();
    this.realtimeConnected = false;
    this.channelId = null;
  }

  experimentalControlsVisible(): boolean {
    return this.client.getConfig().experimentalActions === true;
  }

  async logOut(): Promise<void> {
    if (this.channelId) await this.leaveQuietly();
    this.cookiesCleared = true;
    this.signedIn = false;
    this.stopPresence();
    this.realtimeConnected = false;
    this.uiMessages.push('sign-in');
  }

  playSoundboardWhileMicMuted(): void {
    this.agora.setBroadcastMix({ soundboard: true, mic: false });
  }

  private startPresence(channelId: string): void {
    this.stopPresence();
    this.presenceActive = true;
    this.presenceTimer = this.setIntervalFn(() => {
      void this.client.activePing(channelId);
    }, 30_000);
  }

  private stopPresence(): void {
    this.presenceActive = false;
    if (this.presenceTimer != null) {
      this.clearIntervalFn(this.presenceTimer);
      this.presenceTimer = null;
    }
  }

  get isHidden(): boolean {
    return this.hidden;
  }
}
