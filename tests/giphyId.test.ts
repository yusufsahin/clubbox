import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGiphyId } from '../src/api/giphyId.ts';

test('parseGiphyId accepts raw ids and common Giphy URLs', () => {
  assert.equal(parseGiphyId('3oEjI6SIIHBdRxXI40'), '3oEjI6SIIHBdRxXI40');
  assert.equal(
    parseGiphyId('https://giphy.com/gifs/funny-cat-3oEjI6SIIHBdRxXI40'),
    '3oEjI6SIIHBdRxXI40',
  );
  assert.equal(
    parseGiphyId('https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif'),
    '3oEjI6SIIHBdRxXI40',
  );
  assert.equal(parseGiphyId('https://i.giphy.com/3oEjI6SIIHBdRxXI40.gif'), '3oEjI6SIIHBdRxXI40');
  assert.equal(parseGiphyId(''), null);
  assert.equal(parseGiphyId('not a gif'), null);
  assert.equal(parseGiphyId('https://example.com/gifs/abc123'), null);
});
