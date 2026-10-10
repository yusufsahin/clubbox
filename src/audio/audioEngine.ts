import type { SoundEffectItem } from '../api/types';

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
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private remoteNodes = new Map<string, { source: MediaStreamAudioSourceNode; gain: GainNode }>();

  private isMuted: boolean = true;
  private isMusicMode: boolean = false;
  private monitorEnabled: boolean = false;
  private isRecording: boolean = false;
  private soundpadVolume: number = 0.8;
  private micVolume: number = 1.0;

  private onVolumeChangeCallbacks: ((level: number) => void)[] = [];
  private onRecordingStateCallbacks: ((isRecording: boolean, blobUrl?: string) => void)[] = [];
  private animationFrameId: number | null = null;

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
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
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

      // Local speakers hear the soundpad. The send bus is what Agora publishes.
      this.soundpadGain.connect(this.masterGain);
      this.soundpadGain.connect(this.broadcastDest);
      this.soundpadGain.connect(this.recorderDest);
      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    return this.ctx;
  }

  public async startMicrophone(): Promise<boolean> {
    try {
      const ctx = this.initContextIfNeeded();

      const constraints: MediaStreamConstraints = {
        audio: this.isMusicMode
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
            },
      };

      this.releaseMicrophoneGraph();

      this.micStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.micSource = ctx.createMediaStreamSource(this.micStream);

      this.micGain = ctx.createGain();
      this.micGain.gain.value = this.isMuted ? 0 : this.micVolume;

      // Mic stays off the speakers. It feeds the meter, the send bus, and the recorder.
      this.micSource.connect(this.micGain);
      this.micGain.connect(this.analyser!);
      this.micGain.connect(this.broadcastDest!);
      this.micGain.connect(this.recorderDest!);

      this.monitorGain = ctx.createGain();
      this.monitorGain.gain.value = 1;
      this.micGain.connect(this.monitorGain);
      if (this.monitorEnabled && this.masterGain) {
        this.monitorGain.connect(this.masterGain);
      }

      this.startMeterLoop();
      return true;
    } catch (err: any) {
      console.warn('Microphone access not granted or unavailable, starting simulated VU meter:', err);
      this.startSimulatedMeterLoop();
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

  public setMuted(muted: boolean): void {
    if (this.isMuted !== muted) {
      this.toggleMute();
    }
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public toggleMusicMode(): boolean {
    this.isMusicMode = !this.isMusicMode;
    if (this.micStream) {
      this.startMicrophone();
    }
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
    gain.gain.value = 1;
    source.connect(gain);
    // Local playback and the recording only. Never the send bus.
    gain.connect(this.masterGain!);
    gain.connect(this.recorderDest!);
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

  public setRemoteVolume(uid: string | number, volume: number): void {
    const nodes = this.remoteNodes.get(String(uid));
    if (!nodes || !this.ctx) return;
    const vol = Math.max(0, Math.min(1, volume));
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

    if (fx.audioBuffer) {
      const src = ctx.createBufferSource();
      src.buffer = fx.audioBuffer;
      src.connect(this.soundpadGain!);
      src.start();
      return;
    }

    if (fx.type === 'synth' && fx.synthType) {
      switch (fx.synthType) {
        case 'applause':
          this.synthApplause(ctx);
          break;
        case 'airhorn':
          this.synthAirhorn(ctx);
          break;
        case 'rimshot':
          this.synthRimshot(ctx);
          break;
        case 'bell':
          this.synthBell(ctx);
          break;
        case 'laugh':
          this.synthLaugh(ctx);
          break;
        case 'laser':
          this.synthLaser(ctx);
          break;
      }
    }
  }

  private synthAirhorn(ctx: AudioContext): void {
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
      gain.connect(this.soundpadGain!);

      osc.start(now);
      osc.stop(now + 0.7);
    });
  }

  private synthApplause(ctx: AudioContext): void {
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
    gain.connect(this.soundpadGain!);

    noise.start(now);
    noise.stop(now + 2.5);
  }

  private synthRimshot(ctx: AudioContext): void {
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
    gain.connect(this.soundpadGain!);
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
    ringGain.connect(this.soundpadGain!);
    ring.start(now);
    ring.stop(now + 0.25);
  }

  private synthBell(ctx: AudioContext): void {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1760, now); // A6 ding

    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

    osc.connect(gain);
    gain.connect(this.soundpadGain!);
    osc.start(now);
    osc.stop(now + 1.2);
  }

  private synthLaugh(ctx: AudioContext): void {
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
      gain.connect(this.soundpadGain!);
      osc.start(burstTime);
      osc.stop(burstTime + 0.16);
    }
  }

  private synthLaser(ctx: AudioContext): void {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.25);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(this.soundpadGain!);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  public async loadCustomAudioFile(file: File, name: string): Promise<string> {
    const ctx = this.initContextIfNeeded();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    const newId = 'fx-custom-' + Date.now();
    const newItem: SoundEffectItem = {
      id: newId,
      name: name || file.name.substring(0, 14),
      hotkey: (this.soundEffects.length + 1).toString(),
      icon: '🎵',
      type: 'custom',
      audioBuffer,
    };

    this.soundEffects.push(newItem);
    return newId;
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
