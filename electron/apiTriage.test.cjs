const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runStartupTriage, promotionsFromRecords, groupFailures } = require('./apiTriage.cjs');

test('promotionsFromRecords upgrades bundle/community 2xx only', () => {
  const promoted = promotionsFromRecords([
    { endpoint: 'join_channel', status: 200, evidence: 'bundle' },
    { endpoint: 'me', status: 200, evidence: 'observed' },
    { endpoint: 'invite_speaker', status: 200, evidence: 'community' },
    { endpoint: 'join_channel', status: 404, evidence: 'bundle' },
  ]);
  assert.deepEqual(promoted.sort(), ['invite_speaker', 'join_channel']);
});

test('runStartupTriage writes triage-pending.json from api-log', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clubbox-triage-'));
  const logDir = path.join(root, 'api-log');
  fs.mkdirSync(logDir, { recursive: true });
  fs.writeFileSync(
    path.join(logDir, '2026-10-11.jsonl'),
    `${JSON.stringify({
      endpoint: 'join_channel',
      status: 404,
      error: 'missing',
      bodyKeys: ['channel'],
      evidence: 'bundle',
      kind: 'web_api',
    })}\n${JSON.stringify({
      endpoint: 'follow',
      status: 200,
      evidence: 'bundle',
      kind: 'web_api',
      bodyKeys: ['user_id', 'source'],
    })}\n`,
    'utf8',
  );
  const result = runStartupTriage(root);
  assert.equal(result.ok, true);
  assert.ok(result.promotions.includes('follow'));
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].endpoint, 'join_channel');
  const pending = JSON.parse(fs.readFileSync(result.pendingPath, 'utf8'));
  assert.equal(pending.failures.length, 1);
  assert.ok(groupFailures(pending.failures).has('join_channel|404|missing'));
});
