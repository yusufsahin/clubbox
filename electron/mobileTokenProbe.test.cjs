const assert = require('node:assert/strict');
const test = require('node:test');
const {
  normalizeTrPhoneForAuth,
  summarizeResponseKeys,
  detectAttestation,
  responseHasKey,
  isTokenAuthProbeEndpoint,
  mobileTokenHeaders,
} = require('./mobileTokenProbe.cjs');

test('normalizeTrPhoneForAuth maps TR trunk-zero and national forms', () => {
  assert.equal(normalizeTrPhoneForAuth('+9005321234567'), '+905321234567');
  assert.equal(normalizeTrPhoneForAuth('0532 123 45 67'), '+905321234567');
  assert.equal(normalizeTrPhoneForAuth('5321234567'), '+905321234567');
  assert.equal(normalizeTrPhoneForAuth('905321234567'), '+905321234567');
  assert.equal(normalizeTrPhoneForAuth('+905321234567'), '+905321234567');
  assert.equal(normalizeTrPhoneForAuth(''), null);
  assert.equal(normalizeTrPhoneForAuth('abc'), null);
});

test('summarizeResponseKeys records key names but never token values', () => {
  const shape = summarizeResponseKeys(JSON.stringify({
    success: true,
    auth_token: 'SECRET_SHOULD_NOT_APPEAR',
    refresh_token: 'ALSO_SECRET',
    user_profile: { user_id: 1, name: 'x' },
  }));
  assert.equal(shape.includes('SECRET_SHOULD_NOT_APPEAR'), false);
  assert.equal(shape.includes('ALSO_SECRET'), false);
  assert.match(shape, /keys=/);
  assert.match(shape, /auth_token/); // key name is OK
  assert.match(shape, /user_profile\.keys=/);
});

test('detectAttestation flags captcha-like keys', () => {
  assert.equal(detectAttestation(JSON.stringify({ success: true })).required, false);
  assert.equal(detectAttestation(JSON.stringify({ captcha_token: 'x' })).required, true);
  assert.equal(detectAttestation(JSON.stringify({ detail: 'attestation required' })).required, true);
});

test('responseHasKey and probe allow-list', () => {
  assert.equal(responseHasKey(JSON.stringify({ refresh_token: 'x' }), 'refresh_token'), true);
  assert.equal(responseHasKey(JSON.stringify({ success: true }), 'refresh_token'), false);
  assert.equal(isTokenAuthProbeEndpoint('start_phone_number_auth'), true);
  assert.equal(isTokenAuthProbeEndpoint('mute_speaker'), true);
  assert.equal(isTokenAuthProbeEndpoint('get_profile'), false);
});

test('mobileTokenHeaders set Authorization without logging concerns in shape', () => {
  const headers = mobileTokenHeaders({
    deviceId: '00000000-0000-4000-8000-000000000001',
    userId: 42,
    token: 'tok',
  });
  assert.equal(headers.Authorization, 'Token tok');
  assert.equal(headers['CH-UserID'], '42');
  assert.equal(headers['CH-DeviceId'], '00000000-0000-4000-8000-000000000001');
  assert.ok(headers['CH-AppVersion']);
  assert.ok(headers['CH-AppBuild']);
});
