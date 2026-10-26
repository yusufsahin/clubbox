import type {
  IAgoraRTCClient,
  ILocalAudioTrack,
  IRemoteAudioTrack,
  IAgoraRTCRemoteUser,
} from 'agora-rtc-sdk-ng';

type AgoraSdk = typeof import('agora-rtc-sdk-ng').default;
import { audioEngine } from './audioEngine';
import { agoraPublishTracks } from './agoraPublishPlan';
import { extrasCaptureMode } from './audioSetupWizard';
import { SYSTEM_AUDIO_DEVICE_ID } from './externalConstraints';
import { clubhouseClient } from '../api/client';
import { muteFromAgoraEvent } from '../api/remoteMute';

export interface AgoraJoinOptions {
  isSpeaker: boolean;
  isMusicMode: boolean;
}

export type RemoteMuteReport = { uid: string | number; muted: boolean };

/**
 * Agora join path matches the last known-good committed shape: plain client.join().
 * Do not add join timeouts that call leave() (that surfaces as WS_ABORT: LEAVE and
 * hides the real gateway result). Do not set CONNECT_GATEWAY_WITHOUT_DOMAIN —
 * that hits CSP when the SDK dials wss://<ip>. See docs/history/agora-voice-dns-fix.md.
 */
export class AgoraVoiceEngine {
  private client: IAgoraRTCClient | null = null;
  private localAudioTrack: ILocalAudioTrack | null = null;
  /** Soundboard + VB-Cable / system audio (no mic). */
  private extrasAudioTrack: ILocalAudioTrack | null = null;
  private extrasDeviceId = '';
  /** Only used when falling back to createCustomAudioTrack. */
  private publishedClone: MediaStreamTrack | null = null;
  private isJoined: boolean = false;
  private isSpeaker: boolean = false;
  private currentChannel: string | null = null;
  private onSpeakerVolumeCallbacks: ((speakers: { uid: string | number; level: number }[]) => void)[] = [];
  private onRemoteMuteCallbacks: ((report: RemoteMuteReport) => void)[] = [];
  private onConnectionProblemCallbacks: ((reason: string) => void)[] = [];
  private sdkPromise: Promise<AgoraSdk> | null = null;
  private nativeMuteSignalling = false;

  // Same default as ClubhouseConfig.agoraAppId. See docs/api/realtime.md.
  public appId: string = '938de3e8055e42b281bb8c6f69c21f78';

  private loadSdk(): Promise<AgoraSdk> {
    if (!this.sdkPromise) {
      this.sdkPromise = import('agora-rtc-sdk-ng').then((mod) => {
        // INFO while diagnosing live join; revert to 3 when stable.
        mod.default.setLogLevel(1);
        return mod.default;
      });
    }
    return this.sdkPromise;
  }

  private routeRemoteAudio(user: IAgoraRTCRemoteUser): void {
    const remoteTrack = user.audioTrack as IRemoteAudioTrack | undefined;
    if (!remoteTrack) return;
    void audioEngine.ensureAudioContext();
    audioEngine.addRemoteTrack(user.uid, remoteTrack.getMediaStreamTrack());
    console.log(`[AgoraRTC] Routing remote audio for user: ${user.uid}`);
  }

  private async subscribeRemoteAudio(user: IAgoraRTCRemoteUser): Promise<void> {
    if (!this.client) return;
    try {
      this.emitRemoteMute(user.uid, muteFromAgoraEvent('user-published'));
      await this.client.subscribe(user, 'audio');
      this.routeRemoteAudio(user);
    } catch (err) {
      console.warn(`[AgoraRTC] Subscribe audio failed for ${user.uid}:`, err);
    }
  }

  private async syncRemoteUsers(): Promise<void> {
    if (!this.client) return;
    for (const user of this.client.remoteUsers) {
      if (user.hasAudio) {
        await this.subscribeRemoteAudio(user);
      }
    }
  }

  private formatAgoraError(err: unknown): string {
    if (!err || typeof err !== 'object') return String(err || 'unknown');
    const e = err as { code?: unknown; message?: unknown; data?: unknown; name?: unknown };
    const parts = [
      e.name != null ? String(e.name) : '',
      e.code != null ? `code=${String(e.code)}` : '',
      e.message != null ? String(e.message) : '',
      e.data != null ? `data=${JSON.stringify(e.data)}` : '',
    ].filter(Boolean);
    return parts.join(' ') || String(err);
  }

