import { audioEngine } from '../audio/audioEngine.ts';
import { writeAudioPrefs } from '../audio/audioPrefs.ts';
import { eventToAccelerator, normalizeShortcuts, writeShortcuts, type ShortcutAction, type ShortcutMap } from '../shortcuts.ts';
import { adjustZoomPercent, readAppPrefs, writeAppPrefs, zoomFactorFromPercent } from './appPrefs.ts';
import { agoraVoice } from '../audio/agoraVoice.ts';
import { t } from '../i18n/index.ts';
import { html } from '../ui/html.ts';
import { soundboardView } from '../ui/views/soundboard.ts';
import { buildChapterFileContent, chapterFilename, type RecordingChapter } from '../studio/recordingChapters.ts';
import type { ClubboxApp } from './clubboxApp.ts';
import { electronAPI } from './electronApi.ts';
import { recordingFilename } from './recordingFilename.ts';



export function setupHotkeys(this: ClubboxApp) {
    window.addEventListener('keydown', (event) => {
      if (!this.recordingShortcut || event.repeat) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;
      if (event.key === 'Escape') {
        this.recordingShortcut = null;
        this.render();
        return;
      }
      const accelerator = eventToAccelerator(event);
      if (!accelerator) {
        this.showToast(t('shortcutNeedsModifier'), '⌨️');
        return;
      }
      void this.assignShortcut(this.recordingShortcut, accelerator);
    }, true);
    window.addEventListener('keydown', (e) => {
      if (this.recordingShortcut) return;
      const target = e.target as HTMLElement | null;
      if (target?.id === 'chat-input' && e.key === 'Enter') {
        e.preventDefault();
        this.sendChatMessage();
        return;
      }
      if (target?.id === 'discover-query' && e.key === 'Enter') {
        e.preventDefault();
        void this.runDiscoverSearch();
        return;
      }
      if (target?.id === 'hallway-keyword-input' && e.key === 'Enter') {
        e.preventDefault();
        this.addHallwayKeyword();
        return;
      }
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        this.openCreateModal();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        const prefs = readAppPrefs();
        const next = adjustZoomPercent(prefs.zoomPercent, 1);
        writeAppPrefs({ ...prefs, zoomPercent: next });
        void electronAPI()?.setZoomFactor?.(zoomFactorFromPercent(next));
        if (this.currentTab === 'settings') this.render();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        const prefs = readAppPrefs();
        const next = adjustZoomPercent(prefs.zoomPercent, -1);
        writeAppPrefs({ ...prefs, zoomPercent: next });
        void electronAPI()?.setZoomFactor?.(zoomFactorFromPercent(next));
        if (this.currentTab === 'settings') this.render();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        const prefs = readAppPrefs();
        writeAppPrefs({ ...prefs, zoomPercent: 100 });
        void electronAPI()?.setZoomFactor?.(1);
        if (this.currentTab === 'settings') this.render();
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (!this.isMeSpeaker()) {
          this.showToast(t('inAudience'), '🎙️');
          return;
        }
        this.toggleMute();
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        this.toggleHandRaise();
      } else if ((e.key === 's' || e.key === 'S') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        audioEngine.stopAllSounds();
        this.showToast(t('soundsStopped'), '⏹');
      } else if ((e.key === 't' || e.key === 'T') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (!audioEngine.getIsRecording()) return;
        const title = window.prompt(t('chapterTitlePrompt'));
        if (!title?.trim()) return;
        const chapters = this.recordingChapters as RecordingChapter[];
        chapters.push({ atSec: this.recordDurationSec, title: title.trim() });
      } else if ((e.key === 's' || e.key === 'S') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (!this.currentChannel) return;
        const field = document.getElementById('audience-search') as HTMLInputElement | null;
        if (field) {
          field.focus();
          field.select();
        }
      } else if (e.key === 'r' || e.key === 'R') {
        this.toggleRecording();
      } else if (e.key === 'c' || e.key === 'C') {
        void this.saveClip();
      } else if ((e.key === 'p' || e.key === 'P') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void this.refreshStageManual();
      } else if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        const fx = audioEngine.soundEffects.find((item) => item.hotkey === e.key);
        if (fx) {
          if (!this.currentChannel || !this.isMeSpeaker()) return;
          e.preventDefault();
          audioEngine.playSoundEffect(fx.id);
          this.showToast(t('soundNamed', { name: fx.name }), fx.icon);
        }
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        this.goBack();
      }
    });
  }

