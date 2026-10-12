import assert from 'node:assert/strict';
import test from 'node:test';
import { parseRealtimeMessage } from '../src/api/realtimeEvents.ts';
import { profileRefreshUserId, RoomProfileCache } from '../src/api/roomProfileCache.ts';
import type { CHUser } from '../src/api/types.ts';

const ROOM = 'PG2LoOww';

const ayse: CHUser = {
  user_id: 501,
  name: 'Ayse',
  username: 'ayse',
  photo_url: null,
};

test('profileRefreshUserId fires for add_speaker / uninvite / make_moderator', () => {
  assert.equal(
    profileRefreshUserId(parseRealtimeMessage({
      action: 'add_speaker',
      channel: ROOM,
      user_id: 501,
    }, ROOM)),
    501,
  );
  assert.equal(
    profileRefreshUserId(parseRealtimeMessage({
      action: 'uninvite_speaker',
      channel: ROOM,
      user_id: 501,
    }, ROOM)),
    501,
  );
  assert.equal(
    profileRefreshUserId(parseRealtimeMessage({
      action: 'make_moderator',
      channel: ROOM,
      user_id: 501,
    }, ROOM)),
    501,
  );
});

test('profileRefreshUserId ignores join / invite / other rooms', () => {
  assert.equal(
    profileRefreshUserId(parseRealtimeMessage({
      action: 'join_channel',
      channel: ROOM,
      user_profile: { user_id: 501, name: 'Ayse' },
    }, ROOM)),
    null,
  );
  assert.equal(
    profileRefreshUserId(parseRealtimeMessage({
      action: 'invite_speaker',
      channel: ROOM,
      from_user_id: 1,
      from_name: 'Host',
    }, ROOM)),
    null,
  );
  assert.equal(
    profileRefreshUserId(parseRealtimeMessage({
      action: 'add_speaker',
      channel: 'other',
      user_id: 501,
    }, ROOM)),
    null,
  );
});

test('RoomProfileCache stores, invalidates, and clears per session', () => {
  const cache = new RoomProfileCache();
  cache.set(501, ayse);
  assert.equal(cache.get(501)?.username, 'ayse');
  cache.invalidate(501);
  assert.equal(cache.get(501), undefined);
  cache.set(501, ayse);
  cache.set(502, { ...ayse, user_id: 502 });
  assert.equal(cache.size, 2);
  cache.clear();
  assert.equal(cache.size, 0);
});
