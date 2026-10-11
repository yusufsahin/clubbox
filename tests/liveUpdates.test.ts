import assert from 'node:assert/strict';
import test from 'node:test';
import { isLiveUpdatesUnavailable } from '../src/api/liveUpdates.ts';

test('live updates available when PubNub token is present even without get_channel', () => {
  assert.equal(
    isLiveUpdatesUnavailable({
      webSession: true,
      inRoom: true,
      hasPubnubToken: true,
      supportsGetChannel: false,
    }),
    false,
  );
});

test('live updates unavailable on web room without PubNub and without get_channel', () => {
  assert.equal(
    isLiveUpdatesUnavailable({
      webSession: true,
      inRoom: true,
      hasPubnubToken: false,
      supportsGetChannel: false,
    }),
    true,
  );
});

test('live updates note is off outside a room or offline sandbox', () => {
  assert.equal(
    isLiveUpdatesUnavailable({
      webSession: true,
      inRoom: false,
      hasPubnubToken: false,
      supportsGetChannel: false,
    }),
    false,
  );
  assert.equal(
    isLiveUpdatesUnavailable({
      webSession: false,
      inRoom: true,
      hasPubnubToken: false,
      supportsGetChannel: false,
    }),
    false,
  );
});
