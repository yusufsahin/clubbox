const { app, BrowserWindow, BrowserView, session, ipcMain, globalShortcut, shell, Notification, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const { isAllowedEndpoint, isPlainPayload, pickHeaders } = require('./ipcGuard.cjs');
const { appendApiLog } = require('./apiLog.cjs');
const { runStartupTriage } = require('./apiTriage.cjs');
const { createBundleCrawler } = require('./bundleCrawler.cjs');
const { createPubNubClient } = require('./pubnubClient.cjs');

const REQUEST_TIMEOUT_MS = 20000;
const DEV_SERVER_ORIGIN = 'http://localhost:5173';

const CH_WEB_APP_VERSION = '22.2.0';

app.setName('Clubbox');
if (process.platform === 'win32') {
  app.setAppUserModelId('app.clubbox.desktop');
}
if (process.env.CLUBBOX_USER_DATA) {
  app.setPath('userData', process.env.CLUBBOX_USER_DATA);
}

// Chromium renames Cache to old_Cache_* on startup. On Windows that rename
// fails with ACCESS_DENIED (0x5) when another process still has the folder
// open, and the window then never finishes loading. Keep the cache somewhere
// that is not the locked user-data Cache directory.
app.commandLine.appendSwitch('disk-cache-dir', path.join(os.tmpdir(), 'clubbox-disk-cache'));

let mainWindow = null;

function appIndexUrl() {
  return pathToFileURL(path.join(__dirname, '../dist/index.html'));
}

function isAppDocumentUrl(target) {
  if (typeof target !== 'string' || !target) return false;
  let url;
  try {
    url = new URL(target);
  } catch {
    return false;
  }
  if (!app.isPackaged && url.origin === DEV_SERVER_ORIGIN) return true;
  const index = appIndexUrl();
  return url.protocol === 'file:' && decodeURIComponent(url.pathname) === decodeURIComponent(index.pathname);
}

function isClubhouseHttps(target) {
  let url;
  try {
    url = new URL(target);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return host === 'clubhouse.com' || host.endsWith('.clubhouse.com');
}

/** Profile social links + Clubhouse pages — opened via shell.openExternal. */
function isAllowedExternalHttps(target) {
  if (isClubhouseHttps(target)) return true;
  let url;
  try {
    url = new URL(target);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return host === 'x.com' || host === 'www.x.com'
    || host === 'twitter.com' || host === 'www.twitter.com'
    || host === 'instagram.com' || host === 'www.instagram.com';
}

function isTrustedSender(event) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const contents = mainWindow.webContents;
  if (!contents || contents.isDestroyed()) return false;
  if (event.sender !== contents) return false;
  const frame = event.senderFrame;
  if (!frame) return false;
  if (contents.mainFrame && frame !== contents.mainFrame) return false;
  if (!isAppDocumentUrl(frame.url)) return false;
  return true;
}
let recorderWebContentsId = -1;

function recorderRequested(argv) {
  if (app.isPackaged) return false;
  const args = Array.isArray(argv) ? argv : process.argv;
  return process.env.CLUBBOX_API_RECORDER === '1' || args.includes('--api-recorder');
}

function recorderFlag(argv, name) {
  const args = Array.isArray(argv) ? argv : process.argv;
  const prefix = `--${name}=`;
  const hit = args.find((arg) => typeof arg === 'string' && arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : '';
}

function startRecorderIfAllowed(argv) {
  if (!recorderRequested(argv)) return;
  const roleArg = recorderFlag(argv, 'role');
  const role = roleArg === 'host' || roleArg === 'listener' ? roleArg : 'solo';
  const profile = recorderFlag(argv, 'profile') === 'b' ? 'b' : 'a';
  const { startApiRecorder } = require('./apiRecorder.cjs');
  startApiRecorder({ onWindow: watchRecorderWindow, role, profile });
}

function watchRecorderWindow(win) {
  recorderWebContentsId = win.webContents.id;
  win.on('closed', () => {
    if (recorderWebContentsId === win.webContents.id) recorderWebContentsId = -1;
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1040,
    minHeight: 680,
    title: 'Clubbox',
    icon: path.join(__dirname, '../build/icon.ico'),
    backgroundColor: '#080a0f',
    frame: true,
    autoHideMenuBar: true,
    center: true,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const mainId = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents.id : -1;
    if (permission === 'media' && (webContents.id === mainId || webContents.id === recorderWebContentsId)) {
      return callback(true);
    }
    callback(false);
  });

  // Windows loopback for External audio (ST-11). Only the trusted main window may request it.
  if (typeof session.defaultSession.setDisplayMediaRequestHandler === 'function') {
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      const fromMain = mainWindow
        && !mainWindow.isDestroyed()
        && request?.frame
        && request.frame === mainWindow.webContents.mainFrame;
      if (!fromMain || process.platform !== 'win32') {
        callback({});
        return;
      }
      callback({ audio: 'loopback' });
    }, { useSystemPicker: false });
  }

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[Electron] Failed to load URL:', validatedURL, errorCode, errorDescription);
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppDocumentUrl(url)) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalHttps(url)) {
      shell.openExternal(url).catch(() => {});
    }
    return { action: 'deny' };
  });

  const distPath = path.join(__dirname, '../dist/index.html');

  if (fs.existsSync(distPath)) {
    console.log('[Electron] Loading dist file:', distPath);
    mainWindow.loadFile(distPath).catch(() => {
      if (!app.isPackaged) mainWindow.loadURL(DEV_SERVER_ORIGIN);
    });
  } else if (!app.isPackaged) {
    console.log('[Electron] Loading dev server:', DEV_SERVER_ORIGIN);
    mainWindow.loadURL(DEV_SERVER_ORIGIN);
  } else {
    console.error('[Electron] Packaged app is missing dist/index.html');
  }

  // Force window to appear on top and gain focus immediately
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.show();
  mainWindow.focus();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const SHORTCUT_ACTIONS = ['mute', 'clip', 'pad1', 'pad2', 'pad3', 'pad4', 'pad5', 'pad6', 'pad7', 'pad8', 'pad9'];
