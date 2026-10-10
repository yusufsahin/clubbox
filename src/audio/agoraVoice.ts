import AgoraRTC from 'agora-rtc-sdk-ng';
import type {
  IAgoraRTCClient,
  ILocalAudioTrack,
  IRemoteAudioTrack,
  IAgoraRTCRemoteUser,
} from 'agora-rtc-sdk-ng';
import { audioEngine } from './audioEngine';
import { clubhouseClient } from '../api/client';

export interface AgoraJoinOptions {
  isSpeaker: boolean;
  isMusicMode: boolean;
}

export class AgoraVoiceEngine {
  private client: IAgoraRTCClient | null = null;
  private localAudioTrack: ILocalAudioTrack | null = null;
  private publishedClone: MediaStreamTrack | null = null;
  private isJoined: boolean = false;
  private isSpeaker: boolean = false;
  private currentChannel: string | null = null;
  private onSpeakerVolumeCallbacks: ((speakers: { uid: string | number; level: number }[]) => void)[] = [];

  // Default known Clubhouse Agora App ID (can be overridden in settings)
  public appId: string = '938d3d95b5764796b3204b67d233436e';

  constructor() {
    AgoraRTC.setLogLevel(3); // Warning level
  }

  private initClient(): IAgoraRTCClient {
    if (!this.client) {
      this.client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });

      // Remote audio is played through the Web Audio graph (and the recorder).
      this.client.on('user-published', async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
        if (mediaType === 'audio') {
          await this.client?.subscribe(user, mediaType);
          const remoteTrack = user.audioTrack as IRemoteAudioTrack | undefined;
          if (remoteTrack) {
            audioEngine.addRemoteTrack(user.uid, remoteTrack.getMediaStreamTrack());
            console.log(`[AgoraRTC] Routing remote audio for user: ${user.uid}`);
          }
        }
      });

      this.client.on('user-unpublished', (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
        if (mediaType === 'audio') {
          audioEngine.removeRemoteTrack(user.uid);
        }
      });

      this.client.on('user-left', (user: IAgoraRTCRemoteUser) => {
        audioEngine.removeRemoteTrack(user.uid);
      });

      // Enable volume indicator for active speaker detection
      this.client.enableAudioVolumeIndicator();
      this.client.on('volume-indicator', (volumes) => {
        const mapped = volumes.map((v) => ({
          uid: v.uid,
          level: Math.min(1, v.level / 100),
        }));
        this.onSpeakerVolumeCallbacks.forEach((cb) => cb(mapped));
      });
    }

    return this.client;
  }

  public async join(
    channelName: string,
    token: string,
    uid: number,
    options: AgoraJoinOptions
  ): Promise<boolean> {
    try {
      const client = this.initClient();

      if (this.isJoined) {
        await this.leave();
      }

      const configuredAppId = clubhouseClient.getConfig().agoraAppId;
      if (configuredAppId) {
        this.appId = configuredAppId;
      }

      this.isSpeaker = options.isSpeaker;
      await client.setClientRole(options.isSpeaker ? 'host' : 'audience');
      await client.join(this.appId, channelName, token, uid);
      this.isJoined = true;
      this.currentChannel = channelName;

      if (options.isSpeaker) {
        await this.publishBroadcast(options.isMusicMode);
      }

      console.log(
        `[AgoraRTC] Joined ${channelName} as UID ${uid} (${options.isSpeaker ? 'host' : 'audience'})`
      );
      return true;
    } catch (err) {
      console.warn('[AgoraRTC] Live Agora join failed (likely in sandbox/mock token):', err);
      try {
        await this.leave();
      } catch {
        // Leave is best-effort after a failed join.
      }
      return false;
    }
  }

  public async promoteToSpeaker(): Promise<boolean> {
    if (!this.client || !this.isJoined) return false;
    try {
      await this.client.setClientRole('host');
      this.isSpeaker = true;
      await this.publishBroadcast(audioEngine.getIsMusicMode());
      return true;
    } catch (err) {
      console.warn('[AgoraRTC] Promote to speaker failed:', err);
      return false;
    }
  }

  public async demoteToAudience(): Promise<void> {
    if (!this.client || !this.isJoined) return;
    await this.unpublishLocal();
    await this.client.setClientRole('audience');
    this.isSpeaker = false;
  }

  public async republish(isMusicMode: boolean): Promise<void> {
    if (!this.client || !this.isJoined || !this.isSpeaker) return;
    await this.unpublishLocal();
    await this.publishBroadcast(isMusicMode);
  }

  private async publishBroadcast(isMusicMode: boolean): Promise<void> {
    if (!this.client) return;

    await audioEngine.startMicrophone();
    const broadcastTrack = audioEngine.getBroadcastTrack();
    if (!broadcastTrack) {
      throw new Error('Broadcast mix is unavailable');
    }

    // Clone so closing the Agora track does not end the Web Audio send bus.
    const mediaStreamTrack = broadcastTrack.clone();
    this.publishedClone = mediaStreamTrack;
    this.localAudioTrack = AgoraRTC.createCustomAudioTrack({
      mediaStreamTrack,
      encoderConfig: isMusicMode ? 'high_quality_stereo' : 'speech_standard',
    });
    await this.client.publish([this.localAudioTrack]);
  }

  private async unpublishLocal(): Promise<void> {
    if (this.client && this.localAudioTrack) {
      try {
        await this.client.unpublish([this.localAudioTrack]);
      } catch {
        // Track was never published.
      }
    }
    if (this.localAudioTrack) {
      this.localAudioTrack.stop();
      this.localAudioTrack.close();
      this.localAudioTrack = null;
    }
    if (this.publishedClone) {
      this.publishedClone.stop();
      this.publishedClone = null;
    }
  }

  public async leave(): Promise<void> {
    try {
      await this.unpublishLocal();
    } catch (err) {
      console.warn('[AgoraRTC] Unpublish on leave failed:', err);
    }
    audioEngine.clearRemoteTracks();

    if (this.client && this.isJoined) {
      try {
        await this.client.leave();
      } catch (err) {
        console.warn('[AgoraRTC] Channel leave failed:', err);
      }
    }
    this.isJoined = false;
    this.isSpeaker = false;
    this.currentChannel = null;
  }

  public async setMuted(_muted: boolean): Promise<void> {
    // Mute is the mic gain ramp in AudioEngine. Disabling this track would
    // also silence soundboard effects on the shared send bus.
  }

  public onVolumeLevels(cb: (speakers: { uid: string | number; level: number }[]) => void): () => void {
    this.onSpeakerVolumeCallbacks.push(cb);
    return () => {
      this.onSpeakerVolumeCallbacks = this.onSpeakerVolumeCallbacks.filter((c) => c !== cb);
    };
  }

  public getIsJoined(): boolean {
    return this.isJoined;
  }

  public getCurrentChannel(): string | null {
    return this.currentChannel;
  }

  public getIsSpeaker(): boolean {
    return this.isSpeaker;
  }
}

export const agoraVoice = new AgoraVoiceEngine();
