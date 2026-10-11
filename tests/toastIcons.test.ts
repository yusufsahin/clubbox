import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

test('no showToast call uses ?? as its icon', () => {
  const re = /showToast\([\s\S]{0,200}?,\s*'\?+'/;
  const offenders: string[] = [];
  for (const file of walk(join(process.cwd(), 'src'))) {
    if (re.test(readFileSync(file, 'utf8'))) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});
