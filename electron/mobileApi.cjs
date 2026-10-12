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
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json; charset=utf-8',
    'CH-Languages': 'en-US',
    'CH-Locale': 'en_US',
    'User-Agent': opts.userAgent || '',
    Cookie: cookieHeader,
    'X-CSRFToken': csrf,
    Origin: 'https://www.clubhouse.com',
    Referer: 'https://www.clubhouse.com/home',
  };
}

/**
 * @param {{
 *   fetchFn: typeof fetch,
 *   endpoint: string,
 *   body?: Record<string, unknown> | null,
 *   cookies: Array<{ name: string, value: string }>,
 *   userAgent: string,
 *   timeoutMs?: number,
 * }} args
 */
async function callMobileApi(args) {
  const endpoint = String(args.endpoint || '').replace(/^\//, '');
  if (!isAllowedMobileEndpoint(endpoint)) {
    return {
      ok: false,
      status: 0,
      body: JSON.stringify({ error_message: 'Endpoint is not allowed on mobile API' }),
    };
  }
  const headers = mobileAuthHeadersFromCookies(args.cookies, { userAgent: args.userAgent });
  const timeoutMs = typeof args.timeoutMs === 'number' ? args.timeoutMs : 20_000;
  try {
    const response = await args.fetchFn(`${MOBILE_API_BASE}/${endpoint}`, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers,
      body: JSON.stringify(args.body && typeof args.body === 'object' ? args.body : {}),
    });
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
