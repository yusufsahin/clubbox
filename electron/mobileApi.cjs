/**
 * Phase 27 — moderation calls on the Clubhouse mobile API host.
 * Prefer Authorization: Token when linked (27.5); else web session cookies + X-CSRFToken
 * (get_profile-class only; moderation → 401 without Token).
 * Never log Cookie / X-CSRFToken / Authorization values.
 */

const https = require('https');
const { URL } = require('url');

const MOBILE_API_BASE = 'https://www.clubhouseapi.com/api';
const REFRESH_TOKEN_ENDPOINT = 'refresh_token';

/** Lazy — mobileTokenProbe also requires this module for httpsPostJson. */
function tokenHeaderHelpers() {
  return require('./mobileTokenProbe.cjs');
}

/**
 * Node https POST that keeps Cookie / X-CSRFToken (undici fetch strips Cookie as forbidden).
 * @param {string} url
 * @param {Record<string, string>} headers
 * @param {string} body
 * @param {number} timeoutMs
 */
function httpsPostJson(url, headers, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = Buffer.from(body, 'utf8');
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': payload.length,
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          const status = res.statusCode || 0;
          resolve({ ok: status >= 200 && status < 300, status, body: text });
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.write(payload);
    req.end();
  });
}

const ALLOWED_MOBILE_ENDPOINTS = Object.freeze([
  'end_channel',
  'invite_speaker',
  'uninvite_speaker',
  'mute_speaker',
  'block_from_channel',
  'make_moderator',
  'get_channel',
  'reject_speaker_invite',
  'invite_to_existing_channel',
  'hide_channel',
  'save_replay',
  'check_channel_link',
  'add_channel_link',
  'remove_channel_link',
  'enable_channel_messages',
  'disable_channel_messages',
  'delete_channel_message',
  'disable_replay',
  'get_handraise_queue',
  'get_suggested_speakers',
  'update_nsfw_status',
  'get_moderator_action_history',
  'update_handraise_queue_setting',
]);

const ALLOWED_SET = new Set(ALLOWED_MOBILE_ENDPOINTS);

function isAllowedMobileEndpoint(name) {
  return typeof name === 'string' && ALLOWED_SET.has(name);
}

/**
 * @param {Array<{ name: string, value: string }>} cookies
 * @param {{ userAgent: string }} opts
 */
function mobileAuthHeadersFromCookies(cookies, opts) {
  const list = Array.isArray(cookies) ? cookies : [];
  const csrf = list.find((cookie) => cookie.name === 'csrftoken')?.value || '';
  const cookieHeader = list.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  /** @type {Record<string, string>} */
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json; charset=utf-8',
    'CH-Languages': 'en-US',
    'CH-Locale': 'en_US',
    'User-Agent': opts.userAgent || '',
    // Origin is required for the cookie+csrf mobile path (Phase 27 probe).
    // Do not set Referer — Chromium session.fetch treats it as forbidden (ERR_BLOCKED_BY_CLIENT).
    Origin: 'https://www.clubhouse.com',
  };
  // Empty Cookie / CSRF headers also trip ERR_BLOCKED_BY_CLIENT on session.fetch.
  if (cookieHeader) headers.Cookie = cookieHeader;
  if (csrf) headers['X-CSRFToken'] = csrf;
  return headers;
}

/**
 * @param {{
 *   fetchFn: typeof fetch,
 *   endpoint: string,
 *   body?: Record<string, unknown> | null,
 *   cookies: Array<{ name: string, value: string }>,
 *   userAgent: string,
 *   timeoutMs?: number,
 *   allowList?: Set<string> | ReadonlySet<string>,
 *   tokenAuth?: {
 *     token: string,
 *     userId: number | string,
 *     deviceId: string,
 *     appVersion?: string,
 *     appBuild?: string,
 *     userAgent?: string,
 *   } | null,
 * }} args
 * `allowList` — dev probe only; when set, replaces the production allow-list check.
 * Token path uses Node https (same as Cookie path).
 */
