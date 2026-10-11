import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Phase 13.1 once rewrote emoji as ASCII "?" (encoding loss). Fail if that happens again
 * for the shell chrome the owner sees on every launch.
 */
test('sidebar and top-bar chrome keep real emoji icons', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/clubboxApp.ts'), 'utf8');
  assert.match(src, /brand-icon">🎙️</);
  assert.match(src, /data-tab="explore">[\s\S]*?class="icon">🏠</);
  assert.match(src, /data-tab="discover">[\s\S]*?class="icon">🔍</);
  assert.match(src, /data-tab="friends">[\s\S]*?class="icon">🤝</);
  assert.match(src, /data-tab="houses">[\s\S]*?class="icon">🏛</);
  assert.match(src, /data-tab="events">[\s\S]*?class="icon">📅</);
  assert.match(src, /data-tab="messages">[\s\S]*?class="icon">💬</);
  assert.match(src, /data-tab="stage">[\s\S]*?class="icon">📻</);
  assert.match(src, /data-tab="soundboard">[\s\S]*?class="icon">🎛️</);
  assert.match(src, /data-tab="settings">[\s\S]*?class="icon">⚙️</);
  assert.match(src, /data-action="create-room">[\s\S]*?class="icon">➕</);
  assert.match(src, /title="\$\{t\('messages'\)\}">\s*✉️/);
  assert.match(src, /title="\$\{t\('activity'\)\}">\s*🔔/);
  assert.equal(/class="icon">\?/.test(src), false);
  assert.equal(/brand-icon">\?/.test(src), false);
});
