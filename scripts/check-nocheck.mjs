/**
 * Fail if @ts-nocheck / @ts-ignore / @ts-expect-error appear under src/ or electron/.
 */
import fs from 'node:fs';
import path from 'node:path';

const roots = ['src', 'electron'].map((dir) => path.resolve(import.meta.dirname, '..', dir));
const pattern = /@ts-(?:nocheck|ignore|expect-error)\b/;
const hits = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full);
      continue;
    }
    if (!/\.(ts|tsx|mts|cts|js|cjs|mjs)$/.test(entry.name)) continue;
    const text = fs.readFileSync(full, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      if (pattern.test(line)) hits.push(`${path.relative(process.cwd(), full)}:${i + 1}: ${line.trim()}`);
    });
  }
}

for (const root of roots) walk(root);

if (hits.length) {
  console.error('[check-nocheck] forbidden TypeScript suppressions:\n' + hits.join('\n'));
  process.exit(1);
}
console.log('[check-nocheck] ok');
