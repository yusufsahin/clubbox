/**
 * Phase 28.0 one-shot body discovery using the Clubbox Electron session (cookies).
 * Never prints Cookie / CSRF values.
 *
 * Read-only (default):
 *   node scripts/mobile-probe-28.mjs
 *   node scripts/mobile-probe-28.mjs --channel=xewy04pp
 *
 * Mutations (throwaway room only — typed confirm required):
 *   node scripts/mobile-probe-28.mjs --mutate=disable_replay --confirm=I_CONFIRM_THROWAY_ROOM
 *   node scripts/mobile-probe-28.mjs --mutate=all --confirm=I_CONFIRM_THROWAY_ROOM
 *
 * Writes JSON results to reports/mobile-probe-28.json for docs.
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { cleanElectronEnv } from './electronEnv.mjs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { MUTATION_CONFIRM } = require('../electron/mobileProbe.cjs');

const args = process.argv.slice(2);
function flag(name) {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  if (hit === `--${name}`) return true;
  return hit.slice(name.length + 3);
}

const channelFlag = flag('channel');
const mutate = flag('mutate');
const confirm = flag('confirm') || '';
const userIdFlag = flag('userId');

const userData = process.env.CLUBBOX_USER_DATA
  || (process.env.APPDATA ? join(process.env.APPDATA, 'Clubbox') : join(process.env.HOME || '', '.config', 'Clubbox'));

function readLastChannel() {
  if (typeof channelFlag === 'string' && channelFlag) return channelFlag;
  const path = join(userData, 'last-room.json');
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return typeof raw.channel === 'string' ? raw.channel : null;
  } catch {
    return null;
  }
}

const runnerPath = join(root, 'scripts', '_mobile-probe-28-electron.cjs');
const channel = readLastChannel();
if (!channel) {
  console.error('[mobile-probe-28] No channel. Pass --channel=... or join a room first (last-room.json).');
  process.exit(1);
}

const electronBin = require('electron');
const childEnv = cleanElectronEnv({
  ...process.env,
  CLUBBOX_USER_DATA: userData,
});
const result = spawnSync(
  electronBin,
  [runnerPath, channel, mutate ? String(mutate) : '', confirm, userIdFlag ? String(userIdFlag) : ''],
  {
    cwd: root,
    env: childEnv,
    encoding: 'utf8',
    timeout: 120_000,
  },
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) {
  console.error('[mobile-probe-28] electron runner exited', result.status);
  process.exit(result.status || 1);
}

console.log('[mobile-probe-28] confirm hint for mutations:', MUTATION_CONFIRM);
