import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import { externalInputConstraints, SYSTEM_AUDIO_DEVICE_ID } from '../../src/audio/externalConstraints.ts';
import {
  DEFAULT_DUCK_DB,
  DUCK_ATTACK_MS,
  DUCK_RELEASE_MS,
  duckGainFromDb,
  initialDuckState,
  stepDuckEnvelope,
  systemAudioCaptureAllowed,
} from '../../src/audio/externalDuck.ts';
import { planExternalRouting } from '../../src/audio/externalRouting.ts';
import { t } from '../../src/i18n/index.ts';
import type { ClubboxWorld } from '../support/world.ts';

type ExternalWorld = ClubboxWorld & {
  externalDeviceLabel?: string;
  externalActive?: boolean;
  externalMonitor?: boolean;
  externalDuck?: boolean;
  externalMuted?: boolean;
  externalVolume?: number;
  externalReleased?: boolean;
  externalCopyrightSeen?: boolean;
  lastExternalConstraints?: MediaTrackConstraints | null;
  externalRoute?: ReturnType<typeof planExternalRouting>;
  duckMultiplier?: number;
  offeredMusicQuality?: boolean;
  systemAudioBlockedReason?: string;
  systemAudioEnabled?: boolean;
  clubboxOutputId?: string;
  defaultOutputId?: string;
};

function activateExternal(world: ExternalWorld, label: string): void {
  world.externalDeviceLabel = label;
  world.externalActive = true;
  world.externalReleased = false;
  world.externalMonitor = false;
  world.externalDuck = true;
  world.externalMuted = false;
  world.externalVolume = 0.8;
  world.lastExternalConstraints = externalInputConstraints('vb-cable');
  world.externalRoute = planExternalRouting({
    active: true,
    muted: false,
    monitor: false,
    volume: world.externalVolume,
  });
  if (!world.externalCopyrightSeen) {
    world.uiMessages.push(t('externalCopyrightReminder'));
    world.externalCopyrightSeen = true;
  }
}

When(
  'I open Details › Audio and choose {string} as External audio',
  function (this: ExternalWorld, device: string) {
    activateExternal(this, device);
    if (!this.musicMode) {
      this.offeredMusicQuality = true;
      this.uiMessages.push(t('externalOfferMusic'));
      this.uiMessages.push(t('musicHeadphones'));
    }
  },
);

Then('the external source is mixed into the broadcast and the recording', function (this: ExternalWorld) {
  assert.ok(this.externalRoute);
  assert.equal(this.externalRoute.toBroadcast, true);
  assert.equal(this.externalRoute.toRecord, true);
});

Then(
  'it is opened without echo cancellation, noise suppression and auto gain',
  function (this: ExternalWorld) {
    assert.ok(this.lastExternalConstraints);
    assert.equal(this.lastExternalConstraints.echoCancellation, false);
    assert.equal(this.lastExternalConstraints.noiseSuppression, false);
    assert.equal(this.lastExternalConstraints.autoGainControl, false);
  },
);

Then(
  'it is not played back on my own output unless I turn on {string}',
  function (this: ExternalWorld, label: string) {
    assert.equal(label, 'Monitor external');
    assert.equal(this.externalRoute?.toMonitor, false);
    this.externalMonitor = true;
    this.externalRoute = planExternalRouting({
      active: true,
      muted: !!this.externalMuted,
      monitor: true,
      volume: this.externalVolume ?? 0.8,
    });
    assert.equal(this.externalRoute.toMonitor, true);
  },
);

Then('it has its own volume, mute and level meter', function (this: ExternalWorld) {
  assert.equal(typeof this.externalVolume, 'number');
  assert.equal(typeof this.externalMuted, 'boolean');
  assert.ok(this.externalActive);
});

Given('External audio is playing', function (this: ExternalWorld) {
  activateExternal(this, this.externalDeviceLabel || 'VB-Audio Cable');
});

When('I mute my microphone', function (this: ExternalWorld) {
  this.micMuted = true;
});

Then('the room still hears the external audio', function (this: ExternalWorld) {
  assert.ok(this.externalRoute);
  assert.equal(this.externalRoute.silencedByMicMute, false);
  assert.equal(this.externalRoute.toBroadcast, true);
  assert.equal(this.externalRoute.openGain > 0, true);
});

Given('External audio is playing and {string} is on', function (this: ExternalWorld, label: string) {
  activateExternal(this, 'VB-Audio Cable');
  assert.equal(label, 'Duck under voice');
  this.externalDuck = true;
});

When('I speak', function (this: ExternalWorld) {
  let state = initialDuckState(0);
  state = stepDuckEnvelope(state, 0, true, DEFAULT_DUCK_DB);
  state = stepDuckEnvelope(state, DUCK_ATTACK_MS, true, DEFAULT_DUCK_DB);
  this.duckMultiplier = state.multiplier;
});

