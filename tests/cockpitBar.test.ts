import assert from 'node:assert/strict';
import test from 'node:test';
import { cockpitBar } from '../src/ui/components/cockpitBar.ts';
import { icon } from '../src/ui/icons.ts';

const base = {
  muted: false,
  recording: false,
  handRaised: false,
  handDisabled: false,
  canRaiseHand: false,
  showAudioRetry: false,
  isSpeaker: true,
  inRoom: true,
  roomTitle: 'Morning show',
  effects: [] as { id: string; name: string; icon: string; hotkey: string; type: 'synth'; synthType: 'applause'; volume: number }[],
  latestChat: '',
  unreadChat: 0,
  chatOpen: false,
  canChat: true,
  canClip: false,
  canRecord: true,
  recordHint: '',
  reactionsOpen: false,
  soundsOpen: false,
  canReact: true,
  canGifReact: false,
  overflowOpen: false,
  showMusicMute: true,
  musicMuted: false,
  soundpadVolume: 0.8,
};

test('music and sounds use different icons', () => {
  const html = String(cockpitBar(base));
  assert.match(html, /data-room-bar-item="sounds"/);
  assert.match(html, /data-room-bar-item="music"/);
  assert.notEqual(String(icon('music')), String(icon('speaker')));
  assert.ok(html.includes('M9 18V5l12-2v13'));
  assert.ok(html.includes('M11 5L6 9H3v6h3l5 4V5z'));
});

test('more menu lists folded room actions', () => {
  const html = String(cockpitBar({ ...base, overflowOpen: true }));
  assert.match(html, /data-room-bar-overflow/);
  assert.match(html, /data-action="toggle-chat"/);
  assert.match(html, /data-action="toggle-record"/);
  const overflow = html.slice(html.indexOf('data-room-bar-overflow'));
  assert.equal(overflow.includes('data-action="open-room-details"'), false);
  assert.match(html, /class="[^"]*room-bar-foldable[^"]*"[\s\S]*?data-room-bar-item="chat"/);
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
  assert.match(html, /id="soundpad-vol-label">40%/);
});

test('recording keeps the timer off the hidden label', () => {
  const html = String(cockpitBar({ ...base, recording: true }));
  assert.match(html, /id="record-timer"/);
  assert.equal(/class="room-bar-label"[^>]*id="record-timer"/.test(html), false);
  assert.match(html, /class="room-bar-btn is-active record-active"/);
  assert.match(html, /id="record-timer"[^>]*>00:00/);
});
