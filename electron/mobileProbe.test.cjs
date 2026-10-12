const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PROBE_MOBILE_ENDPOINTS,
  MUTATION_CONFIRM,
  MUTATION_PROBE_ORDER,
  isProbeMobileEndpoint,
  summarizeResponseBody,
  callProbeMobileApi,
  probeMobileMutation,
  readOnlyBodyAttempts,
} = require('./mobileProbe.cjs');
const { isAllowedMobileEndpoint } = require('./mobileApi.cjs');

test('probe allow-list is separate from production host-tool allow-list', () => {
  assert.equal(isProbeMobileEndpoint('get_channel'), true);
  assert.equal(isProbeMobileEndpoint('add_channel_link'), true);
  assert.equal(isProbeMobileEndpoint('get_moderator_action_history'), true);
  assert.equal(isProbeMobileEndpoint('update_handraise_queue_setting'), true);
  assert.equal(isProbeMobileEndpoint('get_channel_audience'), true);
  assert.equal(isProbeMobileEndpoint('get_channel_banner'), true);
  assert.equal(isProbeMobileEndpoint('create_channel_user_poll'), true);
  assert.equal(isProbeMobileEndpoint('update_channel_flags'), true);
  assert.equal(isAllowedMobileEndpoint('get_channel'), true);
  assert.equal(isAllowedMobileEndpoint('get_moderator_action_history'), true);
  assert.equal(isAllowedMobileEndpoint('get_channel_audience'), false);
  assert.equal(isAllowedMobileEndpoint('mute_speaker'), true);
  assert.ok(PROBE_MOBILE_ENDPOINTS.includes('check_channel_link'));
  assert.ok(MUTATION_PROBE_ORDER.includes('set_channel_banner'));
  assert.ok(MUTATION_PROBE_ORDER.includes('update_channel_flags'));
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

test('summarizeResponseBody notes audience pagination cursor keys', () => {
  const shape = summarizeResponseBody(
    'get_channel_audience',
    JSON.stringify({
      success: true,
      users: [{ user_id: 9, name: 'A' }],
      next_cursor: 'abc',
    }),
  );
  assert.match(shape, /users\[0\]\.keys=user_id,name/);
  assert.match(shape, /next_cursor=yes/);
});

test('get_channel_audience read-only attempts include pagination bodies', () => {
  const bodies = readOnlyBodyAttempts('get_channel_audience', 'room1', 'https://example.com');
  assert.equal(bodies.length, 3);
  assert.deepEqual(bodies[0], { channel: 'room1' });
  assert.equal(bodies[1].page_size, 50);
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
