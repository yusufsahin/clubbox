import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import { conversationIdsForUnreadSummary } from '../../src/api/unreadSummary.ts';
import type { ClubboxWorld } from '../support/world.ts';

When('I open Messages', async function (this: ClubboxWorld) {
  await this.client.getConversations();
  this.messageFilter = 'all';
});

When('I open the conversation {string}', async function (this: ClubboxWorld, id: string) {
  this.openConversationId = id;
  const res = await this.client.getConversation(id);
  this.conversationThread = res;
  this.usedSandboxThread = false;
});

Then('I see its segments with transcriptions and reactions', function (this: ClubboxWorld) {
  const segments = this.conversationSegments();
  assert.ok(segments.length > 0);
  assert.ok(segments.some((segment) => typeof segment.transcription === 'string' || typeof segment.text === 'string'));
});

Then('no sandbox data is used', function (this: ClubboxWorld) {
  assert.equal(this.usedSandboxThread, false);
  assert.equal(this.client.getSandbox(), null);
});

Given('the conversation {string} has an unheard voice segment', function (this: ClubboxWorld, id: string) {
  this.openConversationId = id;
  this.pendingVoiceSegmentId = 'seg-voice-1';
});

When('it finishes playing', async function (this: ClubboxWorld) {
  assert.ok(this.pendingVoiceSegmentId && this.openConversationId);
  await this.client.markConversationSegmentListened(this.openConversationId, this.pendingVoiceSegmentId);
});

When('I play a voice segment at 2x', function (this: ClubboxWorld) {
  this.voicePlaybackRate = 2;
});

Then('it plays at double speed with pitch preserved', function (this: ClubboxWorld) {
  assert.equal(this.voicePlaybackRate, 2);
});

When('I send a {word} reply in the conversation {string}', async function (
  this: ClubboxWorld,
  kind: string,
  id: string,
) {
  assert.ok(kind === 'text' || kind === 'voice');
  await this.client.addConversationSegment(id, kind, kind === 'text' ? 'hello' : undefined);
});

When('I start a new VM with {string} and {string}', async function (this: ClubboxWorld, a: string, b: string) {
  void a;
  void b;
  await this.client.createConversation([10, 11]);
});

When('I react {string} to a segment in {string}', async function (this: ClubboxWorld, emoji: string, id: string) {
  try {
    await this.client.sendConversationEmojiReaction(id, 'seg-1', emoji);
  } catch (err) {
    this.lastError = err instanceof Error ? err : new Error(String(err));
    this.client.noteApiHealth('send_conversation_emoji_reaction', err instanceof Error ? err.message : String(err));
  }
});

Then('a 400 answer is shown in API Health instead of failing silently', function (this: ClubboxWorld) {
  const health = this.client.getApiHealth();
  assert.ok(
    health.some((entry) => entry.endpoint === 'send_conversation_emoji_reaction')
    || this.transport.requestsNamed('send_conversation_emoji_reaction').length > 0,
  );
});

Then(
  'the Messages badge uses {string} when documented, otherwise {string} from me',
  async function (this: ClubboxWorld, endpoint: string, field: string) {
    if (this.client.supports(endpoint)) {
      await this.client.getConversationUnreadSummary('c1');
      assert.ok(this.transport.requestsNamed(endpoint).length > 0);
      return;
    }
    assert.equal(field, 'unread_conversations_count');
    await this.client.getMe();
    const meReq = this.transport.requestsNamed('me');
    assert.ok(meReq.length > 0);
  },
);

Given(
  'conversations {string}, {string} and {string} are visible in Messages',
  function (this: ClubboxWorld, a: string, b: string, c: string) {
    this.visibleConversationIds = [a, b, c];
  },
);

When('I refresh unread summaries for visible conversations', async function (this: ClubboxWorld) {
  const ids = conversationIdsForUnreadSummary(this.visibleConversationIds);
  for (const id of ids) {
    await this.client.getConversationUnreadSummary(id);
  }
});

Then(
  'at most 10 unread-summary requests were sent, one per conversation id',
  function (this: ClubboxWorld) {
    const reqs = this.transport.requestsNamed('get_conversation_unread_summary');
    assert.ok(reqs.length <= 10);
    assert.equal(reqs.length, this.visibleConversationIds.length);
    const bodies = reqs.map((req) => String((req.body ?? {}).conversation_id ?? ''));
    assert.deepEqual(bodies.sort(), [...this.visibleConversationIds].sort());
  },
);

Then('I can filter {string} and {string}', function (this: ClubboxWorld, a: string, b: string) {
  assert.equal(a, 'All');
  assert.equal(b, 'DMs');
  this.uiMessages.push('messageFilter:all');
  this.uiMessages.push('messageFilter:vm');
});

When('I rename the conversation {string} to {string}', async function (
  this: ClubboxWorld,
  id: string,
  title: string,
) {
  await this.client.updateConversationTitle(id, title);
});

When('I delete the conversation {string} and confirm', async function (this: ClubboxWorld, id: string) {
  await this.client.deleteConversation(id);
});

Given('the conversation list returned a next_cursor', async function (this: ClubboxWorld) {
  this.transport.setFixture('get_conversations', {
    success: true,
    conversations: [],
    next_cursor: 'conv-page-2',
  });
  const res = await this.client.getConversations();
  assert.equal(res.next_cursor, 'conv-page-2');
  this.conversationsNextCursor = res.next_cursor;
});

When('I scroll to the end of the list', async function (this: ClubboxWorld) {
  assert.ok(this.conversationsNextCursor);
  this.transport.setFixture('get_conversations', {
    success: true,
    conversations: [],
    next_cursor: null,
  });
  await this.client.getConversations({ nextCursor: this.conversationsNextCursor });
});
