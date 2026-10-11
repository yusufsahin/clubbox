import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Phase 13.1 once rewrote emoji as ASCII "?" (encoding loss). Fail if that happens again
 * for the shell chrome the owner sees on every launch.
 */
test('sidebar and top-bar chrome keep real emoji icons', () => {
  const shell = readFileSync(join(process.cwd(), 'src/ui/shellChrome.ts'), 'utf8');
  const app = readFileSync(join(process.cwd(), 'src/app/clubboxApp.ts'), 'utf8');
  assert.match(app, /brand-icon">🎙️</);
  assert.match(shell, /tab: 'explore'[\s\S]*?icon: '🏠'/);
  assert.match(shell, /tab: 'discover'[\s\S]*?icon: '🔍'/);
  assert.match(shell, /tab: 'messages'[\s\S]*?icon: '💬'/);
  assert.match(shell, /tab: 'activity'[\s\S]*?icon: '🔔'/);
  assert.match(shell, /tab: 'soundboard'[\s\S]*?icon: '🎛️'/);
  assert.match(shell, /open-settings[\s\S]*?>⚙</);
  assert.equal(/icon: '\?'/.test(shell), false);
  assert.equal(/brand-icon">\?/.test(app), false);
});
