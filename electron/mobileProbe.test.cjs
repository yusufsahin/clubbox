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
  assert.equal(isProbeMobileEndpoint('get_moderator_action_history'), true);
  assert.equal(isProbeMobileEndpoint('update_handraise_queue_setting'), true);
  assert.equal(isAllowedMobileEndpoint('get_channel'), false);
  assert.equal(isAllowedMobileEndpoint('get_moderator_action_history'), false);
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
      handraise_queue_setting: 2,
    }),
  );
  assert.match(shape, /keys=success,users,channel,handraise_queue_setting/);
  assert.match(shape, /users\[0\]\.keys=user_id,is_moderator,secret_token/);
  assert.match(shape, /handraise_queue_setting=2/);
  assert.doesNotMatch(shape, /secret_token=x/);
});

test('summarizeResponseBody digs into history[0] for moderator action history', () => {
  const shape = summarizeResponseBody(
    'get_moderator_action_history',
    JSON.stringify({
      success: true,
      history: [{ action: 'mute', actor_user_id: 1, target_user_id: 2 }],
    }),
  );
  assert.match(shape, /history\[0\]\.keys=action,actor_user_id,target_user_id/);
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