export function handleGlobalShortcut(this: ClubboxApp, action: string) : void {
    if (action === 'mute') {
      this.toggleMute();
      return;
    }
    if (action === 'clip') {
      void this.saveClip();
      return;
    }
    if (action === 'raiseHand') {
      void this.toggleHandRaise();
      return;
    }
    if (action === 'acceptInvite') {
      void this.acceptSpeakerInvite();
      return;
    }
    if (action === 'declineInvite') {
      this.closeSpeakerInvite();
      return;
    }
    const pad = /^pad([1-9])$/.exec(action);
    if (!pad) return;
    const fx = audioEngine.soundEffects.find((item) => item.hotkey === pad[1]);
    if (!fx) return;
    audioEngine.playSoundEffect(fx.id);
    this.showToast(t('soundNamed', { name: fx.name }), fx.icon);
  }

export function updateVuMeter(this: ClubboxApp, vol: number) {
    const fill = document.getElementById('vu-meter-fill');
    if (fill) {
      fill.style.width = `${Math.min(100, Math.round(vol * 100))}%`;
    }

    const mySpeakerCard = document.querySelector('.speaker-card.me-speaker');
    if (mySpeakerCard) {
      if (vol > 0.12 && !audioEngine.getIsMuted()) {
        mySpeakerCard.classList.add('speaking');
      } else {
        mySpeakerCard.classList.remove('speaking');
      }
    }
  }

export function handleRecordingStateChange(this: ClubboxApp, isRecording: boolean, blobUrl?: string) {
    const recBtn = document.getElementById('record-btn');
    const recTimerEl = document.getElementById('record-timer');

    if (isRecording) {
      recBtn?.classList.add('record-active');
      this.recordingChapters = [];
      this.recordDurationSec = 0;
      this.recordTimerInterval = window.setInterval(() => {
        this.recordDurationSec++;
        const mins = Math.floor(this.recordDurationSec / 60).toString().padStart(2, '0');
        const secs = (this.recordDurationSec % 60).toString().padStart(2, '0');
        if (recTimerEl) recTimerEl.textContent = `${mins}:${secs}`;
      }, 1000);
      this.showToast(t('recordingStarted'), '🔴');
      document.getElementById('recording-badge')?.removeAttribute('hidden');
      this.syncRecBanner();
    } else {
      recBtn?.classList.remove('record-active');
      if (this.recordTimerInterval) {
        clearInterval(this.recordTimerInterval);
        this.recordTimerInterval = null;
      }
      if (recTimerEl) recTimerEl.textContent = 'REC';
      document.getElementById('recording-badge')?.setAttribute('hidden', '');
      this.syncRecBanner();

      if (blobUrl) {
        this.showToast(t('recordingReady'), '💾');
        const recName = recordingFilename(this.currentChannel?.topic);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = recName;
        a.click();
        const chapterBody = buildChapterFileContent(this.recordingChapters as RecordingChapter[]);
        const chapterBlob = new Blob([chapterBody], { type: 'text/plain;charset=utf-8' });
        const chapterUrl = URL.createObjectURL(chapterBlob);
        const chapterLink = document.createElement('a');
        chapterLink.href = chapterUrl;
        chapterLink.download = chapterFilename(recName);
        chapterLink.click();
        window.setTimeout(() => URL.revokeObjectURL(chapterUrl), 1500);
      }
    }
  }

export function toggleMute(this: ClubboxApp) {
    // Muting while Agora is still CONNECTING publishes silence (engineMuted=true)
    // and phones hear nothing — wait until joined.
    if (this.currentChannel && !agoraVoice.getIsJoined() && (this.joinInFlight || this.audioConnected === false)) {
      this.showToast(t('waitForAudioConnect'), '🎙️');
      return;
    }

    const isMuted = audioEngine.toggleMute();
    void agoraVoice.setMuted(isMuted).then(() => {
      console.log(`[Clubbox] mute toggled muted=${isMuted} agoraJoined=${agoraVoice.getIsJoined()}`);
    });

    if (isMuted) {
      this.showToast(t('micMuted'), '🔇');
      this.renderCockpit();
      return;
    }

    // Join may have failed to open the mic — open + publish on first unmute.
    if (agoraVoice.getIsJoined() && agoraVoice.getIsSpeaker()) {
      void agoraVoice.ensurePublished(audioEngine.getIsMusicMode()).then((ok) => {
        if (!ok) {
          if (audioEngine.lastMicError === 'system') {
            this.showToast(t('micPermissionDenied'), '🔇');
            void electronAPI()?.openMicrophoneSettings?.();
          } else {
            this.showToast(t('micStageFailed'), '🔇');
          }
        } else {
          this.showToast(t('micLive'), '🎙️');
        }
        this.renderCockpit();
      });
      return;
    }
    this.showToast(t('micLive'), '🎙️');
    this.renderCockpit();
  }

