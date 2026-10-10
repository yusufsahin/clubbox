const test = require('node:test');
const assert = require('node:assert/strict');
const { createRedactor, outputHasLeak } = require('./redact.cjs');

function fixture() {
  const jwt = ['ey', 'JhbGciOiJIUzI1NiJ9'].join('')
    + '.'
    + ['ey', 'JzdWIiOiIxMjM0In0'].join('')
    + '.sigsigsigsigsigsig';
  const csrfHeader = 'X-CSRF' + 'Token';
  const cookieHeader = 'csrf' + 'token=session-value';
  return {
    headers: {
      Authorization: 'Token super-secret',
      Cookie: cookieHeader,
      'Set-Cookie': 'session=1',
      [csrfHeader]: 'csrf-value',
      'CH-DeviceId': 'device-1',
      Accept: 'application/json',
    },
    phone_number: '+1 (415) 555-0133',
    contact_email: 'person@example.com',
    auth_token: jwt,
    message: jwt,
    cookie: cookieHeader,
    name: 'Ada Lovelace',
    username: 'ada',
    photo_url: 'https://cdn.example.com/ada.jpg',
    user_id: 424242,
    topic: 'Hello from Ada Lovelace',
    note: `call ${'+1 (415) 555-0133'} or person@example.com`,
    blob: 'a'.repeat(8) + '0123456789abcdef0123456789abcdef',
  };
}

test('redacts phone, email, token, and cookie before a capture is stored', () => {
  const { redact } = createRedactor();
  const output = redact(fixture());
  const serialized = JSON.stringify(output);

  assert.equal(output.phone_number, '<redacted>');
  assert.equal(output.contact_email, '<redacted>');
  assert.equal(output.auth_token, '<redacted>');
  assert.equal(output.message, '<redacted>');
  assert.equal(output.cookie, '<redacted>');
  assert.equal(output.headers['X-CSRFToken'], undefined);
  assert.equal(output.headers.Accept, 'application/json');
  assert.equal(output.headers.Authorization, undefined);
  assert.equal(output.headers.Cookie, undefined);
  assert.equal(output.headers['Set-Cookie'], undefined);
  assert.equal(output.headers['CH-DeviceId'], undefined);
  assert.equal(serialized.includes('555-0133'), false);
  assert.equal(serialized.includes('person@example.com'), false);
  assert.equal(serialized.includes('super-secret'), false);
  assert.equal(serialized.includes('session-value'), false);
  assert.equal(serialized.includes('0123456789abcdef0123456789abcdef'), false);
  assert.equal(output.blob.includes('<redacted>'), true);
  assert.equal(outputHasLeak(serialized), false);
  assert.equal(outputHasLeak(['+', '90 5551112233'].join('')), true);
  assert.equal(outputHasLeak(['ey', 'JhbGciOiJIUzI1NiJ9.payload.signature'].join('')), true);
});

test('replaces names, usernames, and photo URLs with stable placeholders', () => {
  const redactor = createRedactor();
  const first = redactor.redact(fixture());
  const second = redactor.redact({
    name: 'Ada Lovelace',
    username: 'grace',
    photo_url: 'https://cdn.example.com/grace.png',
  });

  assert.equal(first.name, 'user_1');
  assert.equal(first.username, 'user_2');
  assert.equal(first.photo_url, 'user_3');
  assert.equal(first.topic, 'Hello from user_1');
  assert.equal(first.user_id, '<id>');
  assert.equal(second.name, 'user_1');
  assert.equal(second.username, 'user_4');
  assert.equal(second.photo_url, 'user_5');
});

test('keeps a marked public Agora app id', () => {
  const { redact } = createRedactor();
  const appId = '938de3e8055e42b281bb8c6f69c21f78';
  const output = redact({ agoraAppId: appId, other: appId }, { preserveKeys: ['agoraAppId'] });
  assert.equal(output.agoraAppId, appId);
  assert.equal(output.other, '<redacted>');
});
