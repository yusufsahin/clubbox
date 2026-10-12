import type {
  IAgoraRTCClient,
  ILocalAudioTrack,
  IMicrophoneAudioTrack,
  IRemoteAudioTrack,
  IAgoraRTCRemoteUser,
  DeviceInfo,
} from 'agora-rtc-sdk-ng';

type AgoraSdk = typeof import('agora-rtc-sdk-ng').default;
import { audioPublishProfile, type AudioQuality } from './audioQuality';
import { micCaptureProfile } from './mixerMic';
import { audioEngine } from './audioEngine';
import { clubhouseClient } from '../api/client';
import { muteFromAgoraEvent } from '../api/remoteMute';
import {
  AGORA_JOIN_MS,
  agoraConnectionPolicy,
  agoraExceptionLogLevel,
  extrasStatsChanged,
  formatVoiceFailureReason,
  networkQualityTone,
  shouldTryCloudProxy,
  type ExtrasStatsSnapshot,
} from './agoraErrors';
import { buildAgoraJoinParams } from './agoraJoinParams';
import {
  nextSpeakingHold,
  SPEAKING_SAMPLE_MS,
  type SpeakingHoldState,
} from './speakingRings';
import { createExclusiveQueue } from './asyncQueue';
import {
  detachAiDenoiser,
  setAiNoisePreference,
  syncAiDenoiserOnTrack,
} from './aiDenoiser';

export interface AgoraJoinOptions {
  isSpeaker: boolean;
  quality: AudioQuality;
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
  private localAudioTrack: IMicrophoneAudioTrack | null = null;
  private deviceListenersBound = false;
  private onMicChangedCallbacks: ((label: string) => void)[] = [];
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
  private onSpeakingRingCallbacks: ((changes: { uid: string; speaking: boolean }[]) => void)[] = [];
  private onRemoteMuteCallbacks: ((report: RemoteMuteReport) => void)[] = [];
  private onRemotePresenceCallbacks: ((uids: number[]) => void)[] = [];
  private onAgoraJoinedCallbacks: ((joined: boolean) => void)[] = [];
  private speakingHold: SpeakingHoldState = new Map();
  private speakingSampleTimer: ReturnType<typeof setInterval> | null = null;
  private speakingSamplePaused = false;
  /** Serialize join/leave so concurrent joins await the previous leave (Phase 24.6). */
  private readonly exclusiveAgora = createExclusiveQueue();
  private onConnectionProblemCallbacks: ((reason: string) => void)[] = [];
  private onReconnectUiCallbacks: ((reconnecting: boolean) => void)[] = [];
  private onBannedCallbacks: ((reason: string) => void)[] = [];
  private onNeedRejoinCallbacks: ((delayMs: number, attempt: number) => void)[] = [];
  private onNeedTokenCallbacks: ((kind: 'will-expire' | 'did-expire') => void)[] = [];
  private onNetworkQualityCallbacks: ((tone: 'good' | 'ok' | 'poor' | 'unknown', uplink: number, downlink: number) => void)[] = [];
  private sdkPromise: Promise<AgoraSdk> | null = null;
  private nativeMuteSignalling = false;
  private lastMuteSignal: { mic: boolean; extras: boolean } | null = null;
  private lastConnectionReason = '';
  private lastExceptionCode = '';
  private lastJoinResult: string | null = null;
  private joinMode: 'direct' | 'proxy' = 'direct';
  private remoteUserCount = 0;
  /** Connection status: extras track sending audio (bitrate/volume > 0). */
  private extrasSending: boolean | null = null;
  /** Last extras-stats line, so the 2s probe logs only when a value changes. */
  private lastExtrasStatsLog: ExtrasStatsSnapshot | null = null;
  private extrasStatsTimer: ReturnType<typeof setInterval> | null = null;
  private rejoinAttempt = 0;
  private joinedAtMs: number | null = null;
  private networkQuality: { uplink: number; downlink: number; tone: 'good' | 'ok' | 'poor' | 'unknown' } = {
    uplink: 0,
    downlink: 0,
    tone: 'unknown',
  };
  private rtcStatsSnapshot: {
    rtt: number;
    sendBitrate: number;
    recvBitrate: number;
    duration: number;
    remotes: { uid: string; packetLoss: number; e2eDelay: number }[];
  } | null = null;

