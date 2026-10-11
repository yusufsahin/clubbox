import type { ClubhouseApiClient } from './client.ts';
import { ClubhouseApiError } from './client.ts';
import { RoomEffectRunner, type RealtimeHub } from '../app/roomEffectRunner.ts';
import {
  initialRoomSessionState,
  nextRoomSession,
  type RoomEffect,
  type RoomSessionState,
} from '../domain/roomSession.ts';

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
  realtime?: RealtimeHub;
};

/**
 * Imperative adapter over the pure RoomSession state machine for BDD and tests.
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
  private machine: RoomSessionState = initialRoomSessionState();
  private hidden = false;
  private readonly client: ClubhouseApiClient;
  private readonly agora: AgoraFacade;
  private readonly myUserId: number;
  private readonly runner: RoomEffectRunner;

  constructor(deps: RoomSessionDeps) {
    this.client = deps.client;
    this.agora = deps.agora;
    this.myUserId = deps.myUserId;
    const realtime: RealtimeHub = deps.realtime ?? {
      subscribe: () => {
        this.realtimeConnected = true;
      },
      unsubscribe: () => {
        this.realtimeConnected = false;
      },
    };
    this.runner = new RoomEffectRunner({
      client: deps.client,
      agora: deps.agora,
      realtime,
      audio: { stopRecording: () => { this.recording = false; } },
      myUserId: deps.myUserId,
      setInterval: deps.setInterval,
      clearInterval: deps.clearInterval,
      onRecordingStopped: () => {
        this.recording = false;
      },
    });
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
  }

  private syncFromMachine(): void {
    this.channelId = this.machine.channelId;
    this.role =
      this.machine.role === 'host' || this.machine.role === 'speaker' || this.machine.role === 'moderator'
        ? 'host'
        : this.machine.channelId
          ? 'audience'
          : null;
    this.presenceActive = this.machine.pingActive;
  }

  private pushEvent(event: Parameters<typeof nextRoomSession>[1]): RoomEffect[] {
    const result = nextRoomSession(this.machine, event);
    this.machine = result.state;
    this.syncFromMachine();
    return result.effects;
  }

  private async dispatch(event: Parameters<typeof nextRoomSession>[1]): Promise<void> {
    const effects = this.pushEvent(event);
    await this.runner.runAll(effects);
  }

  attachAsListener(channelId: string, token = 'agora_rtc_token_fixture'): void {
    this.machine = {
      ...initialRoomSessionState(),
      phase: 'Listening',
      generation: 1,
      channelId,
      role: 'audience',
      token,
      agoraJoined: true,
      agoraRole: 'audience',
      pingActive: true,
      pubnubSubscribed: true,
    };
    this.syncFromMachine();
    this.lastJoinToken = token;
    void this.runner.runAll([
      { type: 'agoraJoin', role: 'audience', token },
      { type: 'pubnubSubscribe', channelId },
      { type: 'pingStart', channelId },
    ]);
  }

  attachAsHost(channelId: string, token = 'agora_create_token_fixture'): void {
    this.machine = {
      ...initialRoomSessionState(),
      phase: 'Hosting',
      generation: 1,
      channelId,
      role: 'host',
      token,
      agoraJoined: true,
      agoraRole: 'host',
      pingActive: true,
      pubnubSubscribed: true,
    };
    this.syncFromMachine();
    this.lastCreateToken = token;
    void this.runner.runAll([
      { type: 'agoraJoin', role: 'host', token },
      { type: 'pubnubSubscribe', channelId },
      { type: 'pingStart', channelId },
    ]);
  }

  tickPresence(): void {
    void this.dispatch({ type: 'TICK' });
  }

  async joinFromHallway(channelId: string): Promise<{ ok: boolean; message?: string }> {
    try {
      await this.dispatch({ type: 'JOIN_START' });
      const generation = this.machine.pendingGeneration ?? this.machine.generation;
      const joined = await this.client.joinChannel(channelId);
      const token = (joined as { token?: string }).token ?? '';
      if (!this.client.getConfig().agoraAppId) {
        this.uiMessages.push('Audio key not found');
        this.client.getApiHealth();
      }
      await this.dispatch({ type: 'JOIN_OK', channelId, token, generation });
      this.lastJoinToken = token;
      return { ok: true };
    } catch (err) {
      const generation = this.machine.pendingGeneration ?? this.machine.generation;
      await this.dispatch({ type: 'JOIN_FAIL', generation });
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
    this.machine = { ...this.machine, recording: this.recording };
    await this.dispatch({ type: 'LEAVE' });
    await this.dispatch({ type: 'LEAVE_COMPLETE' });
    this.channelId = null;
    this.role = null;
  }

  async startFriendsOfFriendsRoom(
    title: string,
    options: { replayEnabled: boolean; chatEnabled: boolean },
  ): Promise<{ ok: boolean }> {
    try {
      await this.dispatch({ type: 'CREATE_START' });
      const generation = this.machine.pendingGeneration ?? this.machine.generation;
      const created = await this.client.createChannel(title, {
        audience: 'friends-of-friends',
        replayEnabled: options.replayEnabled,
        chatEnabled: options.chatEnabled,
      });
      const channelId = (created as { channel?: string }).channel ?? title;
      const token = (created as { token?: string }).token ?? '';
      await this.dispatch({ type: 'CREATE_OK', channelId, token, generation });
      this.lastCreateToken = token;
      return { ok: true };
    } catch {
      const generation = this.machine.pendingGeneration ?? this.machine.generation;
      await this.dispatch({ type: 'JOIN_FAIL', generation });
      return { ok: false };
    }
  }

  async raiseHand(raise: boolean): Promise<void> {
    if (!this.channelId) return;
    await this.dispatch(raise ? { type: 'RAISE' } : { type: 'LOWER' });
  }

  async acceptInvite(): Promise<void> {
    if (!this.channelId) return;
    if (this.machine.phase !== 'Invited') {
      this.pushEvent({ type: 'INVITED' });
    }
    await this.dispatch({ type: 'ACCEPT' });
    this.micMuted = true;
    this.role = 'host';
  }

  async declineInvite(): Promise<void> {
    if (!this.channelId) return;
    if (this.machine.phase !== 'Invited') {
      this.pushEvent({ type: 'INVITED' });
    }
    await this.dispatch({ type: 'DECLINE', userId: this.myUserId });
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
    await this.dispatch({ type: 'ENDED' });
    await this.dispatch({ type: 'LEAVE_COMPLETE' });
    this.channelId = null;
  }

  experimentalControlsVisible(): boolean {
    return this.client.getConfig().experimentalActions === true;
  }

  async logOut(): Promise<void> {
    if (this.channelId) await this.leaveQuietly();
    this.cookiesCleared = true;
    this.signedIn = false;
    this.uiMessages.push('sign-in');
  }

  playSoundboardWhileMicMuted(): void {
    this.agora.setBroadcastMix({ soundboard: true, mic: false });
  }

  get isHidden(): boolean {
    return this.hidden;
  }
}
