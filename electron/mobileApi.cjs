/**
 * Phase 27 — moderation calls on the Clubhouse mobile API host, authenticated
 * with the existing web session (cookies + X-CSRFToken). No phone-token storage.
 * Never log Cookie / X-CSRFToken / Authorization values.
 */

const https = require('https');
const { URL } = require('url');

const MOBILE_API_BASE = 'https://www.clubhouseapi.com/api';

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
  'change_handraise_settings',
  'get_channel',
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
 * }} args
 * `allowList` — dev probe only; when set, replaces the production allow-list check.
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
  const headers = mobileAuthHeadersFromCookies(args.cookies, { userAgent: args.userAgent });
  const timeoutMs = typeof args.timeoutMs === 'number' ? args.timeoutMs : 20_000;
  const url = `${MOBILE_API_BASE}/${endpoint}`;
  const body = JSON.stringify(args.body && typeof args.body === 'object' ? args.body : {});
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

module.exports = {
  MOBILE_API_BASE,
  ALLOWED_MOBILE_ENDPOINTS,
  isAllowedMobileEndpoint,
  mobileAuthHeadersFromCookies,
  callMobileApi,
  httpsPostJson,
};
