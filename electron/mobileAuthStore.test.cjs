const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { AUTH_FILE, PHONE_FILE, purgeRetiredMobileAuth } = require('./mobileAuthStore.cjs');

test('purgeRetiredMobileAuth deletes leftover Token and phone files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clubbox-auth-purge-'));
  fs.writeFileSync(path.join(dir, AUTH_FILE), 'x');
  fs.writeFileSync(path.join(dir, PHONE_FILE), 'y');
  const once = purgeRetiredMobileAuth(dir);
  assert.deepEqual(once.cleared.sort(), [AUTH_FILE, PHONE_FILE].sort());
  assert.equal(fs.existsSync(path.join(dir, AUTH_FILE)), false);
  assert.equal(fs.existsSync(path.join(dir, PHONE_FILE)), false);
  const again = purgeRetiredMobileAuth(dir);
  assert.deepEqual(again.cleared, []);
  fs.rmSync(dir, { recursive: true, force: true });
});
