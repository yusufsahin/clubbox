/**
 * Phase 28.0 / 29.0 one-shot body discovery using the Clubbox Electron session (cookies).
 * Never prints Cookie / CSRF values.
 *
 * Read-only (default) includes 29.0: get_channel_audience, get_channel_banner,
 * get_channel_user_poll, get_highlight (+ Phase 28 room reads).
 *   node scripts/mobile-probe-28.mjs
 *   node scripts/mobile-probe-28.mjs --channel=xewy04pp
 *
 * Mutations (throwaway room only — typed confirm required):
 *   node scripts/mobile-probe-28.mjs --mutate=update_channel_flags --confirm=I_CONFIRM_THROWAY_ROOM
 *   node scripts/mobile-probe-28.mjs --mutate=all --confirm=I_CONFIRM_THROWAY_ROOM
 *
 * If Clubbox is already running, pokes it via second-instance argv (live cookies).
 * Otherwise runs a headless Electron child against userData.
 *
 * Writes reports/mobile-probe-28.json and reports/mobile-probe-29.json (same payload).
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync, statSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
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

function clubboxAlreadyRunning() {
  if (process.platform !== 'win32') return false;
  try {
    const out = execSync(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name = \'electron.exe\'\\" | Select-Object -ExpandProperty CommandLine"',
      { encoding: 'utf8', timeout: 15_000 },
    );
    return out.includes('clubdeck') || out.includes('Clubbox');
  } catch {
    return false;
  }
}

const channel = readLastChannel();
if (!channel) {
  console.error('[mobile-probe-28] No channel. Pass --channel=... or join a room first (last-room.json).');
  process.exit(1);
}

const electronBin = require('electron');
const reportPath = join(root, 'reports', 'mobile-probe-28.json');
const donePath = join(root, 'reports', 'mobile-probe-28.done');
const childEnv = cleanElectronEnv({
  ...process.env,
  CLUBBOX_USER_DATA: userData,
});

async function main() {
  if (clubboxAlreadyRunning()) {
    console.log('[mobile-probe-28] Clubbox running — poking via second-instance (live session)');
    try {
      if (existsSync(donePath)) unlinkSync(donePath);
    } catch {
      /* ignore */
    }
    const before = existsSync(reportPath) ? statSync(reportPath).mtimeMs : 0;
    const probeArgs = [
      '.',
      `--clubbox-mobile-probe=${mutate ? 'mutate' : 'readonly'}`,
      `--channel=${channel}`,
    ];
    if (mutate) probeArgs.push(`--mutate=${mutate}`);
    if (confirm) probeArgs.push(`--confirm=${confirm}`);
    if (userIdFlag) probeArgs.push(`--userId=${userIdFlag}`);
    spawnSync(electronBin, probeArgs, {
      cwd: root,
      env: childEnv,
      encoding: 'utf8',
      timeout: 15_000,
    });
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      if (existsSync(donePath) || (existsSync(reportPath) && statSync(reportPath).mtimeMs > before)) {
        break;
      }
      await sleep(400);
    }
    if (existsSync(reportPath) && statSync(reportPath).mtimeMs > before) {
      const report = JSON.parse(readFileSync(reportPath, 'utf8'));
      console.log('[mobile-probe-28] report channel', report.channel, 'cookieNames', (report.cookieNames || []).join(','));
      for (const row of report.readOnly || []) {
        console.log('[mobile-probe-28]', row.endpoint, row.status, row.shape);
      }
      for (const [endpoint, out] of Object.entries(report.mutations || {})) {
        console.log('[mobile-probe-28] mutate', endpoint, JSON.stringify({ refused: out.refused, n: (out.results || []).length }));
      }
      console.log('[mobile-probe-28] wrote', reportPath);
      console.log('[mobile-probe-28] confirm hint for mutations:', MUTATION_CONFIRM);
      return;
    }
    console.error('[mobile-probe-28] Running Clubbox did not write a report (restart Clubbox to load probe handler, or close it and re-run).');
    process.exitCode = 1;
    return;
  }

  const runnerPath = join(root, 'scripts', '_mobile-probe-28-electron.cjs');
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
    process.exitCode = result.status || 1;
    return;
  }

  console.log('[mobile-probe-28] confirm hint for mutations:', MUTATION_CONFIRM);
}

await main();
