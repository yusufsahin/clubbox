const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowedEndpoint, isPlainPayload, pickHeaders } = require('./ipcGuard.cjs');

test('request allowlist rejects unknown endpoints and unsafe payloads', () => {
  assert.equal(isAllowedEndpoint('me'), true);
  assert.equal(isAllowedEndpoint('join_channel'), true);
  assert.equal(isAllowedEndpoint('get_channel'), false);
  assert.equal(isAllowedEndpoint('start_phone_number_web_auth'), true);
  assert.equal(isPlainPayload({ channel: 'room', raise_hands: true }, 0), true);
  assert.equal(isPlainPayload({ token: 'x'.repeat(5000) }, 0), false);
  const headers = pickHeaders({
    Authorization: 'Token secret',
    Cookie: 'session=1',
    Accept: 'application/json',
    'X-Clubbox-Web-Session': '1',
  });
  assert.equal(headers.Authorization, undefined);
  assert.equal(headers.Cookie, undefined);
  assert.equal(headers.Accept, 'application/json');
  assert.equal(headers['X-Clubbox-Web-Session'], '1');
});
