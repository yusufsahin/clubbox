import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const worldPath = path.join(root, 'features', 'support', 'world.ts');
const featuresDir = path.join(root, 'features');
const stepsDir = path.join(featuresDir, 'steps');

const FORBIDDEN_FN = /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+(filter|sort|apply|compute|derive|prepare)\w*\s*\(/;
const FORBIDDEN_METHOD = /(?:^|\n)\s+(filter|sort|apply|compute|derive|prepare)\w*\s*\([^)]*\)\s*:\s*/;

test('world.ts does not redefine filter/sort/apply/compute/derive/prepare helpers', () => {
  const src = fs.readFileSync(worldPath, 'utf8');
  assert.equal(FORBIDDEN_FN.test(src), false, 'world.ts must not declare filter/sort/apply/… functions');
  assert.equal(FORBIDDEN_METHOD.test(src), false, 'world.ts must not declare filter/sort/apply/… methods');
});

test('non-@local feature step files import from src/', () => {
  const featureFiles = fs.readdirSync(featuresDir).filter((name) => name.endsWith('.feature'));
  const stepFiles = fs.readdirSync(stepsDir).filter((name) => name.endsWith('.ts'));
  assert.ok(stepFiles.length > 0);

  for (const feature of featureFiles) {
    const text = fs.readFileSync(path.join(featuresDir, feature), 'utf8');
    const scenarios = text.split(/\n(?=\s*Scenario)/);
    const hasNonLocal = scenarios.some((block) => /Scenario/.test(block) && !/@local\b/.test(block) && !/@pending\b/.test(block));
    if (!hasNonLocal) continue;

    const importsSrc = stepFiles.some((step) => {
      const stepSrc = fs.readFileSync(path.join(stepsDir, step), 'utf8');
      return /from ['"]\.\.\/\.\.\/src\//.test(stepSrc) || /from ['"]\.\.\/\.\.\/electron\//.test(stepSrc);
    });
    // Collective pool: at least one step module imports src (shared across features).
    assert.ok(importsSrc, `${feature}: expected step modules to import from src/`);
  }

  // Stronger: every step file that is not pure glue imports src, except empty stubs.
  for (const step of stepFiles) {
    const stepSrc = fs.readFileSync(path.join(stepsDir, step), 'utf8');
    if (!/\b(Given|When|Then)\(/.test(stepSrc)) continue;
    const importsSrc = /from ['"]\.\.\/\.\.\/src\//.test(stepSrc)
      || /from ['"]\.\.\/\.\.\/electron\//.test(stepSrc)
      || /from ['"]\.\.\/support\//.test(stepSrc);
    assert.ok(importsSrc, `${step} must import from src/, electron/, or support/`);
  }
});
