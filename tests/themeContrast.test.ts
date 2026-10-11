import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  contrastRatio,
  parseTokenBlock,
  resolveColor,
  type Rgba,
} from '../src/ui/colorContrast.ts';

const css = readFileSync(join(process.cwd(), 'src/style.css'), 'utf8');

function themeTokens(theme: 'dark' | 'light'): Record<string, string> {
  if (theme === 'dark') return parseTokenBlock(css, ':root');
  // Light overrides merge onto dark defaults
  return { ...parseTokenBlock(css, ':root'), ...parseTokenBlock(css, ":root[data-theme='light']") };
}

function requireColor(tokens: Record<string, string>, name: string, under?: Rgba): Rgba {
  const color = resolveColor(tokens, name, under);
  assert.ok(color, `missing token ${name}`);
  return color;
}

function assertTextOnSurface(
  theme: string,
  tokens: Record<string, string>,
  textToken: string,
  surfaceToken: string,
  min = 4.5,
): void {
  const surface = requireColor(tokens, surfaceToken);
  const text = requireColor(tokens, textToken, surface);
  const ratio = contrastRatio(text, surface);
  assert.ok(
    ratio + 1e-6 >= min,
    `${theme}: ${textToken} on ${surfaceToken} = ${ratio.toFixed(2)} (need ≥ ${min})`,
  );
}

for (const theme of ['dark', 'light'] as const) {
  test(`${theme}: text tokens meet 4.5:1 on app/sidebar/card/topbar`, () => {
    const tokens = themeTokens(theme);
    for (const surface of ['--bg-app', '--bg-sidebar', '--bg-card', '--bg-topbar']) {
      for (const text of ['--text-main', '--text-muted', '--text-dim']) {
        assertTextOnSurface(theme, tokens, text, surface, 4.5);
      }
    }
  });

  test(`${theme}: accent text and badges meet contrast floors`, () => {
    const tokens = themeTokens(theme);
    const card = requireColor(tokens, '--bg-card');
    for (const accent of [
      '--accent-purple-text',
      '--accent-emerald-text',
      '--accent-amber-text',
      '--accent-rose-text',
    ]) {
      const fg = requireColor(tokens, accent, card);
      const ratio = contrastRatio(fg, card);
      assert.ok(ratio + 1e-6 >= 4.5, `${theme}: ${accent} on card = ${ratio.toFixed(2)}`);
    }

    const purple = requireColor(tokens, '--accent-purple');
    const onAccent = requireColor(tokens, '--text-on-accent', purple);
    assert.ok(contrastRatio(onAccent, purple) + 1e-6 >= 4.5, `${theme}: text-on-accent on purple`);

    const sidebar = requireColor(tokens, '--bg-sidebar');
    for (const kind of ['live', 'sandbox'] as const) {
      const bg = requireColor(tokens, `--badge-${kind}-bg`, sidebar);
      const fg = requireColor(tokens, `--badge-${kind}-fg`, bg);
      const ratio = contrastRatio(fg, bg);
      assert.ok(ratio + 1e-6 >= 4.5, `${theme}: badge-${kind} = ${ratio.toFixed(2)}`);
    }

    const border = requireColor(tokens, '--border-focus', card);
    assert.ok(contrastRatio(border, card) + 1e-6 >= 3, `${theme}: border-focus on card`);
    const app = requireColor(tokens, '--bg-app');
    const thumb = requireColor(tokens, '--scrollbar-thumb', app);
    assert.ok(contrastRatio(thumb, app) + 1e-6 >= 3, `${theme}: scrollbar-thumb on app`);
  });
}