const SHORTCUT_MODIFIERS = new Set(['Command', 'Cmd', 'Control', 'Ctrl', 'CommandOrControl', 'Alt', 'Option', 'AltGr', 'Shift', 'Super', 'Meta']);
const SHORTCUT_KEYS = new Set(['Plus', 'Space', 'Tab', 'Backspace', 'Delete', 'Insert', 'Return', 'Enter', 'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp', 'PageDown']);

function isShortcutAccelerator(value) {
  if (typeof value !== 'string' || value.length > 64) return false;
  const parts = value.split('+');
  if (parts.length < 1 || parts.length > 5) return false;
  const key = parts[parts.length - 1];
  const functionKey = /^F([1-9]|1\d|2[0-4])$/.test(key);
  const keyOk = /^[A-Z0-9]$/.test(key) || SHORTCUT_KEYS.has(key) || functionKey;
  if (!keyOk) return false;
  const mods = parts.slice(0, -1);
  if (mods.length === 0) return functionKey;
  return mods.every((mod) => SHORTCUT_MODIFIERS.has(mod));
}

function shortcutsFile() {
  return path.join(app.getPath('userData'), 'clubbox-shortcuts.json');
}

function readShortcutFile() {
  try {
    if (!fs.existsSync(shortcutsFile())) return null;
    const parsed = JSON.parse(fs.readFileSync(shortcutsFile(), 'utf8'));
    return sanitizeShortcuts(parsed);
  } catch {
    return null;
  }
}

function sanitizeShortcuts(input) {
  if (!input || typeof input !== 'object') return {};
  const out = {};
  const seen = new Set();
  for (const action of SHORTCUT_ACTIONS) {
    if (!Object.prototype.hasOwnProperty.call(input, action)) continue;
    const value = input[action];
    if (value === '') {
      out[action] = '';
      continue;
    }
    if (!isShortcutAccelerator(value) || seen.has(value)) continue;
    seen.add(value);
    out[action] = value;
  }
  return out;
}

let registeredAccelerators = [];

function sendGlobalShortcut(action) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('clubbox:global-shortcut', action);
}

// globalShortcut has no keyup, so these are toggle-to-talk presses.
function applyGlobalShortcuts(map) {
  for (const accelerator of registeredAccelerators) {
    try {
      globalShortcut.unregister(accelerator);
    } catch {
      // The shortcut was already released.
    }
  }
  registeredAccelerators = [];
  const failed = [];
  for (const action of SHORTCUT_ACTIONS) {
    const accelerator = map[action];
    if (!accelerator) continue;
    try {
      const ok = globalShortcut.register(accelerator, () => sendGlobalShortcut(action));
      if (!ok) failed.push(action);
      else registeredAccelerators.push(accelerator);
    } catch {
      failed.push(action);
    }
  }
  return failed;
}

ipcMain.handle('clubbox:shortcuts-get', (event) => {
  if (!isTrustedSender(event)) return null;
  return readShortcutFile();
});

ipcMain.handle('clubbox:shortcuts-set', (event, shortcuts) => {
  if (!isTrustedSender(event)) return { ok: false, failed: [] };
  const clean = sanitizeShortcuts(shortcuts);
  try {
    const file = shortcutsFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(clean));
  } catch {
    // Registration can still apply for this session.
  }
  return { ok: true, failed: applyGlobalShortcuts(clean) };
});

