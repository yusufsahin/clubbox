const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  saveMobileAuth,
  loadMobileAuth,
  clearMobileAuth,
  requireMatchingMobileAuth,
  mobileAuthStatus,
  rememberMobilePhone,
  loadRememberedPhone,
} = require('./mobileAuthStore.cjs');

function mockSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(`enc:${s}`, 'utf8'),
    decryptString: (b) => Buffer.from(b).toString('utf8').replace(/^enc:/, ''),
  };
}

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'clubbox-auth-'));
}

test('save/load round-trip; values never appear in status', () => {
  const dir = tempDir();
  const ss = mockSafeStorage();
  saveMobileAuth(ss, dir, {
    token: 'SECRET_TOKEN_VALUE',
    userId: 42,
    deviceId: '00000000-0000-4000-8000-000000000001',
    refreshToken: 'SECRET_REFRESH',
    phone: '+9005321234567',
  });
  const loaded = loadMobileAuth(ss, dir);
  assert.equal(loaded.token, 'SECRET_TOKEN_VALUE');
  assert.equal(loaded.userId, 42);
  assert.equal(loaded.phone, '+905321234567');
  const status = mobileAuthStatus(ss, dir, 42);
  assert.equal(status.linked, true);
  assert.equal(status.hasPhone, true);
  assert.equal(JSON.stringify(status).includes('SECRET'), false);
  assert.equal(JSON.stringify(status).includes('532'), false);
  clearMobileAuth(dir);
  assert.equal(loadMobileAuth(ss, dir), null);
});

test('user_id mismatch is refused and file deleted', () => {
  const dir = tempDir();
  const ss = mockSafeStorage();
  saveMobileAuth(ss, dir, {
    token: 'tok',
    userId: 1,
    deviceId: '00000000-0000-4000-8000-000000000002',
  });
  const result = requireMatchingMobileAuth(ss, dir, 99);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'user_id_mismatch');
  assert.equal(loadMobileAuth(ss, dir), null);
});

test('remembered phone normalizes TR forms without linking', () => {
  const dir = tempDir();
  const ss = mockSafeStorage();
  assert.equal(rememberMobilePhone(ss, dir, '0532 123 45 67').ok, true);
  assert.equal(loadRememberedPhone(ss, dir), '+905321234567');
  assert.equal(mobileAuthStatus(ss, dir, null).linked, false);
});
