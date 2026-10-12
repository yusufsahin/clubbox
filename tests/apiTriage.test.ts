import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { groupFailures, readJsonlDir, triage } from '../scripts/api-triage.mjs';

const require = createRequire(import.meta.url);
const { outputHasLeak } = require('../electron/redact.cjs') as { outputHasLeak: (text: string) => boolean };

const FIX_LOG = join(process.cwd(), 'tests/fixtures/api-log');

test('readJsonlDir drops lines that look like they still contain secrets', () => {
  const records = readJsonlDir(FIX_LOG);
  assert.ok(records.some((row) => row.endpoint === 'join_channel'));
  assert.equal(records.some((row) => row.endpoint === 'leaky'), false);
});

test('groupFailures keys by endpoint+status+error', () => {
  const records = readJsonlDir(FIX_LOG);
  const groups = groupFailures(records);
  assert.ok([...groups.keys()].some((key) => key.startsWith('join_channel|404|')));
});

test('groupFailures ignores successful Agora join/connection chatter', () => {
  const groups = groupFailures([
    { endpoint: 'agora_join', status: 200, ok: true, kind: 'agora', error: 'source=bundle' },
    { endpoint: 'agora_connection', status: 0, ok: false, kind: 'agora', error: 'DISCONNECTED->CONNECTING' },
    { endpoint: 'agora_join', status: 0, ok: false, kind: 'agora', error: 'INVALID_TOKEN;source=bundle' },
  ]);
  assert.equal([...groups.keys()].some((key) => key.startsWith('agora_join|200|')), false);
  assert.equal([...groups.keys()].some((key) => key.startsWith('agora_connection|')), false);
  assert.ok([...groups.keys()].some((key) => key.startsWith('agora_join|0|')));
});

test('api:triage creates a live-failure test once, promotes community 2xx, and is idempotent', () => {
  const root = mkdtempSync(join(tmpdir(), 'clubbox-triage-'));
  const logDir = join(root, 'api-log');
  const liveDir = join(root, 'tests/live-failures');
  mkdirSync(logDir, { recursive: true });
  mkdirSync(join(root, 'electron'), { recursive: true });
  mkdirSync(join(root, 'docs/api'), { recursive: true });
  mkdirSync(join(root, 'reports'), { recursive: true });
  mkdirSync(liveDir, { recursive: true });

  writeFileSync(join(logDir, '2026-10-11.jsonl'), readFileSync(join(FIX_LOG, 'sample.jsonl')));
  writeFileSync(
    join(root, 'electron/webApiRoutes.json'),
    JSON.stringify({
      join_channel: { path: '/web_api/join_channel', method: 'POST', evidence: 'bundle', mutation: true },
      invite_speaker: { path: '/web_api/invite_speaker', method: 'POST', evidence: 'community', mutation: true },
    }, null, 2),
  );
  writeFileSync(join(root, 'docs/api/realtime.md'), '# Realtime\n');

  const first = triage({
    root,
    logDir,
    liveDir,
    routesPath: join(root, 'electron/webApiRoutes.json'),
    realtimePath: join(root, 'docs/api/realtime.md'),
    reportPath: join(root, 'reports/triage.md'),
    runDocs: false,
  });
  assert.equal(first.created.includes('join_channel-404'), true);
  assert.equal(first.promoted.includes('invite_speaker'), true);
  assert.ok(existsSync(join(liveDir, 'join_channel-404.test.ts')));
  assert.ok(readFileSync(join(root, 'docs/api/realtime.md'), 'utf8').includes('Seen live, not handled'));
  const routes = JSON.parse(readFileSync(join(root, 'electron/webApiRoutes.json'), 'utf8'));
  assert.equal(routes.invite_speaker.evidence, 'observed');
  assert.equal(outputHasLeak(readFileSync(join(liveDir, 'join_channel-404.test.ts'), 'utf8')), false);

  const second = triage({
    root,
    logDir,
    liveDir,
    routesPath: join(root, 'electron/webApiRoutes.json'),
    realtimePath: join(root, 'docs/api/realtime.md'),
    reportPath: join(root, 'reports/triage.md'),
    runDocs: false,
  });
  assert.equal(second.message, 'NO NEW FAILURES');
  assert.equal(second.created.length, 0);
});
