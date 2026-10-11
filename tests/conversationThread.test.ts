import assert from 'node:assert/strict';
import test from 'node:test';
import { readConversationThread } from '../src/api/conversationThread.ts';

test('readConversationThread maps nested fixture segments', () => {
  const thread = readConversationThread({
    success: true,
    conversation: {
      conversation_id: 'c1',
      segments: [
        { segment_id: 'seg-1', transcription: 'Hello there', text: 'Hello there' },
        { segment_id: 'seg-voice-1', transcription: 'Voice note', kind: 'voice' },
      ],
    },
  });
  assert.ok(thread);
  assert.equal(thread.segments.length, 2);
  assert.equal(thread.segments[0].text, 'Hello there');
  assert.equal(thread.segments[1].kind, 'voice');
});

test('readConversationThread maps flat observed get_conversation shape', () => {
  const thread = readConversationThread({
    success: true,
    conversation_id: 'live-1',
    segments: [
      {
        segment_id: 's1',
        user_text: 'hi',
        creator_user_profile: { name: 'Ayse' },
        shared_without_voice: true,
      },
      {
        segment_id: 's2',
        segment_audio_url: 'https://example.com/a.m4a',
        duration: 4,
        creator_user_profile: { name: 'Ali' },
        transcription: [{ text: 'hello', start_ms: 0, end_ms: 400 }],
      },
    ],
  });
  assert.ok(thread);
  assert.equal(thread.segments[0].author_name, 'Ayse');
  assert.equal(thread.segments[0].kind, 'text');
  assert.equal(thread.segments[1].kind, 'voice');
  assert.equal(thread.segments[1].text, 'hello');
});

test('readConversationThread returns null without segments', () => {
  assert.equal(readConversationThread({ success: true }), null);
  assert.equal(readConversationThread(null), null);
});
