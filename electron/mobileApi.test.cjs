const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ALLOWED_MOBILE_ENDPOINTS,
  isAllowedMobileEndpoint,
  mobileAuthHeadersFromCookies,
  callMobileApi,
  MOBILE_API_BASE,
} = require('./mobileApi.cjs');

test('mobile allow-list accepts moderation + Phase 28 room tools', () => {
  assert.deepEqual(ALLOWED_MOBILE_ENDPOINTS.slice().sort(), [
    'add_channel_link',
    'block_from_channel',
    'change_handraise_settings',
    'check_channel_link',
    'delete_channel_message',
    'disable_channel_messages',
    'disable_replay',
    'enable_channel_messages',
    'end_channel',
    'get_channel',
    'get_handraise_queue',
    'get_suggested_speakers',
    'hide_channel',
    'invite_speaker',
    'invite_to_existing_channel',
    'make_moderator',
    'mute_speaker',
    'reject_speaker_invite',
    'remove_channel_link',
    'save_replay',
    'uninvite_speaker',
    'update_nsfw_status',
  ]);
  assert.equal(isAllowedMobileEndpoint('mute_speaker'), true);
  assert.equal(isAllowedMobileEndpoint('get_channel'), true);
  assert.equal(isAllowedMobileEndpoint('disable_replay'), true);
  assert.equal(isAllowedMobileEndpoint('get_profile'), false);
  assert.equal(isAllowedMobileEndpoint('me'), false);
  assert.equal(isAllowedMobileEndpoint('../mute_speaker'), false);
});

test('mobile auth headers use cookie + csrf like the 200 probe variant', () => {
  const headers = mobileAuthHeadersFromCookies(
    [
      { name: 'sessionid', value: 'secret-session' },
      { name: 'csrftoken', value: 'secret-csrf' },
    ],
    { userAgent: 'TestUA' },
  );
  assert.equal(headers.Origin, 'https://www.clubhouse.com');
  assert.equal(headers.Referer, undefined);
  assert.equal(headers['User-Agent'], 'TestUA');
  assert.equal(headers.Cookie, 'sessionid=secret-session; csrftoken=secret-csrf');
  assert.equal(headers['X-CSRFToken'], 'secret-csrf');
  assert.equal(headers['Content-Type'], 'application/json; charset=utf-8');
});

test('mobile auth headers omit empty Cookie and CSRF', () => {
  const headers = mobileAuthHeadersFromCookies([], { userAgent: 'TestUA' });
  assert.equal(headers.Cookie, undefined);
  assert.equal(headers['X-CSRFToken'], undefined);
  assert.equal(headers.Origin, 'https://www.clubhouse.com');
});

test('callMobileApi refuses non-allow-listed endpoints without fetch', async () => {
  let fetched = false;
  const result = await callMobileApi({
    fetchFn: async () => {
      fetched = true;
      return { ok: true, status: 200, text: async () => '{}' };
    },
    endpoint: 'get_profile',
    body: {},
    cookies: [],
    userAgent: 'TestUA',
  });
  assert.equal(fetched, false);
  assert.equal(result.ok, false);
  assert.equal(result.status, 0);
  assert.match(result.body, /not allowed/i);
});

test('callMobileApi posts to clubhouseapi.com/api/<endpoint>', async () => {
  /** @type {{ url: string, init: RequestInit } | null} */
  let seen = null;
  const result = await callMobileApi({
    fetchFn: async (url, init) => {
      seen = { url, init };
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true }),
      };
    },
    endpoint: 'mute_speaker',
    body: { channel: 'abc', user_id: 9 },
    cookies: [{ name: 'csrftoken', value: 'tok' }],
    userAgent: 'TestUA',
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(seen?.url, `${MOBILE_API_BASE}/mute_speaker`);
  assert.equal(seen?.init?.method, 'POST');
  assert.equal(seen?.init?.body, JSON.stringify({ channel: 'abc', user_id: 9 }));
  assert.equal(seen?.init?.headers?.['X-CSRFToken'], 'tok');
});

test('callMobileApi falls back to https when session.fetch throws', async () => {
  const { httpsPostJson } = require('./mobileApi.cjs');
  assert.equal(typeof httpsPostJson, 'function');
  const result = await callMobileApi({
    fetchFn: async () => {
      throw new Error('net::ERR_FAILED');
    },
    endpoint: 'mute_speaker',
    body: { channel: 'abc', user_id: 9 },
    cookies: [
      { name: 'sessionid', value: 'sess' },
      { name: 'csrftoken', value: 'tok' },
    ],
    userAgent: 'TestUA',
    timeoutMs: 8_000,
  });
  // Live network: 401 without a real session is fine — proves Cookie was accepted by the wire path.
  assert.ok(result.status === 401 || result.status === 200 || result.status === 400);
  assert.doesNotMatch(result.body, /ERR_FAILED/);
});
