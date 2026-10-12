/**
 * Retired Phase 27.5 Token store (owner 2026-10-12 — moderation app-only).
 * Only purges leftover encrypted files from older builds. Never saves tokens or phones.
 */

const fs = require('fs');
const path = require('path');

const AUTH_FILE = 'mobile-auth.bin';
const PHONE_FILE = 'mobile-phone.bin';

/**
 * Delete retired Token / phone blobs if present (idempotent).
 * @param {string} userDataPath
 * @returns {{ cleared: string[] }}
 */
function purgeRetiredMobileAuth(userDataPath) {
  const cleared = [];
  for (const name of [AUTH_FILE, PHONE_FILE]) {
    const file = path.join(userDataPath, name);
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        cleared.push(name);
      }
    } catch {
      /* ignore — next launch retries */
    }
  }
  return { cleared };
}

module.exports = {
  AUTH_FILE,
  PHONE_FILE,
  purgeRetiredMobileAuth,
};
