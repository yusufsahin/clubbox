import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import { t } from '../../src/i18n/index.ts';
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
