import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cockpitBar, type CockpitState } from '../src/ui/components/cockpitBar.ts';

function base(overrides: Partial<CockpitState> = {}): CockpitState {
  return {
    muted: false,
    mixerMic: false,
    showMusicMute: false,
    musicMuted: false,
    recording: false,
    handRaised: false,
    handDisabled: true,
    canRaiseHand: false,
    canJoinStage: false,
    showAudioRetry: false,
    isSpeaker: true,
    inRoom: true,
    roomTitle: 'Room',
    effects: [],
    latestChat: '',
    unreadChat: 0,
    chatOpen: false,
    canChat: true,
    canClip: false,
    canRecord: false,
    recordHint: '',
    reactionsOpen: false,
    soundsOpen: false,
    canReact: false,
    canGifReact: false,
    overflowOpen: false,
    ...overrides,
  };
}

test('cockpit hides Music mute when external is inactive', () => {
  const markup = cockpitBar(base({ showMusicMute: false })).value;
  assert.doesNotMatch(markup, /data-action="toggle-music-mute"/);
  assert.doesNotMatch(markup, /data-room-bar-item="music"/);
});

test('cockpit shows Music mute when external is active', () => {
  const markup = cockpitBar(base({ showMusicMute: true, musicMuted: false })).value;
  assert.match(markup, /data-action="toggle-music-mute"/);
  assert.match(markup, /data-room-bar-item="music"/);
  assert.match(markup, /room-bar-music is-active/);
});

test('cockpit Music mute reflects muted state', () => {
  const markup = cockpitBar(base({ showMusicMute: true, musicMuted: true })).value;
  assert.match(markup, /data-action="toggle-music-mute"/);
  assert.doesNotMatch(markup, /room-bar-music is-active/);
});
