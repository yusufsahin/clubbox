const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PROBE_MOBILE_ENDPOINTS,
  MUTATION_CONFIRM,
  isProbeMobileEndpoint,
  summarizeResponseBody,
  callProbeMobileApi,
  probeMobileMutation,
} = require('./mobileProbe.cjs');
const { isAllowedMobileEndpoint } = require('./mobileApi.cjs');

test('probe allow-list is separate from production host-tool allow-list', () => {
  assert.equal(isProbeMobileEndpoint('get_channel'), true);
  assert.equal(isProbeMobileEndpoint('add_channel_link'), true);
  assert.equal(isAllowedMobileEndpoint('get_channel'), false);
  assert.equal(isAllowedMobileEndpoint('mute_speaker'), true);
  assert.ok(PROBE_MOBILE_ENDPOINTS.includes('check_channel_link'));
});

test('summarizeResponseBody logs keys and users[0] for get_channel', () => {
  const shape = summarizeResponseBody(
    'get_channel',
    JSON.stringify({
      success: true,
      users: [{ user_id: 1, is_moderator: true, secret_token: 'x' }],
      channel: 'abc',
    }),
  );
  assert.match(shape, /keys=success,users,channel/);
  assert.match(shape, /users\[0\]\.keys=user_id,is_moderator,secret_token/);
  assert.doesNotMatch(shape, /secret_token=x/);
});

test('mutation probe refuses without exact typed confirm', async () => {
  const out = await probeMobileMutation({
    fetchFn: async () => ({ ok: true, status: 200, text: async () => '{}' }),
    cookies: [],
    userAgent: 'Test',
    channel: 'abc',
    endpoint: 'disable_replay',
    confirm: 'wrong',
  });
  assert.equal(out.refused, true);
  assert.match(out.reason, new RegExp(MUTATION_CONFIRM));
});

test('callProbeMobileApi uses probe allow-list not production', async () => {
  let seen = null;
  const result = await callProbeMobileApi({
    fetchFn: async (url, init) => {
      seen = { url, body: init.body };
      return { ok: true, status: 200, text: async () => JSON.stringify({ success: true }) };
    },
    cookies: [{ name: 'csrftoken', value: 'tok' }],
    userAgent: 'Test',
    endpoint: 'get_channel',
    body: { channel: 'abc' },
  });
  assert.equal(result.status, 200);
  assert.match(seen.url, /\/api\/get_channel$/);
  assert.equal(seen.body, JSON.stringify({ channel: 'abc' }));
});