async function callMobileApi(args) {
  const endpoint = String(args.endpoint || '').replace(/^\//, '');
  const allowed = args.allowList
    ? args.allowList.has(endpoint)
    : isAllowedMobileEndpoint(endpoint);
  if (!allowed) {
    return {
      ok: false,
      status: 0,
      body: JSON.stringify({ error_message: 'Endpoint is not allowed on mobile API' }),
    };
  }
  const timeoutMs = typeof args.timeoutMs === 'number' ? args.timeoutMs : 20_000;
  const url = `${MOBILE_API_BASE}/${endpoint}`;
  const body = JSON.stringify(args.body && typeof args.body === 'object' ? args.body : {});

  if (args.tokenAuth?.token) {
    const { mobileTokenHeaders, DEFAULT_MOBILE_APP } = tokenHeaderHelpers();
    const headers = mobileTokenHeaders({
      deviceId: args.tokenAuth.deviceId,
      userId: args.tokenAuth.userId,
      token: args.tokenAuth.token,
      appVersion: args.tokenAuth.appVersion || DEFAULT_MOBILE_APP.appVersion,
      appBuild: args.tokenAuth.appBuild || DEFAULT_MOBILE_APP.appBuild,
      userAgent: args.tokenAuth.userAgent || args.userAgent || DEFAULT_MOBILE_APP.userAgent,
    });
    try {
      return await httpsPostJson(url, headers, body, timeoutMs);
    } catch (err) {
      return {
        ok: false,
        status: 0,
        body: err instanceof Error ? err.message : 'Network error',
      };
    }
  }

  const headers = mobileAuthHeadersFromCookies(args.cookies, { userAgent: args.userAgent });
  const hasSessionCookie = Array.isArray(args.cookies)
    && args.cookies.some((cookie) => cookie && cookie.name === 'sessionid' && cookie.value);

  // Chromium session.fetch / undici strip the Cookie forbidden header. Proven 2026-10-12:
  // Node https + Cookie/CSRF → get_profile 200; session.fetch alone → false 401.
  if (hasSessionCookie) {
    try {
      return await httpsPostJson(url, headers, body, timeoutMs);
    } catch (err) {
      return {
        ok: false,
        status: 0,
        body: err instanceof Error ? err.message : 'Network error',
      };
    }
  }

  try {
    const init = {
      method: 'POST',
      headers,
      body,
    };
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      init.signal = AbortSignal.timeout(timeoutMs);
    }
    const response = await args.fetchFn(url, init);
    const text = await response.text();
    return { ok: response.ok, status: response.status, body: text };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: err instanceof Error ? err.message : 'Network error',
    };
  }
}

/**
 * Silent Token refresh (auth-only; not on moderation allow-list).
 * @param {{
 *   refreshToken: string,
 *   deviceId: string,
 *   userId?: number | string | null,
 *   timeoutMs?: number,
 * }} args
 * @returns {Promise<{ ok: boolean, status: number, body: string, token?: string, refreshToken?: string }>}
 */
async function refreshMobileToken(args) {
  const { mobileTokenHeaders } = tokenHeaderHelpers();
  const headers = mobileTokenHeaders({
    deviceId: args.deviceId,
    userId: args.userId,
  });
  const timeoutMs = typeof args.timeoutMs === 'number' ? args.timeoutMs : 20_000;
  const url = `${MOBILE_API_BASE}/${REFRESH_TOKEN_ENDPOINT}`;
  const body = JSON.stringify({ refresh: args.refreshToken, refresh_token: args.refreshToken });
  try {
    const result = await httpsPostJson(url, headers, body, timeoutMs);
    let token;
    let refreshToken;
    try {
      const json = JSON.parse(result.body);
      if (typeof json.auth_token === 'string') token = json.auth_token;
      else if (typeof json.access_token === 'string') token = json.access_token;
      else if (typeof json.token === 'string') token = json.token;
      if (typeof json.refresh_token === 'string') refreshToken = json.refresh_token;
      else if (typeof json.refresh === 'string') refreshToken = json.refresh;
    } catch {
      /* keys only via caller */
    }
    return {
      ok: result.ok,
      status: result.status,
      body: result.body,
      token,
      refreshToken,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: err instanceof Error ? err.message : 'Network error',
    };
  }
}

module.exports = {
  MOBILE_API_BASE,
  ALLOWED_MOBILE_ENDPOINTS,
  REFRESH_TOKEN_ENDPOINT,
  isAllowedMobileEndpoint,
  mobileAuthHeadersFromCookies,
  callMobileApi,
  refreshMobileToken,
  httpsPostJson,
};
