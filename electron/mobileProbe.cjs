/**
 * Phase 28.0 — body discovery on clubhouseapi.com (dev only).
 * Production ALLOWED_MOBILE_ENDPOINTS stays strict; probes use PROBE_MOBILE_ENDPOINTS.
 * Never log Cookie / X-CSRFToken / Authorization values.
 */

const { MOBILE_API_BASE, callMobileApi } = require('./mobileApi.cjs');

/** Dev-only allow-list for CLUBBOX_PROBE_MOBILE discovery (not production IPC). */
const PROBE_MOBILE_ENDPOINTS = Object.freeze([
  'get_channel',
  'get_handraise_queue',
  'get_suggested_speakers',
  'check_channel_link',
  'get_profile',
  'get_channels',
  'add_channel_link',
  'remove_channel_link',
  'disable_channel_messages',
  'enable_channel_messages',
  'update_nsfw_status',
  'disable_replay',
  'uninvite_speaker',
]);

const PROBE_SET = new Set(PROBE_MOBILE_ENDPOINTS);

/** Typed confirm required before any mutation probe runs. */
const MUTATION_CONFIRM = 'I_CONFIRM_THROWAY_ROOM';

function isProbeMobileEndpoint(name) {
  return typeof name === 'string' && PROBE_SET.has(name);
}

/**
 * One-level keys; for get_channel also users[0] keys.
 */
function summarizeResponseBody(endpoint, text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    return `non-json ${String(text || '').slice(0, 80).replace(/\s+/g, ' ')}`;
  }
  if (!json || typeof json !== 'object') return `type=${typeof json}`;
  const keys = Object.keys(json);
  let shape = `keys=${keys.join(',')}`;
  if (json.detail) shape += ` detail=${String(json.detail).slice(0, 120)}`;
  if (json.error_message) shape += ` error_message=${String(json.error_message).slice(0, 160)}`;
  if (endpoint === 'get_channel' && Array.isArray(json.users) && json.users[0] && typeof json.users[0] === 'object') {
    shape += ` users[0].keys=${Object.keys(json.users[0]).join(',')}`;
  }
  if (json.channel && typeof json.channel === 'object') {
    shape += ` channel.keys=${Object.keys(json.channel).join(',')}`;
  }
  return shape;
}

/**
 * @param {{
 *   fetchFn: typeof fetch,
 *   cookies: Array<{ name: string, value: string }>,
 *   userAgent: string,
 *   endpoint: string,
 *   body?: Record<string, unknown>,
 *   timeoutMs?: number,
 * }} args
 */
async function callProbeMobileApi(args) {
  return callMobileApi({
    ...args,
    allowList: PROBE_SET,
  });
}

/**
 * Read-only discovery in the owner's current room.
 */
async function probeMobileReadOnly(args) {
  const channel = String(args.channel || '');
  const link = typeof args.link === 'string' && args.link.startsWith('https://')
    ? args.link
    : 'https://example.com/clubbox-probe';
  const calls = [
    ['get_channel', { channel }],
    ['get_handraise_queue', { channel }],
    ['get_suggested_speakers', { channel }],
    ['check_channel_link', { channel, link }],
  ];
  /** @type {Array<{ endpoint: string, body: Record<string, unknown>, status: number, shape: string }>} */
  const results = [];
  for (const [endpoint, body] of calls) {
    const result = await callProbeMobileApi({
      fetchFn: args.fetchFn,
      cookies: args.cookies,
      userAgent: args.userAgent,
      timeoutMs: args.timeoutMs,
      endpoint,
      body,
    });
    const shape = summarizeResponseBody(endpoint, result.body);
    console.log('[mobile-probe]', endpoint, result.status, shape);
    results.push({ endpoint, body, status: result.status, shape });
  }
  return results;
}

/**
 * Mutation shapes to try (max 3 per endpoint).
 * @param {string} endpoint
 * @param {string} channel
 * @param {string} link
 * @param {number | null} userId
 */
function mutationBodyAttempts(endpoint, channel, link, userId) {
  switch (endpoint) {
    case 'add_channel_link':
      return [
        { channel, link },
        { channel, url: link },
        { channel, link, title: 'probe' },
      ];
    case 'remove_channel_link':
      return [
        { channel },
        { channel, link },
        { channel, channel_link_id: 0 },
      ];
    case 'disable_channel_messages':
    case 'enable_channel_messages':
    case 'disable_replay':
      return [
        { channel },
        { channel, channel_id: channel },
        { channel_id: channel },
      ];
    case 'update_nsfw_status':
      return [
        { channel, is_nsfw: false },
        { channel, nsfw: false },
        { channel, is_nsfw: 0 },
      ];
    case 'uninvite_speaker':
      if (userId == null) return [];
      return [{ channel, user_id: userId }];
    default:
      return [{ channel }];
  }
}

/**
 * Mutations require confirm === MUTATION_CONFIRM (typed in DevTools / CLI).
 */
async function probeMobileMutation(args) {
  if (args.confirm !== MUTATION_CONFIRM) {
    return {
      refused: true,
      reason: `Type confirm exactly: ${MUTATION_CONFIRM}`,
      results: [],
    };
  }
  const endpoint = String(args.endpoint || '').replace(/^\//, '');
  if (!isProbeMobileEndpoint(endpoint)) {
    return { refused: true, reason: 'not on probe allow-list', results: [] };
  }
  const readOnly = new Set([
    'get_channel',
    'get_handraise_queue',
    'get_suggested_speakers',
    'check_channel_link',
    'get_profile',
    'get_channels',
  ]);
  if (readOnly.has(endpoint)) {
    return { refused: true, reason: 'use read-only probe for this endpoint', results: [] };
  }
  const channel = String(args.channel || '');
  const link = typeof args.link === 'string' && args.link.startsWith('https://')
    ? args.link
    : 'https://example.com/clubbox-probe';
  const userId = typeof args.userId === 'number' ? args.userId : null;
  if (endpoint === 'uninvite_speaker' && userId == null) {
    return { refused: true, reason: 'uninvite_speaker probe needs userId (self)', results: [] };
  }
  const attempts = mutationBodyAttempts(endpoint, channel, link, userId).slice(0, 3);
  /** @type {Array<{ body: Record<string, unknown>, status: number, shape: string }>} */
  const results = [];
  for (const body of attempts) {
    const result = await callProbeMobileApi({
      fetchFn: args.fetchFn,
      cookies: args.cookies,
      userAgent: args.userAgent,
      timeoutMs: args.timeoutMs,
      endpoint,
      body,
    });
    const shape = summarizeResponseBody(endpoint, result.body);
    console.log(
      '[mobile-probe-mutate]',
      endpoint,
      result.status,
      'bodyKeys',
      Object.keys(body).join(','),
      shape,
    );
    results.push({ body, status: result.status, shape });
    if (result.status >= 200 && result.status < 300) break;
    if (result.status !== 400 && result.status !== 422) break;
  }
  return { refused: false, results };
}

module.exports = {
  PROBE_MOBILE_ENDPOINTS,
  MUTATION_CONFIRM,
  isProbeMobileEndpoint,
  summarizeResponseBody,
  callProbeMobileApi,
  probeMobileReadOnly,
  probeMobileMutation,
  MOBILE_API_BASE,
};
