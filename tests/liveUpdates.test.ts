import assert from 'node:assert/strict';
import test from 'node:test';
import { isLiveUpdatesUnavailable } from '../src/api/liveUpdates.ts';

test('live updates note when subscribe failed even if token exists', () => {
  assert.equal(isLiveUpdatesUnavailable({
    webSession: true,
    inRoom: true,
    hasPubnubToken: true,
    supportsGetChannel: false,
    pubnubSubscribeFailed: true,
  }), true);
});

test('no note when token present and subscribe ok', () => {
  assert.equal(isLiveUpdatesUnavailable({
    webSession: true,
    inRoom: true,
    hasPubnubToken: true,
    supportsGetChannel: false,
  }), false);
});
