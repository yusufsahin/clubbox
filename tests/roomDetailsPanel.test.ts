import assert from 'node:assert/strict';
import test from 'node:test';
import { roomDetailsPanel } from '../src/ui/components/roomDetailsPanel.ts';

const base = {
  topic: 'Morning show',
  replaysOn: true,
  audioQuality: 'normal' as const,
  monitorEnabled: false,
  voiceEffect: 'none',
  voiceEffectOptions: [{ id: 'none', label: 'None' }],
  spatialAudio: false,
  canMuteAll: false,
  canShare: false,
  canModerate: false,
  canRename: false,
  canPing: false,
  canEnd: false,
  canChangeVisibility: false,
  canHandraise: false,
  visibilityMode: 'open' as const,
  handraiseMode: '1' as const,
  helpUrl: 'https://support.clubhouse.com/hc/en-us/articles/360059385913',
  showExternalAudio: false,
  externalDevices: [] as { id: string; label: string }[],
  externalDeviceId: '',
  externalVolume: 1,
  externalMuted: false,
  externalMonitor: false,
  externalDuck: false,
  externalDuckDb: -12,
  externalActive: false,
  systemAudioAvailable: false,
  systemAudioBlockedReason: '',
  micVolume: 0.5,
  audienceSearch: 'ada',
};

test('room details bind mic gain and audience search', () => {
  const html = String(roomDetailsPanel(base));
  assert.match(html, /id="room-mic-gain"/);
  assert.match(html, /id="room-mic-gain"[^>]*value="0\.5"/);
  assert.equal(html.includes('data-action="set-mic-gain"'), false);
  assert.match(html, /id="audience-search-details"/);
  assert.match(html, /id="audience-search-details"[^>]*value="ada"/);
  assert.match(html, /id="room-spatial-audio"[^>]*data-action="toggle-spatial-audio"/);
});
