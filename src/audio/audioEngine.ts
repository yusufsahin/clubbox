import type { SoundEffectItem } from '../api/types';
import { deleteStoredSound, PAD_HOTKEYS, readStoredSounds, writeStoredSound, type StoredSound } from './soundLibrary';
import { encodeStereoWav } from './wav';

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
  private recorderDest: MediaStreamAudioDestinationNode | null = null;
  private recordMix: GainNode | null = null;
  private clipNode: AudioWorkletNode | null = null;
  private clipReady: Promise<boolean> | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private remoteNodes = new Map<string, { source: MediaStreamAudioSourceNode; gain: GainNode }>();

  private inputDeviceId = '';
  private outputDeviceId = '';
  private remoteVolumes = new Map<string, number>();
  private isMuted: boolean = true;
  private isMusicMode: boolean = false;
  private monitorEnabled: boolean = false;
  private isRecording: boolean = false;
  private simulateMeterOnFailure = false;
  private soundpadVolume: number = 0.8;
  private micVolume: number = 1.0;

  private onVolumeChangeCallbacks: ((level: number) => void)[] = [];
  private onRecordingStateCallbacks: ((isRecording: boolean, blobUrl?: string) => void)[] = [];
  private animationFrameId: number | null = null;
  private micStartPromise: Promise<boolean> | null = null;
  private activeVoices = new Set<AudioScheduledSourceNode>();

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
      this.ctx = new AudioCtx({ latencyHint: 'interactive' });

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 1.0;

      this.soundpadGain = this.ctx.createGain();
      this.soundpadGain.gain.value = this.soundpadVolume;

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.4;

      this.broadcastDest = this.ctx.createMediaStreamDestination();
      this.recorderDest = this.ctx.createMediaStreamDestination();
      this.recordMix = this.ctx.createGain();
      this.recordMix.gain.value = 1;
      this.recordMix.connect(this.recorderDest);

      // Local speakers hear the soundpad. The send bus is what Agora publishes.
      this.soundpadGain.connect(this.masterGain);
      this.soundpadGain.connect(this.broadcastDest);
      this.soundpadGain.connect(this.recordMix);
      this.masterGain.connect(this.ctx.destination);
      this.startClipBuffer();
      if (this.outputDeviceId) void this.applyOutputSink();
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    return this.ctx;
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

  private async openMicrophone(): Promise<boolean> {
    try {
      const ctx = this.initContextIfNeeded();

      const audio: MediaTrackConstraints = this.isMusicMode
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
      if (this.inputDeviceId) audio.deviceId = { ideal: this.inputDeviceId };
      const constraints: MediaStreamConstraints = { audio };

      this.releaseMicrophoneGraph();

      this.micStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.micSource = ctx.createMediaStreamSource(this.micStream);

      this.micGain = ctx.createGain();
      this.micGain.gain.value = this.isMuted ? 0 : this.micVolume;

      // Mic stays off the speakers. It feeds the meter, the send bus, and the recorder.
      this.micSource.connect(this.micGain);
      this.micGain.connect(this.analyser!);
      this.micGain.connect(this.broadcastDest!);
      this.micGain.connect(this.recordMix!);

      this.monitorGain = ctx.createGain();
      this.monitorGain.gain.value = 1;
      this.micGain.connect(this.monitorGain);
      if (this.monitorEnabled && this.masterGain) {
        this.monitorGain.connect(this.masterGain);
      }

      this.startMeterLoop();
      const liveTracks = this.micStream?.getAudioTracks().filter((track) => track.readyState === 'live').length ?? 0;
      console.log('[Clubbox] mic tracks', liveTracks);
      return true;
    } catch (err: unknown) {
      console.warn('Microphone access not granted or unavailable:', err);
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
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
    this.onVolumeChangeCallbacks.forEach((cb) => cb(0));
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
   * Live mix of mic + soundpad. Call startMicrophone() before requesting it
   * so the mic is on the bus. The returned track belongs to the engine;
   * callers that hand it to Agora should clone it.
   */
  public getBroadcastTrack(): MediaStreamTrack | null {
    if (!this.broadcastDest) {
      this.initContextIfNeeded();
    }
    return this.broadcastDest?.stream.getAudioTracks()[0] ?? null;
  }

  public addRemoteTrack(uid: string | number, track: MediaStreamTrack): void {
    const key = String(uid);
    this.removeRemoteTrack(key);

    const ctx = this.initContextIfNeeded();
    const source = ctx.createMediaStreamSource(new MediaStream([track]));
    const gain = ctx.createGain();
    gain.gain.value = this.getRemoteVolume(key);
    source.connect(gain);
    // Local playback and the recording only. Never the send bus.
    gain.connect(this.masterGain!);
    gain.connect(this.recordMix!);
    this.remoteNodes.set(key, { source, gain });
  }

  public removeRemoteTrack(uid: string | number): void {
    const key = String(uid);
    const nodes = this.remoteNodes.get(key);
    if (!nodes) return;
    this.safeDisconnect(nodes.source);
    this.safeDisconnect(nodes.gain);
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
    nodes.gain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.02);
  }

  private releaseMicrophoneGraph(): void {
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }
    this.safeDisconnect(this.micSource);
    this.safeDisconnect(this.micGain);
    this.safeDisconnect(this.monitorGain);
    this.micSource = null;
    this.micGain = null;
    this.monitorGain = null;
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
    if (this.soundpadGain && this.ctx) {
      this.soundpadGain.gain.setTargetAtTime(this.soundpadVolume, this.ctx.currentTime, 0.02);
    }
  }

  public getSoundpadVolume(): number {
    return this.soundpadVolume;
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

    const update = () => {
      if (this.analyser && !this.isMuted) {
        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const normalized = Math.min(1, avg / 128);
        this.onVolumeChangeCallbacks.forEach((cb) => cb(normalized));
      } else {
        this.onVolumeChangeCallbacks.forEach((cb) => cb(0));
      }
      this.animationFrameId = requestAnimationFrame(update);
    };

    this.animationFrameId = requestAnimationFrame(update);
  }

  private startSimulatedMeterLoop(): void {
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);

    let simVol = 0;
    const update = () => {
      if (!this.isMuted) {
        // Natural speech modulation simulation
        const target = Math.random() > 0.3 ? 0.3 + Math.random() * 0.6 : 0.05;
        simVol += (target - simVol) * 0.2;
        this.onVolumeChangeCallbacks.forEach((cb) => cb(simVol));
      } else {
        this.onVolumeChangeCallbacks.forEach((cb) => cb(0));
      }
      this.animationFrameId = requestAnimationFrame(update);
    };

    this.animationFrameId = requestAnimationFrame(update);
  }

  // --- Soundboard Synthesizers & Sampler ---

  public playSoundEffect(effectId: string): void {
    const fx = this.soundEffects.find((s) => s.id === effectId);
    if (!fx) return;

    const ctx = this.initContextIfNeeded();
    const padGain = ctx.createGain();
    padGain.gain.value = Math.max(0, Math.min(1, fx.volume ?? 1));
    padGain.connect(this.soundpadGain!);

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
  }

  private trackVoice(node: AudioScheduledSourceNode): void {
    this.activeVoices.add(node);
    node.addEventListener('ended', () => {
      this.activeVoices.delete(node);
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

  public armClip(armed: boolean): void {
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