ipcMain.handle('clubbox:open-signin', (event, bounds) => {
  if (!isTrustedSender(event)) return { ok: false };
  showEmbeddedSignIn(normalizeBounds(bounds));
  return { ok: true };
});

ipcMain.handle('clubbox:embedded-signin-show', (event, bounds) => {
  if (!isTrustedSender(event)) return { ok: false };
  showEmbeddedSignIn(normalizeBounds(bounds));
  return { ok: true };
});

ipcMain.handle('clubbox:embedded-signin-hide', (event) => {
  if (!isTrustedSender(event)) return { ok: false };
  hideEmbeddedSignIn();
  return { ok: true };
});

ipcMain.handle('clubbox:embedded-signin-set-bounds', (event, bounds) => {
  if (!isTrustedSender(event)) return { ok: false };
  setEmbeddedSignInBounds(normalizeBounds(bounds));
  return { ok: true };
});

ipcMain.handle('clubbox:set-zoom', (event, factor) => {
  if (!isTrustedSender(event)) return { ok: false };
  const value = typeof factor === 'number' && Number.isFinite(factor) ? factor : 1;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.setZoomFactor(Math.max(0.5, Math.min(2, value)));
  }
  return { ok: true };
});

ipcMain.handle('clubbox:set-native-theme', (event, source) => {
  if (!isTrustedSender(event)) return { ok: false };
  const next = source === 'light' || source === 'dark' || source === 'system' ? source : 'system';
  nativeTheme.themeSource = next;
  return { ok: true };
});

ipcMain.handle('clubbox:desktop-notification', (event, payload) => {
  if (!isTrustedSender(event)) return { ok: false };
  if (!Notification.isSupported()) return { ok: false };
  const title = payload && typeof payload.title === 'string' ? payload.title : 'Clubbox';
  const body = payload && typeof payload.body === 'string' ? payload.body : '';
  const note = new Notification({ title, body });
  note.on('click', () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });
  note.show();
  return { ok: true };
});

ipcMain.handle('clubbox:close-signin', (event) => {
  if (!isTrustedSender(event)) return { ok: false };
  hideEmbeddedSignIn();
  return { ok: true };
});

ipcMain.handle('clubbox:api-log-append', (event, record) => {
  if (!isTrustedSender(event)) return { ok: false };
  try {
    appendApiLog(app.getPath('userData'), {
      endpoint: String(record?.endpoint || ''),
      body: record?.bodyKeys
        ? Object.fromEntries((record.bodyKeys || []).map((key) => [key, 'redacted']))
        : {},
      status: Number(record?.status) || 0,
      ok: record?.ok !== false,
      responseBody: typeof record?.error === 'string' ? JSON.stringify({ error_message: record.error }) : '{}',
      appVersion: String(record?.appVersion || CH_WEB_APP_VERSION),
      kind: String(record?.kind || 'web_api'),
      timestamp: record?.timestamp,
    });
    return { ok: true };
  } catch (err) {
    console.warn('[Clubbox] api-log-append failed:', err);
    return { ok: false };
  }
});

ipcMain.handle('clubbox:run-api-triage', (event) => {
  if (!isTrustedSender(event)) return { ok: false, promotions: [], failures: [] };
  try {
    return runStartupTriage(app.getPath('userData'));
  } catch (err) {
    console.warn('[Clubbox] run-api-triage failed:', err);
    return { ok: false, promotions: [], failures: [] };
  }
});

ipcMain.handle('clubbox:clear-web-session', async (event) => {
  if (!isTrustedSender(event)) return { ok: false };
  hideEmbeddedSignIn();
  try {
    await session.defaultSession.clearStorageData({
      origin: 'https://www.clubhouse.com',
    });
    const cookies = await session.defaultSession.cookies.get({ domain: '.clubhouse.com' });
    await Promise.all(cookies.map((cookie) => session.defaultSession.cookies.remove(
      `https://${cookie.domain.replace(/^\./, '')}${cookie.path || '/'}`,
      cookie.name,
    )));
    try {
      fs.unlinkSync(path.join(app.getPath('userData'), 'web-session-ok'));
    } catch {
      // ignore
    }
  } catch (err) {
    console.warn('[Clubbox] clear-web-session failed:', err);
  }
  return { ok: true };
});

const WEB_AUTH_ENDPOINTS = {
  start_phone_number_web_auth: '/web_api/start_phone_number_web_auth',
  complete_phone_number_web_auth: '/web_api/complete_phone_number_web_auth',
  resend_phone_number_auth: '/web_api/resend_phone_number_auth',
};

