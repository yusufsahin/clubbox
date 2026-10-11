/** WCAG 2.x relative luminance and contrast helpers for theme tokens. */

export type Rgba = { r: number; g: number; b: number; a: number };

export function parseCssColor(raw: string): Rgba | null {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (h.length === 6) h += 'ff';
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: parseInt(h.slice(6, 8), 16) / 255,
    };
  }

  const rgb = value.match(/^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)$/);
  if (rgb) {
    return {
      r: Number(rgb[1]),
      g: Number(rgb[2]),
      b: Number(rgb[3]),
      a: rgb[4] == null ? 1 : Number(rgb[4]),
    };
  }
  return null;
}

export function composite(fg: Rgba, bg: Rgba): Rgba {
  const a = fg.a + bg.a * (1 - fg.a);
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
    g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
    b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
    a,
  };
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: Rgba): number {
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

export function contrastRatio(fg: Rgba, bg: Rgba): number {
  const solidFg = fg.a < 1 ? composite(fg, bg) : fg;
  const l1 = relativeLuminance(solidFg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Parse `--name: value;` declarations inside the first matching selector block. */
export function parseTokenBlock(css: string, selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm');
  const match = css.match(re);
  if (!match) return {};
  const body = match[1];
  const tokens: Record<string, string> = {};
  for (const line of body.split(/\n/)) {
    const prop = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*(.+?)\s*;\s*$/i);
    if (!prop) continue;
    tokens[prop[1]] = prop[2].trim();
  }
  return tokens;
}

export function resolveColor(
  tokens: Record<string, string>,
  name: string,
  fallbackSurface?: Rgba,
): Rgba | null {
  const raw = tokens[name];
  if (!raw) return null;
  // var(--other) references
  const varRef = raw.match(/^var\((--[a-z0-9-]+)(?:,\s*(.+))?\)$/i);
  if (varRef) {
    return resolveColor(tokens, varRef[1], fallbackSurface) ?? (varRef[2] ? parseCssColor(varRef[2]) : null);
  }
  const parsed = parseCssColor(raw);
  if (!parsed) return null;
  if (parsed.a < 1 && fallbackSurface) return composite(parsed, fallbackSurface);
  return parsed;
}
