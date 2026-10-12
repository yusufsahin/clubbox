import assert from 'node:assert/strict';
import test from 'node:test';
import { ClubhouseApiClient } from '../src/api/client.ts';
import { moderatorSettingsFlags, usersFromQueuePayload } from '../src/api/moderatorSettings.ts';
import { roomDetailsPanel, type RoomDetailsState } from '../src/ui/components/roomDetailsPanel.ts';
import { chatList } from '../src/ui/views/stage.ts';

function baseDetails(extra: Partial<RoomDetailsState>): string {
  const state: RoomDetailsState = {
    topic: 'Room',
    replaysOn: true,
    audioQuality: 'normal',
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
    showExternalAudio: false,
    externalDevices: [],
    externalDeviceId: '',
    externalVolume: 0.8,
    externalMuted: false,
    externalMonitor: false,
    externalDuck: true,
    externalDuckDb: -12,
    externalActive: false,
    systemAudioAvailable: false,
    systemAudioBlockedReason: '',
    ...extra,
  };
  return roomDetailsPanel(state).value;
}

type MobileCall = { endpoint: string; body: Record<string, unknown> | undefined };

function installFakeMobile(calls: MobileCall[]): () => void {
  const previous = (globalThis as { window?: unknown }).window;
  const mobileCall = async (endpoint: string, body?: Record<string, unknown>) => {
    calls.push({ endpoint, body });
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

test('moderator settings bodies go through mobileCall', async () => {
  const calls: MobileCall[] = [];
  const restore = installFakeMobile(calls);
  try {
    const client = new ClubhouseApiClient({ useSandbox: false, webSession: true, userId: 1 });
    await client.checkChannelLink('abc', 'https://example.com');
    await client.addChannelLink('abc', 'https://example.com');
    await client.removeChannelLink('abc');
    await client.disableChannelMessages('abc');
    await client.enableChannelMessages('abc');
    await client.deleteChannelMessage('abc', 'm1');
    await client.disableReplay('abc');
    await client.updateNsfwStatus('abc', true);
    await client.getHandraiseQueue('abc');
    await client.getSuggestedSpeakers('abc');
    assert.deepEqual(calls.map((c) => c.endpoint), [
      'check_channel_link',
      'add_channel_link',
      'remove_channel_link',
      'disable_channel_messages',
      'enable_channel_messages',
      'delete_channel_message',
      'disable_replay',
      'update_nsfw_status',
      'get_handraise_queue',
      'get_suggested_speakers',
    ]);
    assert.deepEqual(calls[0]?.body, { channel: 'abc', link: 'https://example.com' });
    assert.deepEqual(calls[5]?.body, { channel: 'abc', message_id: 'm1' });
    assert.deepEqual(calls[7]?.body, { channel: 'abc', is_nsfw: true });
  } finally {
    restore();
  }
});

test('moderatorSettingsFlags hide controls when capability is false', () => {
  const supports = () => true;
  const blocked = moderatorSettingsFlags(
    { can_edit_pinned_links: false, can_disable_room_chat: false, can_disable_replay: false },
    { is_replay_enabled: true, is_pinned_links_available: true },
    supports,
  );
  assert.equal(blocked.canPinnedLink, false);
  assert.equal(blocked.canToggleChat, false);
  assert.equal(blocked.canDeleteChat, false);
  assert.equal(blocked.canDisableReplay, false);
});

test('disable replay only when replay is on', () => {
  const supports = (endpoint: string) => endpoint === 'disable_replay';
  assert.equal(
    moderatorSettingsFlags(undefined, { is_replay_enabled: true }, supports).canDisableReplay,
    true,
  );
  assert.equal(
    moderatorSettingsFlags(undefined, { is_replay_enabled: false }, supports).canDisableReplay,
    false,
  );
});

test('usersFromQueuePayload prefers users_in_queue', () => {
  const users = usersFromQueuePayload({
    users: [{ user_id: 1, name: 'A', username: 'a', photo_url: null }],
    users_in_queue: [{ user_id: 2, name: 'B', username: 'b', photo_url: null }],
  });
  assert.equal(users.length, 1);
  assert.equal(users[0]?.user_id, 2);
});

test('non-moderator details hide 28.3 settings controls', () => {
  const markup = baseDetails({ canModerate: false });
  assert.equal(markup.includes('data-action="save-pinned-link"'), false);
  assert.equal(markup.includes('data-action="toggle-room-chat"'), false);
  assert.equal(markup.includes('data-action="disable-replay"'), false);
  assert.equal(markup.includes('data-action="toggle-room-nsfw"'), false);
  assert.equal(markup.includes('data-action="refresh-handraise-queue"'), false);
});

test('moderator details show gated 28.3 controls', () => {
  const markup = baseDetails({
    canModerate: true,
    canPinnedLink: true,
    pinnedLink: 'https://example.com',
    canToggleChat: true,
    canDisableReplay: true,
    canNsfw: true,
    canHandraiseQueue: true,
    canSuggestedSpeakers: true,
    queueUsers: [{ user_id: 9, name: 'Queued', username: 'q', photo_url: null }],
  });
  assert.equal(markup.includes('data-action="save-pinned-link"'), true);
  assert.equal(markup.includes('data-action="remove-pinned-link"'), true);
  assert.equal(markup.includes('data-action="toggle-room-chat"'), true);
  assert.equal(markup.includes('data-action="disable-replay"'), true);
  assert.equal(markup.includes('data-action="toggle-room-nsfw"'), true);
  assert.equal(markup.includes('data-action="refresh-handraise-queue"'), true);
  assert.equal(markup.includes('data-action="invite-stage"'), true);
});

test('chat delete button only when canDelete', () => {
  const msg = {
    id: 'm1',
    message: 'hi',
    user_profile: { user_id: 1, name: 'A', username: 'a', photo_url: null },
    time_created: 1,
  };
  assert.equal(chatList([msg], { canDelete: false }).value.includes('delete-chat-message'), false);
  assert.equal(chatList([msg], { canDelete: true }).value.includes('data-action="delete-chat-message"'), true);
});
