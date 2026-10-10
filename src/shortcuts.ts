const SHORTCUTS_KEY = 'clubbox_shortcuts';

export const SHORTCUT_ACTIONS = ['mute', 'clip', 'pad1', 'pad2', 'pad3', 'pad4', 'pad5', 'pad6', 'pad7', 'pad8', 'pad9'] as const;

export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];
export type ShortcutMap = Record<ShortcutAction, string>;

export const DEFAULT_SHORTCUTS: ShortcutMap = {
  mute: 'Alt+Shift+M',
  clip: 'Alt+Shift+C',
  pad1: 'Alt+1',
  pad2: 'Alt+2',
  pad3: 'Alt+3',
  pad4: 'Alt+4',
  pad5: 'Alt+5',
  pad6: 'Alt+6',
  pad7: 'Alt+7',
  pad8: 'Alt+8',
  pad9: 'Alt+9',
};

const MODIFIERS = new Set(['Command', 'Cmd', 'Control', 'Ctrl', 'CommandOrControl', 'Alt', 'Option', 'AltGr', 'Shift', 'Super', 'Meta']);

function isFunctionKey(key: string): boolean {
  return /^F([1-9]|1\d|2[0-4])$/.test(key);
}

export function isSafeAccelerator(value: string): boolean {
  if (value.length > 64) return false;
  const parts = value.split('+');
  if (parts.length < 1 || parts.length > 5) return false;
  const key = parts[parts.length - 1] ?? '';
  const named = new Set(['Plus', 'Space', 'Tab', 'Backspace', 'Delete', 'Insert', 'Return', 'Enter', 'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown']);
  const keyOk = /^[A-Z0-9]$/.test(key) || named.has(key) || isFunctionKey(key);
  if (!keyOk || key === 'Escape') return false;
  const mods = parts.slice(0, -1);
  if (mods.length === 0) return isFunctionKey(key);
  return mods.every((mod) => MODIFIERS.has(mod));
}

export function normalizeShortcuts(input: unknown): ShortcutMap {
  const source = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const next = {} as ShortcutMap;
  const used = new Set<string>();
  for (const action of SHORTCUT_ACTIONS) {
    const value = source[action];
    if (value === '') {
      next[action] = '';
      continue;
    }
    if (typeof value === 'string' && isSafeAccelerator(value) && !used.has(value)) {
      next[action] = value;
      used.add(value);
      continue;
    }
    next[action] = '';
  }
  for (const action of SHORTCUT_ACTIONS) {
    if (next[action] || source[action] === '') continue;
    const fallback = DEFAULT_SHORTCUTS[action];
    if (used.has(fallback)) continue;
    next[action] = fallback;
    used.add(fallback);
  }
  return next;
}

export function readShortcuts(): ShortcutMap {
  try {
    const raw = localStorage.getItem(SHORTCUTS_KEY);
    if (!raw) return { ...DEFAULT_SHORTCUTS };
    return normalizeShortcuts(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SHORTCUTS };
  }
}

export function writeShortcuts(map: ShortcutMap): void {
  try {
    localStorage.setItem(SHORTCUTS_KEY, JSON.stringify(map));
  } catch {
    // Private mode or a full quota should not block the studio.
  }
}

export function eventToAccelerator(event: KeyboardEvent): string | null {
  if (event.key === 'Escape') return null;
  const parts: string[] = [];
  if (event.ctrlKey) parts.push('Control');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (event.metaKey) parts.push('Command');
  const key = acceleratorKey(event);
  if (!key) return null;
  if (parts.length === 0 && !isFunctionKey(key)) return null;
  parts.push(key);
  return parts.join('+');
}

function acceleratorKey(event: KeyboardEvent): string | null {
  if (event.key === ' ') return 'Space';
  if (isFunctionKey(event.key)) return event.key;
  if (/^[a-zA-Z]$/.test(event.key)) return event.key.toUpperCase();
  if (/^[0-9]$/.test(event.key)) return event.key;
  const named: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Enter: 'Enter',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Tab: 'Tab',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
  };
  return named[event.key] ?? null;
}
