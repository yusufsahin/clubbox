import assert from 'node:assert/strict';
import test from 'node:test';
import { markup } from '../src/ui/html.ts';
import { stageColumn, type StageState } from '../src/ui/views/stage.ts';
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
    canMod: false,
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
    canMod: false,
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
  assert.doesNotMatch(html, /data-action="speaker-menu"/);
});
