import assert from 'node:assert/strict';
import test from 'node:test';
import { applyThemeToDocument, resolvedTheme, syncSystemThemeListener } from '../src/app/appPrefs.ts';

test('resolvedTheme follows system preference', () => {
  assert.equal(resolvedTheme('system', true), 'dark');
  assert.equal(resolvedTheme('system', false), 'light');
  assert.equal(resolvedTheme('light', true), 'light');
});

test('syncSystemThemeListener attaches and detaches the OS listener', () => {
  const listeners: Array<(event: MediaQueryListEvent) => void> = [];
  const media = {
    matches: true,
    addEventListener(_type: string, handler: (event: MediaQueryListEvent) => void) {
      listeners.push(handler);
    },
    removeEventListener(_type: string, handler: (event: MediaQueryListEvent) => void) {
      const idx = listeners.indexOf(handler);
      if (idx >= 0) listeners.splice(idx, 1);
    },
  };
  // jsdom document
  const prev = globalThis.document;
  // @ts-expect-error test stub
  globalThis.document = { documentElement: { dataset: {}, style: { colorScheme: '' } } };
  try {
    assert.equal(syncSystemThemeListener('system', media), 'dark');
    assert.equal(listeners.length, 1);
    assert.equal(syncSystemThemeListener('light', media), 'light');
    assert.equal(listeners.length, 0);
    assert.equal(applyThemeToDocument('dark', false), 'dark');
  } finally {
    globalThis.document = prev;
  }
});
