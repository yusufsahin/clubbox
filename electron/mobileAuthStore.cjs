/**
 * Phase 27.5.1 — Encrypted mobile Token store (main process only).
 * Never log token, refreshToken, phone, or Authorization values.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalizeTrPhoneForAuth } = require('./mobileTokenProbe.cjs');

const AUTH_FILE = 'mobile-auth.bin';
const DEVICE_FILE = 'mobile-probe-device-id.txt';

/**
 * @typedef {{
 *   token: string,
 *   userId: number | string,
 *   deviceId: string,
 *   refreshToken?: string,
 *   phone?: string,
 * }} MobileAuthRecord
 */

function authPath(userDataPath) {
  return path.join(userDataPath, AUTH_FILE);
}

function devicePath(userDataPath) {
  return path.join(userDataPath, DEVICE_FILE);
}

/**
 * @param {string} userDataPath
 * @returns {string}
 */
function ensureDeviceId(userDataPath) {
  const file = devicePath(userDataPath);
  try {
    if (fs.existsSync(file)) {
      const existing = fs.readFileSync(file, 'utf8').trim();
      if (/^[0-9a-f-]{36}$/i.test(existing)) return existing;
    }
  } catch {
    /* generate */
  }
  const id = crypto.randomUUID();
  try {
    fs.writeFileSync(file, `${id}\n`, 'utf8');
  } catch {
    /* in-memory for this process */
  }
  return id;
}

/**
 * @param {{ encryptString: (s: string) => Buffer, isEncryptionAvailable: () => boolean }} safeStorage
 * @param {string} userDataPath
 * @param {MobileAuthRecord} record
 */
function saveMobileAuth(safeStorage, userDataPath, record) {
  if (!safeStorage?.isEncryptionAvailable?.()) {
    throw new Error('safeStorage encryption is not available');
  }
  if (!record || typeof record.token !== 'string' || !record.token) {
    throw new Error('token required');
  }
  if (record.userId == null || record.userId === '') {
    throw new Error('userId required');
  }
  const deviceId = typeof record.deviceId === 'string' && record.deviceId
    ? record.deviceId
    : ensureDeviceId(userDataPath);
  /** @type {MobileAuthRecord} */
  const payload = {
    token: record.token,
    userId: record.userId,
    deviceId,
  };
  if (typeof record.refreshToken === 'string' && record.refreshToken) {
    payload.refreshToken = record.refreshToken;
  }
  if (typeof record.phone === 'string' && record.phone) {
    const normalized = normalizeTrPhoneForAuth(record.phone);
    if (normalized) payload.phone = normalized;
  }
  const encrypted = safeStorage.encryptString(JSON.stringify(payload));
  fs.writeFileSync(authPath(userDataPath), encrypted);
  return { ok: true, userId: payload.userId, deviceId: payload.deviceId };
}

/**
 * @param {{ decryptString: (b: Buffer) => string, isEncryptionAvailable: () => boolean }} safeStorage
 * @param {string} userDataPath
 * @returns {MobileAuthRecord | null}
 */
