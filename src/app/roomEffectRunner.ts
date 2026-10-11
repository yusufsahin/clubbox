import type { ClubhouseApiClient } from '../api/client.ts';
import type { AgoraFacade } from '../api/roomSession.ts';
import type { RoomEffect } from '../domain/roomSession.ts';

export type RealtimeHub = {
  subscribe(channelId: string): void;
  unsubscribe(): void;
};

export type AudioEngineFacade = {
  stopRecording(): void;
};

export type RoomEffectDeps = {
  client: ClubhouseApiClient;
  agora: AgoraFacade;
  realtime: RealtimeHub;
  audio: AudioEngineFacade;
  myUserId: number;
  setInterval: (fn: () => void, ms: number) => number;
  clearInterval: (id: number) => void;
  onRecordingStopped?: () => void;
};

export class RoomEffectRunner {
  private pingTimer: number | null = null;
  private readonly deps: RoomEffectDeps;

  constructor(deps: RoomEffectDeps) {
    this.deps = deps;
  }

  async run(effect: RoomEffect): Promise<void> {
    const { client, agora, realtime, audio } = this.deps;
    switch (effect.type) {
      case 'agoraJoin':
        agora.join(effect.role, effect.token);
        break;
      case 'agoraRole':
        if (effect.role === 'host') agora.switchToHost(effect.token);
        else agora.leave();
        break;
      case 'agoraLeave':
        agora.leave();
        break;
      case 'pubnubSubscribe':
        realtime.subscribe(effect.channelId);
        break;
      case 'pubnubUnsubscribe':
        realtime.unsubscribe();
        break;
      case 'pingStart':
        this.stopPing();
        this.pingTimer = this.deps.setInterval(() => {
          void client.activePing(effect.channelId);
        }, 30_000);
        break;
      case 'pingStop':
        this.stopPing();
        break;
      case 'recordingStopSave':
        audio.stopRecording();
        this.deps.onRecordingStopped?.();
        break;
      case 'api':
        await this.runApi(effect.call);
        break;
      default:
        break;
    }
  }

  async runAll(effects: RoomEffect[]): Promise<void> {
    for (const effect of effects) {
      await this.run(effect);
    }
  }

  private stopPing(): void {
    if (this.pingTimer != null) {
      this.deps.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private async runApi(call: Extract<RoomEffect, { type: 'api' }>['call']): Promise<void> {
    const { client } = this.deps;
    switch (call.kind) {
      case 'join_channel':
        await client.joinChannel(call.channelId);
        break;
      case 'leave_channel':
        await client.leaveChannel(call.channelId);
        break;
      case 'active_ping':
        await client.activePing(call.channelId);
        break;
      case 'audience_reply':
        await client.raiseHand(call.channelId, call.raise);
        break;
      case 'become_speaker':
        await client.becomeSpeaker(call.channelId);
        break;
      case 'reject_speaker_invite':
        await client.rejectSpeakerInvite(call.channelId, call.userId);
        break;
      case 'end_channel':
        await client.endChannel(call.channelId);
        break;
      default:
        break;
    }
  }
}
