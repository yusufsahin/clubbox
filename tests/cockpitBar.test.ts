import assert from 'node:assert/strict';
import test from 'node:test';
import { cockpitBar } from '../src/ui/components/cockpitBar.ts';
import { icon } from '../src/ui/icons.ts';

const base = {
  muted: false,
  musicMode: false,
  recording: false,
  handRaised: false,
  handDisabled: false,
  canRaiseHand: false,
  showAudioRetry: false,
  isSpeaker: true,
  inRoom: true,
  roomTitle: 'Morning show',
  effects: [
    { id: 'applause', name: 'Applause', icon: '👏', hotkey: '1', type: 'synth' as const, synthType: 'applause' as const, volume: 1 },
  ],
  latestChat: '',
  unreadChat: 0,
  chatOpen: false,
  canChat: true,
  canClip: false,
  canRecord: true,
  recordHint: '',
  micVolume: 0.6,
  monitorEnabled: false,
  reactionsOpen: false,
  soundsOpen: false,
  canReact: true,
  canGifReact: false,
  overflowOpen: false,
  showMusicMute: true,
  musicMuted: false,
  soundpadVolume: 0.8,
};

test('studio cockpit keeps mic meter, hear myself, music mode and pads', () => {
  const html = String(cockpitBar(base));
  assert.match(html, /id="mic-vol-slider"[^>]*value="0\.6"/);
  assert.match(html, /id="vu-meter-fill"/);
  assert.match(html, /data-action="toggle-monitor"/);
  assert.match(html, /data-action="toggle-music"/);
  assert.match(html, /data-action="play-sound" data-fx-id="applause"/);
  assert.match(html, /data-action="toggle-music-mute"/);
  assert.notEqual(String(icon('music')), String(icon('headphones')));
});

test('room title opens details and RH-15 items stay labeled', () => {
  const html = String(cockpitBar({ ...base, canRaiseHand: true, isSpeaker: false }));
  assert.match(html, /data-room-bar-item="title"[^>]*data-action="open-room-details"|data-action="open-room-details"[^>]*data-room-bar-item="title"/);
  for (const item of ['mic', 'hand', 'reactions', 'sounds', 'record', 'chat', 'details', 'leave']) {
    assert.match(html, new RegExp(`data-room-bar-item="${item}"`));
  }
});

test('chat shows unread badge and sounds slider uses engine volume', () => {
  const html = String(cockpitBar({
    ...base,
    unreadChat: 3,
    soundsOpen: true,
    soundpadVolume: 0.4,
  }));
  assert.match(html, /class="room-bar-badge">3</);
  assert.match(html, /id="soundpad-vol-slider"[^>]*value="0\.4"/);
});
