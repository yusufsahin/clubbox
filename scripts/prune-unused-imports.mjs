/**
 * Prune unused named imports based on `tsc --noEmit` TS6133/TS6192/TS6196 messages.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';

let out = '';
try {
  execSync('npx tsc --noEmit', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (err) {
  out = `${err.stdout || ''}${err.stderr || ''}`;
}

/** @type {Map<string, Set<string>>} */
const unusedByFile = new Map();
for (const line of out.split(/\r?\n/)) {
  const m = line.match(/^(src\/app\/[^:(]+)\((\d+),\d+\): error TS(?:6133|6196): '(\w+)' is declared but/);
  if (!m) continue;
  const [, file, , name] = m;
  if (!unusedByFile.has(file)) unusedByFile.set(file, new Set());
  unusedByFile.get(file).add(name);
  void file;
}

for (const [file, names] of unusedByFile) {
  let src = fs.readFileSync(file, 'utf8');
  const before = src;
  // Drop entire import lines that only import unused symbols (all unused).
  src = src.replace(/^import\s+(type\s+)?\{([^}]+)\}\s+from\s+['"][^'"]+['"];\r?\n/gm, (full, typeKw, body) => {
    const parts = body.split(',').map((p) => p.trim()).filter(Boolean);
    const kept = parts.filter((part) => {
      const id = part.replace(/^type\s+/, '').split(/\s+as\s+/).pop().trim();
      return !names.has(id);
    });
    if (kept.length === 0) return '';
    if (kept.length === parts.length) return full;
    return `import ${typeKw || ''}{ ${kept.join(', ')} } from ${full.match(/from\s+(['"][^'"]+['"])/)[1]};\n`;
  });
  // Drop unused default-ish single imports: import { Foo } already handled.
  // Drop `import X from` when X unused
  src = src.replace(/^import\s+(\w+)\s+from\s+['"][^'"]+['"];\r?\n/gm, (full, id) => (
    names.has(id) ? '' : full
  ));
  // Drop unused const CHAT_POLL_MS / GUIDELINES_KEY at top of ctl files
  for (const name of names) {
    src = src.replace(new RegExp(`^const ${name} = [^;]+;\\r?\\n`, 'm'), '');
  }
  if (src !== before) {
    fs.writeFileSync(file, src);
    console.log('pruned', file, [...names].join(', '));
  }
}
