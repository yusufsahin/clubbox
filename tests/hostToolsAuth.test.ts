import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  normalizeTrPhoneForAuth,
  stripTrunkZeroFromAuthBody,
} = require('../electron/mobileTokenProbe.cjs') as {
  normalizeTrPhoneForAuth: (raw: string) => string | null;
  stripTrunkZeroFromAuthBody: (text: string) => string | null;
};
const { ALLOWED_MOBILE_ENDPOINTS } = require('../electron/mobileApi.cjs') as {
  ALLOWED_MOBILE_ENDPOINTS: readonly string[];
};

test('TR normalization: +9005, 05, and 5 all become +905', () => {
  assert.equal(normalizeTrPhoneForAuth('+9005321234567'), '+905321234567');
  assert.equal(normalizeTrPhoneForAuth('05321234567'), '+905321234567');
  assert.equal(normalizeTrPhoneForAuth('5321234567'), '+905321234567');
});

test('stripTrunkZeroFromAuthBody never leaves secrets in the rewrite path shape', () => {
  const fixed = stripTrunkZeroFromAuthBody(JSON.stringify({ phone_number: '+9005321234567' }));
  assert.ok(fixed);
  assert.equal(JSON.parse(fixed!).phone_number, '+905321234567');
});

test('allow-list dropped change_handraise_settings; keeps update_handraise_queue_setting', () => {
  assert.equal(ALLOWED_MOBILE_ENDPOINTS.includes('change_handraise_settings'), false);
  assert.equal(ALLOWED_MOBILE_ENDPOINTS.includes('update_handraise_queue_setting'), true);
});
