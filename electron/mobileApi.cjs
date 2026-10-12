/**
 * Phase 27 — moderation calls on the Clubhouse mobile API host, authenticated
 * with the existing web session (cookies + X-CSRFToken). No phone-token storage.
 * Never log Cookie / X-CSRFToken / Authorization values.
 */

const MOBILE_API_BASE = 'https://www.clubhouseapi.com/api';

const ALLOWED_MOBILE_ENDPOINTS = Object.freeze([
  'end_channel',
  'invite_speaker',
  'uninvite_speaker',
  'mute_speaker',
  'block_from_channel',
  'make_moderator',
  'change_handraise_settings',
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
  try {
    const init = {
      method: 'POST',
      headers,
      body: JSON.stringify(args.body && typeof args.body === 'object' ? args.body : {}),
    };
    // Only attach AbortSignal when the runtime supports it without breaking session.fetch.
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      init.signal = AbortSignal.timeout(timeoutMs);
    }
    const response = await args.fetchFn(`${MOBILE_API_BASE}/${endpoint}`, init);
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
};
