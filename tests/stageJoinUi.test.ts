import assert from 'node:assert/strict';
import test from 'node:test';
import { html, markup } from '../src/ui/html.ts';
import { stageColumn, stageView, type StageState } from '../src/ui/views/stage.ts';
import type { CHChannelDetail } from '../src/api/types.ts';

function baseState(overrides: Partial<StageState> = {}): StageState {
  const channel: CHChannelDetail = {
    channel: 'open-mic',
    channel_id: 'ch-open',
    topic: 'Open mic',
    handraise_queue_setting: 0,
    is_handraise_enabled: false,
    users: [
      {
        user_id: 1,
        name: 'Host',
        is_speaker: true,
        is_moderator: true,
      },
      {
        user_id: 2,
        name: 'Listener',
        is_speaker: false,
      },
    ],
  };
  return {
    channel,
    me: { user_id: 2, name: 'Listener' },
    openSpeakerMenuId: null,
    audioDisconnected: false,
    moderator: false,
    canMute: false,
    canMakeModerator: false,
    canMoveToAudience: false,
    canInvite: false,
    canEnd: false,
    canMuteEveryone: false,
    canBlock: false,
    canRename: false,
    canHandraise: false,
    canReact: true,
    canGifReact: false,
    canPing: false,
    canChangeVisibility: false,
    hostToolsCallable: false,
    canFollow: false,
    canJoinStage: true,
    audienceSearch: '',
    handraiseMode: 'off',
    visibilityMode: 'open',
    ...overrides,
  };
}

test('open-stage audience sees Join stage CTA on the stage column', () => {
  const html = markup(stageColumn(baseState()));
  assert.match(html, /data-open-stage-banner/);
  assert.match(html, /data-action="join-open-stage"/);
  assert.match(html, /Join stage|Sahneye çık/);
});

test('speakers do not see Join stage CTA', () => {
  const html = markup(stageColumn(baseState({
    me: { user_id: 1, name: 'Host' },
    canJoinStage: false,
  })));
  assert.doesNotMatch(html, /data-open-stage-banner/);
});

test('moderator without host tools does not fake a presence status on speakers', () => {
  const html = markup(stageColumn(baseState({
    me: { user_id: 2, name: 'Listener' },
    moderator: true,
    canMute: false,
    canMakeModerator: false,
    canMoveToAudience: false,
    canBlock: false,
    canInvite: false,
    canJoinStage: false,
    channel: {
      channel: 'open-mic',
      channel_id: 'ch-open',
      topic: 'Open mic',
      users: [
        { user_id: 1, name: 'Host', username: 'host', is_speaker: true, is_moderator: true },
        { user_id: 2, name: 'Listener', is_speaker: true, is_moderator: true },
      ],
    },
  })));
  assert.doesNotMatch(html, /Temporarily unavailable|Geçici olarak kullanılamıyor/);
  // Other speakers: no host-tool menu. Self may still have Leave quietly.
  assert.doesNotMatch(html, /data-action="speaker-menu"[^>]*data-user-id="1"/);
  assert.doesNotMatch(html, /data-mod-action=/);
  assert.match(html, /data-action="speaker-menu"[^>]*data-user-id="2"/);
});

test('host mute / move / block stay on speaker menu when make moderator is unavailable', () => {
  const html = markup(stageColumn(baseState({
    me: { user_id: 1, name: 'Host' },
    moderator: true,
    canMute: true,
    canMakeModerator: false,
    canMoveToAudience: true,
    canBlock: true,
    canJoinStage: false,
    openSpeakerMenuId: 3,
    channel: {
      channel: 'open-mic',
      channel_id: 'ch-open',
      topic: 'Open mic',
      users: [
        { user_id: 1, name: 'Host', is_speaker: true, is_moderator: true },
        { user_id: 3, name: 'Ayse', is_speaker: true, is_moderator: false, is_muted: false },
        { user_id: 4, name: 'Listener', is_speaker: false },
      ],
    },
  })));
  assert.match(html, /data-mod-action="mute"/);
  assert.match(html, /data-mod-action="audience"/);
  assert.match(html, /data-mod-action="block"/);
  assert.doesNotMatch(html, /data-mod-action="moderator"/);
  // Self speaker card still offers Leave quietly via roomActionsFor.
  assert.match(html, /data-action="speaker-menu"[^>]*data-user-id="1"/);
});