// Shared with src/api/client.ts. Chat methods stay as configured until a capture
// in docs/api/web-api.md confirms them. get_channel and unfollow are omitted, so
// web sign-in shows that live updates are unavailable instead of failing silently.
const WEB_SESSION_PATHS = require('./webApiRoutes.json');

let signInView = null;
let lastSignInNotice = '';
let bundleCrawlInFlight = null;
let bundleCrawlAttempt = 0;
let pubnubClient = null;

function normalizeBounds(bounds) {
  const x = Math.max(0, Math.round(Number(bounds?.x) || 0));
  const y = Math.max(0, Math.round(Number(bounds?.y) || 0));
  const width = Math.max(120, Math.round(Number(bounds?.width) || 480));
  const height = Math.max(160, Math.round(Number(bounds?.height) || 640));
  return { x, y, width, height };
}

function hideEmbeddedSignIn() {
  if (!signInView) return;
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.removeBrowserView(signInView);
    }
  } catch {
    // ignore
  }
  try {
    if (!signInView.webContents.isDestroyed()) {
      signInView.webContents.destroy();
    }
  } catch {
    // ignore
  }
  signInView = null;
  lastSignInNotice = '';
}

function setEmbeddedSignInBounds(bounds) {
  if (!signInView) return;
  try {
    signInView.setBounds(bounds);
  } catch {
    // ignore
  }
}