function loadMobileAuth(safeStorage, userDataPath) {
  if (!safeStorage?.isEncryptionAvailable?.()) return null;
  const file = authPath(userDataPath);
  if (!fs.existsSync(file)) return null;
  try {
    const buf = fs.readFileSync(file);
    const text = safeStorage.decryptString(buf);
    const json = JSON.parse(text);
    if (!json || typeof json.token !== 'string' || !json.token) return null;
    if (json.userId == null || json.userId === '') return null;
    return {
      token: json.token,
      userId: json.userId,
      deviceId: typeof json.deviceId === 'string' && json.deviceId
        ? json.deviceId
        : ensureDeviceId(userDataPath),
      refreshToken: typeof json.refreshToken === 'string' ? json.refreshToken : undefined,
      phone: typeof json.phone === 'string' ? json.phone : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * @param {string} userDataPath
 */
function clearMobileAuth(userDataPath) {
  const file = authPath(userDataPath);
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {
    /* ignore */
  }
  return { ok: true };
}

/**
 * Token user_id must equal web me user_id. On mismatch, delete the file.
 * @param {{ decryptString: (b: Buffer) => string, isEncryptionAvailable: () => boolean }} safeStorage
 * @param {string} userDataPath
 * @param {number | string | null | undefined} webUserId
 * @returns {{ ok: true, auth: MobileAuthRecord } | { ok: false, reason: string }}
 */
function requireMatchingMobileAuth(safeStorage, userDataPath, webUserId) {
  const auth = loadMobileAuth(safeStorage, userDataPath);
  if (!auth) return { ok: false, reason: 'not_linked' };
  if (webUserId == null || webUserId === '') {
    clearMobileAuth(userDataPath);
    return { ok: false, reason: 'no_web_user' };
  }
  if (String(auth.userId) !== String(webUserId)) {
    clearMobileAuth(userDataPath);
    return { ok: false, reason: 'user_id_mismatch' };
  }
  return { ok: true, auth };
}

/**
 * Status for renderer — never includes token/phone values.
 * @param {{ decryptString: (b: Buffer) => Buffer | string, isEncryptionAvailable: () => boolean }} safeStorage
 * @param {string} userDataPath
 * @param {number | string | null | undefined} webUserId
 */
function mobileAuthStatus(safeStorage, userDataPath, webUserId) {
  const auth = loadMobileAuth(safeStorage, userDataPath);
  if (!auth) {
    return {
      linked: false,
      mode: 'none',
      hasPhone: false,
      userIdMatchesWeb: false,
    };
  }
  const matches = webUserId != null && webUserId !== '' && String(auth.userId) === String(webUserId);
  if (!matches && webUserId != null && webUserId !== '') {
    clearMobileAuth(userDataPath);
    return {
      linked: false,
      mode: 'none',
      hasPhone: false,
      userIdMatchesWeb: false,
      clearedForMismatch: true,
    };
  }
  return {
    linked: true,
    mode: 'token',
    hasPhone: typeof auth.phone === 'string' && auth.phone.length > 0,
    userIdMatchesWeb: matches,
  };
}

/**
 * Remember phone only (encrypted), for prefill / SMS start without re-asking.
 * Merges into existing auth or creates a phone-only stub (no token yet).
 * @param {{ encryptString: (s: string) => Buffer, decryptString: (b: Buffer) => string, isEncryptionAvailable: () => boolean }} safeStorage
 * @param {string} userDataPath
 * @param {string} rawPhone
 */
function rememberMobilePhone(safeStorage, userDataPath, rawPhone) {
  const normalized = normalizeTrPhoneForAuth(rawPhone);
  if (!normalized) return { ok: false, reason: 'normalize_failed' };
  const existing = loadMobileAuth(safeStorage, userDataPath);
  if (existing?.token) {
    saveMobileAuth(safeStorage, userDataPath, { ...existing, phone: normalized });
    return { ok: true };
  }
  // Phone-only placeholder is not a valid linked auth — store beside auth file.
  const phoneFile = path.join(userDataPath, 'mobile-phone.bin');
  if (!safeStorage?.isEncryptionAvailable?.()) {
    return { ok: false, reason: 'no_encryption' };
  }
  fs.writeFileSync(phoneFile, safeStorage.encryptString(normalized));
  return { ok: true };
}

/**
 * @param {{ decryptString: (b: Buffer) => string, isEncryptionAvailable: () => boolean }} safeStorage
 * @param {string} userDataPath
 * @returns {string | null}
 */
function loadRememberedPhone(safeStorage, userDataPath) {
  const auth = loadMobileAuth(safeStorage, userDataPath);
  if (auth?.phone) return auth.phone;
  const phoneFile = path.join(userDataPath, 'mobile-phone.bin');
  if (!safeStorage?.isEncryptionAvailable?.() || !fs.existsSync(phoneFile)) return null;
  try {
    return safeStorage.decryptString(fs.readFileSync(phoneFile)) || null;
  } catch {
    return null;
  }
}

function clearRememberedPhone(userDataPath) {
  const phoneFile = path.join(userDataPath, 'mobile-phone.bin');
  try {
    if (fs.existsSync(phoneFile)) fs.unlinkSync(phoneFile);
  } catch {
    /* ignore */
  }
}

module.exports = {
  AUTH_FILE,
  ensureDeviceId,
  saveMobileAuth,
  loadMobileAuth,
  clearMobileAuth,
  requireMatchingMobileAuth,
  mobileAuthStatus,
  rememberMobilePhone,
  loadRememberedPhone,
  clearRememberedPhone,
};
