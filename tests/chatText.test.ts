import assert from 'node:assert/strict';
import test from 'node:test';
import { linkifyChatMessage, normalizeChatHref } from '../src/ui/chatText.ts';
import { markup } from '../src/ui/html.ts';

test('linkifyChatMessage turns https URLs into external anchors', () => {
  const html = markup(linkifyChatMessage('see https://example.com/path and done'));
  assert.match(html, /href="https:\/\/example\.com\/path"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, />https:\/\/example\.com\/path</);
  assert.match(html, / and done/);
});

test('linkifyChatMessage upgrades http and www to https hrefs', () => {
  assert.equal(normalizeChatHref('http://example.com/a'), 'https://example.com/a');
  assert.equal(normalizeChatHref('www.example.com/b'), 'https://www.example.com/b');
  const html = markup(linkifyChatMessage('see www.example.com/x and http://example.com/y'));
  assert.match(html, /href="https:\/\/www\.example\.com\/x"/);
  assert.match(html, /href="https:\/\/example\.com\/y"/);
});

test('linkifyChatMessage escapes HTML and rejects javascript URLs', () => {
  const html = markup(linkifyChatMessage('<b>x</b> javascript:alert(1)'));
  assert.doesNotMatch(html, /<b>/);
  assert.match(html, /&lt;b&gt;/);
  assert.doesNotMatch(html, /href="javascript:/);
});

test('linkifyChatMessage strips trailing punctuation from the href', () => {
  const html = markup(linkifyChatMessage('go https://clubhouse.com/room/ABC.'));
  assert.match(html, /href="https:\/\/clubhouse\.com\/room\/ABC"/);
  assert.match(html, /<\/a>\./);
});
