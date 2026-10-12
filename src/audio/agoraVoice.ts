import type {
  IAgoraRTCClient,
  ILocalAudioTrack,
  IRemoteAudioTrack,
  IAgoraRTCRemoteUser,
} from 'agora-rtc-sdk-ng';

type AgoraSdk = typeof import('agora-rtc-sdk-ng').default;
import { audioEngine } from './audioEngine';
import { clubhouseClient } from '../api/client';
import { muteFromAgoraEvent } from '../api/remoteMute';
import {
  AGORA_JOIN_MS,
  formatVoiceFailureReason,
  shouldTryCloudProxy,
} from './agoraErrors';
import { buildAgoraJoinParams } from './agoraJoinParams';

export interface AgoraJoinOptions {
  isSpeaker: boolean;
  isMusicMode: boolean;
}

export type RemoteMuteReport = { uid: string | number; muted: boolean };

const AGORA_DEBUG_KEY = 'clubbox.agoraDebug';

function agoraDebugEnabled(): boolean {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(AGORA_DEBUG_KEY) === '1') {
      return true;
    }
  } catch {
    // ignore
  }
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
}

/**
 * Agora join: do not dial the gateway by bare IP (CSP blocks wss://IP).
 * See docs/history/agora-voice-dns-fix.md.
 */
export class AgoraVoiceEngine {
  private client: IAgoraRTCClient | null = null;
  private localAudioTrack: ILocalAudioTrack | null = null;
  /** Soundboard / external / effected-voice custom track (Phase 24.1). */
  private extrasAudioTrack: ILocalAudioTrack | null = null;
  /** MediaStreamTrack clone owned by extrasAudioTrack. */
  private publishedExtrasClone: MediaStreamTrack | null = null;
  /** Only used when falling back to createCustomAudioTrack for mic. */
  private publishedClone: MediaStreamTrack | null = null;
  private isJoined: boolean = false;
  private isSpeaker: boolean = false;
  private currentChannel: string | null = null;
  private onSpeakerVolumeCallbacks: ((speakers: { uid: string | number; level: number }[]) => void)[] = [];
  private onRemoteMuteCallbacks: ((report: RemoteMuteReport) => void)[] = [];
  private onConnectionProblemCallbacks: ((reason: string) => void)[] = [];
  private sdkPromise: Promise<AgoraSdk> | null = null;
  private nativeMuteSignalling = false;
  private lastConnectionReason = '';
  private lastExceptionCode = '';
  private lastJoinResult: string | null = null;
  private joinMode: 'direct' | 'proxy' = 'direct';
  private remoteUserCount = 0;
  /** Connection status: extras track sending audio (bitrate/volume > 0). */
  private extrasSending: boolean | null = null;
  private extrasStatsTimer: ReturnType<typeof setInterval> | null = null;

  // Same default as ClubhouseConfig.agoraAppId. See docs/api/realtime.md.
  public appId: string = '938de3e8055e42b281bb8c6f69c21f78';

  private loadSdk(): Promise<AgoraSdk> {
    if (!this.sdkPromise) {
      this.sdkPromise = import('agora-rtc-sdk-ng').then((mod) => {
        mod.default.setLogLevel(agoraDebugEnabled() ? 1 : 3);
        return mod.default;
      });
    } else {
      void this.sdkPromise.then((sdk) => {
        sdk.setLogLevel(agoraDebugEnabled() ? 1 : 3);
      });
    }
    return this.sdkPromise;
  }

  /** Settings › Advanced "Verbose voice log". */
  public setVerboseLog(enabled: boolean): void {
    try {
      localStorage.setItem(AGORA_DEBUG_KEY, enabled ? '1' : '0');
    } catch {
      // ignore
    }
    void this.loadSdk().then((sdk) => sdk.setLogLevel(enabled ? 1 : 3));
  }

  public getVerboseLog(): boolean {
    return agoraDebugEnabled();
  }

  public getLastJoinResult(): string | null {
    return this.lastJoinResult;
  }

