/**
 * Task 11.0 — crawl Clubhouse Next.js chunks into api-captures/bundle-callsites.json.
 * Uses the existing Electron session cookies when available; otherwise prints how to sign in.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const { createBundleCrawler } = require('../electron/bundleCrawler.cjs');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function defaultUserData() {
  if (process.env.CLUBBOX_USER_DATA) return process.env.CLUBBOX_USER_DATA;
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || '', 'clubbox');
  }
  if (process.platform === 'darwin') {
    return path.join(process.env.HOME || '', 'Library', 'Application Support', 'clubbox');
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || '', '.config'), 'clubbox');
}

function sessionLooksSignedIn(userData) {
  // Electron cookie DB path varies; a prior crawl cache or realtime-config is a weak signal.
  // Prefer an explicit cookie jar marker written by the app when present.
  const marker = path.join(userData, 'web-session-ok');
  if (fs.existsSync(marker)) return true;
  const cookies = path.join(userData, 'Cookies');
  if (fs.existsSync(cookies)) return true;
  const network = path.join(userData, 'Network', 'Cookies');
  return fs.existsSync(network);
}

async function main() {
  const userData = defaultUserData();
  if (!sessionLooksSignedIn(userData) && !process.env.CLUBBOX_DISCOVER_FORCE) {
    console.log('[Clubbox] sign in once first (desktop → Clubhouse window), then re-run npm run api:discover');
    console.log(`[Clubbox] looked for a session under ${userData}`);
    process.exitCode = 2;
    return;
  }

  const crawler = createBundleCrawler({
    userDataPath: userData,
    projectRoot: root,
  });

  console.log('[Clubbox] crawling clubhouse.com Next.js chunks (≤1 req/s, max 200)…');
  const result = await crawler.crawl({ force: process.argv.includes('--force') });
  if (!result.ok) {
    console.error(`[Clubbox] discover failed: ${result.reason}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[Clubbox] discover ${result.reason}; buildId=${result.buildId || '?'} chunks=${result.chunks ?? 0}`);
  if (result.reportPath) console.log(`[Clubbox] report: ${result.reportPath}`);
  console.log('[Clubbox] run npm run api:docs to refresh docs/api/bundle-callsites.md and realtime.md');

  // Fingerprint only — never print secret values.
  const secretsPath = path.join(userData, 'realtime-config.json');
  if (fs.existsSync(secretsPath)) {
    const hash = createHash('sha256').update(fs.readFileSync(secretsPath)).digest('hex').slice(0, 12);
    console.log(`[Clubbox] realtime-config.json present (sha256…${hash})`);
  }
}

main().catch((err) => {
  console.error('[Clubbox] api:discover error:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
