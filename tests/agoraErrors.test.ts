import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyAgoraError,
  formatVoiceFailureReason,
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
