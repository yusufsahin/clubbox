const test = require('node:test');
const assert = require('node:assert/strict');
const { createRedactor, outputHasLeak } = require('./redact.cjs');
const { buildNetworkErrorRecord, claimFinalize, FAILURE_MARKS_CHECKLIST } = require('./apiRecorder.cjs');

function entry(pathname) {
  return {
    url: new URL(`https://www.clubhouse.com${pathname}?token=secret-query&chs=invite`),
    method: 'POST',
    started: 10,
  };
}

test('failed loads become separate redacted network_error records', () => {
  const cases = [
    { requestId: 'dns', errorText: 'net::ERR_NAME_NOT_RESOLVED', canceled: false, timestamp: 12.5 },
    { requestId: 'cancel', errorText: 'net::ERR_ABORTED', canceled: true, timestamp: 11 },
    { requestId: 'conn', errorText: 'net::ERR_CONNECTION_RESET phone +905551112233', canceled: false, timestamp: 13, blockedReason: 'other' },
  ];
  const redactor = createRedactor();
  const lines = cases.map((params) => {
    const record = buildNetworkErrorRecord(entry('/web_api/join_channel'), params);
    assert.equal(record.type, 'network_error');
    assert.equal(record.host, 'www.clubhouse.com');
    assert.equal(record.path, '/web_api/join_channel');
    assert.equal(record.requestId, params.requestId);
    assert.equal(record.canceled, params.canceled);
    assert.ok(record.timingMs > 0);
    assert.ok(record.scenarios.includes('Join a room'));
    assert.equal('query' in record, false);
    assert.equal(JSON.stringify(record).includes('secret-query'), false);
    assert.equal(JSON.stringify(record).includes('chs='), false);
    return JSON.stringify(redactor.redact(record));
  });
  assert.equal(lines[0].includes('ERR_NAME_NOT_RESOLVED'), true);
  assert.equal(lines[1].includes('ERR_ABORTED'), true);
  assert.equal(lines[2].includes('ERR_CONNECTION_RESET'), true);
  assert.equal(lines[2].includes('+90555'), false);
  assert.equal(lines[2].includes('blockedReason'), true);
  for (const line of lines) assert.equal(outputHasLeak(line), false);
  assert.equal(FAILURE_MARKS_CHECKLIST, false);
});

test('the same request is finalized once', () => {
  const finalized = new Set();
  assert.equal(claimFinalize(finalized, 'abc'), true);
  assert.equal(claimFinalize(finalized, 'abc'), false);
  assert.equal(claimFinalize(finalized, ''), false);
});
