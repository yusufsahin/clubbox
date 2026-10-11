import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildChapterFileContent,
  chapterFilename,
  formatChapterTimestamp,
  normalizeChapters,
} from '../src/studio/recordingChapters.ts';

test('formatChapterTimestamp pads hours minutes seconds', () => {
  assert.equal(formatChapterTimestamp(357), '00:05:57');
  assert.equal(formatChapterTimestamp(0), '00:00:00');
});

test('normalizeChapters inserts Intro at zero when missing', () => {
  assert.deepEqual(normalizeChapters([{ atSec: 357, title: 'Talking about stuff' }]), [
    { atSec: 0, title: 'Intro' },
    { atSec: 357, title: 'Talking about stuff' },
  ]);
});

test('buildChapterFileContent writes YouTube and Spotify blocks', () => {
  const body = buildChapterFileContent([
    { atSec: 357, title: 'Talking about stuff' },
  ]);
  assert.match(body, /00:00:00 Intro/);
  assert.match(body, /00:05:57 Talking about stuff/);
  assert.match(body, /\(00:05:57\) Talking about stuff/);
});

test('chapterFilename replaces recording extension', () => {
  assert.equal(chapterFilename('clubbox-recording-show-20261011-1200.webm'), 'clubbox-recording-show-20261011-1200.chapters.txt');
});