function showEmbeddedSignIn(bounds) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (signInView) {
    setEmbeddedSignInBounds(bounds);
    try {
      mainWindow.setBrowserView(signInView);
    } catch {
      // ignore
    }
    return;
  }
  lastSignInNotice = '';
  signInView = new BrowserView({
    webPreferences: {
      // Same jar as ch:request /web_api calls — required for adoptWebSession.
      session: session.defaultSession,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  mainWindow.setBrowserView(signInView);
  signInView.setBounds(bounds);
  // Keep Clubhouse's SMS/code steps in the same BrowserView — never spawn a popup window.
  signInView.webContents.setWindowOpenHandler(({ url }) => {
    if (isClubhouseHttps(url) && signInView && !signInView.webContents.isDestroyed()) {
      void signInView.webContents.loadURL(url);
    }
    return { action: 'deny' };
  });
  signInView.webContents.on('will-navigate', (event, url) => {
    if (!isClubhouseHttps(url)) event.preventDefault();
  });
  const notice = (_event, url) => maybeNotifyWebSession(url);
  signInView.webContents.on('did-navigate', notice);
  signInView.webContents.on('did-redirect-navigation', notice);
  signInView.webContents.on('did-navigate-in-page', notice);
  signInView.webContents.on('did-finish-load', () => {
    void extractAgoraAppIdFromSignIn(signInView);
  });
  signInView.webContents.on('destroyed', () => {
    signInView = null;
    lastSignInNotice = '';
  });
  void signInView.webContents.loadURL('https://www.clubhouse.com/signin');
}

function readRealtimeConfig() {
  try {
    const file = path.join(app.getPath('userData'), 'realtime-config.json');
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function hasRealtimeKeys() {
  const config = readRealtimeConfig();
  return typeof config.pubnubSubscribeKey === 'string' && config.pubnubSubscribeKey.length > 0
    && typeof config.agoraAppId === 'string' && /^[a-fA-F0-9]{32}$/.test(config.agoraAppId);
}

function pushAgoraAppIdFromConfig() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const config = readRealtimeConfig();
  const appId = typeof config.agoraAppId === 'string' ? config.agoraAppId : null;
  if (appId && /^[a-fA-F0-9]{32}$/.test(appId)) {
    mainWindow.webContents.send('clubbox:agora-app-id', appId);
  }
}

function logRealtimeShape(record) {
  try {
    appendApiLog(app.getPath('userData'), {
      endpoint: record.endpoint,
      method: 'REALTIME',
      path: record.path || record.endpoint,
      status: typeof record.status === 'number' ? record.status : (record.ok ? 200 : 0),
      ok: !!record.ok,
      body: {},
      responseBody: '',
      error: record.error || '',
      appVersion: CH_WEB_APP_VERSION,
      kind: record.kind || 'realtime',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('[Clubbox] realtime log failed:', err instanceof Error ? err.message : err);
  }
}

function ensurePubNubClient() {
  if (pubnubClient) return pubnubClient;
  pubnubClient = createPubNubClient({
    fetchFn: (url, init) => session.defaultSession.fetch(url, init),
    onMessage: (message) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.send('clubbox:pubnub-message', message);
    },
    onStatus: (status) => {
      if (status?.reconnecting || status?.connected === false) {
        logRealtimeShape({
          endpoint: 'pubnub_status',
          path: 'pubnub_status',
          ok: !!status?.connected,
          status: status?.connected ? 200 : 0,
          error: status?.reconnecting ? 'reconnecting' : 'disconnected',
          kind: 'realtime',
        });
      }
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.send('clubbox:pubnub-status', status);
    },
  });
  return pubnubClient;
}

function scheduleBundleCrawl(options = {}) {
  if (bundleCrawlInFlight) return bundleCrawlInFlight;
  const force = options.force === true;
  // Runtime never writes project artifacts (packaged app.asar is read-only; shipping route table must not change at runtime).
  const crawler = createBundleCrawler({
    userDataPath: app.getPath('userData'),
    projectRoot: path.join(__dirname, '..'),
    writeProjectArtifacts: false,
    fetchFn: (url, init) => session.defaultSession.fetch(url, init),
  });
  bundleCrawlInFlight = crawler.crawl({ force }).then((result) => {
    if (result.ok && result.reason === 'crawled') {
      console.log(`[Clubbox] bundle crawl done buildId=${result.buildId} chunks=${result.chunks}`);
      bundleCrawlAttempt = 0;
      try {
        fs.writeFileSync(path.join(app.getPath('userData'), 'web-session-ok'), '1');
      } catch {
        // ignore
      }
      logRealtimeShape({ endpoint: 'bundle_crawl', path: 'bundle_crawl', ok: true, status: 200, kind: 'realtime' });
    } else if (result.ok && result.reason === 'cache_hit') {
      console.log(`[Clubbox] bundle crawl cache hit buildId=${result.buildId}`);
      bundleCrawlAttempt = 0;
    } else {
      console.warn('[Clubbox] bundle crawl skipped:', result.reason);
      logRealtimeShape({
        endpoint: 'bundle_crawl',
        path: 'bundle_crawl',
        ok: false,
        status: 0,
        error: String(result.reason || 'skipped'),
        kind: 'realtime',
      });
      scheduleBundleCrawlRetry();
    }
    pushAgoraAppIdFromConfig();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('clubbox:realtime-config', {
        hasKeys: hasRealtimeKeys(),
        reason: result.reason || null,
      });
    }
    return result;
  }).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[Clubbox] bundle crawl failed:', message);
    logRealtimeShape({
      endpoint: 'bundle_crawl',
      path: 'bundle_crawl',
      ok: false,
      status: 0,
      error: message.slice(0, 120),
      kind: 'realtime',
    });
    scheduleBundleCrawlRetry();
    return { ok: false, reason: 'error' };
  }).finally(() => {
    bundleCrawlInFlight = null;
  });
  return bundleCrawlInFlight;
}

function scheduleBundleCrawlRetry() {
  bundleCrawlAttempt += 1;
  if (bundleCrawlAttempt > 4) return;
  const delay = Math.min(60_000, 5_000 * (2 ** (bundleCrawlAttempt - 1)));
  setTimeout(() => {
    scheduleBundleCrawl();
  }, delay);
}

function notifyWebSessionMaybe(reason, options = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const force = options.force === true;
  if (!force && reason && lastSignInNotice === reason) return;
  if (reason) lastSignInNotice = reason;
  mainWindow.webContents.send('clubbox:web-session-maybe');
  scheduleBundleCrawl();
}

function maybeNotifyWebSession(target) {
  if (!isClubhouseHttps(target) || !mainWindow || mainWindow.isDestroyed()) return;
  let url;
  try {
    url = new URL(target);
  } catch {
    return;
  }
  const path = url.pathname.toLowerCase();
  // Still notify after leaving the phone/code steps. Cookie watcher covers
  // SPA sign-in that never changes the path.
  if (path === '/signin' || path.startsWith('/signin/') || path === '/login' || path.startsWith('/login/')) return;
  notifyWebSessionMaybe(url.href);
}

let cookieNotifyTimer = null;
let cookieWatchArmed = false;

function armWebSessionCookieWatch() {
  if (cookieWatchArmed) return;
  cookieWatchArmed = true;
  session.defaultSession.cookies.on('changed', (_event, cookie, _cause, removed) => {
    if (removed || !cookie || !signInView) return;
    const domain = String(cookie.domain || '').toLowerCase();
    if (!domain.includes('clubhouse.com')) return;
    if (cookieNotifyTimer) clearTimeout(cookieNotifyTimer);
    cookieNotifyTimer = setTimeout(() => {
      cookieNotifyTimer = null;
      // Force: the same cookie name may update several times during SMS verify.
      notifyWebSessionMaybe(`cookie:${cookie.name}:${Date.now()}`, { force: true });
    }, 500);
  });
}

async function extractAgoraAppIdFromSignIn(view) {
  if (!view?.webContents || view.webContents.isDestroyed() || !mainWindow || mainWindow.isDestroyed()) return;
  try {
    const appId = await view.webContents.executeJavaScript(`
      (() => {
        const patterns = [
          /NEXT_PUBLIC_AGORA_KEY["']?\\s*[:=]\\s*["']([a-fA-F0-9]{32})["']/,
          /agora\\s*:\\s*\\{\\s*key\\s*:\\s*["']([a-fA-F0-9]{32})["']/,
        ];
        for (const el of document.querySelectorAll('script')) {
          const text = el.textContent || '';
          for (const re of patterns) {
            const match = text.match(re);
            if (match) return match[1];
          }
        }
        return null;
      })()
    `);
    if (typeof appId === 'string' && /^[a-fA-F0-9]{32}$/.test(appId)) {
      mainWindow.webContents.send('clubbox:agora-app-id', appId);
    }
  } catch (err) {
    console.warn('[Clubbox] agora key scan failed:', err);
  }
}

function expandRoutePath(route, body) {
  const template = route.path || '';
  const pathParams = Array.isArray(route.pathParams) ? route.pathParams : [];
  const payload = body && typeof body === 'object' ? { ...body } : {};
  if (!template.includes('{')) {
    return { pathName: template, body: payload };
  }
  const pathName = template.replace(/\{(\w+)\}/g, (_, key) => {
    let value = payload[key];
    if (value == null && key === 'id') value = payload.highlight_id;
    if (value == null) {
      throw new Error(`Missing path param ${key} for ${template}`);
    }
    delete payload[key];
    if (key === 'id') delete payload.highlight_id;
    return encodeURIComponent(String(value));
  });
  for (const key of pathParams) {
    delete payload[key];
  }
  return { pathName, body: payload };
}

function webSessionUrl(pathName, method, body) {
  const base = `https://www.clubhouse.com${pathName}`;
  if (method !== 'GET' || !body || typeof body !== 'object') return base;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value == null) continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

function logResponseShape(endpoint, text) {
  if (
    endpoint !== 'join_channel'
    && endpoint !== 'get_channels'
    && endpoint !== 'search_users'
    && endpoint !== 'get_edge_stories'
    && endpoint !== 'get_notifications'
  ) return;
  try {
    const parsed = JSON.parse(text);
    const keys = parsed && typeof parsed === 'object' ? Object.keys(parsed) : [];
    console.log('[web]', endpoint, 'keys', keys.join(','));
    const nested = parsed && parsed.channel;
    if (nested && typeof nested === 'object') {
      console.log('[web]', endpoint, 'channel keys', Object.keys(nested).join(','));
    }
    const first = Array.isArray(parsed?.items)
      ? parsed.items[0]
      : (Array.isArray(parsed?.activities)
        ? parsed.activities[0]
        : (Array.isArray(parsed?.notifications) ? parsed.notifications[0] : null));
    if (first && typeof first === 'object') {
      console.log('[web]', endpoint, 'item keys', Object.keys(first).join(','));
      const inner = first.channel;
      if (inner && typeof inner === 'object') {
        console.log('[web]', endpoint, 'item.channel keys', Object.keys(inner).join(','));
      }
    }
  } catch {
    // Shape logging is diagnostic only.
  }
}

function authSession() {
  if (signInView && !signInView.webContents.isDestroyed()) {
    return signInView.webContents.session;
  }
  return session.defaultSession;
}

async function listClubhouseCookies(sess) {
  const byUrl = await sess.cookies.get({ url: 'https://www.clubhouse.com' });
  const byDomain = await sess.cookies.get({ domain: '.clubhouse.com' });
  const map = new Map();
  for (const cookie of [...byUrl, ...byDomain]) {
    map.set(`${cookie.name}|${cookie.domain}|${cookie.path}`, cookie);
  }
  return [...map.values()];
}

async function syncClubhouseCookiesToDefault(sourceSession) {
  if (!sourceSession || sourceSession === session.defaultSession) return 0;
  const cookies = await listClubhouseCookies(sourceSession);
  let written = 0;
  for (const cookie of cookies) {
    const domain = cookie.domain || 'clubhouse.com';
    const host = domain.startsWith('.') ? domain.slice(1) : domain;
    try {
      await session.defaultSession.cookies.set({
        url: `https://${host}${cookie.path || '/'}`,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        expirationDate: cookie.expirationDate,
        sameSite: cookie.sameSite,
      });
      written += 1;
    } catch (err) {
      console.warn('[Clubbox] cookie sync failed:', cookie.name, err instanceof Error ? err.message : err);
    }
  }
  return written;
}

async function probeMeInSignInPage() {
  if (!signInView || signInView.webContents.isDestroyed()) return null;
  try {
    return await signInView.webContents.executeJavaScript(`
      (async () => {
        const match = document.cookie.split(';').map((s) => s.trim()).find((s) => s.startsWith('csrftoken='));
        const csrf = match ? decodeURIComponent(match.slice('csrftoken='.length)) : '';
        const res = await fetch('https://www.clubhouse.com/web_api/me', {
          method: 'POST',
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json; charset=utf-8',
            'X-CSRFToken': csrf,
            'CH-Web-AppVersion': ${JSON.stringify(CH_WEB_APP_VERSION)},
            'CH-Web-Version': ${JSON.stringify(CH_WEB_APP_VERSION)},
          },
          body: '{}',
        });
        return { status: res.status, ok: res.ok, body: await res.text() };
      })()
    `);
  } catch (err) {
    console.warn('[Clubbox] in-page me probe failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function postWithWebSession(endpoint, body) {
  const route = WEB_SESSION_PATHS[endpoint];
  if (!route) {
    return {
      ok: false,
      status: 0,
      body: JSON.stringify({ error_message: 'This action is not available on the web session yet.' }),
    };
  }
  const sess = authSession();
  const allCookies = await listClubhouseCookies(sess);
  const csrf = allCookies.find((cookie) => cookie.name === 'csrftoken')?.value || '';
  console.log(
    '[web] session cookies',
    allCookies.map((cookie) => cookie.name).join(',') || '(none)',
    'csrf',
    csrf ? 'yes' : 'no',
    'fromSignInView',
    sess !== session.defaultSession,
  );
  const method = route.method || 'POST';
  let pathName;
  let requestBody;
  try {
    ({ pathName, body: requestBody } = expandRoutePath(route, body));
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: JSON.stringify({ error_message: err instanceof Error ? err.message : String(err) }),
    };
  }

  let status = 0;
  let ok = false;
  let text = '';

  // Prefer an in-page fetch while the sign-in BrowserView is open — it sends
  // HttpOnly cookies the same way the Clubhouse SPA does.
  if (endpoint === 'me' && signInView && !signInView.webContents.isDestroyed()) {
    const probed = await probeMeInSignInPage();
    if (probed && typeof probed.status === 'number') {
      status = probed.status;
      ok = !!probed.ok;
      text = typeof probed.body === 'string' ? probed.body : '';
      console.log('[web] me via sign-in page', status);
    }
  }

  if (!status) {
    const response = await sess.fetch(webSessionUrl(pathName, method, requestBody), {
      method,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'X-CSRFToken': csrf,
        'CH-Web-AppVersion': CH_WEB_APP_VERSION,
        'CH-Web-Version': CH_WEB_APP_VERSION,
        Origin: 'https://www.clubhouse.com',
        Referer: 'https://www.clubhouse.com/home',
      },
      body: method === 'GET' ? undefined : JSON.stringify(requestBody ?? {}),
    });
    status = response.status;
    ok = response.ok;
    text = await response.text();
    console.log('[web]', endpoint, status);
  }

  logResponseShape(endpoint, text);
  if (ok && endpoint === 'me') {
    const synced = await syncClubhouseCookiesToDefault(sess);
    try {
      fs.writeFileSync(path.join(app.getPath('userData'), 'web-session-ok'), '1');
    } catch {
      // ignore
    }
    console.log('[web] me ok; cookies synced to defaultSession:', synced);
  }
  try {
    appendApiLog(app.getPath('userData'), {
      endpoint,
      body: requestBody && typeof requestBody === 'object' ? Object.fromEntries(
        Object.keys(requestBody).map((key) => [key, typeof requestBody[key]]),
      ) : {},
      status,
      ok,
      responseBody: text,
      appVersion: CH_WEB_APP_VERSION,
      kind: 'web_api',
    });
  } catch (err) {
    console.warn('[Clubbox] api-log write failed:', err);
  }
  return { ok, status, body: text };
}

ipcMain.handle('clubbox:ensure-realtime-config', async (event) => {
  if (!isTrustedSender(event)) return { ok: false, reason: 'unauthorized' };
  const pending = scheduleBundleCrawl();
  const result = pending ? await pending : { ok: hasRealtimeKeys(), reason: hasRealtimeKeys() ? 'ready' : 'missing' };
  return {
    ok: !!result?.ok || hasRealtimeKeys(),
    reason: result?.reason || (hasRealtimeKeys() ? 'ready' : 'missing_keys'),
    hasKeys: hasRealtimeKeys(),
  };
});

ipcMain.handle('clubbox:connection-status', async (event) => {
  if (!isTrustedSender(event)) return { ok: false };
  const config = readRealtimeConfig();
  const hub = pubnubClient;
  return {
    ok: true,
    webSession: fs.existsSync(path.join(app.getPath('userData'), 'web-session-ok')),
    realtimeKeys: hasRealtimeKeys(),
    pubnubConnected: !!(hub && typeof hub.isConnected === 'function' ? hub.isConnected() : false),
    agoraAppIdPresent: typeof config.agoraAppId === 'string' && /^[a-fA-F0-9]{32}$/.test(config.agoraAppId),
  };
});

ipcMain.handle('clubbox:pubnub-subscribe', async (event, payload) => {
  if (!isTrustedSender(event)) return { ok: false, reason: 'unauthorized' };
  const config = readRealtimeConfig();
  const subscribeKey = typeof config.pubnubSubscribeKey === 'string' ? config.pubnubSubscribeKey : null;
  if (!subscribeKey) {
    scheduleBundleCrawl();
    logRealtimeShape({
      endpoint: 'pubnub_subscribe',
      path: 'pubnub_subscribe',
      ok: false,
      status: 0,
      error: 'missing_subscribe_key',
      kind: 'realtime',
    });
    return { ok: false, reason: 'missing_subscribe_key' };
  }
  if (!payload || typeof payload !== 'object') return { ok: false, reason: 'invalid_payload' };
  const channelId = String(payload.channelId || '');
  const token = String(payload.token || '');
  const origin = String(payload.origin || 'clubhouse.pubnubapi.com');
  const uuid = String(payload.uuid || 'clubbox');
  if (!channelId || !token) return { ok: false, reason: 'missing_channel_or_token' };
  // Only the room's own Clubhouse channels (users.*, channel_user.*, channel_all.*, channel_speakers.*).
  const channels = Array.isArray(payload.channels)
    ? payload.channels
      .filter((name) => typeof name === 'string' && /^(users|channel_user|channel_all|channel_speakers)\.[A-Za-z0-9_.-]{1,80}$/.test(name))
      .slice(0, 6)
    : [];
  ensurePubNubClient().start({
    channelId,
    channels,
    token,
    origin,
    uuid,
    heartbeat: payload.heartbeat,
    timeToken: payload.timeToken,
  }, subscribeKey);
  logRealtimeShape({
    endpoint: 'pubnub_subscribe',
    path: 'pubnub_subscribe',
    ok: true,
    status: 200,
    kind: 'realtime',
  });
  return { ok: true, reason: 'subscribed' };
});

ipcMain.handle('clubbox:pubnub-resubscribe', async (event) => {
  if (!isTrustedSender(event)) return { ok: false };
  ensurePubNubClient().resubscribe();
  return { ok: true };
});

ipcMain.handle('clubbox:pubnub-unsubscribe', async (event) => {
  if (!isTrustedSender(event)) return { ok: false };
  ensurePubNubClient().stop();
  return { ok: true };
});

ipcMain.handle('ch:request', async (event, payload) => {
  if (!isTrustedSender(event)) {
    return { ok: false, status: 0, body: 'Unauthorized frame' };
  }
  const endpoint = String(payload?.endpoint || '').replace(/^\//, '');
  if (!/^[a-z0-9_]+$/i.test(endpoint) || !isAllowedEndpoint(endpoint)) {
    return { ok: false, status: 0, body: 'Endpoint is not allowed' };
  }
  if (!isPlainPayload(payload?.body, 0)) {
    return { ok: false, status: 0, body: 'Invalid payload' };
  }

  const headers = pickHeaders(payload?.headers);
  const webSession = headers['X-Clubbox-Web-Session'] === '1';
  delete headers['X-Clubbox-Web-Session'];

  if (WEB_AUTH_ENDPOINTS[endpoint]) {
    return {
      ok: false,
      status: 0,
      body: JSON.stringify({
        error_message: 'Sign in on the official Clubhouse page. Clubbox does not submit the verification itself.',
      }),
    };
  }

  if (webSession) {
    try {
      return await postWithWebSession(endpoint, payload?.body);
    } catch (err) {
      return { ok: false, status: 0, body: err instanceof Error ? err.message : 'Network error' };
    }
  }

  return {
    ok: false,
    status: 0,
    body: JSON.stringify({ error_message: 'Token sign-in is not supported. Use web sign-in.' }),
  };
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  console.error('[Electron] Clubbox is already running. Close that window, then start again.');
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (argv.includes('--api-recorder')) {
      startRecorderIfAllowed(argv);
      return;
    }
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  const savedShortcuts = readShortcutFile();
  if (savedShortcuts) applyGlobalShortcuts(savedShortcuts);
  armWebSessionCookieWatch();
  createWindow();
  startRecorderIfAllowed(process.argv);
  // Returning signed-in users never reopen /signin — still need PubNub/Agora keys in userData.
  scheduleBundleCrawl();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
