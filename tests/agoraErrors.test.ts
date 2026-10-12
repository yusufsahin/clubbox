import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AGORA_REJOIN_BACKOFF_MS,
  agoraConnectionPolicy,
  agoraExceptionLogLevel,
  classifyAgoraError,
  extrasStatsChanged,
  formatVoiceFailureReason,
  networkQualityTone,
  shouldTryCloudProxy,
} from '../src/audio/agoraErrors.ts';

test('classifyAgoraError: network-block vs auth vs timeout vs banned', () => {
  assert.equal(classifyAgoraError({ code: 'CAN_NOT_GET_GATEWAY_SERVER' }), 'network-block');
  assert.equal(classifyAgoraError({ code: 'WS_ERR', message: 'ws close 1006' }), 'network-block');
  assert.equal(classifyAgoraError({ code: 'INVALID_VENDOR_KEY' }), 'auth');
  assert.equal(classifyAgoraError({ code: 'INVALID_TOKEN' }), 'auth');
  assert.equal(classifyAgoraError({ code: 'JOIN_TIMEOUT' }), 'timeout');
  assert.equal(classifyAgoraError({ code: 'UID_BANNED' }), 'banned');
  assert.equal(classifyAgoraError({ code: 'SOMETHING_ELSE' }), 'other');
});

test('shouldTryCloudProxy only for network-block and once', () => {
  assert.equal(shouldTryCloudProxy({ code: 'CAN_NOT_GET_GATEWAY_SERVER' }, false), true);
  assert.equal(shouldTryCloudProxy({ code: 'CAN_NOT_GET_GATEWAY_SERVER' }, true), false);
  assert.equal(shouldTryCloudProxy({ code: 'INVALID_TOKEN' }, false), false);
  assert.equal(shouldTryCloudProxy({ code: 'JOIN_TIMEOUT' }, false), false);
});

test('formatVoiceFailureReason keeps a short code', () => {
  assert.equal(formatVoiceFailureReason({ code: 'INVALID_VENDOR_KEY' }), 'INVALID_VENDOR_KEY');
  assert.ok(formatVoiceFailureReason(null).length > 0);
});

test('agoraConnectionPolicy: reconnecting banner and clear on connected', () => {
  assert.deepEqual(
    agoraConnectionPolicy({ state: 'RECONNECTING', rejoinAttempt: 0 }),
    { type: 'show-reconnecting' },
  );
  assert.deepEqual(
    agoraConnectionPolicy({ state: 'CONNECTED', rejoinAttempt: 2 }),
    { type: 'clear-reconnecting' },
  );
});

test('agoraConnectionPolicy: banned leaves without rejoin', () => {
  assert.deepEqual(
    agoraConnectionPolicy({ state: 'DISCONNECTED', reason: 'UID_BANNED', rejoinAttempt: 0 }),
    { type: 'leave-banned', reason: 'UID_BANNED' },
  );
  assert.deepEqual(
    agoraConnectionPolicy({ state: 'FAILED', reason: 'CHANNEL_BANNED', rejoinAttempt: 0 }),
    { type: 'leave-banned', reason: 'CHANNEL_BANNED' },
  );
});

test('agoraConnectionPolicy: unexpected disconnect schedules 2s/5s/15s then stops', () => {
  assert.deepEqual(AGORA_REJOIN_BACKOFF_MS, [2000, 5000, 15000]);
  assert.deepEqual(
    agoraConnectionPolicy({ state: 'DISCONNECTED', reason: 'NETWORK_ERROR', rejoinAttempt: 0 }),
    { type: 'schedule-rejoin', delayMs: 2000, attempt: 1 },
  );
  assert.deepEqual(
    agoraConnectionPolicy({ state: 'DISCONNECTED', reason: 'NETWORK_ERROR', rejoinAttempt: 1 }),
    { type: 'schedule-rejoin', delayMs: 5000, attempt: 2 },
  );
  assert.deepEqual(
    agoraConnectionPolicy({ state: 'DISCONNECTED', reason: 'NETWORK_ERROR', rejoinAttempt: 2 }),
    { type: 'schedule-rejoin', delayMs: 15000, attempt: 3 },
  );
  assert.deepEqual(
    agoraConnectionPolicy({ state: 'DISCONNECTED', reason: 'NETWORK_ERROR', rejoinAttempt: 3 }),
    { type: 'none' },
  );
  assert.deepEqual(
    agoraConnectionPolicy({ state: 'DISCONNECTED', reason: 'LEAVE', rejoinAttempt: 0 }),
    { type: 'none' },
  );
});

test('networkQualityTone maps uplink/downlink 0–6', () => {
  assert.equal(networkQualityTone(1, 1), 'good');
  assert.equal(networkQualityTone(2, 4), 'ok');
  assert.equal(networkQualityTone(5, 3), 'poor');
  assert.equal(networkQualityTone(0, 0), 'unknown');
});

test('muted low-input exception is debug; other exceptions stay warnings', () => {
  assert.equal(agoraExceptionLogLevel(2001, true), 'debug');
  assert.equal(agoraExceptionLogLevel('2001', true), 'debug');
  assert.equal(agoraExceptionLogLevel(2001, false), 'warn');
  assert.equal(agoraExceptionLogLevel(1005, true), 'warn');
});

test('extras stats log only when a displayed value changes', () => {
  const first = { vol: '0.000', sendVol: 0, bitrate: 7600, sending: true };
  assert.equal(extrasStatsChanged(null, first), true);
  assert.equal(extrasStatsChanged(first, { ...first }), false);
  assert.equal(extrasStatsChanged(first, { ...first, bitrate: 0 }), true);
  assert.equal(extrasStatsChanged(first, { ...first, sending: false }), true);
});
