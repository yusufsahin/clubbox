const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { appendApiLog, buildRecord } = require('./apiLog.cjs');
const { outputHasLeak } = require('./redact.cjs');

test('api-log record keeps keys not values and rejects leaky lines', () => {
  const record = buildRecord({
    endpoint: 'join_channel',
    body: { channel: 'secret-channel-id' },
    status: 404,
    ok: false,
    responseBody: JSON.stringify({ success: false, error_message: 'missing' }),
    appVersion: '22.2.0',
  });
  assert.deepEqual(record.bodyKeys, ['channel']);
  assert.equal(record.bodyShape.channel, '<channel>');
  assert.equal(outputHasLeak(JSON.stringify(record)), false);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clubbox-apilog-'));
  const ok = appendApiLog(dir, {
    endpoint: 'join_channel',
    body: { channel: 'x' },
    status: 200,
    ok: true,
    responseBody: '{"success":true}',
    appVersion: '22.2.0',
  });
  assert.equal(ok, true);
  const files = fs.readdirSync(path.join(dir, 'api-log'));
  assert.equal(files.length, 1);
});