test('host moderation actions render disabled with app-only tooltip when not callable', () => {
  const html = markup(stageColumn(baseState({
    me: { user_id: 1, name: 'Host' },
    moderator: true,
    canMute: true,
    canMakeModerator: true,
    canMoveToAudience: true,
    canBlock: true,
    hostToolsCallable: false,
    canJoinStage: false,
    openSpeakerMenuId: 3,
    channel: {
      channel: 'open-mic',
      channel_id: 'ch-open',
      topic: 'Open mic',
      users: [
        { user_id: 1, name: 'Host', is_speaker: true, is_moderator: true },
        { user_id: 3, name: 'Ayse', is_speaker: true, is_moderator: false, is_muted: false },
      ],
    },
  })));
  assert.match(html, /data-mod-action="mute"[^>]*disabled[^>]*title=&quot;Moderation is only available in the Clubhouse app&quot;/);
  assert.match(html, /data-mod-action="audience"[^>]*disabled/);
  assert.match(html, /data-mod-action="moderator"[^>]*disabled/);
  assert.match(html, /data-mod-action="block"[^>]*disabled/);
});

test('speaker menu order is mute, move, make mod, remove', () => {
  const html = markup(stageColumn(baseState({
    me: { user_id: 1, name: 'Host' },
    moderator: true,
    canMute: true,
    canMakeModerator: true,
    canMoveToAudience: true,
    canBlock: true,
    canJoinStage: false,
    openSpeakerMenuId: 3,
    channel: {
      channel: 'open-mic',
      channel_id: 'ch-open',
      topic: 'Open mic',
      users: [
        { user_id: 1, name: 'Host', is_speaker: true, is_moderator: true },
        { user_id: 3, name: 'Ayse', is_speaker: true, is_moderator: false, is_muted: false },
      ],
    },
  })));
  const mute = html.indexOf('data-mod-action="mute"');
  const audience = html.indexOf('data-mod-action="audience"');
  const moderator = html.indexOf('data-mod-action="moderator"');
  const block = html.indexOf('data-mod-action="block"');
  assert.ok(mute >= 0 && audience > mute && moderator > audience && block > moderator);
});

test('moderator can remove an audience member from the room', () => {
  const html = markup(stageColumn(baseState({
    me: { user_id: 1, name: 'Host' },
    moderator: true,
    canBlock: true,
    canInvite: true,
    canJoinStage: false,
    channel: {
      channel: 'open-mic',
      channel_id: 'ch-open',
      topic: 'Open mic',
      users: [
        { user_id: 1, name: 'Host', is_speaker: true, is_moderator: true },
        { user_id: 4, name: 'Listener', is_speaker: false },
      ],
    },
  })));
  assert.match(html, /data-mod-action="block"/);
  assert.match(html, /data-user-id="4"/);
});

test('headphones banner is a full-width strip above the stage row, dismissable', () => {
  const out = markup(stageView(html`<div data-col>col</div>`, html``, false, true));
  assert.match(out, /data-headphones-banner/);
  assert.match(out, /stage-strip-banner/);
  assert.match(out, /data-action="dismiss-headphones-banner"/);
  assert.match(out, /class="stage-main-row"/);
  // Banner must sit outside the content column (layout bug was flex-row stretch).
  const bannerAt = out.indexOf('data-headphones-banner');
  const rowAt = out.indexOf('stage-main-row');
  const colAt = out.indexOf('id="stage-column"');
  assert.ok(bannerAt >= 0 && rowAt > bannerAt && colAt > rowAt);
});

test('headphones banner omitted when not requested', () => {
  const out = markup(stageView(html`<div data-col>col</div>`, html``, false, false));
  assert.doesNotMatch(out, /data-headphones-banner/);
  assert.match(out, /class="stage-main-row"/);
});
