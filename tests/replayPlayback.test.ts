import assert from 'node:assert/strict';
import test from 'node:test';
import { readHighlightPayload, readReplayPayload } from '../src/api/replayPlayback.ts';

test('readReplayPayload maps title and https audio url', () => {
  const replay = readReplayPayload({
    success: true,
    replay: {
      channel: 'replay-1',
      topic: 'Morning show',
      audio_url: 'https://cdn.example.com/replay.mp3',
    },
  }, 'fallback');
  assert.ok(replay);
  assert.equal(replay.id, 'replay-1');
  assert.equal(replay.title, 'Morning show');
  assert.equal(replay.audioUrl, 'https://cdn.example.com/replay.mp3');
});

test('readReplayPayload rejects non-https audio', () => {
  const replay = readReplayPayload({
    replay: { channel: 'r1', topic: 'X', audio_url: 'http://insecure.example/a.mp3' },
  }, 'r1');
  assert.ok(replay);
  assert.equal(replay.audioUrl, '');
});

test('readHighlightPayload maps highlight_id', () => {
  const highlight = readHighlightPayload({
    highlight: {
      highlight_id: 'hl-1',
      title: 'Clip',
      media_url: 'https://cdn.example.com/hl.mp3',
    },
  }, 'x');
  assert.ok(highlight);
  assert.equal(highlight.kind, 'highlight');
  assert.equal(highlight.id, 'hl-1');
  assert.equal(highlight.audioUrl, 'https://cdn.example.com/hl.mp3');
});