  private initClient(AgoraRTC: AgoraSdk): IAgoraRTCClient {
    if (!this.client) {
      this.client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });

      // Remote audio is played through the Web Audio graph (and the recorder).
      // Mute badges follow Agora (not PubNub): publish/unpublish + user-info-updated.
      this.client.on('user-published', (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
        if (mediaType === 'audio') {
          void this.subscribeRemoteAudio(user);
        }
      });

      this.client.on('user-unpublished', (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
        if (mediaType === 'audio') {
          this.emitRemoteMute(user.uid, muteFromAgoraEvent('user-unpublished'));
          audioEngine.removeRemoteTrack(user.uid);
        }
      });

      this.client.on('user-info-updated', (uid: string | number, msg: string) => {
        this.emitRemoteMute(uid, muteFromAgoraEvent('user-info-updated', msg));
      });

      this.client.on('user-left', (user: IAgoraRTCRemoteUser) => {
        audioEngine.removeRemoteTrack(user.uid);
      });

      this.client.on('connection-state-change', (cur, prev, reason) => {
        console.warn(`[AgoraRTC] connection ${prev} → ${cur}${reason ? ` (${reason})` : ''}`);
        const ok = cur === 'CONNECTED';
        void this.logAgora(
          'agora_connection',
          ok,
          'conn',
          `${String(prev)}->${String(cur)}${reason ? `:${String(reason)}` : ''}`,
        );
        if (!this.isJoined) return;
        const why = String(reason || '');
        if (
          (cur === 'DISCONNECTED' || String(cur) === 'FAILED')
          && why
          && !/LEAVE|UID_BANNED|CHANNEL_BANNED/i.test(why)
        ) {
          this.onConnectionProblemCallbacks.forEach((cb) => cb(why || String(cur)));
        }
      });

