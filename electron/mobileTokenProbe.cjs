/**
 * Phase 27.5.0 — SMS Token auth spike (dev only).
 * Never log phone numbers, SMS codes, auth_token, refresh_token, or Authorization values.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { httpsPostJson, MOBILE_API_BASE } = require('./mobileApi.cjs');

const TOKEN_AUTH_ENDPOINTS = Object.freeze([
  'start_phone_number_auth',
  'complete_phone_number_auth',
  'resend_phone_number_auth',
  'mute_speaker',
]);

const TOKEN_AUTH_SET = new Set(TOKEN_AUTH_ENDPOINTS);

/** Default mobile-client headers (clubhouse-py / README); spike may try variants on 426. */
const DEFAULT_MOBILE_APP = Object.freeze({
  appVersion: '1.0.8',
  appBuild: '304',
  userAgent: 'clubhouse/304 (iPhone; iOS 14.4; Scale/3.00)',
});

const ATTESTATION_KEY_HINTS = Object.freeze([
  'captcha',
  'attestation',
  'challenge',
  'safety_net',
  'play_integrity',
  'device_check',
  'recaptcha',
  'is_verified',
  'verification_method',
]);

function isTokenAuthProbeEndpoint(name) {
  return typeof name === 'string' && TOKEN_AUTH_SET.has(name);
}

/**
 * TR trunk-zero + national formats → E.164 +905…
 * Mirrors stripTrunkZeroFromAuthBody (+900532… → +90532…) and also 0532… / 90532….
 * Returns null when input is empty / unusable (never invent a number).
 */
function normalizeTrPhoneForAuth(raw) {
  if (typeof raw !== 'string') return null;
  const compact = raw.replace(/[\s()-]/g, '');
  if (!compact) return null;
  let match = /^\+900(\d{10})$/.exec(compact);
  if (match) return `+90${match[1]}`;
  match = /^\+90(\d{10})$/.exec(compact);
  if (match) return `+90${match[1]}`;
  match = /^90(\d{10})$/.exec(compact);
  if (match) return `+90${match[1]}`;
  match = /^0(\d{10})$/.exec(compact);
  if (match) return `+90${match[1]}`;
  match = /^5(\d{9})$/.exec(compact);
  if (match) return `+905${match[1]}`;
  if (/^\+[1-9]\d{7,14}$/.test(compact)) return compact;
  return null;
}

function ensureProbeDeviceId(userDataPath) {
  const file = path.join(userDataPath, 'mobile-probe-device-id.txt');
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
    /* still return in-memory id for this run */
  }
  return id;
}

/** Top-level + one-level array item keys only. Never include values. */
function summarizeResponseKeys(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return `non-json len=${String(text || '').length}`;
  }
  if (!json || typeof json !== 'object') return `type=${typeof json}`;
  const keys = Object.keys(json);
  let shape = `keys=${keys.join(',')}`;
  if (typeof json.detail === 'string') shape += ` detail=${json.detail.slice(0, 120)}`;
  if (typeof json.error_message === 'string') shape += ` error_message=${json.error_message.slice(0, 160)}`;
  for (const name of ['user_profile', 'user']) {
    const nested = json[name];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      shape += ` ${name}.keys=${Object.keys(nested).join(',')}`;
    }
  }
  for (const name of ['users', 'errors', 'challenges']) {
    const arr = json[name];
    if (Array.isArray(arr) && arr[0] && typeof arr[0] === 'object') {
      shape += ` ${name}[0].keys=${Object.keys(arr[0]).join(',')}`;
    }
  }
  return shape;
}

function responseHasKey(text, key) {
  try {
    const json = JSON.parse(text);
    return !!(json && typeof json === 'object' && key in json && json[key] != null && json[key] !== '');
  } catch {
    return false;
  }
}

function detectAttestation(text) {
  try {
    const json = JSON.parse(text);
    if (!json || typeof json !== 'object') return { required: false, hints: [] };
    const keys = Object.keys(json).map((k) => k.toLowerCase());
    const hints = ATTESTATION_KEY_HINTS.filter((hint) => keys.some((k) => k.includes(hint)));
    const detail = typeof json.detail === 'string' ? json.detail.toLowerCase() : '';
    const err = typeof json.error_message === 'string' ? json.error_message.toLowerCase() : '';
    const blob = `${detail} ${err}`;
    const textHit = ATTESTATION_KEY_HINTS.some((hint) => blob.includes(hint.replace(/_/g, ' ')) || blob.includes(hint));
    // Clubhouse support: "Login Did Not Pass Token Validation" = unsupported / non-native device OS.
    const tokenValidation = blob.includes('token validation') || blob.includes('did not pass token');
    if (tokenValidation && !hints.includes('token_validation')) hints.push('token_validation');
    const blocked = json.is_blocked === true;
    if (blocked && !hints.includes('is_blocked')) hints.push('is_blocked');
    return {
      required: hints.length > 0 || textHit || tokenValidation,
      hints,
      is_blocked: blocked,
    };
  } catch {
    return { required: false, hints: [] };
  }
}

