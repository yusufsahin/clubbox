const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MODERATION_WATCHLIST,
  diffEndpointSets,
  watchlistHits,
  endpointNamesFromScripts,
  buildEndpointsDiff,
} = require('./moderationWatchlist.cjs');

test('diffEndpointSets reports added, removed, and unchanged names', () => {
  const diff = diffEndpointSets(['me', 'join_channel'], ['me', 'mute_speaker', 'join_channel']);
  assert.deepEqual(diff.added, ['mute_speaker']);
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.unchanged, ['join_channel', 'me']);
});

test('watchlistHits only returns moderation watch-list names', () => {
  assert.deepEqual(
    watchlistHits(['mute_speaker', 'me', 'end_channel', 'get_profile']),
    ['end_channel', 'mute_speaker'],
  );
  assert.ok(MODERATION_WATCHLIST.includes('make_moderator'));
});

test('endpointNamesFromScripts unions calls and endpoints', () => {
  assert.deepEqual(
    endpointNamesFromScripts([
      { endpoints: ['me'], calls: [{ name: 'mute_speaker' }, { name: 'me' }] },
      { calls: [{ name: 'invite_speaker' }] },
    ]),
    ['invite_speaker', 'me', 'mute_speaker'],
  );
});

test('buildEndpointsDiff includes watchlistHits for new moderation routes', () => {
  const payload = buildEndpointsDiff({
    buildId: 'build-b',
    previousBuildId: 'build-a',
    previous: ['me', 'join_channel'],
    current: ['me', 'join_channel', 'mute_speaker', 'create_channel'],
  });
  assert.equal(payload.buildId, 'build-b');
  assert.deepEqual(payload.added, ['create_channel', 'mute_speaker']);
  assert.deepEqual(payload.watchlistHits, ['mute_speaker']);
});
