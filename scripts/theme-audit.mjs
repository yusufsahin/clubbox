/**
 * Fails when style.css (or TS views) hard-code colours outside the token blocks,
 * or reference undefined var(--…).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cssPath = path.join(root, 'src', 'style.css');
const css = fs.readFileSync(cssPath, 'utf8');

const COLOR_RE = /#(?:[0-9a-f]{3,8})\b|rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*[\d.]+)?\s*\)/gi;
const VAR_RE = /var\(\s*(--[a-z0-9-]+)/gi;

/** Lines inside these selector blocks may define raw colours. */
function tokenBlockRanges(text) {
  const ranges = [];
  const re = /:root(?:\[data-theme='light'\])?\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    const start = m.index;
    let depth = 0;
    let i = text.indexOf('{', start);
    for (; i < text.length; i++) {
      if (text[i] === '{') depth += 1;
      else if (text[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          ranges.push([start, i + 1]);
          break;
        }
      }
    }
  }
  return ranges;
}

function inRanges(index, ranges) {
  return ranges.some(([a, b]) => index >= a && index < b);
}

function definedTokens(text) {
  const names = new Set();
  for (const range of tokenBlockRanges(text)) {
    const body = text.slice(range[0], range[1]);
    for (const m of body.matchAll(/--([a-z0-9-]+)\s*:/gi)) {
      names.add(`--${m[1]}`);
    }
  }
  return names;
}

const ranges = tokenBlockRanges(css);
const hardCoded = [];
for (const m of css.matchAll(COLOR_RE)) {
  if (inRanges(m.index, ranges)) continue;
  const line = css.slice(0, m.index).split(/\n/).length;
  const snippet = css.slice(Math.max(0, m.index - 40), m.index + m[0].length + 20).replace(/\s+/g, ' ');
  hardCoded.push({ line, color: m[0], snippet });
}

const defined = definedTokens(css);
const undefinedVars = [];
for (const m of css.matchAll(VAR_RE)) {
  const name = m[1];
  if (!defined.has(name)) {
    // Allow var(--x, fallback) only if defined — still flag missing defs
    const line = css.slice(0, m.index).split(/\n/).length;
    undefinedVars.push({ line, name });
  }
}

// Also scan TS views for inline colour literals (except data URLs)
const tsHits = [];
const viewsDir = path.join(root, 'src');
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(full);
      continue;
    }
    if (!/\.(ts|css)$/.test(name)) continue;
    if (full === cssPath) continue;
    const text = fs.readFileSync(full, 'utf8');
    for (const m of text.matchAll(/color:\s*['"]?(#(?:[0-9a-f]{3,8})|rgba?\([^)]+\))/gi)) {
      tsHits.push({ file: path.relative(root, full), color: m[1] });
    }
  }
}
walk(viewsDir);

const report = {
  hardCodedCount: hardCoded.length,
  undefinedVars: [...new Map(undefinedVars.map((u) => [u.name, u])).values()],
  tsInlineColors: tsHits,
  sampleHardCoded: hardCoded.slice(0, 40),
};

const outDir = path.join(root, 'reports');
fs.mkdirSync(outDir, { recursive: true });
const md = [
  '# Theme audit',
  '',
  `Hard-coded colours outside token blocks: **${report.hardCodedCount}**`,
  `Undefined var(--…): **${report.undefinedVars.length}**`,
  `TS/CSS inline color:**:** **${tsHits.length}**`,
  '',
  '## Sample hard-coded',
  ...hardCoded.slice(0, 60).map((h) => `- L${h.line}: \`${h.color}\` — ${h.snippet}`),
  '',
  '## Undefined variables',
  ...(report.undefinedVars.length
    ? report.undefinedVars.map((u) => `- L${u.line}: \`${u.name}\``)
    : ['- (none)']),
  '',
].join('\n');
fs.writeFileSync(path.join(outDir, 'theme-audit.md'), md);

const fail =
  report.hardCodedCount > 0
  || report.undefinedVars.length > 0
  || tsHits.length > 0;

console.log(md.split('\n').slice(0, 12).join('\n'));
if (fail) {
  console.error(
    `[theme-audit] FAIL: ${report.hardCodedCount} hard-coded, ${report.undefinedVars.length} undefined vars, ${tsHits.length} TS inline colours`,
  );
  process.exit(1);
}
console.log('[theme-audit] OK');
