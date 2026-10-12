/**
 * Electron child for scripts/mobile-probe-28.mjs — loads Clubbox userData session.
 * Args: channel, mutateEndpointOrAll, confirm, userId
 */
const { app, session } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  probeMobileReadOnly,
  probeMobileMutation,
  MUTATION_CONFIRM,
  MUTATION_PROBE_ORDER,
} = require('../electron/mobileProbe.cjs');

const channel = process.argv[2] || '';
const mutate = process.argv[3] || '';
const confirm = process.argv[4] || '';
const userIdRaw = process.argv[5] || '';
const userId = userIdRaw && /^\d+$/.test(userIdRaw) ? Number(userIdRaw) : null;

const PAGE_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36`;

if (process.env.CLUBBOX_USER_DATA) {
  app.setPath('userData', process.env.CLUBBOX_USER_DATA);
}
app.commandLine.appendSwitch('disk-cache-dir', path.join(os.tmpdir(), 'clubbox-probe-disk-cache'));

async function listClubhouseCookies(sess) {
  const all = await sess.cookies.get({});
  const club = all.filter((cookie) => String(cookie.domain || '').includes('clubhouse'));
  const byUrl = await sess.cookies.get({ url: 'https://www.clubhouse.com' });
  const byDomain = await sess.cookies.get({ domain: '.clubhouse.com' });
  const map = new Map();
  for (const cookie of [...club, ...byUrl, ...byDomain]) {
    map.set(`${cookie.name}|${cookie.domain}|${cookie.path}`, cookie);
  }
  console.log('[mobile-probe-28] cookie inventory total', all.length, 'clubhouse', map.size);
  return [...map.values()];
}

app.whenReady().then(async () => {
  const report = {
    channel,
    confirmRequired: MUTATION_CONFIRM,
    readOnly: [],
    mutations: {},
    cookieNames: [],
    userData: app.getPath('userData'),
  };
  try {
    console.log('[mobile-probe-28] userData', report.userData);
    console.log('[mobile-probe-28] web-session-ok', fs.existsSync(path.join(report.userData, 'web-session-ok')));
    const sess = session.defaultSession;
    const cookies = await listClubhouseCookies(sess);
    report.cookieNames = cookies.map((c) => c.name);
    // Shape only — never log cookie values.
    report.cookieMeta = cookies.map((c) => ({
      name: c.name,
      domain: c.domain,
      path: c.path,
      httpOnly: !!c.httpOnly,
      secure: !!c.secure,
      valueLen: String(c.value || '').length,
    }));
    console.log(
      '[mobile-probe-28] channel',
      channel,
      'cookieMeta',
      report.cookieMeta.map((c) => `${c.name}@${c.domain}:len=${c.valueLen}`).join(' '),
    );

    // Cookie-aware https fallback lives inside callMobileApi when session.fetch throws.
    const fetchNoAbort = async (url, init) => {
      const next = { ...init };
      delete next.signal;
      return sess.fetch(url, next);
    };
    report.readOnly = await probeMobileReadOnly({
      fetchFn: fetchNoAbort,
      cookies,
      userAgent: PAGE_UA,
      timeoutMs: 20_000,
      channel,
    });

    if (mutate) {
      if (confirm !== MUTATION_CONFIRM) {
        console.log('[mobile-probe-28] mutations skipped — pass --confirm=' + MUTATION_CONFIRM);
      } else {
        const endpoints = mutate === 'all' ? [...MUTATION_PROBE_ORDER] : [mutate];
        for (const endpoint of endpoints) {
          const out = await probeMobileMutation({
            fetchFn: fetchNoAbort,
            cookies,
            userAgent: PAGE_UA,
            timeoutMs: 20_000,
            channel,
            endpoint,
            confirm,
            link: 'https://example.com/clubbox-probe',
            userId: endpoint === 'uninvite_speaker' ? userId : undefined,
          });
          report.mutations[endpoint] = out;
        }
      }
    }

    const outDir = path.join(__dirname, '..', 'reports');
    fs.mkdirSync(outDir, { recursive: true });
    const payload = `${JSON.stringify(report, null, 2)}\n`;
    fs.writeFileSync(path.join(outDir, 'mobile-probe-28.json'), payload);
    fs.writeFileSync(path.join(outDir, 'mobile-probe-29.json'), payload);
    console.log('[mobile-probe-28] wrote', path.join(outDir, 'mobile-probe-29.json'));
    app.exit(0);
  } catch (err) {
    console.error('[mobile-probe-28] error', err instanceof Error ? err.message : err);
    app.exit(1);
  }
});