  // Same default as ClubhouseConfig.agoraAppId. See docs/api/realtime.md.
  public appId: string = '938de3e8055e42b281bb8c6f69c21f78';

  private loadSdk(): Promise<AgoraSdk> {
    if (!this.sdkPromise) {
      this.sdkPromise = import('agora-rtc-sdk-ng').then((mod) => {
        mod.default.setLogLevel(agoraDebugEnabled() ? 1 : 3);
        this.bindDeviceListeners(mod.default);
        return mod.default;
      });
    } else {
      void this.sdkPromise.then((sdk) => {
        sdk.setLogLevel(agoraDebugEnabled() ? 1 : 3);
        this.bindDeviceListeners(sdk);
      });
    }
    return this.sdkPromise;
  }

  /** Phase 24.4: hot-swap mic/output without republish. */
  private bindDeviceListeners(sdk: AgoraSdk): void {
    if (this.deviceListenersBound) return;
    this.deviceListenersBound = true;
    sdk.onMicrophoneChanged = (info: DeviceInfo) => {
      void this.onMicrophoneDeviceChanged(sdk, info);
    };
    sdk.onPlaybackDeviceChanged = (info: DeviceInfo) => {
      void this.onPlaybackDeviceChanged(info);
    };
  }

  private async onMicrophoneDeviceChanged(sdk: AgoraSdk, info: DeviceInfo): Promise<void> {
    if (!this.isJoined || !this.isSpeaker || !this.localAudioTrack) return;
    // Newly plugged (ACTIVE) devices do not auto-switch.
    if (String(info.state).toUpperCase() !== 'INACTIVE') return;
    const goneId = info.device?.deviceId || '';
    const currentId = audioEngine.getInputDeviceId();
    if (currentId && goneId && currentId !== goneId) return;
    try {
      const mics = await sdk.getMicrophones();
      const next = mics.find((d) => d.deviceId && d.deviceId !== goneId) || mics[0];
      if (!next?.deviceId) return;
      await this.localAudioTrack.setDevice(next.deviceId);
      audioEngine.setInputDeviceId(next.deviceId, next.label || '');
      const label = next.label || next.deviceId;
      console.log('[AgoraRTC] mic hot-swap', `label=${label.slice(0, 48)}`);
      this.onMicChangedCallbacks.forEach((cb) => cb(label));
    } catch (err) {
      console.warn('[AgoraRTC] mic hot-swap failed:', err);
    }
  }

  private async onPlaybackDeviceChanged(info: DeviceInfo): Promise<void> {
    if (String(info.state).toUpperCase() !== 'INACTIVE') return;
    const goneId = info.device?.deviceId || '';
    const currentId = audioEngine.getOutputDeviceId();
    if (currentId && goneId && currentId !== goneId) return;
    // Fall back to default output (empty id → browser default via setSinkId).
    audioEngine.setOutputDevice('');
    console.log('[AgoraRTC] playback device removed — fell back to default sink');
  }

  /** Settings › Audio input while in a room: setDevice on live mic track (no republish). */
  public async setMicrophoneDevice(deviceId: string): Promise<boolean> {
    // Never restart local capture — Agora owns the track (applyMicDevice / store path).
    audioEngine.storeInputDeviceId(deviceId);
    if (!this.localAudioTrack || !this.isJoined) return false;
    try {
      let id = deviceId;
      if (!id) {
        const sdk = await this.loadSdk();
        const mics = await sdk.getMicrophones();
        id = mics[0]?.deviceId || '';
      }
      if (!id) return false;
      await this.localAudioTrack.setDevice(id);
      await audioEngine.ensureInputDeviceLabel();
      const capture = micCaptureProfile(audioEngine.getInputDevice(), audioEngine.getAudioQuality());
      await this.applyLineInputConstraints(capture);
      if (capture.virtual) {
        const AgoraRTC = await this.loadSdk();
        await syncAiDenoiserOnTrack(AgoraRTC, this.localAudioTrack, true);
      }
      console.log('[AgoraRTC] setMicrophoneDevice', `idLen=${id.length}`);
      return true;
    } catch (err) {
      console.warn('[AgoraRTC] setMicrophoneDevice failed:', err);
      return false;
    }
  }

