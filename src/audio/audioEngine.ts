import type { SoundEffectItem } from '../api/types';
import { createVoiceEffectChain, panForUid, type EffectChain } from './effectChain';
import { externalInputConstraints, SYSTEM_AUDIO_DEVICE_ID } from './externalConstraints';
import {
  DEFAULT_DUCK_DB,
  initialDuckState,
  stepDuckEnvelope,
  VOICE_DUCK_THRESHOLD,
  type DuckEnvelopeState,
} from './externalDuck';
import { planExternalRouting } from './externalRouting';
import { deleteStoredSound, PAD_HOTKEYS, readStoredSounds, writeStoredSound, type StoredSound } from './soundLibrary';
import {
  applyEffect,
  defaultVoiceEffectState,
  monitorUsesEffect,
  pickEffect,
  startPreview,
  type VoiceEffectId,
  type VoiceEffectState,
} from './voiceEffects';
import { encodeStereoWav } from './wav';

type RemoteAudioNodes = {
  source: MediaStreamAudioSourceNode;
  gain: GainNode;
  panner: StereoPannerNode | null;
};

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micGain: GainNode | null = null;
  private monitorGain: GainNode | null = null;
  private soundpadGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private broadcastDest: MediaStreamAudioDestinationNode | null = null;
  /** Soundboard + external only (no mic) — second Agora publish track (Phase 24.1). */
  private extrasDest: MediaStreamAudioDestinationNode | null = null;
  private recorderDest: MediaStreamAudioDestinationNode | null = null;
  private recordMix: GainNode | null = null;
  private externalStream: MediaStream | null = null;
  private externalSource: MediaStreamAudioSourceNode | null = null;
  private externalGain: GainNode | null = null;
  private externalAnalyser: AnalyserNode | null = null;
  private externalDeviceId = '';
  private externalVolume = 0.8;
  private externalMuted = false;
  private externalMonitor = false;
  private externalDuckEnabled = true;
  private externalDuckDb = DEFAULT_DUCK_DB;
  private externalDuckState: DuckEnvelopeState = initialDuckState();
  private externalLevel = 0;
  /** Last constraints / capture mode used for the external channel (tests / diagnostics). */
  public lastExternalConstraints: MediaTrackConstraints | null = null;
  public lastExternalCapture: 'device' | 'system' | null = null;
  private broadcastEffect: EffectChain | null = null;
  private monitorEffect: EffectChain | null = null;
  private clipNode: AudioWorkletNode | null = null;
  private clipReady: Promise<boolean> | null = null;
  private clipArmed = false;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private remoteNodes = new Map<string, RemoteAudioNodes>();
  private roomHeard = true;
  private voiceNote: AudioBufferSourceNode | null = null;
  private voiceEffects: VoiceEffectState = defaultVoiceEffectState();
  private spatialAudioEnabled = false;

  private inputDeviceId = '';
  /** When true, mic MediaStreamTrack is owned by Agora — do not stop() it on release. */
  private micOwnedExternally = false;
  private outputDeviceId = '';
  private remoteVolumes = new Map<string, number>();
  private isMuted: boolean = true;
  private isMusicMode: boolean = false;
  private monitorEnabled: boolean = false;
  private isRecording: boolean = false;
  private simulateMeterOnFailure = false;
  private soundpadVolume: number = 0.8;
  private soundpadVolumeBeforeDuck: number | null = null;
  private micVolume: number = 1.0;
  /** Last getUserMedia audio constraints applied when opening the mic (for tests / diagnostics). */
  public lastMicConstraints: MediaTrackConstraints | null = null;

  private onVolumeChangeCallbacks: ((level: number) => void)[] = [];
  private onRecordingStateCallbacks: ((isRecording: boolean, blobUrl?: string) => void)[] = [];
  private animationFrameId: number | null = null;
  private micStartPromise: Promise<boolean> | null = null;
  private activeVoices = new Set<AudioScheduledSourceNode>();
  /** Non-local soundboard voices still playing into the extras mix. */
  private broadcastPads = 0;
  private trackingBroadcast = false;
  private extrasActivityListener: (() => void) | null = null;

  public soundEffects: SoundEffectItem[] = [
    { id: 'fx-applause', name: 'Applause', hotkey: '1', icon: '👏', type: 'synth', synthType: 'applause' },
    { id: 'fx-airhorn', name: 'Airhorn', hotkey: '2', icon: '📢', type: 'synth', synthType: 'airhorn' },
    { id: 'fx-rimshot', name: 'Rimshot', hotkey: '3', icon: '🥁', type: 'synth', synthType: 'rimshot' },
    { id: 'fx-bell', name: 'Bell Ding', hotkey: '4', icon: '🔔', type: 'synth', synthType: 'bell' },
    { id: 'fx-laugh', name: 'Laugh Track', hotkey: '5', icon: '😂', type: 'synth', synthType: 'laugh' },
    { id: 'fx-laser', name: 'Sci-Fi Zap', hotkey: '6', icon: '⚡', type: 'synth', synthType: 'laser' },
  ];

  constructor() {
    // AudioContext will be initialized on user interaction
  }

  private initContextIfNeeded(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      // 48 kHz matches Agora music profiles and extras custom-track encode.
      this.ctx = new AudioCtx({ latencyHint: 'interactive', sampleRate: 48000 });

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1.0;

      this.soundpadGain = this.ctx.createGain();
      this.soundpadGain.gain.value = this.soundpadVolume;

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.4;

      this.broadcastDest = this.ctx.createMediaStreamDestination();
      this.extrasDest = this.ctx.createMediaStreamDestination();
      this.recorderDest = this.ctx.createMediaStreamDestination();
      this.recordMix = this.ctx.createGain();
      this.recordMix.gain.value = 1;
      this.recordMix.connect(this.recorderDest);

      // Local speakers hear the soundpad. Extras bus → Agora custom track (no mic).
      this.soundpadGain.connect(this.masterGain);
      this.soundpadGain.connect(this.broadcastDest);
      this.soundpadGain.connect(this.extrasDest);
      this.soundpadGain.connect(this.recordMix);
      this.masterGain.connect(this.ctx.destination);
      this.startClipBuffer();
      if (this.outputDeviceId) void this.applyOutputSink();
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch((err) => {
        console.warn('[Clubbox] AudioContext.resume failed:', err);
      });
    }

    return this.ctx;
  }

  /** Ensure the Web Audio graph exists and is running (room hear / publish). */
  public ensureAudioContext(): AudioContext {
    return this.initContextIfNeeded();
  }

  public startMicrophone(): Promise<boolean> {
    if (this.micStartPromise) return this.micStartPromise;
    return this.trackMicrophoneStart(this.openMicrophone());
  }

  public restartMicrophone(): Promise<boolean> {
    const previous = this.micStartPromise ?? Promise.resolve(false);
    return this.trackMicrophoneStart(previous.then(() => this.openMicrophone(), () => this.openMicrophone()));
  }

  public ensureMicrophone(): Promise<boolean> {
    const live = this.micStream?.getAudioTracks().some((track) => track.readyState === 'live') ?? false;
    if (live) return Promise.resolve(true);
    return this.startMicrophone();
  }

  private trackMicrophoneStart(run: Promise<boolean>): Promise<boolean> {
    const tracked = run.finally(() => {
      if (this.micStartPromise === tracked) this.micStartPromise = null;
    });
    this.micStartPromise = tracked;
    return tracked;
  }

  private micConstraintBase(): MediaTrackConstraints {
    return this.isMusicMode
      ? {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
        }
      : {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        };
  }

  /** Last mic open failure — 'system' = OS privacy block (Windows/macOS). */
  public lastMicError: 'system' | 'device' | 'unknown' | null = null;

  private classifyMicError(err: unknown): 'system' | 'device' | 'unknown' {
    const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '';
    const message = err instanceof Error ? err.message : String(err || '');
    if (/Permission denied by system|NotAllowedError|Permission denied/i.test(`${name} ${message}`)) {
      if (/by system/i.test(message) || /denied by system/i.test(message)) return 'system';
      // Chromium often uses NotAllowedError for both prompt dismiss and OS block.
      if (/system/i.test(message)) return 'system';
      return 'system';
    }
    if (/OverconstrainedError|NotFoundError|DevicesNotFound|Could not start audio/i.test(`${name} ${message}`)) {
      return 'device';
    }
    return 'unknown';
  }

  private async openMicrophone(): Promise<boolean> {
    this.lastMicError = null;
    try {
      const ctx = this.initContextIfNeeded();
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume();
        } catch {
          // User-gesture may still be required on some paths.
        }
      }

      const tryConstraints = async (audio: MediaTrackConstraints): Promise<MediaStream> => {
        this.lastMicConstraints = { ...audio };
        this.releaseMicrophoneGraph();
        return navigator.mediaDevices.getUserMedia({ audio });
      };

      const preferred = this.micConstraintBase();
      if (this.inputDeviceId) preferred.deviceId = { ideal: this.inputDeviceId };

      try {
        this.micStream = await tryConstraints(preferred);
      } catch (firstErr: unknown) {
        const kind = this.classifyMicError(firstErr);
        // OS privacy denial will fail again without a deviceId — do not double-prompt.
        if (kind === 'system' || !this.inputDeviceId) {
          throw firstErr;
        }
        // Stale / exclusive device — retry with the OS default input.
        console.warn(
          '[Clubbox] mic open failed with preferred device — retrying default:',
          firstErr instanceof Error ? firstErr.message : firstErr,
        );
        this.micStream = await tryConstraints(this.micConstraintBase());
      }

      this.micSource = ctx.createMediaStreamSource(this.micStream);

      this.micGain = ctx.createGain();
      this.micGain.gain.value = this.isMuted ? 0 : this.micVolume;
      this.micSource.connect(this.micGain);

      this.monitorGain = ctx.createGain();
      this.monitorGain.gain.value = 1;
      this.wireMicEffects();

      this.startMeterLoop();
      const liveTracks = this.micStream?.getAudioTracks().filter((track) => track.readyState === 'live').length ?? 0;
      console.log('[Clubbox] mic tracks', liveTracks, 'muted=', this.isMuted);
      return true;
    } catch (err: unknown) {
      this.lastMicError = this.classifyMicError(err);
      console.warn(
        '[Clubbox] Microphone access not granted or unavailable:',
        err instanceof Error ? err.message : err,
        `kind=${this.lastMicError}`,
      );
      if (this.simulateMeterOnFailure) {
        this.startSimulatedMeterLoop();
      } else {
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
        this.onVolumeChangeCallbacks.forEach((cb) => cb(0));
      }
      return false;
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.micGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.micGain.gain.cancelScheduledValues(now);
      this.micGain.gain.setValueAtTime(this.micGain.gain.value, now);
      this.micGain.gain.setTargetAtTime(this.isMuted ? 0 : this.micVolume, now, 0.015);
    }
    return this.isMuted;
  }

  public setSimulateMeterOnFailure(enabled: boolean): void {
    this.simulateMeterOnFailure = enabled;
  }

  public stopMicrophone(): void {
    this.releaseMicrophoneGraph();
    if (!this.externalStream) {
      if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
      this.onVolumeChangeCallbacks.forEach((cb) => cb(0));
    }
  }

  /**
   * Wire an externally owned mic track (Agora createMicrophoneAudioTrack) into
   * the local VU/monitor graph without a second getUserMedia capture.
   */
  public adoptMicrophoneTrack(track: MediaStreamTrack): void {
    const ctx = this.initContextIfNeeded();
    this.releaseMicrophoneGraph();
    this.micOwnedExternally = true;
    this.micStream = new MediaStream([track]);
    this.micSource = ctx.createMediaStreamSource(this.micStream);
    this.micGain = ctx.createGain();
    this.micGain.gain.value = this.isMuted ? 0 : this.micVolume;
    this.micSource.connect(this.micGain);
    this.monitorGain = ctx.createGain();
    this.monitorGain.gain.value = 1;
    this.wireMicEffects();
    this.startMeterLoop();
    console.log('[Clubbox] adopted Agora mic track muted=', this.isMuted);
  }

  public setMuted(muted: boolean): void {
    if (this.isMuted !== muted) {
      this.toggleMute();
    }
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public async toggleMusicMode(): Promise<boolean> {
    this.isMusicMode = !this.isMusicMode;
    await this.restartMicrophone();
    return this.isMusicMode;
  }

  public getIsMusicMode(): boolean {
    return this.isMusicMode;
  }

  public setMonitorEnabled(enabled: boolean): void {
    this.monitorEnabled = enabled;
    if (!this.monitorGain || !this.masterGain) return;

    this.safeDisconnect(this.monitorGain);
    if (enabled) {
      this.monitorGain.connect(this.masterGain);
    }
  }

  public getMonitorEnabled(): boolean {
    return this.monitorEnabled;
  }

  /**
   * Live mix of mic + soundpad (local record / meters). Prefer createMicrophoneAudioTrack
   * + getBroadcastExtrasTrack() for Agora publish (Phase 24.1).
   */
  public getBroadcastTrack(): MediaStreamTrack | null {
    if (!this.broadcastDest) {
      this.initContextIfNeeded();
    }
    const track = this.broadcastDest?.stream.getAudioTracks()[0] ?? null;
    if (track && !track.enabled) track.enabled = true;
    return track;
  }

  /**
   * Soundboard + external input only (no mic). Clone before handing to
   * AgoraRTC.createCustomAudioTrack as the second published track.
   */
  public getBroadcastExtrasTrack(): MediaStreamTrack | null {
    if (!this.extrasDest) {
      this.initContextIfNeeded();
    }
    const track = this.extrasDest?.stream.getAudioTracks()[0] ?? null;
    if (track && !track.enabled) track.enabled = true;
    return track;
  }

  /** Raw getUserMedia mic track for Agora publish (clone before handing to SDK). */
  public getMicrophoneMediaTrack(): MediaStreamTrack | null {
    const track = this.micStream?.getAudioTracks().find((t) => t.readyState === 'live') ?? null;
    if (track && !track.enabled) track.enabled = true;
    return track;
  }

  /**
   * Agora may stop destination tracks on close(). Rebuild send buses and
   * rewire mic/soundpad/external so the next publish has live tracks.
   */
  public refreshBroadcastDestination(): void {
    if (!this.ctx) return;
    const mixLive = this.broadcastDest?.stream.getAudioTracks().some((t) => t.readyState === 'live');
    const extrasLive = this.extrasDest?.stream.getAudioTracks().some((t) => t.readyState === 'live');
    if (mixLive && extrasLive && this.broadcastDest && this.extrasDest) return;

    try {
      this.soundpadGain?.disconnect(this.broadcastDest!);
    } catch {
      // not connected
    }
    try {
      this.soundpadGain?.disconnect(this.extrasDest!);
    } catch {
      // not connected
    }
    this.broadcastDest = this.ctx.createMediaStreamDestination();
    this.extrasDest = this.ctx.createMediaStreamDestination();
    if (this.soundpadGain) {
      this.soundpadGain.connect(this.broadcastDest);
      this.soundpadGain.connect(this.extrasDest);
    }
    if (this.micGain) this.wireMicEffects();
    if (this.externalSource) this.wireExternalGraph();
    console.log('[Clubbox] broadcast destination refreshed');
  }

  public addRemoteTrack(uid: string | number, track: MediaStreamTrack): void {
    const key = String(uid);
    this.removeRemoteTrack(key);

    const ctx = this.initContextIfNeeded();
    const source = ctx.createMediaStreamSource(new MediaStream([track]));
    const gain = ctx.createGain();
    gain.gain.value = this.heardGain(key);
    source.connect(gain);
    // Recording stays unpanned; local speakers may get spatial pan (RL-11).
    gain.connect(this.recordMix!);
    let panner: StereoPannerNode | null = null;
    if (this.spatialAudioEnabled && typeof ctx.createStereoPanner === 'function') {
      panner = ctx.createStereoPanner();
      panner.pan.value = panForUid(key);
      gain.connect(panner);
      panner.connect(this.masterGain!);
    } else {
      gain.connect(this.masterGain!);
    }
    this.remoteNodes.set(key, { source, gain, panner });
  }

  public removeRemoteTrack(uid: string | number): void {
    const key = String(uid);
    const nodes = this.remoteNodes.get(key);
    if (!nodes) return;
    this.safeDisconnect(nodes.source);
    this.safeDisconnect(nodes.gain);
    this.safeDisconnect(nodes.panner);
    this.remoteNodes.delete(key);
  }

  public clearRemoteTracks(): void {
    for (const uid of [...this.remoteNodes.keys()]) {
      this.removeRemoteTrack(uid);
    }
  }

  public setMicVolume(volume: number): void {
    this.micVolume = Math.max(0, Math.min(1, volume));
    if (!this.micGain || !this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    this.micGain.gain.cancelScheduledValues(now);
    this.micGain.gain.setValueAtTime(this.micGain.gain.value, now);
    this.micGain.gain.setTargetAtTime(this.micVolume, now, 0.015);
  }

  public getMicVolume(): number {
    return this.micVolume;
  }

  public getInputDeviceId(): string {
    return this.inputDeviceId;
  }

  public setInputDeviceId(deviceId: string): void {
    this.inputDeviceId = deviceId;
    const live = this.micStream?.getAudioTracks().some((track) => track.readyState === 'live') ?? false;
    if (live) void this.restartMicrophone();
  }

  public canSelectOutput(): boolean {
    return typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype;
  }

  public getOutputDeviceId(): string {
    return this.outputDeviceId;
  }

  public setOutputDevice(deviceId: string): void {
    this.outputDeviceId = deviceId;
    if (this.ctx) void this.applyOutputSink();
  }

  private async applyOutputSink(): Promise<void> {
    if (!this.ctx || !this.canSelectOutput()) return;
    const sink = (this.ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> }).setSinkId;
    if (!sink) return;
    try {
      await sink.call(this.ctx, this.outputDeviceId);
    } catch {
      // The chosen output can disappear between the list and the switch.
    }
  }

  public getRemoteVolume(uid: string | number): number {
    return this.remoteVolumes.get(String(uid)) ?? 1;
  }

  public setRemoteVolume(uid: string | number, volume: number): void {
    const vol = Math.max(0, Math.min(1, volume));
    const key = String(uid);
    this.remoteVolumes.set(key, vol);
    const nodes = this.remoteNodes.get(key);
    if (!nodes || !this.ctx) return;
    nodes.gain.gain.setTargetAtTime(this.heardGain(key), this.ctx.currentTime, 0.02);
  }

  public setRoomHeard(heard: boolean): void {
    this.roomHeard = heard;
    if (!this.ctx) return;
    for (const [key, nodes] of this.remoteNodes) {
      nodes.gain.gain.setTargetAtTime(this.heardGain(key), this.ctx.currentTime, 0.02);
    }
  }

  public isRoomHeard(): boolean {
    return this.roomHeard;
  }

  public playVoiceNote(rate: number): void {
    this.stopVoiceNote();
    const ctx = this.initContextIfNeeded();
    const seconds = 0.7;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      const time = i / ctx.sampleRate;
      data[i] = Math.sin(2 * Math.PI * 220 * time) * Math.exp(-2.2 * time) * 0.35;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate === 1.5 || rate === 2 ? rate : 1;
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    source.connect(gain);
    gain.connect(this.masterGain!);
    source.start();
    this.voiceNote = source;
    source.onended = () => {
      if (this.voiceNote === source) this.voiceNote = null;
    };
  }

  public stopVoiceNote(): void {
    const note = this.voiceNote;
    this.voiceNote = null;
    if (!note) return;
    try {
      note.stop();
    } catch {
      // Already stopped.
    }
  }

  private heardGain(key: string): number {
    return this.roomHeard ? this.getRemoteVolume(key) : 0;
  }

  private releaseMicrophoneGraph(): void {
    if (this.micStream) {
      if (!this.micOwnedExternally) {
        this.micStream.getTracks().forEach((track) => track.stop());
      }
      this.micStream = null;
    }
    this.micOwnedExternally = false;
    this.disposeMicEffects();
    this.safeDisconnect(this.micSource);
    this.safeDisconnect(this.micGain);
    this.safeDisconnect(this.monitorGain);
    this.micSource = null;
    this.micGain = null;
    this.monitorGain = null;
  }

  private disposeMicEffects(): void {
    this.broadcastEffect?.dispose();
    this.monitorEffect?.dispose();
    this.broadcastEffect = null;
    this.monitorEffect = null;
  }

  /**
   * Mic → applied effect → send/record/meter; mic → monitor effect → headphones when enabled.
   * When a broadcast effect is applied, also feed extrasDest so Agora's custom track carries
   * the processed voice (mic SDK track is muted separately — see agoraVoice.syncVoiceEffectPublish).
   */
  private wireMicEffects(): void {
    if (!this.ctx || !this.micGain || !this.monitorGain || !this.analyser || !this.broadcastDest || !this.extrasDest || !this.recordMix) {
      return;
    }
    this.disposeMicEffects();
    this.safeDisconnect(this.micGain);
    this.safeDisconnect(this.monitorGain);

    const broadcastId = this.voiceEffects.applied;
    const monitorId = monitorUsesEffect(this.voiceEffects);
    this.broadcastEffect = createVoiceEffectChain(this.ctx, broadcastId);
    this.monitorEffect = createVoiceEffectChain(this.ctx, monitorId);

    this.micGain.connect(this.broadcastEffect.input);
    this.broadcastEffect.output.connect(this.analyser);
    this.broadcastEffect.output.connect(this.broadcastDest);
    this.broadcastEffect.output.connect(this.recordMix);
    // Effected voice rides the extras custom track (createMicrophoneAudioTrack has no Clubbox FX).
    if (broadcastId !== 'none') {
      this.broadcastEffect.output.connect(this.extrasDest);
    }

    this.micGain.connect(this.monitorEffect.input);
    this.monitorEffect.output.connect(this.monitorGain);
    if (this.monitorEnabled && this.masterGain) {
      this.monitorGain.connect(this.masterGain);
    }
  }

  public pickVoiceEffect(effect: VoiceEffectId): void {
    this.voiceEffects = pickEffect(this.voiceEffects, effect);
    if (this.micGain) this.wireMicEffects();
  }

  public previewVoiceEffect(): void {
    this.voiceEffects = startPreview(this.voiceEffects);
    if (this.micGain) this.wireMicEffects();
  }

  public applyVoiceEffect(): void {
    this.voiceEffects = applyEffect(this.voiceEffects);
    if (this.micGain) this.wireMicEffects();
    this.notifyExtrasActivity();
  }

  /** Restore a previously applied effect (e.g. from audioPrefs) without preview. */
  public restoreAppliedVoiceEffect(effect: VoiceEffectId): void {
    this.voiceEffects = { selected: effect, applied: effect, previewActive: false };
    if (this.micGain) this.wireMicEffects();
    this.notifyExtrasActivity();
  }

  public getVoiceEffectState(): VoiceEffectState {
    return { ...this.voiceEffects };
  }

  public getMonitorEffect(): VoiceEffectId {
    return monitorUsesEffect(this.voiceEffects);
  }

  public getBroadcastEffect(): VoiceEffectId {
    return this.voiceEffects.applied;
  }

  public setSpatialAudioEnabled(enabled: boolean): void {
    if (this.spatialAudioEnabled === enabled) return;
    this.spatialAudioEnabled = enabled;
    const snapshot = [...this.remoteNodes.entries()].map(([uid, nodes]) => {
      const tracks = nodes.source.mediaStream.getAudioTracks();
      return { uid, track: tracks[0] };
    });
    for (const { uid, track } of snapshot) {
      if (track) this.addRemoteTrack(uid, track);
    }
  }

  public getSpatialAudioEnabled(): boolean {
    return this.spatialAudioEnabled;
  }

  private safeDisconnect(node: AudioNode | null): void {
    if (!node) return;
    try {
      node.disconnect();
    } catch {
      // Already disconnected.
    }
  }

  public setSoundpadVolume(vol: number): void {
    this.soundpadVolume = Math.max(0, Math.min(1, vol));
    if (this.soundpadVolumeBeforeDuck == null && this.soundpadGain && this.ctx) {
      this.soundpadGain.gain.setTargetAtTime(this.soundpadVolume, this.ctx.currentTime, 0.02);
    }
  }

  public getSoundpadVolume(): number {
    if (this.soundpadVolumeBeforeDuck != null) return 0;
    return this.soundpadVolume;
  }

  /** Hold to mute the soundboard bus; release restores the previous level. */
  public setDuckHeld(held: boolean): void {
    if (held) {
      if (this.soundpadVolumeBeforeDuck == null) this.soundpadVolumeBeforeDuck = this.soundpadVolume;
      if (this.soundpadGain && this.ctx) {
        this.soundpadGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
      }
      return;
    }
    if (this.soundpadVolumeBeforeDuck == null) return;
    const restored = this.soundpadVolumeBeforeDuck;
    this.soundpadVolumeBeforeDuck = null;
    this.soundpadVolume = restored;
    if (this.soundpadGain && this.ctx) {
      this.soundpadGain.gain.setTargetAtTime(restored, this.ctx.currentTime, 0.02);
    }
  }

  public onVolumeLevel(cb: (level: number) => void): () => void {
    this.onVolumeChangeCallbacks.push(cb);
    return () => {
      this.onVolumeChangeCallbacks = this.onVolumeChangeCallbacks.filter((c) => c !== cb);
    };
  }

  private startMeterLoop(): void {
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);

    const dataArray = new Uint8Array(this.analyser?.frequencyBinCount || 128);
    const externalData = new Uint8Array(this.externalAnalyser?.frequencyBinCount || 128);

    const update = () => {
      let micLevel = 0;
      if (this.analyser && !this.isMuted) {
        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        micLevel = Math.min(1, avg / 128);
        this.onVolumeChangeCallbacks.forEach((cb) => cb(micLevel));
      } else {
        this.onVolumeChangeCallbacks.forEach((cb) => cb(0));
      }
      if (this.externalAnalyser) {
        this.externalAnalyser.getByteFrequencyData(externalData);
        let sum = 0;
        for (let i = 0; i < externalData.length; i++) sum += externalData[i];
        this.externalLevel = Math.min(1, (sum / externalData.length) / 128);
      } else {
        this.externalLevel = 0;
      }
      this.tickExternalDuck(micLevel);
      this.animationFrameId = requestAnimationFrame(update);
    };

    this.animationFrameId = requestAnimationFrame(update);
  }

  private startSimulatedMeterLoop(): void {
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);

    let simVol = 0;
    const update = () => {
      let micLevel = 0;
      if (!this.isMuted) {
        // Natural speech modulation simulation
        const target = Math.random() > 0.3 ? 0.3 + Math.random() * 0.6 : 0.05;
        simVol += (target - simVol) * 0.2;
        micLevel = simVol;
        this.onVolumeChangeCallbacks.forEach((cb) => cb(simVol));
      } else {
        this.onVolumeChangeCallbacks.forEach((cb) => cb(0));
      }
      this.tickExternalDuck(micLevel);
      this.animationFrameId = requestAnimationFrame(update);
    };

    this.animationFrameId = requestAnimationFrame(update);
  }

  private tickExternalDuck(micLevel: number): void {
    if (!this.externalGain || !this.ctx) return;
    const speaking = this.externalDuckEnabled && !this.isMuted && micLevel >= VOICE_DUCK_THRESHOLD;
    this.externalDuckState = stepDuckEnvelope(
      this.externalDuckState,
      performance.now(),
      speaking,
      this.externalDuckDb,
    );
    this.applyExternalGain();
  }

  private applyExternalGain(): void {
    if (!this.externalGain || !this.ctx) return;
    const plan = planExternalRouting({
      active: !!this.externalStream,
      muted: this.externalMuted,
      monitor: this.externalMonitor,
      volume: this.externalVolume,
    });
    const gain = plan.openGain * this.externalDuckState.multiplier;
    const now = this.ctx.currentTime;
    this.externalGain.gain.cancelScheduledValues(now);
    this.externalGain.gain.setValueAtTime(this.externalGain.gain.value, now);
    this.externalGain.gain.setTargetAtTime(gain, now, 0.01);
  }

  private wireExternalGraph(): void {
    if (!this.ctx || !this.externalSource || !this.broadcastDest || !this.extrasDest || !this.recordMix || !this.masterGain) {
      return;
    }
    this.safeDisconnect(this.externalGain);
    this.safeDisconnect(this.externalAnalyser);
    this.externalGain = this.ctx.createGain();
    this.externalAnalyser = this.ctx.createAnalyser();
    this.externalAnalyser.fftSize = 256;
    this.externalAnalyser.smoothingTimeConstant = 0.4;
    this.externalSource.connect(this.externalGain);
    this.externalGain.connect(this.externalAnalyser);
    const plan = planExternalRouting({
      active: true,
      muted: this.externalMuted,
      monitor: this.externalMonitor,
      volume: this.externalVolume,
    });
    if (plan.toBroadcast) {
      this.externalGain.connect(this.broadcastDest);
      this.externalGain.connect(this.extrasDest);
    }
    if (plan.toRecord) this.externalGain.connect(this.recordMix);
    if (plan.toMonitor) this.externalGain.connect(this.masterGain);
    this.externalDuckState = initialDuckState(performance.now());
    this.applyExternalGain();
    if (!this.animationFrameId) this.startMeterLoop();
  }

  public releaseExternal(): void {
    const wasLive = this.isExternalActive() || !!this.externalSource;
    if (this.externalStream) {
      this.externalStream.getTracks().forEach((track) => track.stop());
      this.externalStream = null;
    }
    this.safeDisconnect(this.externalSource);
    this.safeDisconnect(this.externalGain);
    this.safeDisconnect(this.externalAnalyser);
    this.externalSource = null;
    this.externalGain = null;
    this.externalAnalyser = null;
    this.externalLevel = 0;
    this.lastExternalConstraints = null;
    this.lastExternalCapture = null;
    this.externalDuckState = initialDuckState();
    if (wasLive) this.notifyExtrasActivity();
  }

  public getExternalDeviceId(): string {
    return this.externalDeviceId;
  }

  public getExternalVolume(): number {
    return this.externalVolume;
  }

  public getExternalMuted(): boolean {
    return this.externalMuted;
  }

  public getExternalMonitor(): boolean {
    return this.externalMonitor;
  }

  public getExternalDuckEnabled(): boolean {
    return this.externalDuckEnabled;
  }

  public getExternalDuckDb(): number {
    return this.externalDuckDb;
  }

  public getExternalLevel(): number {
    return this.externalLevel;
  }

  public isExternalActive(): boolean {
    return !!this.externalStream?.getAudioTracks().some((track) => track.readyState === 'live');
  }

  /** No soundboard pad, live external input, or broadcast voice effect is feeding extras. */
  public isExtrasMixIdle(): boolean {
    return this.broadcastPads === 0
      && !(this.isExternalActive() && !this.externalMuted)
      && this.getBroadcastEffect() === 'none';
  }

  public setExtrasActivityListener(listener: (() => void) | null): void {
    this.extrasActivityListener = listener;
  }

  private notifyExtrasActivity(): void {
    this.extrasActivityListener?.();
  }

  /** Routing snapshot for tests — independent of mic mute. */
  public getExternalRoutePlan() {
    return planExternalRouting({
      active: this.isExternalActive() || !!this.externalSource,
      muted: this.externalMuted,
      monitor: this.externalMonitor,
      volume: this.externalVolume,
    });
  }

  public setExternalVolume(volume: number): void {
    this.externalVolume = Math.max(0, Math.min(1, volume));
    this.applyExternalGain();
  }

  public setExternalMuted(muted: boolean): void {
    this.externalMuted = muted;
    this.applyExternalGain();
    this.notifyExtrasActivity();
  }

  public setExternalMonitor(enabled: boolean): void {
    this.externalMonitor = enabled;
    if (this.externalSource) this.wireExternalGraph();
  }

  public setExternalDuckEnabled(enabled: boolean): void {
    this.externalDuckEnabled = enabled;
    if (!enabled) {
      this.externalDuckState = initialDuckState(performance.now());
      this.applyExternalGain();
    }
  }

  public setExternalDuckDb(db: number): void {
    this.externalDuckDb = Math.max(-24, Math.min(0, db));
  }

  public setExternalDeviceId(deviceId: string): void {
    this.externalDeviceId = deviceId;
  }

  /**
   * Open an external input (device) or system loopback and mix into broadcast + record.
   * Does not touch mic mute. Returns false if getUserMedia / getDisplayMedia fails.
   */
  public async startExternal(deviceId: string): Promise<boolean> {
    this.externalDeviceId = deviceId;
    this.releaseExternal();
    try {
      const ctx = this.initContextIfNeeded();
      let stream: MediaStream;
      if (deviceId === SYSTEM_AUDIO_DEVICE_ID) {
        this.lastExternalConstraints = null;
        this.lastExternalCapture = 'system';
        stream = await navigator.mediaDevices.getDisplayMedia({
          audio: true,
          video: true,
        });
        // Drop video tracks — we only need loopback audio.
        for (const track of stream.getVideoTracks()) track.stop();
      } else {
        const audio = externalInputConstraints(deviceId);
        this.lastExternalConstraints = { ...audio };
        this.lastExternalCapture = 'device';
        stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
      }
      this.externalStream = stream;
      this.externalSource = ctx.createMediaStreamSource(stream);
      this.wireExternalGraph();
      this.notifyExtrasActivity();
      return true;
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      console.warn('[Clubbox] external audio unavailable:', detail);
      this.releaseExternal();
      return false;
    }
  }

  /** Test helper: attach a synthetic stream as the external channel without getUserMedia. */
  public attachExternalForTest(stream: MediaStream): void {
    const ctx = this.initContextIfNeeded();
    this.releaseExternal();
    this.externalStream = stream;
    this.externalSource = ctx.createMediaStreamSource(stream);
    this.lastExternalConstraints = externalInputConstraints(this.externalDeviceId || 'test');
    this.lastExternalCapture = 'device';
    this.wireExternalGraph();
    this.notifyExtrasActivity();
  }

  // --- Soundboard Synthesizers & Sampler ---

  public playSoundEffect(effectId: string, opts?: { localOnly?: boolean }): void {
    const fx = this.soundEffects.find((s) => s.id === effectId);
    if (!fx) return;

    this.trackingBroadcast = !opts?.localOnly;
    try {
    const ctx = this.initContextIfNeeded();
    const padGain = ctx.createGain();
    padGain.gain.value = Math.max(0, Math.min(1, fx.volume ?? 1));
    if (opts?.localOnly) {
      padGain.connect(ctx.destination);
    } else {
      padGain.connect(this.soundpadGain!);
    }

    if (fx.audioBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = fx.audioBuffer;
      src.loop = fx.loop === true;
      src.connect(padGain);
      this.trackVoice(src);
      src.start();
      return;
    }

    if (fx.type === 'synth' && fx.synthType) {
      switch (fx.synthType) {
        case 'applause':
          this.synthApplause(ctx, padGain);
          break;
        case 'airhorn':
          this.synthAirhorn(ctx, padGain);
          break;
        case 'rimshot':
          this.synthRimshot(ctx, padGain);
          break;
        case 'bell':
          this.synthBell(ctx, padGain);
          break;
        case 'laugh':
          this.synthLaugh(ctx, padGain);
          break;
        case 'laser':
          this.synthLaser(ctx, padGain);
          break;
      }
    }
    } finally {
      this.trackingBroadcast = false;
    }
  }

  public stopAllSounds(): void {
    for (const voice of this.activeVoices) {
      try {
        voice.stop();
      } catch {
        // The voice already ended.
      }
      this.safeDisconnect(voice);
    }
    this.activeVoices.clear();
    if (this.broadcastPads !== 0) {
      this.broadcastPads = 0;
      this.notifyExtrasActivity();
    }
  }

  private trackVoice(node: AudioScheduledSourceNode): void {
    const broadcast = this.trackingBroadcast;
    this.activeVoices.add(node);
    if (broadcast) {
      this.broadcastPads += 1;
      this.notifyExtrasActivity();
    }
    node.addEventListener('ended', () => {
      if (!this.activeVoices.delete(node)) return;
      if (!broadcast) return;
      this.broadcastPads = Math.max(0, this.broadcastPads - 1);
      this.notifyExtrasActivity();
    }, { once: true });
  }

  private synthAirhorn(ctx: AudioContext, dest: AudioNode): void {
    const now = ctx.currentTime;
    const freqs = [466.16, 554.37, 622.25]; // Bb4, Db5, Eb5 brass chord

    freqs.forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      // Pitch drop bend
      osc.frequency.setValueAtTime(freq * 1.05, now);
      osc.frequency.exponentialRampToValueAtTime(freq, now + 0.06);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

      osc.connect(gain);
      gain.connect(dest);
      this.trackVoice(osc);

      osc.start(now);
      osc.stop(now + 0.7);
    });
  }

  private synthApplause(ctx: AudioContext, dest: AudioNode): void {
    const bufferSize = ctx.sampleRate * 2.5; // 2.5 seconds
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.02 * white) / 1.02; // Pink-ish noise
      lastOut = data[i];
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1400;
    filter.Q.value = 1.2;

    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.4, now + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.5);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    this.trackVoice(noise);

    noise.start(now);
    noise.stop(now + 2.5);
  }

  private synthRimshot(ctx: AudioContext, dest: AudioNode): void {
    const now = ctx.currentTime;
    // Transient click
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);

    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(dest);
    this.trackVoice(osc);
    osc.start(now);
    osc.stop(now + 0.15);

    // Rim metallic ring
    const ring = ctx.createOscillator();
    const ringGain = ctx.createGain();
    ring.type = 'sine';
    ring.frequency.setValueAtTime(1150, now);

    ringGain.gain.setValueAtTime(0.5, now);
    ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    ring.connect(ringGain);
    ringGain.connect(dest);
    this.trackVoice(ring);
    ring.start(now);
    ring.stop(now + 0.25);
  }

  private synthBell(ctx: AudioContext, dest: AudioNode): void {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1760, now); // A6 ding

    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

    osc.connect(gain);
    gain.connect(dest);
    this.trackVoice(osc);
    osc.start(now);
    osc.stop(now + 1.2);
  }

  private synthLaugh(ctx: AudioContext, dest: AudioNode): void {
    const now = ctx.currentTime;
    // Series of 4 cheerful bursts
    for (let i = 0; i < 4; i++) {
      const burstTime = now + i * 0.18;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(420 + i * 30, burstTime);
      osc.frequency.linearRampToValueAtTime(320, burstTime + 0.14);

      gain.gain.setValueAtTime(0.3, burstTime);
      gain.gain.exponentialRampToValueAtTime(0.001, burstTime + 0.15);

      osc.connect(gain);
      gain.connect(dest);
      this.trackVoice(osc);
      osc.start(burstTime);
      osc.stop(burstTime + 0.16);
    }
  }

  private synthLaser(ctx: AudioContext, dest: AudioNode): void {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.25);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(dest);
    this.trackVoice(osc);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  public async loadCustomAudioFile(file: File, name: string): Promise<string> {
    const ctx = this.initContextIfNeeded();
    const original = await file.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(original.slice(0));
    const label = (name || file.name).trim().slice(0, 40) || 'Sound';

    const newItem: SoundEffectItem = {
      id: 'fx-custom-' + Date.now(),
      name: label,
      hotkey: this.claimHotkey(''),
      icon: '🎵',
      type: 'custom',
      audioBuffer,
      sourceBytes: original,
      volume: 1,
      loop: false,
    };

    this.soundEffects.push(newItem);
    await this.persistPad(newItem);
    return newItem.id;
  }

  public async loadStoredPads(): Promise<void> {
    const rows = await readStoredSounds();
    const deleted = new Set(rows.filter((row) => row.deleted).map((row) => row.id));
    this.soundEffects = this.soundEffects.filter((fx) => !deleted.has(fx.id));

    const custom: StoredSound[] = [];
    for (const row of rows) {
      if (row.deleted) continue;
      const existing = this.soundEffects.find((fx) => fx.id === row.id);
      if (existing) {
        this.applyStoredPad(existing, row);
        continue;
      }
      if (row.audio) custom.push(row);
    }

    if (custom.length > 0) {
      const ctx = new AudioContext();
      try {
        for (const row of custom) {
          if (!row.audio) continue;
          try {
            const audioBuffer = await ctx.decodeAudioData(row.audio.slice(0));
            const item: SoundEffectItem = {
              id: row.id,
              name: row.name || 'Sound',
              hotkey: row.hotkey,
              icon: row.icon || '🎵',
              type: 'custom',
              audioBuffer,
              sourceBytes: row.audio,
              volume: this.clampPadVolume(row.volume),
              loop: row.loop === true,
            };
            this.soundEffects.push(item);
          } catch {
            // A corrupt file stays out of the rack.
          }
        }
      } finally {
        await ctx.close();
      }
    }

    const repaired = this.repairHotkeys();
    for (const id of repaired) {
      const fx = this.soundEffects.find((item) => item.id === id);
      if (fx) await this.persistPad(fx);
    }
  }

  public async updateSound(id: string, patch: { name?: string; icon?: string; hotkey?: string; volume?: number; loop?: boolean }): Promise<void> {
    const fx = this.soundEffects.find((item) => item.id === id);
    if (!fx) return;

    if (patch.hotkey != null && patch.hotkey !== fx.hotkey && (PAD_HOTKEYS as readonly string[]).includes(patch.hotkey)) {
      const other = this.soundEffects.find((item) => item.id !== id && item.hotkey === patch.hotkey);
      if (other) {
        other.hotkey = fx.hotkey;
        await this.persistPad(other);
      }
      fx.hotkey = patch.hotkey;
    }
    if (patch.name != null) {
      const name = patch.name.trim().slice(0, 40);
      if (name) fx.name = name;
    }
    if (patch.icon != null) {
      const icon = patch.icon.trim().slice(0, 8);
      if (icon) fx.icon = icon;
    }
    if (patch.volume != null) fx.volume = this.clampPadVolume(patch.volume);
    if (patch.loop != null) fx.loop = patch.loop;
    await this.persistPad(fx);
  }

  public async deleteSound(id: string): Promise<void> {
    const fx = this.soundEffects.find((item) => item.id === id);
    if (!fx) return;
    this.soundEffects = this.soundEffects.filter((item) => item.id !== id);
    if (fx.type === 'custom') {
      await deleteStoredSound(id);
      return;
    }
    await writeStoredSound({
      id: fx.id,
      name: fx.name,
      icon: fx.icon,
      hotkey: '',
      volume: fx.volume ?? 1,
      loop: false,
      deleted: true,
    });
  }

  private applyStoredPad(fx: SoundEffectItem, row: StoredSound): void {
    if (row.name) fx.name = row.name;
    if (row.icon) fx.icon = row.icon;
    if (row.hotkey) fx.hotkey = row.hotkey;
    fx.volume = this.clampPadVolume(row.volume);
    fx.loop = row.loop === true;
  }

  private clampPadVolume(volume: number): number {
    return Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 1));
  }

  private claimHotkey(preferred: string): string {
    const used = new Set(this.soundEffects.map((fx) => fx.hotkey));
    if ((PAD_HOTKEYS as readonly string[]).includes(preferred) && !used.has(preferred)) return preferred;
    return PAD_HOTKEYS.find((key) => !used.has(key)) ?? '';
  }

  private repairHotkeys(): string[] {
    const changed: string[] = [];
    const used = new Set<string>();
    for (const fx of this.soundEffects) {
      const before = fx.hotkey;
      if (!(PAD_HOTKEYS as readonly string[]).includes(fx.hotkey) || used.has(fx.hotkey)) {
        fx.hotkey = PAD_HOTKEYS.find((key) => !used.has(key)) ?? '';
      }
      if (fx.hotkey) used.add(fx.hotkey);
      if (fx.hotkey !== before) changed.push(fx.id);
    }
    return changed;
  }

  private async persistPad(fx: SoundEffectItem): Promise<void> {
    await writeStoredSound({
      id: fx.id,
      name: fx.name,
      icon: fx.icon,
      hotkey: fx.hotkey,
      volume: fx.volume ?? 1,
      loop: fx.loop === true,
      ...(fx.type === 'custom' && fx.sourceBytes ? { audio: fx.sourceBytes } : {}),
    });
  }

  // Share-to-Clubhouse stays hidden until a capture shows a clip upload.
  private startClipBuffer(): void {
    if (this.clipReady || !this.ctx || !this.recordMix) return;
    const ctx = this.ctx;
    const mix = this.recordMix;
    const workletUrl = new URL('clip-processor.js', document.baseURI).href;
    this.clipReady = ctx.audioWorklet.addModule(workletUrl).then(() => {
      const node = new AudioWorkletNode(ctx, 'clubbox-clip', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
        channelCount: 2,
      });
      const silent = ctx.createGain();
      silent.gain.value = 0;
      mix.connect(node);
      node.connect(silent);
      silent.connect(ctx.destination);
      node.port.start();
      this.clipNode = node;
      return true;
    }).catch(() => false);
  }

  public isClipArmed(): boolean {
    return this.clipArmed;
  }

  public armClip(armed: boolean): void {
    this.clipArmed = armed;
    if (!armed && !this.ctx) return;
    this.initContextIfNeeded();
    void this.clipReady?.then((ready) => {
      if (!ready) return;
      this.clipNode?.port.postMessage(armed ? 'arm' : 'disarm');
    });
  }

  public saveClip(): Promise<Blob | null> {
    this.initContextIfNeeded();
    const ready = this.clipReady ?? Promise.resolve(false);
    return ready.then((ok) => {
      const node = this.clipNode;
      if (!ok || !node) return null;
      return new Promise<Blob | null>((resolve) => {
        const finish = (blob: Blob | null) => {
          node.port.removeEventListener('message', onMessage);
          resolve(blob);
        };
        const onMessage = (event: MessageEvent<{ type?: string; sampleRate?: number; left?: Float32Array; right?: Float32Array }>) => {
          if (event.data?.type !== 'clip' || !event.data.left || !event.data.right || !event.data.sampleRate) return;
          if (event.data.left.length < event.data.sampleRate / 5) {
            finish(null);
            return;
          }
          finish(encodeStereoWav(event.data.left, event.data.right, event.data.sampleRate));
        };
        node.port.addEventListener('message', onMessage);
        node.port.postMessage('dump');
        window.setTimeout(() => finish(null), 2000);
      });
    });
  }

  // --- Stage Recording ---

  public startRecording(): boolean {
    if (!this.recorderDest) this.initContextIfNeeded();
    if (!this.recorderDest) return false;

    try {
      this.recordedChunks = [];
      const stream = this.recorderDest.stream;
      this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        this.isRecording = false;
        this.onRecordingStateCallbacks.forEach((cb) => cb(false, url));
      };

      this.mediaRecorder.start(250);
      this.isRecording = true;
      this.onRecordingStateCallbacks.forEach((cb) => cb(true));
      return true;
    } catch (err) {
      console.error('MediaRecorder start failed:', err);
      return false;
    }
  }

  public stopRecording(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
  }

  public toggleRecording(): boolean {
    if (this.isRecording) {
      this.stopRecording();
      return false;
    } else {
      return this.startRecording();
    }
  }

  public onRecordingState(cb: (isRecording: boolean, blobUrl?: string) => void): () => void {
    this.onRecordingStateCallbacks.push(cb);
    return () => {
      this.onRecordingStateCallbacks = this.onRecordingStateCallbacks.filter((c) => c !== cb);
    };
  }

  public getIsRecording(): boolean {
    return this.isRecording;
  }
}

export const audioEngine = new AudioEngine();
