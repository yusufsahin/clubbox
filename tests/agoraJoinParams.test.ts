import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAgoraJoinParams } from '../src/audio/agoraJoinParams.ts';

const FALLBACK = '938de3e8055e42b281bb8c6f69c21f78';

test('buildAgoraJoinParams prefers RTC token and numeric user_profile_id', () => {
  const p = buildAgoraJoinParams({
    configuredAppId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    fallbackAppId: FALLBACK,
    rtcToken: 'x'.repeat(171),
    rtmToken: 'rtm-should-not-use',
    pubnubToken: 'pub-should-not-use',
    channel: 'P9Y3d9pY',
    userProfileId: '909585031',
    meUserId: 1,
    isSpeaker: true,
  });
  assert.equal(p.ok, true);
  assert.equal(p.appIdSource, 'signin-extract');
  assert.equal(p.appIdPrefix, 'aaaa');
  assert.equal(p.tokenLen, 171);
  assert.equal(p.token.startsWith('rtm'), false);
  assert.equal(p.channel, 'P9Y3d9pY');
  assert.equal(p.uid, 909585031);
  assert.equal(p.uidType, 'number');
  assert.equal(p.promoteToHostAfterJoin, true);
});

test('buildAgoraJoinParams rejects missing RTC token even if rtm present', () => {
  const p = buildAgoraJoinParams({
    fallbackAppId: FALLBACK,
    rtmToken: 'rtm-only',
    channel: 'abc123',
    meUserId: 42,
    isSpeaker: false,
  });
  assert.equal(p.ok, false);
  assert.equal(p.error, 'missing_rtc_token');
});

test('buildAgoraJoinParams falls back to default app id', () => {
  const p = buildAgoraJoinParams({
    configuredAppId: '',
    fallbackAppId: FALLBACK,
    rtcToken: 'tok',
    channel: 'abc123',
    meUserId: 7,
    isSpeaker: false,
  });
  assert.equal(p.ok, true);
  assert.equal(p.appIdSource, 'fallback');
  assert.equal(p.appIdLen, 32);
  assert.equal(p.promoteToHostAfterJoin, false);
});