  public onMicrophoneChanged(cb: (label: string) => void): () => void {
    this.onMicChangedCallbacks.push(cb);
    return () => {
      this.onMicChangedCallbacks = this.onMicChangedCallbacks.filter((c) => c !== cb);
    };
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

  public getNetworkQualityTone(): 'good' | 'ok' | 'poor' | 'unknown' {
    return this.networkQuality.tone;
  }

  public getRtcStatsSnapshot(): typeof this.rtcStatsSnapshot {
    return this.rtcStatsSnapshot;
  }

  /** Call after a successful rejoin so backoff resets. */
  public resetRejoinAttempts(): void {
    this.rejoinAttempt = 0;
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
        this.emitRemotePresence();
      });

      this.client.on('user-left', (user: IAgoraRTCRemoteUser) => {
        this.remoteUserCount = Math.max(0, this.remoteUserCount - 1);
        console.log(`[AgoraRTC] user-left count=${this.remoteUserCount}`);
        audioEngine.removeRemoteTrack(user.uid);
        this.emitRemotePresence();
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
        this.applyConnectionPolicy(String(cur), String(reason || ''));
      });

      this.client.on('network-quality', (stats: { uplinkNetworkQuality?: number; downlinkNetworkQuality?: number }) => {
        const uplink = Number(stats?.uplinkNetworkQuality ?? 0);
        const downlink = Number(stats?.downlinkNetworkQuality ?? 0);
        const tone = networkQualityTone(uplink, downlink);
        this.networkQuality = { uplink, downlink, tone };
        this.onNetworkQualityCallbacks.forEach((cb) => cb(tone, uplink, downlink));
      });

      // Phase 24.3: token lifetime evidence + renew via join_channel (no invent refresh route).
      this.client.on('token-privilege-will-expire', () => {
        const mins = this.minutesSinceJoin();
        console.warn(`[AgoraRTC] token-privilege-will-expire afterMin=${mins ?? 'n/a'}`);
        void this.logAgora('agora_token', true, 'will-expire', `afterMin=${mins ?? 'n/a'}`);
        this.onNeedTokenCallbacks.forEach((cb) => cb('will-expire'));
      });
      this.client.on('token-privilege-did-expire', () => {
        const mins = this.minutesSinceJoin();
        console.warn(`[AgoraRTC] token-privilege-did-expire afterMin=${mins ?? 'n/a'}`);
        void this.logAgora('agora_token', false, 'did-expire', `afterMin=${mins ?? 'n/a'}`);
        this.onNeedTokenCallbacks.forEach((cb) => cb('did-expire'));
      });

      this.client.on('exception', (e: { code?: number; msg?: string; uid?: string | number }) => {
        this.lastExceptionCode = String(e?.code ?? '');
        const line = `[AgoraRTC] exception code=${String(e?.code ?? '')} msg=${String(e?.msg ?? '')} uid=${String(e?.uid ?? '')}`;
        if (agoraExceptionLogLevel(e?.code, audioEngine.getIsMuted()) === 'debug') console.debug(line);
        else console.warn(line);
        void this.logAgora(
          'agora_exception',
          false,
          'sdk',
          `code=${String(e?.code ?? '')};msg=${String(e?.msg ?? '').slice(0, 80)}`,
        );
      });

