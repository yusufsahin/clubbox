import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseChatPostBlock, roomChatComposerState } from '../src/api/chatPostBlock.ts';
import type { CHChannelDetail } from '../src/api/types.ts';
import { html } from '../src/ui/html.ts';
import { stageView } from '../src/ui/views/stage.ts';

test('parseChatPostBlock reads follow_user CTA', () => {
  const block = parseChatPostBlock({
    reason: 'must_follow',
    title: 'Follow to chat',
    body: 'Follow the host to send messages.',
    name: 'Host',
    avatar_url: 'https://example.com/a.png',
    cta: { type: 'follow_user', target_user_id: 42, current_state: 'none' },
  });
  assert.ok(block);
  assert.equal(block?.title, 'Follow to chat');
  assert.equal(block?.cta?.type, 'follow_user');
  assert.equal(block?.cta?.target_user_id, 42);
});

test('roomChatComposerState blocks when chat_post_block present', () => {
  const channel = {
    channel_id: 1,
    topic: 't',
    num_speakers: 1,
    num_all: 1,
    users: [],
    is_chat_enabled: true,
    chat_post_block: {
      title: 'Follow to chat',
      cta: { type: 'follow_user', target_user_id: 7 },
    },
  } as CHChannelDetail;
  const state = roomChatComposerState(channel);
  assert.equal(state.canPost, false);
  assert.equal(state.block?.cta?.target_user_id, 7);
});

test('roomChatComposerState respects can_post_to_chat false', () => {
  const channel = {
    channel_id: 1,
    topic: 't',
    num_speakers: 1,
    num_all: 1,
    users: [],
    is_chat_enabled: true,
    user_capabilities: { can_post_to_chat: false },
  } as CHChannelDetail;
  assert.equal(roomChatComposerState(channel).canPost, false);
});

test('roomChatComposerState allows post when chat on and no gate', () => {
  const channel = {
    channel_id: 1,
    topic: 't',
    num_speakers: 1,
    num_all: 1,
    users: [],
    is_chat_enabled: true,
    user_capabilities: { can_post_to_chat: true },
  } as CHChannelDetail;
  assert.equal(roomChatComposerState(channel).canPost, true);
});

test('stage chat panel shows follow CTA instead of composer when blocked', () => {
  const out = stageView(
    html`<div data-col>col</div>`,
    html``,
    true,
    false,
    {
      title: 'Follow to chat',
      body: 'Follow the host first.',
      cta: { type: 'follow_user', target_user_id: 99 },
    },
    false,
  ).value;
  assert.match(out, /data-chat-post-block/);
  assert.match(out, /data-action="follow-user"/);
  assert.match(out, /data-user-id="99"/);
  assert.doesNotMatch(out, /id="chat-input"/);
  assert.doesNotMatch(out, /data-action="send-chat"/);
});

test('stage chat panel shows composer when posting is allowed', () => {
  const out = stageView(html`<div data-col>col</div>`, html``, true, false, null, true).value;
  assert.match(out, /id="chat-input"/);
  assert.match(out, /data-action="send-chat"/);
  assert.doesNotMatch(out, /data-chat-post-block/);
});
