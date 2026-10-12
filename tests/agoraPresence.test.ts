import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGORA_PRESENCE_THRESHOLD_MS,
  createAgoraPresenceState,
  overlayAgoraPresence,
  presenceSetJoined,
  presenceSetLeft,
  presenceSyncPresent,
} from '../src/api/agoraPresence.ts';
import type { CHUser } from '../src/api/types.ts';

const ayse: CHUser = {
  user_id: 501,
  name: 'Ayse',
  username: 'ayse',
  photo_url: null,
  is_speaker: true,
};

test('speakers missing from Agora for 10s get is_on_call false; presence clears it', () => {
  let state = createAgoraPresenceState();
  state = presenceSetJoined(state, 1_000);
  state = presenceSyncPresent(state, [], [501], 1_000);

  const early = overlayAgoraPresence([ayse], state, 1_000 + AGORA_PRESENCE_THRESHOLD_MS - 1, {
    myUserId: 42,
  });
  assert.equal(early[0].is_on_call, undefined);

  const late = overlayAgoraPresence([ayse], state, 1_000 + AGORA_PRESENCE_THRESHOLD_MS, {
    myUserId: 42,
  });
  assert.equal(late[0].is_on_call, false);

  state = presenceSyncPresent(state, [501], [501], 20_000);
  const back = overlayAgoraPresence(late, state, 20_000, { myUserId: 42 });
  assert.equal(back[0].is_on_call, true);
});

test('local speaker is treated as present', () => {
  let state = createAgoraPresenceState();
  state = presenceSetJoined(state, 0);
  state = presenceSyncPresent(state, [], [42], 0);
  const me = { ...ayse, user_id: 42 };
  const users = overlayAgoraPresence([me], state, AGORA_PRESENCE_THRESHOLD_MS + 1, {
    myUserId: 42,
  });
  assert.equal(users[0].is_on_call, undefined);
});

test('audience is not marked not-connected; leave clears state', () => {
  let state = createAgoraPresenceState();
  state = presenceSetJoined(state, 0);
  state = presenceSyncPresent(state, [], [501], 0);
  const listener = { ...ayse, is_speaker: false };
  const users = overlayAgoraPresence([listener], state, AGORA_PRESENCE_THRESHOLD_MS + 5);
  assert.equal(users[0].is_on_call, undefined);
  state = presenceSetLeft(state);
  assert.equal(state.agoraJoined, false);
});
