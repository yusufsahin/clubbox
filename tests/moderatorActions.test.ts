import assert from 'node:assert/strict';
import test from 'node:test';
import { ClubhouseApiClient } from '../src/api/client.ts';
import {
  moderatorActionsFlags,
  noteUnknownModeratorAction,
  parseModeratorActionHistory,
  queueRowHasDismiss,
  resetUnknownModeratorActionLog,
} from '../src/api/moderatorActions.ts';
import { cockpitBar } from '../src/ui/components/cockpitBar.ts';
import { moderatorActionsPanelView } from '../src/ui/components/moderatorActionsPanel.ts';

type MobileCall = { endpoint: string; body: Record<string, unknown> | undefined };

function installFakeMobile(calls: MobileCall[]): () => void {
  const previous = (globalThis as { window?: unknown }).window;
  const mobileCall = async (endpoint: string, body?: Record<string, unknown>) => {
    calls.push({ endpoint, body });
    if (endpoint === 'get_moderator_action_history') {
      return {
        ok: true,
        status: 200,
        body: JSON.stringify({
          success: true,
          history: [
            {
              id: 1,
              action: 'mute_speaker',
              actor: { name: 'Host', user_id: 1 },
              target: { name: 'Guest', user_id: 2 },
              time_created: '2026-10-12T12:00:00.000Z',
            },
          ],
        }),
      };
    }
    return { ok: true, status: 200, body: JSON.stringify({ success: true }) };
  };
  (globalThis as { window: { electronAPI: { mobileCall: typeof mobileCall } } }).window = {
    electronAPI: { mobileCall },
  };
  return () => {
    if (previous === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window: unknown }).window = previous;
  };
}

test('moderatorActionsFlags require history/queue capabilities', () => {
  const supports = () => true;
  assert.equal(
    moderatorActionsFlags({ can_view_moderator_actions_history: false, can_edit_handraise_queue: false, can_invite: false }, supports).canOpenPanel,
    false,
  );
  assert.equal(
    moderatorActionsFlags({ can_view_moderator_actions_history: true }, supports).canHistory,
    true,
  );
  assert.equal(
    moderatorActionsFlags({ can_edit_handraise_queue: true }, supports).canEditQueueMode,
    true,
  );
});

test('history + queue-mode bodies go through mobileCall', async () => {
  const calls: MobileCall[] = [];
  const restore = installFakeMobile(calls);
  try {
    const client = new ClubhouseApiClient({ useSandbox: false, webSession: true, userId: 1 });
    await client.getModeratorActionHistory('abc', { cursor: 'c1', pageSize: 25 });
    await client.updateHandraiseQueueSetting('abc', 2);
    assert.equal(calls[0]?.endpoint, 'get_moderator_action_history');
    assert.deepEqual(calls[0]?.body, { channel: 'abc', cursor: 'c1', page_size: 25 });
    assert.equal(calls[1]?.endpoint, 'update_handraise_queue_setting');
    assert.deepEqual(calls[1]?.body, { channel: 'abc', handraise_queue_setting: 2 });
  } finally {
    restore();
  }
});

test('parseModeratorActionHistory sorts newest first and keeps unknown kinds', () => {
  resetUnknownModeratorActionLog();
  const parsed = parseModeratorActionHistory({
    history: [
      {
        id: 'old',
        action: 'invite_speaker',
        actor: { name: 'A' },
        time_created: '2026-10-12T10:00:00.000Z',
      },
      {
        id: 'new',
        action: 'brand_new_kind',
        actor: { name: 'B' },
        target: { name: 'C' },
        time_created: '2026-10-12T12:00:00.000Z',
      },
    ],
    next_cursor: 'next',
  });
  assert.equal(parsed.items[0]?.id, 'new');
  assert.equal(parsed.items[0]?.action, 'brand_new_kind');
  assert.equal(parsed.nextCursor, 'next');
  noteUnknownModeratorAction('brand_new_kind');
  noteUnknownModeratorAction('brand_new_kind');
});

test('queueRowHasDismiss stays false without explicit API fields', () => {
  assert.equal(queueRowHasDismiss({ user_id: 1, name: 'A', username: 'a', photo_url: null }), false);
  assert.equal(
    queueRowHasDismiss({
      user_id: 1,
      name: 'A',
      username: 'a',
      photo_url: null,
      can_dismiss: true,
    } as never),
    true,
  );
});

test('cockpit bar hides Moderator actions without capability', () => {
  const base = {
    muted: true,
    mixerMic: false,
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
    canReact: true,
    canGifReact: false,
    overflowOpen: false,
  };
  assert.equal(
    cockpitBar({ ...base, canModeratorActions: false }).value.includes('open-moderator-actions'),
    false,
  );
  assert.equal(
    cockpitBar({ ...base, canModeratorActions: true }).value.includes('data-action="open-moderator-actions"'),
    true,
  );
});

test('panel Requests Invite and History render known + unknown kinds', () => {
  const markup = moderatorActionsPanelView({
    tab: 'requests',
    canRequests: true,
    canHistory: true,
    canEditQueueMode: true,
    queueOptions: [
      { value: 0, label: 'open stage', sub_label: 'anyone can speak' },
      { value: 2, label: 'request to join' },
    ],
    queueSetting: 2,
    queueUsers: [{ user_id: 9, name: 'Queued', username: 'q', photo_url: null }],
    history: [],
    historyCursor: null,
    loading: false,
  }).value;
  assert.equal(markup.includes('data-action="invite-stage"'), true);
  assert.equal(markup.includes('data-action="set-handraise-queue-setting"'), true);
  assert.equal(markup.includes('value="2"'), true);

  const history = moderatorActionsPanelView({
    tab: 'history',
    canRequests: true,
    canHistory: true,
    canEditQueueMode: false,
    queueOptions: [],
    queueSetting: null,
    queueUsers: [],
    history: [
      {
        id: '1',
        action: 'mute_speaker',
        actorName: 'Host',
        targetName: 'Guest',
        timeLabel: 'now',
        timeSort: 2,
      },
      {
        id: '2',
        action: 'weird_new_action',
        actorName: 'Host',
        targetName: '',
        timeLabel: '',
        timeSort: 1,
      },
    ],
    historyCursor: 'c2',
    loading: false,
  }).value;
  assert.equal(history.includes('mute_speaker'), true);
  assert.equal(history.includes('weird_new_action'), true);
  assert.equal(history.includes('data-action="load-more-moderator-history"'), true);
});
