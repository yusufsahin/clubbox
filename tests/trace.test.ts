import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  evaluateTrace,
  parseDesignGaps,
  parseDoneTasks,
  parseFeatureScenarios,
  parsePrdCatalog,
  R1_IDS,
  runTrace,
} from '../scripts/trace.mjs';

const FIX = join(process.cwd(), 'tests/fixtures/trace');

test('parsePrdCatalog reads priority and today', () => {
  const catalog = parsePrdCatalog(readFileSync(join(FIX, 'PRD.md'), 'utf8'));
  assert.equal(catalog.get('ACC-1')?.priority, 'P0');
  assert.equal(catalog.get('ACC-9')?.priority, 'P1');
  assert.equal(catalog.get('ACC-10')?.priority, "Won't");
});

test('parseFeatureScenarios tracks pending and unknown ids', () => {
  const { byId } = parseFeatureScenarios(join(FIX, 'features'));
  assert.equal(byId.get('ACC-1')?.[0].pending, false);
  assert.equal(byId.get('ACC-99')?.[0].pending, true);
});

test('parseDesignGaps and done tasks detect open gaps after a finished fix', () => {
  const gaps = parseDesignGaps(readFileSync(join(FIX, 'DESIGN.md'), 'utf8'));
  const done = parseDoneTasks(readFileSync(join(FIX, 'CURSOR_TASKS.md'), 'utf8'));
  assert.equal(done.has('10.2'), true);
  assert.equal(gaps.find((g) => g.id === 'G-99')?.closed, false);
});

test('warn mode softens non-R1 missing scenarios but keeps unknown ids and done-task gaps as errors', () => {
  const catalog = parsePrdCatalog(readFileSync(join(FIX, 'PRD.md'), 'utf8'));
  const { byId } = parseFeatureScenarios(join(FIX, 'features'));
  const gaps = parseDesignGaps(readFileSync(join(FIX, 'DESIGN.md'), 'utf8'));
  const doneTasks = parseDoneTasks(readFileSync(join(FIX, 'CURSOR_TASKS.md'), 'utf8'));
  const result = evaluateTrace({
    catalog,
    scenarios: byId,
    gaps,
    doneTasks,
    mode: 'warn',
    r1ReleaseDone: false,
  });
  assert.ok(result.warnings.some((w) => w.id === 'ACC-9' && w.kind === 'missing-scenario'));
  assert.ok(result.errors.some((e) => e.id === 'ACC-99' && e.kind === 'unknown-id'));
  assert.ok(result.errors.some((e) => e.id === 'G-99' && e.kind === 'gap-open-task-done'));
  assert.equal(result.errors.some((e) => e.id === 'ACC-10'), false);
});

test('strict mode fails when an R1 P0 scenario is flipped to pending after release done', () => {
  const catalog = new Map([
    ['ACC-3', { id: 'ACC-3', title: 'Log out', today: '❌', priority: 'P0' }],
  ]);
  assert.ok(R1_IDS.has('ACC-3'));
  const scenarios = new Map([
    ['ACC-3', [{ pending: true, name: 'Log out', file: 'account.feature' }]],
  ]);
  const result = evaluateTrace({
    catalog,
    scenarios,
    gaps: [],
    doneTasks: new Set(['11.4']),
    mode: 'strict',
    r1ReleaseDone: true,
  });
  assert.ok(result.errors.some((e) => e.kind === 'r1-still-pending' && e.id === 'ACC-3'));
});

test('runTrace writes reports/traceability.md for the fixture tree', () => {
  const dir = mkdtempSync(join(tmpdir(), 'clubbox-trace-'));
  mkdirSync(join(dir, 'docs/product'), { recursive: true });
  mkdirSync(join(dir, 'features'), { recursive: true });
  mkdirSync(join(dir, 'reports'), { recursive: true });
  writeFileSync(join(dir, 'docs/product/PRD.md'), readFileSync(join(FIX, 'PRD.md')));
  writeFileSync(join(dir, 'docs/product/DESIGN.md'), readFileSync(join(FIX, 'DESIGN.md')));
  writeFileSync(join(dir, 'CURSOR_TASKS.md'), readFileSync(join(FIX, 'CURSOR_TASKS.md')));
  writeFileSync(join(dir, 'features/sample.feature'), readFileSync(join(FIX, 'features/sample.feature')));
  const outPath = join(dir, 'reports/traceability.md');
  const result = runTrace({
    root: dir,
    mode: 'warn',
    outPath,
  });
  assert.ok(readFileSync(outPath, 'utf8').includes('ACC-1'));
  assert.ok(result.errors.length >= 1);
});