export function toggleMusicMode(this: ClubboxApp) : void {
    this.musicModeChain = this.musicModeChain.then(() => this.applyMusicMode()).catch((err) => {
      this.reportApiError(err);
    });
  }

export async function applyMusicMode(this: ClubboxApp) : Promise<void> {
    await audioEngine.toggleMusicMode();
    if (agoraVoice.getIsJoined() && agoraVoice.getIsSpeaker()) {
      await agoraVoice.republish(audioEngine.getIsMusicMode());
    }
    const isMusic = audioEngine.getIsMusicMode();
    const btn = document.getElementById('music-mode-btn');
    if (btn) btn.classList.toggle('active', isMusic);
    this.showToast(
      isMusic ? t('musicOn') : t('musicOff'),
      isMusic ? '🎵' : '🎙️',
    );
    if (isMusic) this.showToast(t('musicHeadphones'), '🎧');
  }

export function applyAudioPrefs(this: ClubboxApp) : void {
    audioEngine.setMicVolume(this.audioPrefs.micVolume);
    audioEngine.setMonitorEnabled(this.audioPrefs.monitorEnabled);
    audioEngine.setSpatialAudioEnabled(this.audioPrefs.spatialAudioEnabled === true);
    audioEngine.restoreAppliedVoiceEffect(this.audioPrefs.voiceEffectApplied || 'none');
    audioEngine.setInputDeviceId(this.audioPrefs.inputDeviceId);
    audioEngine.setOutputDevice(this.audioPrefs.outputDeviceId);
    audioEngine.setExternalDeviceId(this.audioPrefs.externalDeviceId || '');
    audioEngine.setExternalVolume(this.audioPrefs.externalVolume ?? 0.8);
    audioEngine.setExternalMonitor(this.audioPrefs.externalMonitor === true);
    audioEngine.setExternalDuckEnabled(this.audioPrefs.externalDuck !== false);
    audioEngine.setExternalDuckDb(this.audioPrefs.externalDuckDb ?? -12);
    void agoraVoice.setAiNoiseSuppression(this.audioPrefs.aiNoiseSuppression === true);
    for (const [uid, volume] of Object.entries(this.audioPrefs.remoteVolumes)) {
      audioEngine.setRemoteVolume(uid, volume);
    }
  }

export function saveAudioPrefs(this: ClubboxApp) : void {
    writeAudioPrefs(this.audioPrefs);
  }

export async function fillAudioDevices(this: ClubboxApp) : Promise<void> {
    let devices: MediaDeviceInfo[];
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch {
      return;
    }
    if (this.currentTab !== 'settings') return;
    this.fillDeviceSelect('cfg-input-device', devices.filter((device) => device.kind === 'audioinput'), audioEngine.getInputDeviceId());
    const output = document.getElementById('cfg-output-device') as HTMLSelectElement | null;
    const supported = audioEngine.canSelectOutput();
    if (output) output.disabled = !supported;
    this.fillDeviceSelect('cfg-output-device', devices.filter((device) => device.kind === 'audiooutput'), audioEngine.getOutputDeviceId());
    const note = document.getElementById('output-device-note');
    if (note) note.hidden = supported;
  }

export function fillDeviceSelect(this: ClubboxApp, id: string, devices: MediaDeviceInfo[], selected: string) : void {
    const select = document.getElementById(id) as HTMLSelectElement | null;
    if (!select) return;
    select.replaceChildren();
    const fallback = document.createElement('option');
    fallback.value = '';
    fallback.textContent = t('systemDefault');
    select.append(fallback);
    devices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `${t('unnamedDevice')} ${index + 1}`;
      select.append(option);
    });
    select.value = [...select.options].some((option) => option.value === selected) ? selected : '';
  }

