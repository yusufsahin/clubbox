import assert from 'node:assert/strict';
import test from 'node:test';
import { audioPublishProfile } from '../src/audio/audioQuality.ts';
import { roomDetailsPanel, type RoomDetailsState } from '../src/ui/components/roomDetailsPanel.ts';
import { stageView } from '../src/ui/views/stage.ts';
import { html } from '../src/ui/html.ts';

test('audio quality profile sets encoder and AEC ANS AGC', () => {
  const normal = audioPublishProfile('normal');
  const high = audioPublishProfile('high');
  const music = audioPublishProfile('music');
  assert.deepEqual(
    { encoder: normal.encoder, aec: normal.aec, ans: normal.ans, agc: normal.agc },
    { encoder: 'speech_standard', aec: true, ans: true, agc: true },
  );
  assert.deepEqual(
    { encoder: high.encoder, aec: high.aec, ans: high.ans, agc: high.agc },
    { encoder: 'high_quality', aec: true, ans: true, agc: true },
  );
  assert.deepEqual(
    { encoder: music.encoder, aec: music.aec, ans: music.ans, agc: music.agc },
    { encoder: { sampleRate: 48000, stereo: true, bitrate: 128 }, aec: false, ans: false, agc: false },
  );
  assert.equal(normal.aiDenoiserAllowed, true);
  assert.equal(high.aiDenoiserAllowed, true);
  assert.equal(music.aiDenoiserAllowed, false);
});

function details(quality: RoomDetailsState['audioQuality'], externalActive: boolean): string {
  const state: RoomDetailsState = {
    topic: 'Room',
    replaysOn: false,
    audioQuality: quality,
    monitorEnabled: false,
    voiceEffect: 'none',
    voiceEffectOptions: [{ id: 'none', label: 'None' }],
    spatialAudio: false,
    micVolume: 1,
    canMuteAll: false,
    canShare: false,
    canHideRoom: false,
    canSaveReplay: false,
    canModerate: false,
    canPinnedLink: false,
    pinnedLink: '',
    canToggleChat: false,
    chatEnabled: true,
    canDisableReplay: false,
    canNsfw: false,
    isNsfw: false,
    canHandraiseQueue: false,
    canSuggestedSpeakers: false,
    queueUsers: [],
    suggestedUsers: [],
    canRename: false,
    canPing: false,
    canEnd: false,
    canChangeVisibility: false,
    canHandraise: false,
    visibilityMode: 'open',
    handraiseMode: '1',
    audienceSearch: '',
    helpUrl: 'https://support.clubhouse.com/hc/en-us/articles/360059385913',
    showExternalAudio: true,
    externalDevices: [],
    externalDeviceId: '',
    externalVolume: 0.8,
    externalMuted: false,
    externalMonitor: false,
    externalDuck: true,
    externalDuckDb: -12,
    externalActive,
    systemAudioAvailable: false,
    systemAudioBlockedReason: '',
  };
  return roomDetailsPanel(state).value;
}

test('room details select keeps High selected', () => {
  const markup = details('high', false);
  assert.match(markup, /value="high" selected/);
  assert.doesNotMatch(markup, /value="normal" selected/);
  assert.doesNotMatch(markup, /value="music" selected/);
  assert.doesNotMatch(markup, /data-quality="music"/);
  assert.match(markup, /data-action="preview-voice-effect"/);
  assert.match(markup, /data-action="apply-voice-effect"/);
});

test('normal quality with external audio offers a one-tap music switch', () => {
  const markup = details('normal', true);
  assert.match(markup, /data-quality="music"/);
  assert.match(markup, /Switch to Music for better external audio/);
  assert.doesNotMatch(details('high', true), /data-quality="music"/);
});

test('music on stage shows the headphones banner', () => {
  const markup = stageView(html``, html``, false, true).value;
  assert.match(markup, /data-headphones-banner/);
  assert.match(markup, /Use headphones — echo cancellation is off/);
  assert.doesNotMatch(stageView(html``, html``, false, false).value, /data-headphones-banner/);
});