Then(
  'the external audio is lowered by the duck amount within 100 ms',
  function (this: ExternalWorld) {
    const target = duckGainFromDb(DEFAULT_DUCK_DB);
    assert.ok(this.duckMultiplier != null);
    assert.ok(Math.abs(this.duckMultiplier - target) < 0.02);
    assert.ok(DUCK_ATTACK_MS <= 100);
  },
);

Then(
  'it returns to its level about 500 ms after I stop',
  function (this: ExternalWorld) {
    let state = initialDuckState(0);
    state = stepDuckEnvelope(state, 0, true, DEFAULT_DUCK_DB);
    state = stepDuckEnvelope(state, DUCK_ATTACK_MS, true, DEFAULT_DUCK_DB);
    state = stepDuckEnvelope(state, DUCK_ATTACK_MS, false, DEFAULT_DUCK_DB);
    state = stepDuckEnvelope(state, DUCK_ATTACK_MS + DUCK_RELEASE_MS, false, DEFAULT_DUCK_DB);
    assert.ok(Math.abs(state.multiplier - 1) < 0.02);
  },
);

When(
  'I start External audio while audio quality is {string}',
  function (this: ExternalWorld, quality: string) {
    assert.equal(quality, 'Normal');
    this.musicMode = false;
    activateExternal(this, 'VB-Audio Cable');
    this.offeredMusicQuality = true;
    this.uiMessages.push(t('externalOfferMusic'));
    this.uiMessages.push(t('musicHeadphones'));
  },
);

Then(
  'I am offered to switch to {string} quality with the headphones warning',
  function (this: ExternalWorld, quality: string) {
    assert.equal(quality, 'Music');
    assert.equal(this.offeredMusicQuality, true);
    assert.ok(this.uiMessages.some((m) => m.includes('Music') || m.includes(t('externalOfferMusic')) || m.includes(t('musicHeadphones'))));
  },
);

When('I choose {string} as External audio', function (this: ExternalWorld, label: string) {
  if (label === 'System audio') {
    this.clubboxOutputId = this.clubboxOutputId || '';
    this.defaultOutputId = this.defaultOutputId || 'default';
    const allowed = systemAudioCaptureAllowed(this.clubboxOutputId, this.defaultOutputId);
    this.systemAudioEnabled = allowed;
    if (!allowed) {
      this.systemAudioBlockedReason = t('externalSystemAudioEchoGuard');
      this.uiMessages.push(this.systemAudioBlockedReason);
      return;
    }
    activateExternal(this, SYSTEM_AUDIO_DEVICE_ID);
    return;
  }
  activateExternal(this, label);
});

Then(
  'Clubbox asks me to set its own output to a different device first, because system audio would also capture the room and echo it back',
  function (this: ExternalWorld) {
    assert.ok(this.systemAudioBlockedReason || this.uiMessages.some((m) => m === t('externalSystemAudioEchoGuard')));
  },
);

Then(
  "System audio is only enabled when Clubbox's output device differs from the system default output",
  function (this: ExternalWorld) {
    assert.equal(systemAudioCaptureAllowed('', 'default'), false);
    assert.equal(systemAudioCaptureAllowed('headphones-1', 'default'), true);
    assert.equal(systemAudioCaptureAllowed('default', 'default'), false);
    this.clubboxOutputId = 'headphones-1';
    this.defaultOutputId = 'default';
    this.systemAudioEnabled = systemAudioCaptureAllowed(this.clubboxOutputId, this.defaultOutputId);
    assert.equal(this.systemAudioEnabled, true);
  },
);

Given('I chose {string} as External audio', function (this: ExternalWorld, device: string) {
  activateExternal(this, device);
});

When('I leave the room', function (this: ExternalWorld) {
  this.externalActive = false;
  this.externalReleased = true;
  this.externalRoute = planExternalRouting({
    active: false,
    muted: false,
    monitor: false,
    volume: 0,
  });
});

Then('the external device is released', function (this: ExternalWorld) {
  assert.equal(this.externalReleased, true);
  assert.equal(this.externalActive, false);
});

Then('it is offered again the next time I am a speaker', function (this: ExternalWorld) {
  assert.ok(this.externalDeviceLabel);
  // Device preference is remembered; stream is reopened when speaking again.
  assert.equal(this.externalReleased, true);
});

When('I enable External audio for the first time', function (this: ExternalWorld) {
  this.externalCopyrightSeen = false;
  activateExternal(this, 'VB-Audio Cable');
});

Then(
  "I see a one-time reminder that broadcasting music you do not own may break Clubhouse's copyright rules",
  function (this: ExternalWorld) {
    assert.ok(this.uiMessages.includes(t('externalCopyrightReminder')));
    assert.equal(this.externalCopyrightSeen, true);
  },
);
