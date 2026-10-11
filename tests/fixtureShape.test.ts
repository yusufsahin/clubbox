import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { outputHasLeak } = require('../electron/redact.cjs') as { outputHasLeak: (text: string) => boolean };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = path.join(root, 'features', 'fixtures');
const manifestPath = path.join(fixturesDir, 'manifest.json');

function keyShape(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) {
    if (!value.length || depth > 3) return 'array';
    return [keyShape(value[0], depth + 1)];
  }
  if (typeof value === 'object') {
    if (depth > 3) return 'object';
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      if (key === 'synthetic') continue;
      out[key] = keyShape((value as Record<string, unknown>)[key], depth + 1);
    }
    return out;
  }
  return typeof value;
}

test('non-synthetic fixtures match capture key shapes and have no leaks', () => {
  assert.ok(fs.existsSync(manifestPath), 'run node scripts/make-fixtures.mjs first');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<
    string,
    { synthetic: boolean; shape: unknown; captureEndpoint: string }
  >;

  for (const [name, meta] of Object.entries(manifest)) {
    const file = path.join(fixturesDir, `${name}.json`);
    const text = fs.readFileSync(file, 'utf8');
    assert.equal(outputHasLeak(text), false, `${name} contains a leak`);
    const body = JSON.parse(text) as Record<string, unknown>;
    if (meta.synthetic) {
      assert.equal(body.synthetic, true);
      continue;
    }
    assert.notEqual(body.synthetic, true);
    assert.deepEqual(keyShape(body), meta.shape, `${name} drifted from capture shape`);

    // Live feed rooms never carry a top-level topic_key (only logging_context.topic_key).
    if (name === 'get_channels') {
      const items = Array.isArray(body.items) ? body.items : [];
      for (const item of items) {
        const channel = (item as { channel?: Record<string, unknown> })?.channel
          ?? (item as Record<string, unknown>);
        assert.equal(
          Object.prototype.hasOwnProperty.call(channel, 'topic_key'),
          false,
          'feed room must not have topic_key',
        );
      }
    }
  }
});

test('make-fixtures regenerates without leaks', () => {
  execFileSync(process.execPath, [path.join(root, 'scripts', 'make-fixtures.mjs')], {
    cwd: root,
    stdio: 'pipe',
  });
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  assert.ok(Object.keys(manifest).length >= 8);
});
