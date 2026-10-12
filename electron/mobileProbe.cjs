/**
 * Phase 28.0 / 29.0 — body discovery on clubhouseapi.com (dev only).
 * Production ALLOWED_MOBILE_ENDPOINTS stays strict; probes use PROBE_MOBILE_ENDPOINTS.
 * Never log Cookie / X-CSRFToken / Authorization values.
 */

const { MOBILE_API_BASE, callMobileApi } = require('./mobileApi.cjs');

/** Dev-only allow-list for CLUBBOX_PROBE_MOBILE discovery (not production IPC). */
const PROBE_MOBILE_ENDPOINTS = Object.freeze([
  // Phase 28.0 / 28.6
  'get_channel',
  'get_handraise_queue',
  'get_suggested_speakers',
  'check_channel_link',
  'get_moderator_action_history',
  'get_profile',
  'get_channels',
  'add_channel_link',
  'remove_channel_link',
  'disable_channel_messages',
  'enable_channel_messages',
  'update_nsfw_status',
  'disable_replay',
  'update_handraise_queue_setting',
  'uninvite_speaker',
  // Phase 29.0 read-only
  'get_channel_audience',
  'get_channel_banner',
  'get_channel_user_poll',
  'get_highlight',
  // Phase 29.0 mutations (throwaway + typed confirm only)
  'set_channel_banner',
  'create_channel_user_poll',
  'submit_channel_user_poll_vote',
  'remove_channel_user_poll',
  'create_highlight',
  'delete_highlight',
  'update_channel_flags',
]);

const PROBE_SET = new Set(PROBE_MOBILE_ENDPOINTS);

/** Typed confirm required before any mutation probe runs. */
const MUTATION_CONFIRM = 'I_CONFIRM_THROWAY_ROOM';

const READ_ONLY_PROBE = new Set([
  'get_channel',
  'get_handraise_queue',
  'get_suggested_speakers',
  'check_channel_link',
  'get_moderator_action_history',
  'get_profile',
  'get_channels',
  'get_channel_audience',
  'get_channel_banner',
  'get_channel_user_poll',
  'get_highlight',
]);

function isProbeMobileEndpoint(name) {
  return typeof name === 'string' && PROBE_SET.has(name);
}

/**
 * One-level keys; dig one level into the first list item for room/queue/history shapes.
 * Never logs secret field values — only key names.
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
  if (json.channel && typeof json.channel === 'object') {
    shape += ` channel.keys=${Object.keys(json.channel).join(',')}`;
  }
  const firstItemArrays = [
    'users',
    'users_in_queue',
    'queue',
    'handraise_queue',
    'items',
    'actions',
    'history',
    'moderator_actions',
    'suggested_speakers',
    'speakers',
    'handraise_queue_options',
    'audience',
    'channel_audience',
    'options',
    'votes',
    'highlights',
  ];
  for (const name of firstItemArrays) {
    const arr = json[name];
    if (Array.isArray(arr) && arr[0] && typeof arr[0] === 'object') {
      shape += ` ${name}[0].keys=${Object.keys(arr[0]).join(',')}`;
    }
  }
  if (endpoint === 'get_channel' && typeof json.handraise_queue_setting === 'number') {
    shape += ` handraise_queue_setting=${json.handraise_queue_setting}`;
  }
  if (typeof json.next_cursor === 'string') shape += ' next_cursor=yes';
  if (typeof json.cursor === 'string') shape += ' cursor=yes';
  if (typeof json.pagination_cursor === 'string') shape += ' pagination_cursor=yes';
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
 * Extra body shapes when the first attempt returns 400 (max 3 total per endpoint).
 * @param {string} endpoint
 * @param {string} channel
 */
function readOnlyBodyAttempts(endpoint, channel, link) {
  switch (endpoint) {
    case 'get_channel':
    case 'get_suggested_speakers':
    case 'get_channel_banner':
    case 'get_channel_user_poll':
      return [{ channel }];
    case 'get_channel_audience':
      return [
        { channel },
        { channel, page_size: 50 },
        { channel, cursor: null, page_size: 50 },
      ];
    case 'get_highlight':
      return [
        { channel },
        { channel, id: channel },
        { id: channel },
      ];
    case 'get_handraise_queue':
      return [
        { channel },
        { channel, page_size: 50 },
        { channel, cursor: null },
      ];
    case 'get_moderator_action_history':
      return [
        { channel },
        { channel, page_size: 50 },
        { channel, cursor: '', page_size: 50 },
      ];
    case 'check_channel_link':
      return [{ channel, link }];
    default:
      return [{ channel }];
  }
}

/**
 * Read-only discovery in the owner's current room (28.0 + 28.6 + 29.0).
 */
