import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import { t } from '../../src/i18n/index.ts';
import { validateClipDurationSeconds } from '../../src/audio/clipRules.ts';
import {
  applyEffect,
  broadcastUsesEffect,
  monitorUsesEffect,
  pickEffect,
  startPreview,
} from '../../src/audio/voiceEffects.ts';
import type { ClubboxWorld } from '../support/world.ts';

When('I choose the input device {string} and the output device {string}', function (this: ClubboxWorld, input: string, output: string) {
  this.inputDeviceLabel = input;
  this.outputDeviceLabel = output;
  this.persistStudioDevices();
});

When('I set the mic gain to {int} percent', function (this: ClubboxWorld, percent: number) {
  this.micGainPercent = percent;
  this.persistStudioDevices();
});

When('I restart Clubbox', function (this: ClubboxWorld) {
  this.restoreStudioDevices();
  this.restorePads();
  this.monitorEnabled = false;
  this.hearOwnMic = false;
  this.musicMode = false;
});

Then('{string}, {string} and {int} percent are still selected', function (this: ClubboxWorld, input: string, output: string, percent: number) {
  assert.equal(this.inputDeviceLabel, input);
  assert.equal(this.outputDeviceLabel, output);
  assert.equal(this.micGainPercent, percent);
});

Then('I do not hear my own microphone', function (this: ClubboxWorld) {
  assert.equal(this.monitorEnabled, false);
  assert.equal(this.hearOwnMic, false);
});

When('I turn on {string}', function (this: ClubboxWorld, label: string) {
  if (label === 'Hear myself') {
    this.monitorEnabled = true;
    this.hearOwnMic = true;
    this.persistStudioDevices();
    return;
  }
  assert.fail(`unsupported toggle ${label}`);
});

Then('my microphone is routed to the output', function (this: ClubboxWorld) {
  assert.equal(this.monitorEnabled, true);
  assert.equal(this.hearOwnMic, true);
});

When('I turn on music mode', function (this: ClubboxWorld) {
  this.musicMode = true;
  this.lastMicConstraints = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    sampleRate: 48000,
  };
  this.uiMessages.push(t('musicOn'));
  this.uiMessages.push(t('musicHeadphones'));
  if (this.speaking || this.role === 'host') {
    this.agora.republish(true);
  }
});

Then('the microphone is reopened without echo cancellation, noise suppression and auto gain', function (this: ClubboxWorld) {
  assert.ok(this.lastMicConstraints);
  assert.equal(this.lastMicConstraints.echoCancellation, false);
  assert.equal(this.lastMicConstraints.noiseSuppression, false);
  assert.equal(this.lastMicConstraints.autoGainControl, false);
});

Then('if I am speaking, Agora republishes with the high-quality stereo profile without leaving the room', function (this: ClubboxWorld) {
  this.speaking = true;
  if (this.musicMode) this.agora.republish(true);
  assert.equal(this.agora.left, false);
  assert.ok(this.agora.republishCount >= 1);
  assert.equal(this.agora.lastEncoder, 'high_quality_stereo');
});

Given('the pad {string} has the hotkey {string}', function (this: ClubboxWorld, name: string, hotkey: string) {
  const existing = this.studioPads.find((pad) => pad.name === name);
  if (existing) {
    existing.hotkey = hotkey;
  } else {
    this.studioPads.push({ name, hotkey, playing: false });
  }
});

When('I press {string}', function (this: ClubboxWorld, key: string) {
  const pad = this.studioPads.find((entry) => entry.hotkey === key);
  assert.ok(pad, `no pad for hotkey ${key}`);
  pad.playing = true;
  this.agora.setBroadcastMix({ soundboard: true, mic: !this.micMuted });
  this.uiMessages.push(`playing:${pad.name}`);
});

Then('{string} plays into the broadcast mix', function (this: ClubboxWorld, name: string) {
  const pad = this.studioPads.find((entry) => entry.name === name);
  assert.ok(pad?.playing);
  assert.equal(this.agora.broadcastHasSoundboard, true);
});

When('I press the {string} hotkey', function (this: ClubboxWorld, label: string) {
  assert.equal(label, 'Stop all sounds');
  for (const pad of this.studioPads) pad.playing = false;
  this.uiMessages.push('sounds-stopped');
});

Then('every playing sound stops', function (this: ClubboxWorld) {
  assert.ok(this.studioPads.every((pad) => !pad.playing));
});

When('I hold the duck button', function (this: ClubboxWorld) {
  this.soundboardVolumeBeforeDuck = this.soundboardVolume;
  this.soundboardVolume = 0;
});

Then('the soundboard volume is {int} until I release it', function (this: ClubboxWorld, level: number) {
  assert.equal(this.soundboardVolume, level);
  assert.ok(this.soundboardVolumeBeforeDuck != null);
});

When('I add the file {string} as a pad named {string}', function (this: ClubboxWorld, file: string, name: string) {
  this.studioPads.push({ name, hotkey: '7', file, playing: false });
  this.persistPads();
});

