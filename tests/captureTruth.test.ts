import assert from 'node:assert/strict';
import test from 'node:test';
import { SHORTCUT_ACTIONS, type ShortcutMap } from '../src/shortcuts.ts';
import {
  captureTruthFromSettings,
  formatCaptureLog,
  needsVirtualFormatHint,
  showWindowsFormatHint,
  type CaptureTruth,
} from '../src/audio/captureTruth.ts';
import type { ClubhouseConfig } from '../src/api/client.ts';
import { t } from '../src/i18n/index.ts';
import { markup } from '../src/ui/html.ts';
import { settingsView } from '../src/ui/views/settings.ts';

const cable: CaptureTruth = {
  channelCount: 2,
  sampleRate: 48000,
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  family: 'vbcable',
  side: 'capture',
};

test('capture log uses getSettings fields and omits the device id', () => {
  const truth = captureTruthFromSettings({
    channelCount: 2,
    sampleRate: 48000,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    deviceId: 'secret-device-id',
    label: 'CABLE Output (2- VB-Audio Virtual Cable)',
  });
  const line = formatCaptureLog('mic', truth);
  assert.equal(line, '[Clubbox] capture mic ch=2 sr=48000 aec=false ns=false agc=false family=vbcable');
  assert.equal(line.includes('secret-device-id'), false);
  assert.equal(formatCaptureLog('external', truth).startsWith('[Clubbox] capture external '), true);
});

test('virtual format hint is for mono or non-48 kHz cables, including the render side', () => {
  assert.equal(needsVirtualFormatHint(cable), false);
  assert.equal(needsVirtualFormatHint({ ...cable, channelCount: 1 }), true);
  assert.equal(needsVirtualFormatHint({ ...cable, sampleRate: 44100 }), true);
  assert.equal(needsVirtualFormatHint({ ...cable, family: 'physical', side: 'capture', channelCount: 1, sampleRate: 44100 }), false);
  assert.equal(needsVirtualFormatHint({ ...cable, side: 'render', sampleRate: 44100 }), true);
  assert.equal(showWindowsFormatHint([cable, null]), false);
  assert.equal(showWindowsFormatHint([cable, { ...cable, family: 'voicemeeter', sampleRate: 44100 }]), true);
});

test('connection status shows capture truth, both format hints, and the ASIO bridge note', () => {
  const shortcuts = Object.fromEntries(SHORTCUT_ACTIONS.map((action) => [action, ''])) as ShortcutMap;
  const config = {
    userId: null,
    deviceId: 'not-a-capture-id',
    appBuild: '1',
    appVersion: '1',
    agoraAppId: 'test',
    useSandbox: true,
    webSession: false,
    language: 'en',
    allowUnverified: false,
    allowLocalRecording: false,
    experimentalActions: false,
    requestLogging: false,
    unsupportedRoutes: {},
    evidenceOverrides: {},
    confirmedExperimentalRoutes: [],
  } satisfies ClubhouseConfig;
  const html = markup(settingsView(
    config,
    shortcuts,
    null,
    false,
    null,
    [],
    null,
    [],
    null,
    {
      webSession: true,
      realtimeKeys: true,
      pubnubConnected: true,
      agoraJoined: true,
      agoraResult: 'ok',
      broadcastExtras: true,
      verboseVoiceLog: false,
      micCapture: { ...cable, channelCount: 1 },
      externalCapture: null,
      rtc: null,
    },
  ));
  assert.match(html, /data-connection-capture="mic"/);
  assert.match(html, /1 ch/);
  assert.match(html, /family vbcable/);
  assert.match(html, new RegExp(t('captureFormatHint').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, new RegExp(t('captureFormatHintRender').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, /data-asio-bridge/);
  assert.equal(html.includes('secret-device-id'), false);
});
