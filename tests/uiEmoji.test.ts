import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Phase 13.1 once rewrote emoji as ASCII "?" (encoding loss). Fail if that happens again
 * for the shell chrome the owner sees on every launch.
 */
test('sidebar chrome keeps real emoji icons for the four places', () => {
  const shell = readFileSync(join(process.cwd(), 'src/ui/shellChrome.ts'), 'utf8');
  const app = readFileSync(join(process.cwd(), 'src/app/clubboxApp.ts'), 'utf8');
  assert.match(app, /brand-icon">🎙️</);
  assert.match(shell, /tab: 'explore'[\s\S]*?icon: '🏠'/);
  assert.match(shell, /tab: 'discover'[\s\S]*?icon: '🔍'/);
  assert.match(shell, /tab: 'messages'[\s\S]*?icon: '💬'/);
  assert.match(shell, /tab: 'activity'[\s\S]*?icon: '🔔'/);
  assert.equal(/tab: 'soundboard'/.test(shell), false);
  assert.match(shell, /open-settings[\s\S]*?>⚙</);
  assert.equal(/icon: '\?'/.test(shell), false);
  assert.equal(/brand-icon">\?/.test(app), false);
});

/** Phase 18.4 — chrome data-action buttons use SVG icons, not emoji-only icons. */
test('room bar and start-room templates do not use emoji-only icons on data-action buttons', () => {
  const files = [
    'src/ui/components/cockpitBar.ts',
    'src/app/clubboxApp.ts',
  ];
  const emojiOnlyIcon = /data-action="[^"]+"[^>]*>\s*[\u{1F300}-\u{1FAFF}➕✂🔴]\s*</u;
  for (const rel of files) {
    const src = readFileSync(join(process.cwd(), rel), 'utf8');
    assert.equal(emojiOnlyIcon.test(src), false, `${rel} still has an emoji-only data-action icon`);
  }
  assert.match(readFileSync(join(process.cwd(), 'src/ui/components/cockpitBar.ts'), 'utf8'), /icon\(/);
});