  /** Settings › Connection status: Broadcast extras sending ✓/✗ (null = not publishing). */
  public getExtrasSending(): boolean | null {
    return this.extrasSending;
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
    let dataKeys = '';
    if (e.data != null && typeof e.data === 'object') {
      dataKeys = `dataKeys=${Object.keys(e.data as object).join(',')}`;
    }
    const parts = [
      e.name != null ? String(e.name) : '',
      e.code != null ? `code=${String(e.code)}` : '',
      e.message != null ? String(e.message).slice(0, 120) : '',
      dataKeys,
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

      this.client.on('user-joined', () => {
        this.remoteUserCount += 1;
        console.log(`[AgoraRTC] user-joined count=${this.remoteUserCount}`);
      });

      this.client.on('user-left', (user: IAgoraRTCRemoteUser) => {
        this.remoteUserCount = Math.max(0, this.remoteUserCount - 1);
        console.log(`[AgoraRTC] user-left count=${this.remoteUserCount}`);
        audioEngine.removeRemoteTrack(user.uid);
      });

      this.client.on('connection-state-change', (cur, prev, reason) => {
        this.lastConnectionReason = String(reason || '');
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
        this.lastExceptionCode = String(e?.code ?? '');
        console.warn(
          `[AgoraRTC] exception code=${String(e?.code ?? '')} msg=${String(e?.msg ?? '')} uid=${String(e?.uid ?? '')}`,
        );
        void this.logAgora(
          'agora_exception',
          false,
          'sdk',
          `code=${String(e?.code ?? '')};msg=${String(e?.msg ?? '').slice(0, 80)}`,
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

  private async joinWithTimeout(
    client: IAgoraRTCClient,
    appId: string,
    channelName: string,
    token: string,
    uid: number,
  ): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error(
          `JOIN_TIMEOUT lastConn=${this.lastConnectionReason || 'none'} lastEx=${this.lastExceptionCode || 'none'}`,
        );
        (err as { code?: string }).code = 'JOIN_TIMEOUT';
        reject(err);
      }, AGORA_JOIN_MS);
    });
    try {
      await Promise.race([client.join(appId, channelName, token, uid), timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  public async join(
    channelName: string,
    token: string,
    uid: number,
    options: AgoraJoinOptions,
  ): Promise<boolean> {
    const AgoraRTC = await this.loadSdk();
    const client = this.initClient(AgoraRTC);

    if (this.isJoined) {
      await this.leave();
    }

    const params = buildAgoraJoinParams({
      configuredAppId: clubhouseClient.getConfig().agoraAppId,
      fallbackAppId: this.appId,
      rtcToken: token,
      channel: channelName,
      userProfileId: uid,
      isSpeaker: options.isSpeaker,
    });
    if (!params.ok) {
      this.lastJoinResult = params.error || 'join_params';
      console.warn('[AgoraRTC] join params invalid:', params.error);
      void this.logAgora('agora_join', false, params.appIdSource, params.error || 'join_params');
      return false;
    }
    this.appId = params.appId;

    this.isSpeaker = options.isSpeaker;
    this.joinMode = 'direct';
    this.remoteUserCount = 0;
    this.lastConnectionReason = '';
    this.lastExceptionCode = '';
    this.lastJoinResult = null;

    console.log(
      `[AgoraRTC] joining channelLen=${params.channelLen} uidType=${params.uidType}`
        + ` tokenLen=${params.tokenLen} appId=${params.appIdPrefix}…/${params.appIdLen}`
        + ` source=${params.appIdSource} promoteHost=${params.promoteToHostAfterJoin}`,
    );

    const tryJoinOnce = async (useProxy: boolean): Promise<void> => {
      if (useProxy) {
        try {
          const maybeProxy = client as IAgoraRTCClient & { startProxyServer?: (mode: number) => Promise<void> };
          await maybeProxy.startProxyServer?.(5);
          this.joinMode = 'proxy';
          console.warn('[AgoraRTC] cloud proxy mode=5 (once)');
        } catch (proxyErr) {
          console.warn('[AgoraRTC] startProxyServer failed:', this.formatAgoraError(proxyErr));
        }
      }
      // Match clubhouse.com order: join as audience, then promote to host.
      await client.setClientRole('audience');
      await this.joinWithTimeout(client, params.appId, params.channel, params.token, params.uid);
      if (params.promoteToHostAfterJoin) {
        await client.setClientRole('host');
      }
    };

    let proxyTried = false;
    try {
      try {
        await tryJoinOnce(false);
      } catch (firstErr) {
        if (shouldTryCloudProxy(firstErr, proxyTried)) {
          proxyTried = true;
          console.warn(
            '[AgoraRTC] network-block — retry once with cloud proxy;',
            this.formatAgoraError(firstErr),
          );
          try {
            await client.leave();
          } catch {
            // ignore
          }
          await tryJoinOnce(true);
        } else {
          throw firstErr;
        }
      }

      this.isJoined = true;
      this.currentChannel = params.channel;
      void audioEngine.ensureAudioContext();
      await this.syncRemoteUsers();

      if (options.isSpeaker) {
        try {
          await this.publishBroadcast(options.isMusicMode);
        } catch (publishErr) {
          console.warn('[AgoraRTC] Host join ok but publish failed:', this.formatAgoraError(publishErr));
          void this.logAgora('agora_publish', false, params.appIdSource, 'MICROPHONE_UNAVAILABLE');
        }
      }

      const role = options.isSpeaker ? 'host' : 'audience';
      console.log(
        `[AgoraRTC] Joined ${params.channel} uid=${params.uid} role=${role} mode=${this.joinMode}`,
      );
      this.lastJoinResult = `ok:${this.joinMode}`;
      void this.logAgora('agora_join', true, params.appIdSource, `mode=${this.joinMode}`);
      return true;
    } catch (err) {
      // Log connection/exception snapshot before leave hides the gateway state.
      console.warn(
        '[AgoraRTC] Live Agora join failed:',
        this.formatAgoraError(err),
        `lastConn=${this.lastConnectionReason || 'none'}`,
        `lastEx=${this.lastExceptionCode || 'none'}`,
      );
      const code = formatVoiceFailureReason(err);
      this.lastJoinResult = code;
      void this.logAgora('agora_join', false, params.appIdSource, code);
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
        kind: 'agora',
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
    audioEngine.ensureAudioContext();
    audioEngine.refreshBroadcastDestination();

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

    // Feed Agora's live track into the local graph for VU / monitor / effects (no second capture).
    audioEngine.adoptMicrophoneTrack(this.localAudioTrack.getMediaStreamTrack());

    // Phase 24.1: second track = soundboard + external (+ effected voice when FX applied).
    // Voice effects: SDK localAudioTrack.pipe(processor) exists, but Clubbox FX are Web Audio
    // (effectChain). When applied !== 'none', processed mic is wired into extrasDest and the
    // mic SDK track is muted so remotes hear the effect via this custom track.
    const extrasSource = audioEngine.getBroadcastExtrasTrack();
    const toPublish: ILocalAudioTrack[] = [this.localAudioTrack];
    if (extrasSource) {
      this.publishedExtrasClone = extrasSource.clone();
      if (!this.publishedExtrasClone.enabled) this.publishedExtrasClone.enabled = true;
      this.extrasAudioTrack = AgoraRTC.createCustomAudioTrack({
        mediaStreamTrack: this.publishedExtrasClone,
        encoderConfig: isMusicMode ? 'high_quality_stereo' : 'music_standard',
      });
      toPublish.push(this.extrasAudioTrack);
    } else {
      console.warn('[AgoraRTC] extras track unavailable — publishing mic only');
    }

    await this.client.publish(toPublish);
    const media = this.localAudioTrack.getMediaStreamTrack();
    console.log(
      '[AgoraRTC] published mic+extras',
      `tracks=${toPublish.length}`,
      `mic readyState=${media.readyState}`,
      `enabled=${media.enabled}`,
      `extras=${!!this.extrasAudioTrack}`,
    );
    this.extrasSending = !!this.extrasAudioTrack;
    this.startExtrasStatsProbe();
    await this.syncVoiceEffectPublish();
  }

  /**
   * When a broadcast voice effect is applied, mute the mic SDK track so only the
   * processed voice on the extras custom track is sent. User mute still wins.
   */
  public async syncVoiceEffectPublish(): Promise<void> {
    if (!this.localAudioTrack || !this.isSpeaker) return;
    const effectOn = audioEngine.getBroadcastEffect() !== 'none';
    const userMuted = audioEngine.getIsMuted();
    try {
      if (effectOn) {
        await this.localAudioTrack.setMuted(true);
        console.log('[AgoraRTC] mic muted for voice effect (processed voice on extras)');
      } else {
        await this.localAudioTrack.setMuted(userMuted);
      }
    } catch (err) {
      console.warn('[AgoraRTC] syncVoiceEffectPublish failed:', err);
    }
  }

  private startExtrasStatsProbe(): void {
    this.stopExtrasStatsProbe();
    if (!this.client || !this.extrasAudioTrack) return;
    this.extrasStatsTimer = setInterval(() => {
      void this.probeExtrasSending();
    }, 2000);
    void this.probeExtrasSending();
  }

  private stopExtrasStatsProbe(): void {
    if (this.extrasStatsTimer) {
      clearInterval(this.extrasStatsTimer);
      this.extrasStatsTimer = null;
    }
  }

  private async probeExtrasSending(): Promise<void> {
    if (!this.client || !this.extrasAudioTrack) {
      this.extrasSending = null;
      return;
    }
    try {
      const vol = this.extrasAudioTrack.getVolumeLevel();
      const stats = this.client.getLocalAudioStats() as
        | { sendBitrate?: number; sendVolumeLevel?: number }
        | Record<string, { sendBitrate?: number; sendVolumeLevel?: number }>;
      let bitrate = 0;
      let sendVol = 0;
      if (stats && typeof stats === 'object' && 'sendBitrate' in stats) {
        bitrate = Number(stats.sendBitrate) || 0;
        sendVol = Number(stats.sendVolumeLevel) || 0;
      } else if (stats && typeof stats === 'object') {
        for (const row of Object.values(stats)) {
          if (row && typeof row === 'object') {
            bitrate = Math.max(bitrate, Number(row.sendBitrate) || 0);
            sendVol = Math.max(sendVol, Number(row.sendVolumeLevel) || 0);
          }
        }
      }
      // Sending = extras track has level, or aggregate local send looks alive while published.
      this.extrasSending = vol > 0.01 || sendVol > 0 || bitrate > 0;
      if (agoraDebugEnabled()) {
        console.log(
          '[AgoraRTC] extras stats',
          `vol=${vol.toFixed(3)}`,
          `sendVol=${sendVol}`,
          `bitrate=${bitrate}`,
          `sending=${this.extrasSending}`,
        );
      }
    } catch {
      this.extrasSending = this.extrasAudioTrack != null;
    }
  }

  private async unpublishLocal(): Promise<void> {
    this.stopExtrasStatsProbe();
    this.extrasSending = null;
    const tracks = [this.localAudioTrack, this.extrasAudioTrack].filter(
      (t): t is ILocalAudioTrack => !!t,
    );
    if (this.client && tracks.length) {
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
    if (this.extrasAudioTrack) {
      this.extrasAudioTrack.stop();
      this.extrasAudioTrack.close();
      this.extrasAudioTrack = null;
    }
    if (this.publishedExtrasClone) {
      this.publishedExtrasClone.stop();
      this.publishedExtrasClone = null;
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
  }

  public setNativeMuteSignalling(enabled: boolean): void {
    this.nativeMuteSignalling = enabled;
  }

  public async setMuted(muted: boolean): Promise<void> {
    if (!this.localAudioTrack) return;
    try {
      // Mic track only — soundboard/external on extras keep playing (Phase 24.1 mute semantics).
      // Voice effect overrides: keep mic muted while effect is applied.
      const effectOn = audioEngine.getBroadcastEffect() !== 'none';
      await this.localAudioTrack.setMuted(muted || effectOn);
      console.log(
        `[AgoraRTC] local track muted=${muted || effectOn}`,
        `userMuted=${muted}`,
        `effectOn=${effectOn}`,
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