/**
 * @param {{
 *   deviceId: string,
 *   userId?: number | string | null,
 *   token?: string | null,
 *   appVersion?: string,
 *   appBuild?: string,
 *   userAgent?: string,
 * }} opts
 */
function mobileTokenHeaders(opts) {
  const appVersion = opts.appVersion || DEFAULT_MOBILE_APP.appVersion;
  const appBuild = opts.appBuild || DEFAULT_MOBILE_APP.appBuild;
  const userAgent = opts.userAgent || DEFAULT_MOBILE_APP.userAgent;
  /** @type {Record<string, string>} */
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json; charset=utf-8',
    'CH-Languages': 'en-US',
    'CH-Locale': 'en_US',
    'CH-AppVersion': appVersion,
    'CH-AppBuild': appBuild,
    'CH-DeviceId': opts.deviceId,
    'User-Agent': userAgent,
  };
  if (opts.userId != null && opts.userId !== '') {
    headers['CH-UserID'] = String(opts.userId);
  }
  if (opts.token) {
    headers.Authorization = `Token ${opts.token}`;
  }
  return headers;
}

/**
 * @param {{
 *   endpoint: string,
 *   body?: Record<string, unknown>,
 *   headers: Record<string, string>,
 *   timeoutMs?: number,
 * }} args
 */
async function callTokenProbeApi(args) {
  const endpoint = String(args.endpoint || '').replace(/^\//, '');
  if (!isTokenAuthProbeEndpoint(endpoint)) {
    return {
      ok: false,
      status: 0,
      body: JSON.stringify({ error_message: 'Endpoint is not on the token-auth probe allow-list' }),
      shape: 'refused',
    };
  }
  const url = `${MOBILE_API_BASE}/${endpoint}`;
  const body = JSON.stringify(args.body && typeof args.body === 'object' ? args.body : {});
  const timeoutMs = typeof args.timeoutMs === 'number' ? args.timeoutMs : 20_000;
  try {
    const result = await httpsPostJson(url, args.headers, body, timeoutMs);
    return {
      ok: result.ok,
      status: result.status,
      body: result.body,
      shape: summarizeResponseKeys(result.body),
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: err instanceof Error ? err.message : 'Network error',
      shape: 'network_error',
    };
  }
}

/**
 * On 401/403/426, try dropping or swapping header sets (shape only — never log header values).
 * @returns {Promise<{ status: number, shape: string, variant: string, body: string }>}
 */
async function muteSpeakerWithHeaderVariants(args) {
  const {
    channel,
    userId,
    token,
    deviceId,
    authUserId,
    timeoutMs,
  } = args;
  const body = { channel, user_id: Number(userId) };
  const variants = [
    {
      name: 'full',
      headers: mobileTokenHeaders({
        deviceId,
        userId: authUserId,
        token,
      }),
    },
    {
      name: 'no-userid',
      headers: mobileTokenHeaders({ deviceId, token }),
    },
    {
      name: 'browser-ua',
      headers: mobileTokenHeaders({
        deviceId,
        userId: authUserId,
        token,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        appVersion: '24.10.1',
        appBuild: '241001',
      }),
    },
    {
      name: 'minimal-token',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Token ${token}`,
        'User-Agent': DEFAULT_MOBILE_APP.userAgent,
      },
    },
  ];
  /** @type {Array<{ variant: string, status: number, shape: string }>} */
  const attempts = [];
  for (const variant of variants) {
    const result = await callTokenProbeApi({
      endpoint: 'mute_speaker',
      body,
      headers: variant.headers,
      timeoutMs,
    });
    attempts.push({ variant: variant.name, status: result.status, shape: result.shape });
    if (result.status >= 200 && result.status < 300) {
      return { status: result.status, shape: result.shape, variant: variant.name, body: result.body, attempts };
    }
    if (result.status !== 401 && result.status !== 403 && result.status !== 426) {
      return { status: result.status, shape: result.shape, variant: variant.name, body: result.body, attempts };
    }
  }
  const last = attempts[attempts.length - 1];
  return {
    status: last.status,
    shape: last.shape,
    variant: last.variant,
    body: '',
    attempts,
  };
}

module.exports = {
  TOKEN_AUTH_ENDPOINTS,
  DEFAULT_MOBILE_APP,
  isTokenAuthProbeEndpoint,
  normalizeTrPhoneForAuth,
  ensureProbeDeviceId,
  summarizeResponseKeys,
  responseHasKey,
  detectAttestation,
  mobileTokenHeaders,
  callTokenProbeApi,
  muteSpeakerWithHeaderVariants,
  MOBILE_API_BASE,
};