async function probeMobileReadOnly(args) {
  const channel = String(args.channel || '');
  const link = typeof args.link === 'string' && args.link.startsWith('https://')
    ? args.link
    : 'https://example.com/clubbox-probe';
  const endpoints = [
    'get_channel',
    'get_handraise_queue',
    'get_suggested_speakers',
    'check_channel_link',
    'get_moderator_action_history',
    'get_channel_audience',
    'get_channel_banner',
    'get_channel_user_poll',
    'get_highlight',
  ];
  /** @type {Array<{ endpoint: string, body: Record<string, unknown>, status: number, shape: string }>} */
  const results = [];
  for (const endpoint of endpoints) {
    const attempts = readOnlyBodyAttempts(endpoint, channel, link).slice(0, 3);
    let last = null;
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
      console.log('[mobile-probe]', endpoint, result.status, 'bodyKeys', Object.keys(body).join(','), shape);
      last = { endpoint, body, status: result.status, shape };
      if (result.status >= 200 && result.status < 300) break;
      if (result.status !== 400 && result.status !== 422) break;
    }
    if (last) results.push(last);
  }
  return results;
}

/**
 * Mutation shapes to try (max 3 per endpoint).
 * @param {string} endpoint
 * @param {string} channel
 * @param {string} link
 * @param {number | null} userId
 * @param {number | null} [handraiseQueueSetting]
 * @param {Record<string, unknown>} [extra]
 */
function mutationBodyAttempts(endpoint, channel, link, userId, handraiseQueueSetting = null, extra = {}) {
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
    case 'update_handraise_queue_setting': {
      const values = handraiseQueueSetting != null ? [handraiseQueueSetting] : [0, 2, 1];
      return values.slice(0, 3).map((handraise_queue_setting) => ({ channel, handraise_queue_setting }));
    }
    case 'uninvite_speaker':
      if (userId == null) return [];
      return [{ channel, user_id: userId }];
    case 'set_channel_banner':
      return [
        { channel, text: 'clubbox-probe' },
        { channel, banner: 'clubbox-probe' },
        { channel, message: 'clubbox-probe' },
      ];
    case 'create_channel_user_poll':
      return [
        { channel, question: 'Clubbox probe?', options: ['A', 'B'] },
        { channel, question: 'Clubbox probe?', options: [{ text: 'A' }, { text: 'B' }] },
        { channel, title: 'Clubbox probe?', options: ['A', 'B'] },
      ];
    case 'submit_channel_user_poll_vote':
      return [
        { channel, option_index: 0 },
        { channel, option: 0 },
        { channel, vote: 0 },
      ];
    case 'remove_channel_user_poll':
      return [
        { channel },
        { channel, channel_user_poll_id: extra.pollId ?? 0 },
        { channel_id: channel },
      ];
    case 'create_highlight':
      return [
        { channel, title: 'clubbox-probe' },
        { channel, name: 'clubbox-probe' },
        { channel, title: 'clubbox-probe', start_time: 0 },
      ];
    case 'delete_highlight':
      return [
        { channel, id: String(extra.highlightId || '0') },
        { id: String(extra.highlightId || '0') },
        { channel, highlight_id: String(extra.highlightId || '0') },
      ];
    case 'update_channel_flags':
      return [
        { channel, is_web_listening_enabled: false },
        { channel, is_chat_enabled: true },
        { channel, is_handraise_enabled: true },
      ];
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
  if (READ_ONLY_PROBE.has(endpoint)) {
    return { refused: true, reason: 'use read-only probe for this endpoint', results: [] };
  }
  const channel = String(args.channel || '');
  const link = typeof args.link === 'string' && args.link.startsWith('https://')
    ? args.link
    : 'https://example.com/clubbox-probe';
  const userId = typeof args.userId === 'number' ? args.userId : null;
  const handraiseQueueSetting = typeof args.handraiseQueueSetting === 'number'
    ? args.handraiseQueueSetting
    : null;
  if (endpoint === 'uninvite_speaker' && userId == null) {
    return { refused: true, reason: 'uninvite_speaker probe needs userId (self)', results: [] };
  }
  const attempts = mutationBodyAttempts(
    endpoint,
    channel,
    link,
    userId,
    handraiseQueueSetting,
    {
      pollId: typeof args.pollId === 'number' ? args.pollId : undefined,
      highlightId: typeof args.highlightId === 'string' ? args.highlightId : undefined,
    },
  ).slice(0, 3);
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

/** Default mutate=all order for Phase 28 + 29.0 (throwaway room only). */
const MUTATION_PROBE_ORDER = Object.freeze([
  'add_channel_link',
  'remove_channel_link',
  'disable_channel_messages',
  'enable_channel_messages',
  'update_nsfw_status',
  'disable_replay',
  'update_handraise_queue_setting',
  'set_channel_banner',
  'create_channel_user_poll',
  'submit_channel_user_poll_vote',
  'remove_channel_user_poll',
  'create_highlight',
  'delete_highlight',
  'update_channel_flags',
]);

module.exports = {
  PROBE_MOBILE_ENDPOINTS,
  MUTATION_CONFIRM,
  MUTATION_PROBE_ORDER,
  READ_ONLY_PROBE,
  isProbeMobileEndpoint,
  summarizeResponseBody,
  callProbeMobileApi,
  probeMobileReadOnly,
  probeMobileMutation,
  readOnlyBodyAttempts,
  mutationBodyAttempts,
  MOBILE_API_BASE,
};