      this.client.on('exception', (e: { code?: number; msg?: string; uid?: string | number }) => {
        console.warn(
          `[AgoraRTC] exception code=${String(e?.code ?? '')} msg=${String(e?.msg ?? '')} uid=${String(e?.uid ?? '')}`,
        );
      });

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
    options: AgoraJoinOptions,
  ): Promise<boolean> {
    try {
      const AgoraRTC = await this.loadSdk();
      const client = this.initClient(AgoraRTC);

      if (this.isJoined) {
        await this.leave();
      }

      const configuredAppId = clubhouseClient.getConfig().agoraAppId;
      if (configuredAppId) {
        this.appId = configuredAppId;
      }

      this.isSpeaker = options.isSpeaker;
      console.log(
        `[AgoraRTC] joining channel=${channelName} uid=${uid} tokenLen=${token?.length ?? 0}`
          + ` appIdLen=${this.appId.length} role=${options.isSpeaker ? 'host' : 'audience'}`,
      );
      await client.setClientRole(options.isSpeaker ? 'host' : 'audience');
      await client.join(this.appId, channelName, token, uid);
      this.isJoined = true;
      this.currentChannel = channelName;
      void audioEngine.ensureAudioContext();

      await this.syncRemoteUsers();

      if (options.isSpeaker) {
        try {
          await this.publishBroadcast(options.isMusicMode);
        } catch (publishErr) {
          // Stay joined so the host can still hear the room; mic can retry on unmute.
          console.warn('[AgoraRTC] Host join ok but publish failed:', this.formatAgoraError(publishErr));
          void this.logAgora('agora_publish', false, configuredAppId ? 'config' : 'fallback', 'MICROPHONE_UNAVAILABLE');
        }
      }

      console.log(
        `[AgoraRTC] Joined ${channelName} as UID ${uid} (${options.isSpeaker ? 'host' : 'audience'})`,
      );
      void this.logAgora('agora_join', true, configuredAppId ? 'config' : 'fallback');
      return true;
    } catch (err) {
      // No Agora token-refresh request has been captured. Do not invent one.
      console.warn('[AgoraRTC] Live Agora join failed:', this.formatAgoraError(err));
      const code = err && typeof err === 'object' && 'code' in err
        ? String((err as { code: unknown }).code)
        : 'join_failed';
      void this.logAgora('agora_join', false, clubhouseClient.getConfig().agoraAppId ? 'config' : 'fallback', code);
      try {
        await this.leave();
      } catch {
        // Leave is best-effort after a failed join.
      }
      return false;
    }
  }

  /** Ensure mic is open and published (unmute / retry). */
  public async ensurePublished(isMusicMode: boolean): Promise<boolean> {
    if (!this.client || !this.isJoined || !this.isSpeaker) return false;
    if (this.localAudioTrack) return true;
    try {
      await this.publishBroadcast(isMusicMode);
      return true;
    } catch (err) {
      console.warn('[AgoraRTC] ensurePublished failed:', this.formatAgoraError(err));
      return false;
    }
  }

  private async logAgora(endpoint: string, ok: boolean, source: string, error?: string): Promise<void> {
    try {
      const api = (globalThis as typeof globalThis & {
        electronAPI?: { appendApiLog?: (r: Record<string, unknown>) => Promise<unknown> };
      }).electronAPI;
      // Shape only — never log the Agora app id value.
      await api?.appendApiLog?.({
        endpoint,
        status: ok ? 200 : 0,
        ok,
        error: ok ? `source=${source}` : `${error || 'join_failed'};source=${source}`,
        kind: 'audio',
      });
    } catch {
      // Logging must not break join.
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
    const AgoraRTC = await this.loadSdk();

    // Always publish live; connect-time mute left silence on the wire.
    if (audioEngine.getIsMuted()) {
      audioEngine.setMuted(false);
      console.warn('[AgoraRTC] cleared mute before publish (was muted while connecting)');
    }

    // Release Clubbox's getUserMedia so Windows can hand the device to Agora.
    // Custom/cloned MediaStreamTracks were joining + flipping mute badges but
    // remotes heard nothing (inbound still worked). createMicrophoneAudioTrack
    // is the SDK path native Clubhouse clients expect.
    audioEngine.stopMicrophone();

    const encoderConfig = isMusicMode ? 'high_quality_stereo' : 'speech_standard';
    const micId = audioEngine.getInputDeviceId() || undefined;
    try {
      this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack({
        microphoneId: micId,
        encoderConfig,
        AEC: !isMusicMode,
        ANS: !isMusicMode,
        AGC: true,
      });
    } catch (firstErr) {
      if (!micId) throw firstErr;
      console.warn('[AgoraRTC] preferred mic failed — retrying default:', firstErr);
      this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig,
        AEC: !isMusicMode,
        ANS: !isMusicMode,
        AGC: true,
      });
    }

    await this.client.publish([this.localAudioTrack]);
    // Feed Agora's live track into the local graph for VU / monitor (no second capture).
    audioEngine.adoptMicrophoneTrack(this.localAudioTrack.getMediaStreamTrack());
    const media = this.localAudioTrack.getMediaStreamTrack();
    audioEngine.onExternalSendLevel = (gain) => {
      this.setExtrasSendVolume(gain);
    };
    if (audioEngine.getExternalDeviceId()) {
      await this.ensureExtrasPublished();
    }
    console.log(
      '[AgoraRTC] published createMicrophoneAudioTrack',
      `readyState=${media.readyState}`,
      `enabled=${media.enabled}`,
      `extras=${this.extrasAudioTrack ? 'yes' : 'no'}`,
    );
  }

  /** Publish VB-Cable via Agora createMicrophoneAudioTrack (custom dest tracks stay silent). */
  public async ensureExtrasPublished(): Promise<void> {
    if (!this.client || !this.isJoined || !this.isSpeaker) return;
    const deviceId = audioEngine.getExternalDeviceId();
    const mode = extrasCaptureMode(deviceId, SYSTEM_AUDIO_DEVICE_ID);
    if (mode === 'none') {
      await this.unpublishExtrasOnly();
      return;
    }
    if (this.extrasAudioTrack && this.extrasDeviceId === deviceId) {
      this.setExtrasSendVolume(audioEngine.getExternalMuted() ? 0 : audioEngine.getExternalVolume());
      return;
    }
    await this.unpublishExtrasOnly();
    const AgoraRTC = await this.loadSdk();
    const isMusicMode = audioEngine.getIsMusicMode();
    try {
      if (mode === 'agora-mic') {
        audioEngine.releaseExternal();
        this.extrasAudioTrack = await AgoraRTC.createMicrophoneAudioTrack({
          microphoneId: deviceId,
          encoderConfig: isMusicMode ? 'high_quality_stereo' : 'music_standard',
          AEC: false,
          ANS: false,
          AGC: false,
        });
        audioEngine.adoptExternalTrack(this.extrasAudioTrack.getMediaStreamTrack());
      } else {
        void audioEngine.ensureAudioContext();
        audioEngine.refreshExtrasDestination();
        const extras = audioEngine.getBroadcastExtrasTrack();
        if (!extras || extras.readyState !== 'live') return;
        this.extrasAudioTrack = AgoraRTC.createCustomAudioTrack({
          mediaStreamTrack: extras,
          encoderConfig: isMusicMode ? 'high_quality_stereo' : 'music_standard',
        });
      }
      await this.client.publish([this.extrasAudioTrack]);
      this.extrasDeviceId = deviceId;
      this.setExtrasSendVolume(audioEngine.getExternalMuted() ? 0 : audioEngine.getExternalVolume());
      console.log('[AgoraRTC] published extras', mode, deviceId);
    } catch (err) {
      console.warn('[AgoraRTC] extras publish failed:', this.formatAgoraError(err));
      this.closeExtrasTrack();
      if (mode === 'agora-mic' && deviceId) {
        await audioEngine.startExternal(deviceId);
      }
    }
  }

  public extrasIsLive(): boolean {
    return !!this.extrasAudioTrack;
  }

  public setExtrasSendVolume(gain: number): void {
    if (!this.extrasAudioTrack) return;
    const volume = Math.max(0, Math.min(100, Math.round(gain * 100)));
    try {
      this.extrasAudioTrack.setVolume(volume);
    } catch {
      // older SDK
    }
    try {
      void this.extrasAudioTrack.setMuted(volume <= 0);
    } catch {
      // ignore
    }
  }

  private async unpublishExtrasOnly(): Promise<void> {
    if (this.client && this.extrasAudioTrack) {
      try {
        await this.client.unpublish([this.extrasAudioTrack]);
      } catch {
        // never published
      }
    }
    this.closeExtrasTrack();
  }

  private closeExtrasTrack(): void {
    if (this.extrasAudioTrack) {
      try {
        this.extrasAudioTrack.stop();
        this.extrasAudioTrack.close();
      } catch {
        // ignore
      }
      this.extrasAudioTrack = null;
    }
    this.extrasDeviceId = '';
  }

  private async unpublishLocal(): Promise<void> {
    const tracks = agoraPublishTracks(this.localAudioTrack, this.extrasAudioTrack);
    if (this.client && tracks.length > 0) {
      try {
        await this.client.unpublish(tracks);
      } catch {
        // Track was never published.
      }
    }
    if (this.localAudioTrack) {
      this.localAudioTrack.stop();
      this.localAudioTrack.close();
      this.localAudioTrack = null;
    }
    this.closeExtrasTrack();
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
    // Drop adopted Agora mic from the local graph (track already closed above).
    audioEngine.stopMicrophone();
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
    this.nativeMuteSignalling = false;
    audioEngine.onExternalSendLevel = null;
  }

  public isInChannel(): boolean {
    return this.isJoined && this.isSpeaker;
  }

  public setNativeMuteSignalling(enabled: boolean): void {
    this.nativeMuteSignalling = enabled;
  }

  public async setMuted(muted: boolean): Promise<void> {
    if (!this.localAudioTrack) return;
    try {
      // Always mute the published SDK track (audio + remote badges when native).
      await this.localAudioTrack.setMuted(muted);
      console.log(
        `[AgoraRTC] local track muted=${muted}`,
        `nativeSignalling=${this.nativeMuteSignalling}`,
        `enabled=${this.localAudioTrack.getMediaStreamTrack().enabled}`,
      );
    } catch (err) {
      console.warn('[AgoraRTC] Track mute failed:', err);
    }
  }

  private emitRemoteMute(uid: string | number, muted: boolean | null): void {
    if (muted == null) return;
    const report: RemoteMuteReport = { uid, muted };
    this.onRemoteMuteCallbacks.forEach((cb) => cb(report));
  }

  public onVolumeLevels(cb: (speakers: { uid: string | number; level: number }[]) => void): () => void {
    this.onSpeakerVolumeCallbacks.push(cb);
    return () => {
      this.onSpeakerVolumeCallbacks = this.onSpeakerVolumeCallbacks.filter((c) => c !== cb);
    };
  }

  public onRemoteMute(cb: (report: RemoteMuteReport) => void): () => void {
    this.onRemoteMuteCallbacks.push(cb);
    return () => {
      this.onRemoteMuteCallbacks = this.onRemoteMuteCallbacks.filter((c) => c !== cb);
    };
  }

  public onConnectionProblem(cb: (reason: string) => void): () => void {
    this.onConnectionProblemCallbacks.push(cb);
    return () => {
      this.onConnectionProblemCallbacks = this.onConnectionProblemCallbacks.filter((c) => c !== cb);
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