export function renderSoundboardView(this: ClubboxApp) : ReturnType<typeof html> {
    return soundboardView(audioEngine.soundEffects, this.editingSoundId, audioEngine.getSoundpadVolume());
  }

export async function commitSoundEdit(this: ClubboxApp, target: HTMLInputElement) : Promise<void> {
    const id = target.dataset.fxId;
    if (!id) return;
    try {
      if (target.id === 'sound-name') await audioEngine.updateSound(id, { name: target.value });
      else if (target.id === 'sound-icon') await audioEngine.updateSound(id, { icon: target.value });
      else if (target.id === 'sound-hotkey') await audioEngine.updateSound(id, { hotkey: target.value });
      else if (target.id === 'sound-volume') await audioEngine.updateSound(id, { volume: parseFloat(target.value) });
      else if (target.id === 'sound-loop') await audioEngine.updateSound(id, { loop: target.checked });
      if (this.currentTab === 'soundboard' && target.id !== 'sound-volume') this.render();
    } catch {
      this.showToast(t('somethingWrong'), '⚠️');
    }
  }

export async function removeSound(this: ClubboxApp, id: string) : Promise<void> {
    try {
      await audioEngine.deleteSound(id);
      if (this.editingSoundId === id) this.editingSoundId = null;
      this.render();
    } catch {
      this.showToast(t('somethingWrong'), '⚠️');
    }
  }

export async function assignShortcut(this: ClubboxApp, action: ShortcutAction, accelerator: string) : Promise<void> {
    const next: ShortcutMap = { ...this.shortcuts, [action]: accelerator };
    if (accelerator) {
      for (const key of Object.keys(next) as ShortcutAction[]) {
        if (key !== action && next[key] === accelerator) next[key] = '';
      }
    }
    this.shortcuts = normalizeShortcuts(next);
    this.recordingShortcut = null;
    writeShortcuts(this.shortcuts);
    await this.publishShortcuts();
    if (this.currentTab === 'settings') this.render();
  }

export async function syncShortcuts(this: ClubboxApp) : Promise<void> {
    const api = electronAPI();
    if (api?.getGlobalShortcuts) {
      try {
        const stored = await api.getGlobalShortcuts();
        if (stored) {
          this.shortcuts = normalizeShortcuts(stored);
          writeShortcuts(this.shortcuts);
        }
      } catch {
        // The browser preview has no desktop bridge.
      }
    }
    await this.publishShortcuts();
  }

export async function publishShortcuts(this: ClubboxApp) : Promise<void> {
    const api = electronAPI();
    if (!api?.setGlobalShortcuts) return;
    try {
      const result = await api.setGlobalShortcuts(this.shortcuts);
      if (result.failed.length > 0) this.showToast(t('shortcutFailed'), '⌨️');
    } catch {
      // Registration is a desktop-app feature.
    }
  }

export function isShortcutAction(this: ClubboxApp, action: string | undefined) : action is ShortcutAction {
    return action === 'mute' || action === 'clip' || /^pad[1-9]$/.test(action || '');
  }

export function wireStudioCtl(proto: ClubboxApp): void {
  proto.setupHotkeys = setupHotkeys;
  proto.handleGlobalShortcut = handleGlobalShortcut;
  proto.updateVuMeter = updateVuMeter;
  proto.handleRecordingStateChange = handleRecordingStateChange;
  proto.toggleMute = toggleMute;
  proto.toggleMusicMode = toggleMusicMode;
  proto.applyMusicMode = applyMusicMode;
  proto.applyAudioPrefs = applyAudioPrefs;
  proto.saveAudioPrefs = saveAudioPrefs;
  proto.fillAudioDevices = fillAudioDevices;
  proto.fillDeviceSelect = fillDeviceSelect;
  proto.renderSoundboardView = renderSoundboardView;
  proto.commitSoundEdit = commitSoundEdit;
  proto.removeSound = removeSound;
  proto.assignShortcut = assignShortcut;
  proto.syncShortcuts = syncShortcuts;
  proto.publishShortcuts = publishShortcuts;
  proto.isShortcutAction = isShortcutAction;
}