      // Fallback volume-indicator (SDK); rings prefer the 150 ms getVolumeLevel sampler.
      this.client.enableAudioVolumeIndicator();
      this.client.on('volume-indicator', (volumes) => {
        const mapped = volumes.map((v) => ({
          uid: v.uid,
          level: Math.min(1, v.level / 100),
        }));
        this.onSpeakerVolumeCallbacks.forEach((cb) => cb(mapped));
        if (!this.speakingSampleTimer) {
          this.applySpeakingLevels(mapped);
        }
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
    return this.exclusiveAgora(() => this.joinExclusive(channelName, token, uid, options));
  }

  private async joinExclusive(
    channelName: string,
    token: string,
    uid: number,
    options: AgoraJoinOptions,
  ): Promise<boolean> {
    const AgoraRTC = await this.loadSdk();
    const client = this.initClient(AgoraRTC);

    if (this.isJoined) {
      await this.leaveExclusive();
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
      this.rejoinAttempt = 0;
      this.joinedAtMs = Date.now();
      void audioEngine.ensureAudioContext();
      await this.syncRemoteUsers();
      this.startSpeakingSampler();
      this.emitAgoraJoined(true);
      this.emitRemotePresence();

      if (options.isSpeaker) {
        try {
          await this.publishBroadcast(options.quality);
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
        await this.leaveExclusive();
      } catch {
        // Leave is best-effort after a failed join.
      }
      return false;
    }
  }

  /** Ensure mic is open and published (unmute / retry). */
  public async ensurePublished(quality: AudioQuality): Promise<boolean> {
    if (!this.client || !this.isJoined || !this.isSpeaker) return false;
    if (this.localAudioTrack) return true;
    try {
      await this.publishBroadcast(quality);
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
    return this.exclusiveAgora(async () => {
      if (!this.client || !this.isJoined) return false;
      // Idempotent: PubNub role-sync and Accept can race; a second publish bans the UID.
      if (this.isSpeaker) {
        if (!this.localAudioTrack) {
          try {
            await this.publishBroadcast(audioEngine.getAudioQuality());
          } catch (err) {
            console.warn('[AgoraRTC] Promote republish failed:', err);
            return false;
          }
        }
        await this.setMuted(audioEngine.getIsMuted());
        return true;
      }
      try {
        await this.client.setClientRole('host');
        this.isSpeaker = true;
        await this.publishBroadcast(audioEngine.getAudioQuality());
        await this.setMuted(audioEngine.getIsMuted());
        return true;
      } catch (err) {
        console.warn('[AgoraRTC] Promote to speaker failed:', err);
        this.isSpeaker = false;
        return false;
      }
    });
  }

  public async demoteToAudience(): Promise<void> {
    if (!this.client || !this.isJoined) return;
    await this.unpublishLocal();
    // Drop adopted Agora mic from the local graph (track already closed above) — same as leave.
    audioEngine.stopMicrophone();
    await this.client.setClientRole('audience');
    this.isSpeaker = false;
  }

  /** Line-input open: processing flags from the capture profile, stereo only when virtual. */
  private async applyLineInputConstraints(capture: { virtual: boolean; echoCancellation: boolean; noiseSuppression: boolean; autoGainControl: boolean }): Promise<void> {
    if (!this.localAudioTrack) return;
    const audio: MediaTrackConstraints = {
      echoCancellation: capture.echoCancellation,
      noiseSuppression: capture.noiseSuppression,
      autoGainControl: capture.autoGainControl,
    };
    if (capture.virtual) audio.channelCount = 2;
    try {
      await this.localAudioTrack.getMediaStreamTrack().applyConstraints(audio);
    } catch {
      // Some virtual drivers reject channelCount. Create already requested AEC/ANS/AGC.
    }
  }

  public async republish(quality: AudioQuality): Promise<void> {
    if (!this.client || !this.isJoined || !this.isSpeaker) return;
    await this.unpublishLocal();
    await this.publishBroadcast(quality);
  }

  private async publishBroadcast(quality: AudioQuality): Promise<void> {
    if (!this.client) return;
    const AgoraRTC = await this.loadSdk();

    // Keep engine mute across publish. Accept/join-stage must start muted (RL-7);
    // syncVoiceEffectPublish / setMuted apply it to the Agora track after publish.
    // Clearing mute here was publishing live audio and racing UID_BANNED kicks.

    // Release Clubbox's getUserMedia so Windows can hand the device to Agora.
    // Custom/cloned MediaStreamTracks were joining + flipping mute badges but
    // remotes heard nothing (inbound still worked). createMicrophoneAudioTrack
    // is the SDK path native Clubhouse clients expect.
    audioEngine.stopMicrophone();
    audioEngine.ensureAudioContext();
    audioEngine.refreshBroadcastDestination();
    await audioEngine.ensureInputDeviceLabel();

    const profile = audioPublishProfile(quality);
    const capture = micCaptureProfile(audioEngine.getInputDevice(), quality);
    const micId = audioEngine.getInputDeviceId() || undefined;
    try {
      this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack({
        microphoneId: micId,
        encoderConfig: profile.encoder,
        AEC: capture.echoCancellation,
        ANS: capture.noiseSuppression,
        AGC: capture.autoGainControl,
      });
    } catch (firstErr) {
      if (!micId) throw firstErr;
      console.warn('[AgoraRTC] preferred mic failed — retrying default:', firstErr);
      this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack({
        encoderConfig: profile.encoder,
        AEC: capture.echoCancellation,
        ANS: capture.noiseSuppression,
        AGC: capture.autoGainControl,
      });
    }
    await audioEngine.ensureInputDeviceLabel();
    const opened = micCaptureProfile(audioEngine.getInputDevice(), quality);
    await this.applyLineInputConstraints(opened);

    // Feed Agora's live track into the local graph for VU / monitor / effects (no second capture).
    audioEngine.adoptMicrophoneTrack(this.localAudioTrack.getMediaStreamTrack());

    // Phase 24.7: AI denoiser pipe (no republish to toggle; music mode and a virtual mic force it off).
    await syncAiDenoiserOnTrack(AgoraRTC, this.localAudioTrack, !opened.aiDenoiser);

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
        encoderConfig: profile.encoder,
      });
      toPublish.push(this.extrasAudioTrack);
    } else {
      console.warn('[AgoraRTC] extras track unavailable — publishing mic only');
    }

    await this.client.publish(toPublish);
    const media = this.localAudioTrack.getMediaStreamTrack();
    console.log(
      '[AgoraRTC] published mic+extras',
      `quality=${profile.quality}`,
      `agc=${String(profile.agc)}`,
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
   * When a broadcast voice effect is applied, mute the dry mic so only the
   * processed voice on the extras track is sent. User mute still wins on the mic track.
   */
  public async syncVoiceEffectPublish(): Promise<void> {
    if (!this.localAudioTrack || !this.isSpeaker) return;
    await this.setMuted(audioEngine.getIsMuted());
    if (audioEngine.getBroadcastEffect() !== 'none') {
      console.log('[AgoraRTC] mic muted for voice effect (processed voice on extras)');
    }
  }

  /** Re-read mute after a soundboard pad, external input, or effect starts or stops. */
  public syncMuteSignal(): Promise<void> {
    return this.setMuted(audioEngine.getIsMuted());
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
    this.lastExtrasStatsLog = null;
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
      const snapshot: ExtrasStatsSnapshot = {
        vol: vol.toFixed(3),
        sendVol,
        bitrate,
        sending: this.extrasSending,
      };
      if (agoraDebugEnabled() && extrasStatsChanged(this.lastExtrasStatsLog, snapshot)) {
        this.lastExtrasStatsLog = snapshot;
        console.log(
          '[AgoraRTC] extras stats',
          `vol=${snapshot.vol}`,
          `sendVol=${snapshot.sendVol}`,
          `bitrate=${snapshot.bitrate}`,
          `sending=${snapshot.sending}`,
        );
      }
    } catch {
      this.extrasSending = this.extrasAudioTrack != null;
    }
  }

  /** Settings › Audio AI noise suppression (off by default). Live toggle without republish. */
  public async setAiNoiseSuppression(enabled: boolean): Promise<void> {
    setAiNoisePreference(enabled);
    if (!this.localAudioTrack || !this.isJoined) return;
    const AgoraRTC = await this.loadSdk();
    const capture = micCaptureProfile(audioEngine.getInputDevice(), audioEngine.getAudioQuality());
    await syncAiDenoiserOnTrack(AgoraRTC, this.localAudioTrack, !capture.aiDenoiser);
  }

  private async unpublishLocal(): Promise<void> {
    await detachAiDenoiser();
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
    return this.exclusiveAgora(() => this.leaveExclusive());
  }

  private async leaveExclusive(): Promise<void> {
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
    const wasJoined = this.isJoined;
    this.isJoined = false;
    this.isSpeaker = false;
    this.currentChannel = null;
    this.nativeMuteSignalling = false;
    this.lastMuteSignal = null;
    this.rejoinAttempt = 0;
    this.joinedAtMs = null;
    this.networkQuality = { uplink: 0, downlink: 0, tone: 'unknown' };
    this.rtcStatsSnapshot = null;
    this.stopSpeakingSampler();
    // Clear any rings still lit.
    const clear = [...this.speakingHold.entries()]
      .filter(([, e]) => e.speaking)
      .map(([uid]) => ({ uid, speaking: false }));
    this.speakingHold = new Map();
    if (clear.length) this.onSpeakingRingCallbacks.forEach((cb) => cb(clear));
    this.onReconnectUiCallbacks.forEach((cb) => cb(false));
    if (wasJoined) {
      this.emitAgoraJoined(false);
      this.emitRemotePresence();
    }
  }

  public setNativeMuteSignalling(enabled: boolean): void {
    this.nativeMuteSignalling = enabled;
  }

  public async setMuted(muted: boolean): Promise<void> {
    const effectOn = audioEngine.getBroadcastEffect() !== 'none';
    const micMuted = muted || effectOn;
    const extrasMuted = muted && audioEngine.isExtrasMixIdle();
    let touched = false;
    if (this.localAudioTrack) {
      touched = true;
      try {
        await this.localAudioTrack.setMuted(micMuted);
        console.log(
          `[AgoraRTC] local track muted=${micMuted}`,
          `userMuted=${muted}`,
          `effectOn=${effectOn}`,
          `nativeSignalling=${this.nativeMuteSignalling}`,
          `enabled=${this.localAudioTrack.getMediaStreamTrack().enabled}`,
        );
      } catch (err) {
        console.warn('[AgoraRTC] Track mute failed:', err);
      }
    }
    if (this.extrasAudioTrack) {
      touched = true;
      try {
        await this.extrasAudioTrack.setMuted(extrasMuted);
      } catch (err) {
        console.warn('[AgoraRTC] extras mute failed:', err);
      }
    }
    if (!touched) return;
    const prev = this.lastMuteSignal;
    if (!prev || prev.mic !== micMuted || prev.extras !== extrasMuted) {
      this.lastMuteSignal = { mic: micMuted, extras: extrasMuted };
      console.log(`[AgoraRTC] mute signal mic=${micMuted} extras=${extrasMuted}`);
    }
  }

  /** Clubhouse user_ids currently in the Agora channel as remotes. */
  public getRemoteUids(): number[] {
    if (!this.client) return [];
    const out: number[] = [];
    for (const user of this.client.remoteUsers) {
      const uid = Number(user.uid);
      if (Number.isFinite(uid) && uid > 0) out.push(uid);
    }
    return out;
  }

  private emitRemotePresence(): void {
    const uids = this.getRemoteUids();
    this.onRemotePresenceCallbacks.forEach((cb) => cb(uids));
  }

  private emitAgoraJoined(joined: boolean): void {
    this.onAgoraJoinedCallbacks.forEach((cb) => cb(joined));
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

  /** Diff-only speaking ring updates (threshold + 300 ms hold). */
  public onSpeakingRings(cb: (changes: { uid: string; speaking: boolean }[]) => void): () => void {
    this.onSpeakingRingCallbacks.push(cb);
    return () => {
      this.onSpeakingRingCallbacks = this.onSpeakingRingCallbacks.filter((c) => c !== cb);
    };
  }

  /** Pause ring sampling while the window is hidden (polling rule). */
  public setSpeakingSamplePaused(paused: boolean): void {
    this.speakingSamplePaused = paused;
    if (!paused && this.isJoined) this.startSpeakingSampler();
    if (paused) this.stopSpeakingSampler();
  }

  private startSpeakingSampler(): void {
    this.stopSpeakingSampler();
    if (!this.isJoined || this.speakingSamplePaused) return;
    this.speakingSampleTimer = setInterval(() => {
      this.sampleSpeakingLevels();
    }, SPEAKING_SAMPLE_MS);
    this.sampleSpeakingLevels();
  }

  private stopSpeakingSampler(): void {
    if (this.speakingSampleTimer) {
      clearInterval(this.speakingSampleTimer);
      this.speakingSampleTimer = null;
    }
  }

  private sampleSpeakingLevels(): void {
    if (!this.client || !this.isJoined || this.speakingSamplePaused) return;
    const levels: { uid: string; level: number }[] = [];
    for (const user of this.client.remoteUsers) {
      const track = user.audioTrack as IRemoteAudioTrack | undefined;
      if (!track) continue;
      try {
        levels.push({ uid: String(user.uid), level: track.getVolumeLevel() });
      } catch {
        // Track may be closing.
      }
    }
    if (this.localAudioTrack && this.isSpeaker) {
      try {
        levels.push({ uid: 'local', level: this.localAudioTrack.getVolumeLevel() });
      } catch {
        // ignore
      }
    }
    this.applySpeakingLevels(levels);
  }

  private applySpeakingLevels(levels: { uid: string | number; level: number }[]): void {
    const normalized = levels.map((row) => ({ uid: String(row.uid), level: row.level }));
    const { next, changed } = nextSpeakingHold(this.speakingHold, normalized, performance.now());
    this.speakingHold = next;
    if (changed.length) {
      this.onSpeakingRingCallbacks.forEach((cb) => cb(changed));
    }
  }

  public onRemoteMute(cb: (report: RemoteMuteReport) => void): () => void {
    this.onRemoteMuteCallbacks.push(cb);
    return () => {
      this.onRemoteMuteCallbacks = this.onRemoteMuteCallbacks.filter((c) => c !== cb);
    };
  }

  /** Agora remote uid set changed (join/leave/sync). uids are Clubhouse user_ids. */
  public onRemotePresence(cb: (uids: number[]) => void): () => void {
    this.onRemotePresenceCallbacks.push(cb);
    return () => {
      this.onRemotePresenceCallbacks = this.onRemotePresenceCallbacks.filter((c) => c !== cb);
    };
  }

  /** Local Agora channel joined/left — starts the 10s not-connected overlay clock. */
  public onAgoraJoined(cb: (joined: boolean) => void): () => void {
    this.onAgoraJoinedCallbacks.push(cb);
    return () => {
      this.onAgoraJoinedCallbacks = this.onAgoraJoinedCallbacks.filter((c) => c !== cb);
    };
  }

  public onConnectionProblem(cb: (reason: string) => void): () => void {
    this.onConnectionProblemCallbacks.push(cb);
    return () => {
      this.onConnectionProblemCallbacks = this.onConnectionProblemCallbacks.filter((c) => c !== cb);
    };
  }

  public onReconnectUi(cb: (reconnecting: boolean) => void): () => void {
    this.onReconnectUiCallbacks.push(cb);
    return () => {
      this.onReconnectUiCallbacks = this.onReconnectUiCallbacks.filter((c) => c !== cb);
    };
  }

  public onBanned(cb: (reason: string) => void): () => void {
    this.onBannedCallbacks.push(cb);
    return () => {
      this.onBannedCallbacks = this.onBannedCallbacks.filter((c) => c !== cb);
    };
  }

  public onNeedRejoin(cb: (delayMs: number, attempt: number) => void): () => void {
    this.onNeedRejoinCallbacks.push(cb);
    return () => {
      this.onNeedRejoinCallbacks = this.onNeedRejoinCallbacks.filter((c) => c !== cb);
    };
  }

  public onNeedToken(cb: (kind: 'will-expire' | 'did-expire') => void): () => void {
    this.onNeedTokenCallbacks.push(cb);
    return () => {
      this.onNeedTokenCallbacks = this.onNeedTokenCallbacks.filter((c) => c !== cb);
    };
  }

  /** Apply a fresh RTC token without leaving the channel (Phase 24.3). */
  public async renewToken(token: string): Promise<boolean> {
    if (!this.client || !this.isJoined || !token) return false;
    try {
      await this.client.renewToken(token);
      console.log('[AgoraRTC] renewToken ok', `tokenLen=${token.length}`);
      void this.logAgora('agora_token', true, 'renew', `tokenLen=${token.length}`);
      return true;
    } catch (err) {
      console.warn('[AgoraRTC] renewToken failed:', this.formatAgoraError(err));
      void this.logAgora('agora_token', false, 'renew', formatVoiceFailureReason(err));
      return false;
    }
  }

  private minutesSinceJoin(): number | null {
    if (this.joinedAtMs == null) return null;
    return Math.round((Date.now() - this.joinedAtMs) / 60_000);
  }

  public onNetworkQuality(cb: (tone: 'good' | 'ok' | 'poor' | 'unknown', uplink: number, downlink: number) => void): () => void {
    this.onNetworkQualityCallbacks.push(cb);
    return () => {
      this.onNetworkQualityCallbacks = this.onNetworkQualityCallbacks.filter((c) => c !== cb);
    };
  }

  private applyConnectionPolicy(state: string, reason: string): void {
    if (!this.isJoined && state !== 'CONNECTED') {
      // Pre-join failures still surface via join() catch; mid-join RECONNECTING is fine to ignore.
      if (state !== 'RECONNECTING') return;
    }
    const action = agoraConnectionPolicy({
      state,
      reason,
      rejoinAttempt: this.rejoinAttempt,
    });
    switch (action.type) {
      case 'show-reconnecting':
        this.onReconnectUiCallbacks.forEach((cb) => cb(true));
        break;
      case 'clear-reconnecting':
        this.rejoinAttempt = 0;
        this.onReconnectUiCallbacks.forEach((cb) => cb(false));
        break;
      case 'leave-banned':
        this.onBannedCallbacks.forEach((cb) => cb(action.reason));
        this.onConnectionProblemCallbacks.forEach((cb) => cb(action.reason));
        break;
      case 'schedule-rejoin':
        this.rejoinAttempt = action.attempt;
        this.onReconnectUiCallbacks.forEach((cb) => cb(true));
        this.onNeedRejoinCallbacks.forEach((cb) => cb(action.delayMs, action.attempt));
        break;
      case 'none':
        if (
          (state === 'DISCONNECTED' || state === 'FAILED')
          && reason
          && !/LEAVE|UID_BANNED|CHANNEL_BANNED/i.test(reason)
          && this.rejoinAttempt >= 3
        ) {
          this.onConnectionProblemCallbacks.forEach((cb) => cb(reason || state));
        }
        break;
    }
  }

  /** Refresh RTC stats for Settings › Connection status (caller enforces poll cadence). */
  public refreshRtcStats(): void {
    if (!this.client || !this.isJoined) {
      this.rtcStatsSnapshot = null;
      return;
    }
    try {
      const rtc = this.client.getRTCStats() as {
        RTT?: number;
        OutgoingAvailableBandwidth?: number;
        Duration?: number;
        RecvBitrate?: number;
        SendBitrate?: number;
      };
      const remote = this.client.getRemoteAudioStats() as Record<
        string,
        { receivePacketsLost?: number; end2EndDelay?: number; packetLossRate?: number }
      >;
      const remotes = Object.entries(remote || {}).map(([uid, row]) => ({
        uid,
        packetLoss: Number(row?.packetLossRate ?? row?.receivePacketsLost ?? 0),
        e2eDelay: Number(row?.end2EndDelay ?? 0),
      }));
      this.rtcStatsSnapshot = {
        rtt: Number(rtc?.RTT ?? 0),
        sendBitrate: Number(rtc?.SendBitrate ?? 0),
        recvBitrate: Number(rtc?.RecvBitrate ?? 0),
        duration: Number(rtc?.Duration ?? 0),
        remotes,
      };
    } catch {
      // Stats unavailable until fully connected.
    }
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
