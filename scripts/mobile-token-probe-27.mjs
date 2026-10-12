/**
 * Phase 27.5.0 — SMS Token auth spike via the running Clubbox window.
 * Phone number and SMS code are typed into app prompts (never CLI, never logged).
 *
 *   node scripts/mobile-token-probe-27.mjs
 *   node scripts/mobile-token-probe-27.mjs --channel=<throwaway>
 *
 * Requires Clubbox already running (second-instance poke). Writes
 * reports/mobile-token-probe-27.json (status + response keys only).
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

const args = process.argv.slice(2);
function flag(name) {
  const hit = args.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return null;
  if (hit === `--${name}`) return true;
  return hit.slice(name.length + 3);
}

const channelFlag = flag('channel');
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
const electronBin = require('electron');
const reportPath = join(root, 'reports', 'mobile-token-probe-27.json');
const donePath = join(root, 'reports', 'mobile-token-probe-27.done');
const childEnv = cleanElectronEnv({
  ...process.env,
  CLUBBOX_USER_DATA: userData,
});

async function main() {
  if (!clubboxAlreadyRunning()) {
    console.error('[token-probe-27] Start Clubbox first (dev), join your throwaway room, then re-run.');
    process.exit(1);
  }
  console.log('[token-probe-27] Clubbox running — opening app prompts (phone + SMS code; never on CLI)');
  try {
    if (existsSync(donePath)) unlinkSync(donePath);
  } catch {
    /* ignore */
  }
  const before = existsSync(reportPath) ? statSync(reportPath).mtimeMs : 0;
  const probeArgs = ['.', '--clubbox-token-probe=1'];
  if (channel) probeArgs.push(`--channel=${channel}`);
  spawnSync(electronBin, probeArgs, {
    cwd: root,
    env: childEnv,
    encoding: 'utf8',
    timeout: 15_000,
  });
  // Owner may take a while for SMS — wait up to 10 minutes.
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    if (existsSync(donePath) || (existsSync(reportPath) && statSync(reportPath).mtimeMs > before)) {
      break;
    }
    await sleep(500);
  }
  if (existsSync(reportPath) && statSync(reportPath).mtimeMs > before) {
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    console.log('[token-probe-27] report phase', report.phase);
    console.log('[token-probe-27] phoneNormalized', report.phoneNormalized);
    console.log('[token-probe-27] start', report.start);
    console.log('[token-probe-27] complete', report.complete);
    console.log('[token-probe-27] hasRefreshToken', report.hasRefreshToken);
    console.log('[token-probe-27] attestation', report.attestation);
    console.log('[token-probe-27] stoppedForAttestation', report.stoppedForAttestation);
    console.log('[token-probe-27] mute', report.mute);
    console.log('[token-probe-27] notes', (report.notes || []).join(','));
    console.log('[token-probe-27] phoneAppSignedOut', report.phoneAppSignedOut, '(confirm manually)');
    return;
  }
  console.error('[token-probe-27] No report yet — complete the app prompts, or check Clubbox console for [token-probe].');
  process.exit(1);
}

main().catch((err) => {
  console.error('[token-probe-27]', err instanceof Error ? err.message : err);
  process.exit(1);
});