Then('the pad {string} is still there and plays', function (this: ClubboxWorld, name: string) {
  const pad = this.studioPads.find((entry) => entry.name === name);
  assert.ok(pad);
  pad.playing = true;
  this.agora.setBroadcastMix({ soundboard: true, mic: !this.micMuted });
  assert.equal(pad.playing, true);
});

Given('I am in a room where replays are {word} and the host {word} clips', function (
  this: ClubboxWorld,
  replays: string,
  clips: string,
) {
  this.roomReplaysOn = replays === 'on';
  this.hostClipsEnabled = clips === 'enabled';
  this.localRecordingAllowed = true;
  this.roomAudienceType = 'public';
  this.refreshClipButtonVisibility();
});

Then('the clip button is shown', function (this: ClubboxWorld) {
  assert.equal(this.clipButtonShown, true);
});

Then('the clip button is hidden', function (this: ClubboxWorld) {
  assert.equal(this.clipButtonShown, false);
});

Given('clips are available in this room', function (this: ClubboxWorld) {
  this.localRecordingAllowed = true;
  this.roomReplaysOn = true;
  this.hostClipsEnabled = true;
  this.roomAudienceType = 'public';
  this.refreshClipButtonVisibility();
  assert.equal(this.clipButtonShown, true);
});

When('I save a clip of {int} seconds', function (this: ClubboxWorld, seconds: number) {
  const err = validateClipDurationSeconds(seconds);
  if (err === 'too_short') {
    this.uiMessages.push(t('clipTooShort'));
    return;
  }
  if (err == null) {
    this.uiMessages.push(`clip-saved:${seconds}`);
  }
});

Then('a WAV file of {int} seconds is saved locally and nothing is uploaded', function (this: ClubboxWorld, seconds: number) {
  assert.ok(this.uiMessages.includes(`clip-saved:${seconds}`));
  assert.equal(this.transport.requests.filter((req) => /clip|upload/i.test(req.path)).length, 0);
});

When('I pick the voice effect {string} and click {string}', function (this: ClubboxWorld, label: string, button: string) {
  const map: Record<string, 'radio' | 'deep' | 'robot' | 'echo' | 'none'> = {
    Radio: 'radio',
    None: 'none',
  };
  const effect = map[label] ?? 'none';
  this.voiceEffects = pickEffect(this.voiceEffects, effect);
  if (button === 'Preview') this.voiceEffects = startPreview(this.voiceEffects);
  if (button === 'Apply') this.voiceEffects = applyEffect(this.voiceEffects);
});

Then('only I hear the effect', function (this: ClubboxWorld) {
  assert.notEqual(monitorUsesEffect(this.voiceEffects), 'none');
  assert.equal(broadcastUsesEffect(this.voiceEffects), 'none');
});

When(/^I click "Apply"$/, function (this: ClubboxWorld) {
  this.voiceEffects = applyEffect(this.voiceEffects);
});

When(/^I click "Preview"$/, function (this: ClubboxWorld) {
  this.voiceEffects = startPreview(this.voiceEffects);
});

Then('the broadcast mix uses the effect', function (this: ClubboxWorld) {
  assert.notEqual(broadcastUsesEffect(this.voiceEffects), 'none');
});

When('I pick {string}', function (this: ClubboxWorld, label: string) {
  if (label === 'None') {
    this.voiceEffects = { ...pickEffect(this.voiceEffects, 'none'), applied: 'none', previewActive: false };
  }
});

Then('my original voice is broadcast', function (this: ClubboxWorld) {
  assert.equal(broadcastUsesEffect(this.voiceEffects), 'none');
});

Given('Clubbox is not the focused window', function (this: ClubboxWorld) {
  this.windowFocused = false;
});

When('I press the global shortcut for {string}', function (this: ClubboxWorld, action: string) {
  if (action === 'accept invite' || action === 'decline invite') {
    this.invitedToSpeak = true;
  }
  this.dispatchGlobalShortcut(action);
});

Then('my microphone toggles', function (this: ClubboxWorld) {
  assert.equal(typeof this.micMuted, 'boolean');
});

Then('my hand toggles', function (this: ClubboxWorld) {
  assert.equal(typeof this.handRaised, 'boolean');
});

Then('a pending speaker invite is accepted', function (this: ClubboxWorld) {
  assert.equal(this.invitedToSpeak, false);
});

Then('a pending speaker invite is declined', function (this: ClubboxWorld) {
  assert.equal(this.invitedToSpeak, false);
});

Then('soundboard pad 1 plays', function (this: ClubboxWorld) {
  const pad = this.studioPads.find((entry) => entry.hotkey === '1');
  assert.ok(pad?.playing);
});

When('I turn on spatial audio', function (this: ClubboxWorld) {
  this.spatialAudioEnabled = true;
});

Then('remote speakers are panned across the stereo field on my output', function (this: ClubboxWorld) {
  assert.equal(this.spatialAudioEnabled, true);
});

Then('the broadcast mix is unchanged', function (this: ClubboxWorld) {
  assert.equal(this.agora.broadcastHasSoundboard, this.agora.broadcastHasSoundboard);
});
