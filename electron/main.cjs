const {
  app,
  BrowserWindow,
  session,
  ipcMain,
  globalShortcut,
  shell,
  Notification,
  nativeTheme,
  systemPreferences,
  powerMonitor,
  dialog,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const { isAllowedEndpoint, isPlainPayload, pickHeaders } = require('./ipcGuard.cjs');
const { appendApiLog } = require('./apiLog.cjs');
const { runStartupTriage } = require('./apiTriage.cjs');
const { createBundleCrawler } = require('./bundleCrawler.cjs');
const { createPubNubClient } = require('./pubnubClient.cjs');
const { writeLastRoom, clearLastRoom, peekStaleRoom } = require('./lastRoom.cjs');
const {
  isAllowedMobileEndpoint,
  mobileAuthHeadersFromCookies,
  callMobileApi,
  httpsPostJson,
  MOBILE_API_BASE,
} = require('./mobileApi.cjs');
const {
  probeMobileReadOnly,
  probeMobileMutation,
  MUTATION_CONFIRM,
  MUTATION_PROBE_ORDER,
} = require('./mobileProbe.cjs');
const { stripTrunkZeroFromAuthBody } = require('./mobileTokenProbe.cjs');
const { purgeRetiredMobileAuth } = require('./mobileAuthStore.cjs');

const REQUEST_TIMEOUT_MS = 20000;
const DEV_SERVER_ORIGIN = 'http://localhost:5173';

const CH_WEB_APP_VERSION = '22.2.0';
/** Same browser UA as the API recorder — Electron's default UA often gets 403 from Clubhouse web_api. */
// Use the real Chromium major so the UA agrees with Sec-CH-UA / navigator.userAgentData;
// reCAPTCHA on the SMS step scores mismatched client hints as a bot.
const PAGE_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${String(process.versions.chrome || '131').split('.')[0]}.0.0.0 Safari/537.36`;

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
// Optional Chromium net log for voice/DNS diagnosis (see docs/history/agora-voice-dns-fix.md).
if (process.env.CLUBBOX_NETLOG === '1') {
  try {
    app.commandLine.appendSwitch('enable-logging');
    app.commandLine.appendSwitch(
      'log-file',
      path.join(app.getPath('userData'), 'chromium-net.log'),
    );
  } catch {
    // ignore
  }
}

let mainWindow = null;
/** Dev A/B window: clubhouse.com room with Agora WS shape logging (Phase 23.3). */
let agoraAbWindow = null;

/** One-shot cleanup of abandoned Agora edge-map / net-log experiments. */
function purgeAbandonedAgoraDnsArtifacts() {
  const dir = app.getPath('userData');
  const names = ['agora-edge-maps.json'];
  // Keep the file when the operator explicitly asked for a net log this run.
  if (process.env.CLUBBOX_NETLOG !== '1') names.push('chromium-net.log');
  for (const name of names) {
    try {
      fs.unlinkSync(path.join(dir, name));
    } catch {
      // missing or locked — fine
    }
  }
}

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

/** Google / reCAPTCHA hosts the SMS step may open (iframes + rare full navigations). */
function isSignInAuxHttps(target) {
  let url;
  try {
    url = new URL(target);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return host === 'google.com' || host.endsWith('.google.com')
    || host === 'gstatic.com' || host.endsWith('.gstatic.com')
    || host === 'recaptcha.net' || host.endsWith('.recaptcha.net')
    || host === 'google.com.tr' || host.endsWith('.google.com.tr');
}

function isSignInAllowedHttps(target) {
  return isClubhouseHttps(target) || isSignInAuxHttps(target);
}

/**
 * User-clicked https links (room chat, profile social, Clubhouse pages).
 * Opened via shell.openExternal — https only, no credentials in the URL.
 */
function isAllowedExternalHttps(target) {
  let url;
  try {
    url = new URL(target);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  return Boolean(url.hostname);
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

  const allowMediaFor = (webContents) => {
    const mainId = mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents.id : -1;
    const abId = agoraAbWindow && !agoraAbWindow.isDestroyed() ? agoraAbWindow.webContents.id : -1;
    return !!(webContents && (
      webContents.id === mainId
      || webContents.id === recorderWebContentsId
      || webContents.id === abId
    ));
  };
  // Chromium asks both check + request for getUserMedia. Request-only leaves mic denied.
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media' || permission === 'microphone' || permission === 'audioCapture') {
      return allowMediaFor(webContents);
    }
    return false;
  });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (
      (permission === 'media' || permission === 'microphone' || permission === 'audioCapture')
      && allowMediaFor(webContents)
    ) {
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

  // Surface Agora / audio diagnostics in the desktop terminal (renderer console).
  mainWindow.webContents.on('console-message', (event) => {
    const text = String(event?.message || '');
    if (!/\[AgoraRTC\]|\[Clubbox\]/i.test(text)) return;
    const line = `[renderer] ${text}`;
    if (Number(event?.level) >= 2) console.warn(line);
    else console.log(line);
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

  // Phase 25.1: leave Agora and Clubhouse before the window tears down (3 s cap).
  mainWindow.on('close', (event) => {
    if (agoraLifecycleDone) return;
    event.preventDefault();
    quitInProgress = true;
    void requestRendererAgoraLifecycle('close').finally(() => {
      void mainLeaveIfStillInRoom().finally(() => {
        agoraLifecycleDone = true;
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
      });
    });
  });

  mainWindow.webContents.on('render-process-gone', () => {
    void mainLeaveIfStillInRoom();
  });
  mainWindow.webContents.on('unresponsive', () => {
    if (!quitInProgress) return;
    void mainLeaveIfStillInRoom();
  });

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

ipcMain.handle('clubbox:has-web-session', async (event) => {
  if (!isTrustedSender(event)) return { ok: false, hasSession: false };
  const hasSession = await hasClubhouseSessionCookie();
  return { ok: true, hasSession, authReady: signInAuthReady };
});

ipcMain.handle('clubbox:open-signin', async (event, bounds) => {
  if (!isTrustedSender(event)) return { ok: false };
  return showEmbeddedSignIn(normalizeBounds(bounds));
});

ipcMain.handle('clubbox:embedded-signin-show', async (event, bounds) => {
  if (!isTrustedSender(event)) return { ok: false };
  return showEmbeddedSignIn(normalizeBounds(bounds));
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

let signInWindow = null;
let signInAuthReady = false;
let lastSignInNotice = '';
let signInOpenInFlight = false;
let bundleCrawlInFlight = null;
let bundleCrawlAttempt = 0;
let pubnubClient = null;
let lastCookieLogSig = '';

function normalizeBounds(bounds) {
  const x = Math.max(0, Math.round(Number(bounds?.x) || 0));
  const y = Math.max(0, Math.round(Number(bounds?.y) || 0));
  const width = Math.max(120, Math.round(Number(bounds?.width) || 480));
  const height = Math.max(160, Math.round(Number(bounds?.height) || 640));
  return { x, y, width, height };
}

function markSignInAuthReady(reason) {
  if (signInAuthReady) {
    notifyWebSessionMaybe(`ready:${reason}:${Date.now()}`, { force: true });
    return;
  }
  signInAuthReady = true;
  console.log('[web] auth ready:', reason);
  notifySignInProgress('ready');
  notifyWebSessionMaybe(`ready:${reason}:${Date.now()}`, { force: true });
}

function hideEmbeddedSignIn() {
  signInOpenInFlight = false;
  if (signInWindow && !signInWindow.isDestroyed()) {
    try {
      signInWindow.close();
    } catch {
      // ignore
    }
  }
  signInWindow = null;
  signInAuthReady = false;
  lastSignInNotice = '';
}

function setEmbeddedSignInBounds() {
  // Sign-in uses a dedicated BrowserWindow (not BrowserView bounds).
}

function notifySignInProgress(step) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('clubbox:signin-progress', { step });
}

function focusSignInWindow() {
  if (!signInWindow || signInWindow.isDestroyed()) return;
  try {
    if (signInWindow.isMinimized()) signInWindow.restore();
    signInWindow.show();
    signInWindow.focus();
  } catch {
    // ignore
  }
}

async function showEmbeddedSignIn() {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false, reason: 'no-main' };
  try {
    session.defaultSession.setUserAgent(PAGE_UA);
  } catch {
    // ignore
  }
  // Reloading /signin while a *working* session exists can wipe it (me → 403).
  // Only skip the window when we already adopted successfully (web-session-ok).
  // A leftover sessionid without adopt leaves the user stuck if we skip forever.
  try {
    const hasCookie = await hasClubhouseSessionCookie();
    const adopted = fs.existsSync(path.join(app.getPath('userData'), 'web-session-ok'));
    if (hasCookie && adopted) {
      console.log('[web] skip sign-in window — session already adopted');
      markSignInAuthReady('existing-session');
      notifyWebSessionMaybe('existing-session', { force: true });
      return { ok: true, reused: true, existingSession: true };
    }
  } catch {
    // fall through and open the window
  }
  if (signInWindow && !signInWindow.isDestroyed()) {
    focusSignInWindow();
    return { ok: true, reused: true };
  }
  if (signInOpenInFlight) {
    return { ok: true, reused: true, pending: true };
  }
  signInOpenInFlight = true;
  lastSignInNotice = '';
  signInAuthReady = false;
  // Independent BrowserWindow (no parent) — same shape as the API recorder.
  // A parented/narrow window hit WidgetHost errors and never reached complete_phone.
  // Concurrent showEmbeddedSignIn calls must not create a second window (render races).
  signInWindow = new BrowserWindow({
    show: true,
    width: 1100,
    height: 860,
    modal: false,
    title: 'Clubhouse',
    autoHideMenuBar: true,
    webPreferences: {
      session: session.defaultSession,
      preload: path.join(__dirname, 'signinPreload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  signInWindow.webContents.setUserAgent(PAGE_UA);
  signInWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSignInAllowedHttps(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          parent: undefined,
          autoHideMenuBar: true,
          webPreferences: {
            session: session.defaultSession,
            preload: path.join(__dirname, 'signinPreload.cjs'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false,
          },
        },
      };
    }
    return { action: 'deny' };
  });
  signInWindow.webContents.on('did-create-window', (child) => {
    try {
      child.webContents.setUserAgent(PAGE_UA);
    } catch {
      // ignore
    }
  });
  signInWindow.webContents.on('will-navigate', (event, url) => {
    if (!isSignInAllowedHttps(url)) event.preventDefault();
  });
  signInWindow.webContents.on('console-message', (event) => {
    const text = String(event?.message || '').slice(0, 240);
    const lvl = Number(event?.level);
    if (lvl < 2) return; // warn + error only
    if (/grecaptcha|recaptcha|otp|auth|phone|credential|NotSupported/i.test(text)) {
      const src = event?.sourceId;
      const ln = event?.line;
      console.warn('[web] signin console:', text, src ? `${src}:${ln}` : '');
    }
  });
  signInWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    console.warn('[web] signin fail-load', errorCode, errorDescription, String(validatedURL || '').slice(0, 120));
  });
  const notice = (_event, url) => {
    maybeNotifyWebSession(url);
    try {
      const pathName = new URL(url).pathname.toLowerCase();
      if (pathName && pathName !== '/signin' && !pathName.startsWith('/signin/') && pathName !== '/login' && !pathName.startsWith('/login/')) {
        markSignInAuthReady(`navigate:${pathName}`);
      }
    } catch {
      // ignore
    }
  };
  signInWindow.webContents.on('did-navigate', notice);
  signInWindow.webContents.on('did-redirect-navigation', notice);
  signInWindow.webContents.on('did-navigate-in-page', notice);
  // Do not inject scripts into the sign-in page (fetch/XHR patches, focus() on
  // inputs, synthetic clicks) — they broke the OTP auto-submit, so
  // complete_phone was never sent. Network logging below is passive.
  signInWindow.webContents.on('did-finish-load', () => {
    void extractAgoraAppIdFromSignIn(signInWindow);
    const url = signInWindow.webContents.getURL();
    if (url && !/\/signin|\/login/i.test(url)) {
      markSignInAuthReady('load-off-signin');
    }
  });
  signInWindow.on('closed', () => {
    signInWindow = null;
    signInOpenInFlight = false;
    lastSignInNotice = '';
  });
  armSignInNetworkWatch();
  attachSignInAuthDebugger(signInWindow);
  console.log('[web] sign-in window open (independent)');
  focusSignInWindow();
  notifySignInProgress('phone');
  void signInWindow.webContents.loadURL('https://www.clubhouse.com/signin', {
    userAgent: PAGE_UA,
    httpReferrer: 'https://www.clubhouse.com/',
  }).finally(() => {
    signInOpenInFlight = false;
  });
  return { ok: true, reused: false };
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

/** PubNub subscribe URLs carry the room auth token — reject non-PubNub hosts. */
function isAllowedPubNubOrigin(origin) {
  const host = String(origin || '')
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .split(':')[0]
    .toLowerCase();
  return /^(?:[a-z0-9-]+\.)*(?:pubnubapi|pubnub)\.com$/.test(host);
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
      // Do not write web-session-ok here — crawl works without cookies; me success owns that flag.
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
      // Phase 30.2 — names only; renderer marks bundle evidence + one-time toast.
      if (Array.isArray(result.watchlistHits) && result.watchlistHits.length > 0) {
        mainWindow.webContents.send('clubbox:moderation-web-discovered', {
          endpoints: result.watchlistHits,
          buildId: result.buildId || null,
        });
      }
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
let signInNetworkWatchArmed = false;
function armWebSessionCookieWatch() {
  if (cookieWatchArmed) return;
  cookieWatchArmed = true;
  session.defaultSession.cookies.on('changed', (_event, cookie, _cause, removed) => {
    if (removed || !cookie || !signInWindow) return;
    const domain = String(cookie.domain || '').toLowerCase();
    if (!domain.includes('clubhouse.com')) return;
    const name = String(cookie.name || '');
    console.log('[web] cookie set:', name);
    if (cookieLooksLikeSession(name)) {
      markSignInAuthReady(`cookie:${name}`);
    }
    if (cookieNotifyTimer) clearTimeout(cookieNotifyTimer);
    cookieNotifyTimer = setTimeout(() => {
      cookieNotifyTimer = null;
      if (signInAuthReady) {
        notifyWebSessionMaybe(`cookie:${cookie.name}:${Date.now()}`, { force: true });
      }
    }, 500);
  });
}

function probeSignInDom(reason) {
  if (!signInWindow || signInWindow.isDestroyed()) return;
  void signInWindow.webContents.executeJavaScript(`
    (() => {
      const inputs = Array.from(document.querySelectorAll('input')).map((el) => ({
        type: el.type || '',
        inputMode: el.inputMode || '',
        name: el.name || '',
        maxLength: el.maxLength || 0,
        disabled: !!el.disabled,
        autocomplete: el.autocomplete || '',
      }));
      const buttons = Array.from(document.querySelectorAll('button')).map((el) => ({
        text: (el.innerText || '').trim().slice(0, 40),
        disabled: !!el.disabled,
      }));
      const bodyText = (document.body && document.body.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 240);
      return {
        href: location.href,
        title: document.title || '',
        inputs,
        buttons: buttons.slice(0, 12),
        bodyText,
      };
    })()
  `).then((snap) => {
    console.log('[web] signin dom', reason, JSON.stringify(snap));
  }).catch((err) => {
    console.warn('[web] signin dom probe failed', reason, err instanceof Error ? err.message : err);
  });
}

const SIGNIN_AUTH_URL = /web_api\/(start|resend|complete|call)_phone/i;

/**
 * Shape of an auth request/response for the log. Phone numbers keep only the
 * dial-code prefix, codes/tokens only their length — never the values.
 */
function summarizeAuthPayload(data, depth = 0) {
  if (data == null || typeof data !== 'object') return data === undefined ? null : typeof data;
  if (Array.isArray(data)) return `array:${data.length}`;
  const out = {};
  for (const [key, value] of Object.entries(data).slice(0, 32)) {
    if (value === null || typeof value === 'boolean' || typeof value === 'number') {
      out[key] = value;
    } else if (typeof value === 'string') {
      if (/phone/i.test(key)) {
        // TR mobiles are +90 + 10 digits; a typed trunk "0" (+9005…) silently gets no SMS.
        const digits = value.replace(/\D/g, '');
        const national = digits.startsWith('90') ? digits.slice(2) : '';
        out[key] = `${value.slice(0, 3)}…(chars:${value.length} digits:${digits.length}${national.startsWith('0') ? ' LEADING-0' : ''}${/\s|-/.test(value) ? ' has-space' : ''})`;
      }
      else if (/code|token|csrf|session|secret|key|auth|email/i.test(key)) out[key] = `[str:${value.length}]`;
      else out[key] = value.slice(0, 160);
    } else if (typeof value === 'object' && depth < 2) {
      out[key] = summarizeAuthPayload(value, depth + 1);
    } else {
      out[key] = typeof value;
    }
  }
  return out;
}

function parseAuthBody(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    try {
      return Object.fromEntries(new URLSearchParams(text));
    } catch {
      return { raw: `[text:${text.length}]` };
    }
  }
}

/** Read start/resend/complete phone bodies via CDP — rewrite TR +900… so SMS can arrive. */
function attachSignInAuthDebugger(win) {
  const dbg = win?.webContents?.debugger;
  if (!dbg) return;
  try {
    dbg.attach('1.3');
  } catch (err) {
    console.warn('[web] auth debugger attach failed', err instanceof Error ? err.message : err);
    return;
  }
  const tracked = new Map();
  dbg.on('message', (_event, method, params) => {
    if (method === 'Network.requestWillBeSent') {
      const url = String(params?.request?.url || '');
      if (!SIGNIN_AUTH_URL.test(url)) return;
      const endpoint = url.replace(/^https:\/\/[^/]+/, '').split('?')[0];
      tracked.set(params.requestId, endpoint);
      const post = params.request.postData;
      if (post) {
        console.log('[web] auth req', endpoint, JSON.stringify(summarizeAuthPayload(parseAuthBody(post))));
      } else if (params.request.hasPostData) {
        dbg.sendCommand('Network.getRequestPostData', { requestId: params.requestId })
          .then((r) => console.log('[web] auth req', endpoint, JSON.stringify(summarizeAuthPayload(parseAuthBody(r?.postData)))))
          .catch(() => {});
      }
      return;
    }
    if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
      const endpoint = tracked.get(params?.requestId);
      if (!endpoint) return;
      tracked.delete(params.requestId);
      if (method === 'Network.loadingFailed') {
        console.warn('[web] auth resp failed', endpoint, params?.errorText || '');
        return;
      }
      dbg.sendCommand('Network.getResponseBody', { requestId: params.requestId })
        .then((r) => {
          const text = r?.base64Encoded ? Buffer.from(r.body || '', 'base64').toString('utf8') : r?.body;
          console.log('[web] auth resp', endpoint, JSON.stringify(summarizeAuthPayload(parseAuthBody(text))));
        })
        .catch((err) => console.warn('[web] auth resp body unavailable', endpoint, err instanceof Error ? err.message : err));
    }
  });
  dbg.on('message', (_event, method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    const requestId = params?.requestId;
    const passThrough = () => dbg.sendCommand('Fetch.continueRequest', { requestId }).catch(() => {});
    // Fetch.requestPaused often omits postData; pull it via Network when needed so
    // TR trunk-zero (+900…) is not forwarded (HTTP 200 but SMS never arrives).
    void (async () => {
      try {
        let post = params?.request?.postData;
        if (!post && params?.networkId) {
          try {
            const r = await dbg.sendCommand('Network.getRequestPostData', { requestId: params.networkId });
            post = r?.postData;
          } catch {
            /* body unavailable — pass through */
          }
        }
        if (!post && params?.request?.hasPostData && params?.requestId) {
          try {
            const r = await dbg.sendCommand('Network.getRequestPostData', { requestId: params.networkId || params.requestId });
            post = r?.postData;
          } catch {
            /* ignore */
          }
        }
        const fixed = stripTrunkZeroFromAuthBody(post);
        if (!fixed) {
          passThrough();
          return;
        }
        console.log('[web] phone_number: TR trunk-zero stripped (+900… → +905…; SMS never arrives for +900)');
        await dbg.sendCommand('Fetch.continueRequest', {
          requestId,
          postData: Buffer.from(fixed, 'utf8').toString('base64'),
        });
      } catch {
        passThrough();
      }
    })();
  });
  dbg.sendCommand('Network.enable').catch((err) => {
    console.warn('[web] auth debugger Network.enable failed', err instanceof Error ? err.message : err);
  });
  dbg.sendCommand('Fetch.enable', {
    patterns: [
      { urlPattern: '*://*clubhouse.com/web_api/*phone_number*', requestStage: 'Request' },
      { urlPattern: '*://www.clubhouse.com/web_api/*phone*', requestStage: 'Request' },
    ],
  }).catch((err) => {
    console.warn('[web] auth debugger Fetch.enable failed', err instanceof Error ? err.message : err);
  });
  win.on('closed', () => {
    try { dbg.detach(); } catch { /* ignore */ }
  });
}

function armSignInNetworkWatch() {
  if (signInNetworkWatchArmed) return;
  signInNetworkWatchArmed = true;
  session.defaultSession.webRequest.onCompleted(
    { urls: ['https://www.clubhouse.com/*', 'https://clubhouse.com/*'] },
    (details) => {
      if (!signInWindow) return;
      const type = String(details.resourceType || '');
      if (type !== 'xhr' && type !== 'fetch') return;
      const path = String(details.url || '').replace(/^https:\/\/www\.clubhouse\.com/, '');
      // Skip noisy analytics.
      if (/google-analytics|\/collect|_ga|stripe/i.test(path)) return;
      console.log('[web] xhr', details.method, path.slice(0, 120), details.statusCode);
      if (/complete_phone|verify|confirm_otp|check_waitlist|web_api\/me|start_phone|resend_phone/i.test(path)) {
        if (details.statusCode >= 400) {
          console.warn('[web] auth xhr failed', details.statusCode, path.slice(0, 120));
        }
        if (/start_phone/i.test(path) && details.statusCode >= 200 && details.statusCode < 400) {
          // HTTP 200 does NOT guarantee an SMS was sent (no account / wrong country).
          console.log('[web] phone step OK (HTTP', details.statusCode, ') — SMS only if this number already has a Clubhouse account; check +90 then Click to resend');
          notifySignInProgress('otp');
          setTimeout(() => probeSignInDom('after-start-phone'), 800);
        }
        if (/resend_phone/i.test(path) && details.statusCode >= 200 && details.statusCode < 400) {
          console.log('[web] resend OK (HTTP', details.statusCode, ') — still no SMS ⇒ wrong country or no Clubhouse account on that number');
          notifySignInProgress('otp');
          setTimeout(() => probeSignInDom('after-resend'), 800);
        }
        if (/complete_phone|verify|confirm_otp/i.test(path)) {
          setTimeout(() => probeSignInDom(`after-${path.split('/').pop()}`), 400);
        }
      }
      if (details.statusCode >= 200 && details.statusCode < 400) {
        if (/complete_phone|verify|confirm_otp|check_waitlist|web_api\/me/i.test(path) && !/start_phone|resend_phone/i.test(path)) {
          // /me 200 means the SPA itself is authenticated.
          if (/web_api\/me/i.test(path) && details.statusCode === 200) {
            markSignInAuthReady('spa-me-200');
          } else if (/complete_phone|verify|confirm_otp/i.test(path)) {
            markSignInAuthReady(`xhr:${path.split('?')[0]}`);
          }
        }
      }
    },
  );
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

/**
 * Phase 27.0 step 0b + Phase 28.0 (dev only, CLUBBOX_PROBE_MOBILE=1):
 * Auth check on me; room read-only body discovery when channel is known.
 * Never log cookie/csrf values. Mutations: clubbox:mobile-probe-mutate + typed confirm.
 */
let mobileAuthProbeDone = false;
let mobileRoomProbeChannel = null;

async function probeMobileApiWithWebSession(sess, meText) {
  if (mobileAuthProbeDone) return;
  mobileAuthProbeDone = true;
  let userId = null;
  try {
    const me = JSON.parse(meText);
    userId = me?.user_profile?.user_id ?? me?.user_id ?? null;
  } catch {
    // keep null
  }
  const cookies = await listClubhouseCookies(sess);
  const cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  const fullHeaders = mobileAuthHeadersFromCookies(cookies, { userAgent: PAGE_UA });
  const variants = {
    cookie: {
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      'CH-Languages': 'en-US',
      'CH-Locale': 'en_US',
      'User-Agent': PAGE_UA,
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    'cookie+csrf': fullHeaders,
  };
  const calls = [
    ['get_profile', { user_id: userId }],
    ['get_channels', {}],
  ];
  console.log('[mobile-probe] start userId', userId != null ? 'yes' : 'no', 'cookies', cookies.map((c) => c.name).join(','));
  for (const [name, headers] of Object.entries(variants)) {
    for (const [endpoint, body] of calls) {
      try {
        const response = await sess.fetch(`${MOBILE_API_BASE}/${endpoint}`, {
          method: 'POST',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          headers,
          body: JSON.stringify(body),
        });
        const raw = await response.text();
        let shape;
        try {
          const json = JSON.parse(raw);
          shape = `keys=${Object.keys(json).join(',')}${json.detail ? ` detail=${json.detail}` : ''}`;
        } catch {
          shape = `non-json ${raw.slice(0, 60).replace(/\s+/g, ' ')}`;
        }
        console.log('[mobile-probe]', name, endpoint, response.status, shape);
      } catch (err) {
        console.log('[mobile-probe]', name, endpoint, 'error', err instanceof Error ? err.message : String(err));
      }
    }
  }
}

async function probeMobileRoomReadOnly(sess, channel) {
  if (process.env.CLUBBOX_PROBE_MOBILE !== '1') return;
  if (!channel || mobileRoomProbeChannel === channel) return;
  mobileRoomProbeChannel = channel;
  const cookies = await listClubhouseCookies(sess);
  console.log('[mobile-probe] room read-only channel', channel, 'cookieNames', cookies.map((c) => c.name).join(','));
  await probeMobileReadOnly({
    fetchFn: (url, init) => sess.fetch(url, init),
    cookies,
    userAgent: PAGE_UA,
    timeoutMs: REQUEST_TIMEOUT_MS,
    channel,
  });
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
  if (signInWindow && !signInWindow.isDestroyed()) {
    return signInWindow.webContents.session;
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

function cookieLooksLikeSession(name) {
  const n = String(name || '');
  if (/csrf/i.test(n)) return false;
  if (/^(__stripe|_ga|_gid|_gat|__cf|_fbp|_gcl)/i.test(n)) return false;
  return /sessionid|^session$|auth|jwt|refresh|sid|logged/i.test(n);
}

async function hasClubhouseSessionCookie(sess = session.defaultSession) {
  const cookies = await listClubhouseCookies(sess);
  return cookies.some((cookie) => cookieLooksLikeSession(cookie.name));
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
  if (!signInWindow || signInWindow.isDestroyed()) return null;
  try {
    return await signInWindow.webContents.executeJavaScript(`
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
            'User-Agent': ${JSON.stringify(PAGE_UA)},
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
  const hasSession = allCookies.some((cookie) => cookieLooksLikeSession(cookie.name));
  // Never call /me until we have a real session cookie or an auth-ready signal.
  if (endpoint === 'me' && !hasSession && !signInAuthReady) {
    return {
      ok: false,
      status: 0,
      body: JSON.stringify({ error_message: 'waiting_for_signin' }),
    };
  }
  const csrf = allCookies.find((cookie) => cookie.name === 'csrftoken')?.value || '';
  // Throttle: every web_api call used to dump this line (floods the console).
  const cookieSig = `${allCookies.map((cookie) => cookie.name).join(',')}|${csrf ? 1 : 0}|${signInAuthReady ? 1 : 0}|${hasSession ? 1 : 0}`;
  if (cookieSig !== lastCookieLogSig) {
    lastCookieLogSig = cookieSig;
    console.log(
      '[web] session cookies',
      allCookies.map((cookie) => cookie.name).join(',') || '(none)',
      'csrf',
      csrf ? 'yes' : 'no',
      'authReady',
      signInAuthReady,
      'hasSession',
      hasSession,
    );
  }
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

  // Prefer an in-page fetch while the sign-in window is open — it sends
  // HttpOnly cookies the same way the Clubhouse SPA does.
  if (endpoint === 'me' && signInWindow && !signInWindow.isDestroyed() && signInAuthReady) {
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
        'User-Agent': PAGE_UA,
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

  if (!ok && (status === 403 || status === 401)) {
    const snippet = String(text || '').replace(/\s+/g, ' ').slice(0, 160);
    console.log('[web]', endpoint, 'error body:', snippet || '(empty)');
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
    void recoverStaleRoom();
    if (process.env.CLUBBOX_PROBE_MOBILE === '1') void probeMobileApiWithWebSession(sess, text);
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

function microphoneAccessStatus() {
  try {
    if (typeof systemPreferences.getMediaAccessStatus === 'function') {
      return systemPreferences.getMediaAccessStatus('microphone');
    }
  } catch {
    // older Electron
  }
  return 'unknown';
}

ipcMain.handle('clubbox:mic-access-status', async (event) => {
  if (!isTrustedSender(event)) return { ok: false };
  const status = microphoneAccessStatus();
  return { ok: true, status };
});

ipcMain.handle('clubbox:open-mic-settings', async (event) => {
  if (!isTrustedSender(event)) return { ok: false };
  try {
    if (process.platform === 'win32') {
      await shell.openExternal('ms-settings:privacy-microphone');
    } else if (process.platform === 'darwin') {
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
    } else {
      return { ok: false, reason: 'unsupported' };
    }
    return { ok: true };
  } catch (err) {
    console.warn('[Clubbox] open mic settings failed:', err instanceof Error ? err.message : err);
    return { ok: false };
  }
});

/**
 * Phase 23.3 — open the current room on clubhouse.com in a separate window
 * (same defaultSession cookies) and log Agora WebSocket join shapes via CDP.
 */
function summarizeAgoraWsPayload(raw) {
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return { kind: 'non-json', len: String(raw || '').length };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { kind: typeof parsed };
  }
  const obj = parsed;
  const keys = Object.keys(obj).slice(0, 40);
  const out = { keys };
  const appid = obj.appid ?? obj.appId ?? obj.AppId;
  if (typeof appid === 'string') {
    out.appidPrefix = appid.slice(0, 4);
    out.appidLen = appid.length;
  }
  const cname = obj.cname ?? obj.channel ?? obj.ChannelName;
  if (typeof cname === 'string') out.cnameLen = cname.length;
  const uid = obj.uid ?? obj.UID ?? obj.userId;
  if (uid != null) {
    out.uidType = typeof uid;
    out.uidDigits = String(uid).replace(/\D/g, '').length;
  }
  const token = obj.token ?? obj.key ?? obj.Token;
  if (typeof token === 'string') out.tokenLen = token.length;
  if (obj.sdkVersion != null || obj.sdk_version != null) {
    out.sdkVersion = String(obj.sdkVersion ?? obj.sdk_version).slice(0, 24);
  }
  if (obj.role != null || obj.clientRole != null) {
    out.role = String(obj.role ?? obj.clientRole).slice(0, 24);
  }
  if (obj.success != null) out.success = Boolean(obj.success);
  if (obj.code != null || obj.error != null || obj.reason != null) {
    out.resultCode = String(obj.code ?? obj.error ?? obj.reason).slice(0, 48);
  }
  return out;
}

function isAgoraWsUrl(url) {
  try {
    const u = new URL(String(url || ''));
    const host = u.hostname.toLowerCase();
    return host.endsWith('.agora.io') || host.endsWith('.sd-rtn.com') || host === 'agora.io' || host === 'sd-rtn.com';
  } catch {
    return false;
  }
}

function attachAgoraAbDebugger(win) {
  const dbg = win?.webContents?.debugger;
  if (!dbg) return;
  try {
    dbg.attach('1.3');
  } catch (err) {
    console.warn('[agora-ab] debugger attach failed', err instanceof Error ? err.message : err);
    return;
  }
  const agoraSockets = new Set();
  dbg.on('message', (_event, method, params) => {
    if (method === 'Network.webSocketCreated') {
      const url = String(params?.url || '');
      if (!isAgoraWsUrl(url)) return;
      agoraSockets.add(params.requestId);
      try {
        const u = new URL(url);
        console.log('[agora-ab] ws created', u.hostname, u.port || (u.protocol === 'wss:' ? '443' : ''));
      } catch {
        console.log('[agora-ab] ws created host=?');
      }
      return;
    }
    if (method === 'Network.webSocketFrameSent' || method === 'Network.webSocketFrameReceived') {
      if (!agoraSockets.has(params?.requestId)) return;
      const payload = params?.response?.payloadData ?? params?.payloadData;
      if (payload == null) return;
      const dir = method.endsWith('Sent') ? 'sent' : 'recv';
      const summary = summarizeAgoraWsPayload(payload);
      // Only log frames that look like join / result (avoid flooding).
      const keys = summary.keys || [];
      const interesting = summary.appidLen || summary.cnameLen || summary.tokenLen
        || summary.success != null || summary.resultCode
        || keys.some((k) => /cname|uid|token|appid|role|success|code/i.test(String(k)));
      if (!interesting) return;
      console.log(`[agora-ab] ws ${dir}`, JSON.stringify(summary));
    }
  });
  dbg.sendCommand('Network.enable').catch((err) => {
    console.warn('[agora-ab] Network.enable failed', err instanceof Error ? err.message : err);
  });
  win.on('closed', () => {
    try { dbg.detach(); } catch { /* ignore */ }
  });
}

async function openAgoraAbRoomWindow(channel) {
  const name = String(channel || '').trim();
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(name)) {
    return { ok: false, reason: 'bad-channel' };
  }
  const target = `https://www.clubhouse.com/room/${encodeURIComponent(name)}`;
  if (!isClubhouseHttps(target)) return { ok: false, reason: 'bad-url' };

  if (agoraAbWindow && !agoraAbWindow.isDestroyed()) {
    try {
      agoraAbWindow.focus();
      await agoraAbWindow.loadURL(target, { userAgent: PAGE_UA });
      return { ok: true, reused: true };
    } catch (err) {
      console.warn('[agora-ab] reload failed', err instanceof Error ? err.message : err);
    }
  }

  agoraAbWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: undefined,
    },
  });
  agoraAbWindow.webContents.setUserAgent(PAGE_UA);
  agoraAbWindow.webContents.on('will-navigate', (event, url) => {
    if (!isClubhouseHttps(url) && !isSignInAuxHttps(url)) {
      event.preventDefault();
    }
  });
  agoraAbWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isClubhouseHttps(url) || isSignInAuxHttps(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
        },
      };
    }
    return { action: 'deny' };
  });
  agoraAbWindow.on('closed', () => {
    agoraAbWindow = null;
  });
  attachAgoraAbDebugger(agoraAbWindow);
  try {
    await agoraAbWindow.loadURL(target, { userAgent: PAGE_UA });
  } catch (err) {
    console.warn('[agora-ab] load failed', err instanceof Error ? err.message : err);
    return { ok: false, reason: 'load-failed' };
  }
  console.log('[agora-ab] opened room window channelLen=', name.length);
  return { ok: true };
}

ipcMain.handle('clubbox:open-agora-ab-room', async (event, payload) => {
  if (!isTrustedSender(event)) return { ok: false, reason: 'unauthorized' };
  const channel = payload && typeof payload === 'object' ? payload.channel : payload;
  return openAgoraAbRoomWindow(channel);
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
  if (!isAllowedPubNubOrigin(origin)) return { ok: false, reason: 'invalid_origin' };
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

/**
 * Mobile host moderation is app-only (owner 2026-10-12). Token/SMS path removed.
 * IPC stays so the renderer never hits an unknown channel; never posts to the mobile host.
 */
ipcMain.handle('clubbox:mobile-call', async (event, payload) => {
  if (!isTrustedSender(event)) {
    return { ok: false, status: 0, body: 'Unauthorized frame' };
  }
  const endpoint = String(payload?.endpoint || '').replace(/^\//, '');
  if (!isAllowedMobileEndpoint(endpoint)) {
    return { ok: false, status: 0, body: 'Endpoint is not allowed' };
  }
  if (!isPlainPayload(payload?.body, 0)) {
    return { ok: false, status: 0, body: 'Invalid payload' };
  }
  void payload;
  return {
    ok: false,
    status: 403,
    body: JSON.stringify({ error_message: 'Use the Clubhouse app to moderate' }),
    appOnly: true,
  };
});

/** Phase 28.0 — DevTools: await electronAPI.mobileProbeReadOnly() while in a room. */
ipcMain.handle('clubbox:mobile-probe-readonly', async (event, payload) => {
  if (process.env.CLUBBOX_PROBE_MOBILE !== '1') {
    return { ok: false, reason: 'Set CLUBBOX_PROBE_MOBILE=1' };
  }
  if (!isTrustedSender(event)) return { ok: false, reason: 'unauthorized' };
  const channel = typeof payload?.channel === 'string' && payload.channel
    ? payload.channel
    : currentRoomChannel;
  if (!channel || !ROOM_CHANNEL_ID.test(channel)) {
    return { ok: false, reason: 'no room channel' };
  }
  const sess = authSession();
  const cookies = await listClubhouseCookies(sess);
  mobileRoomProbeChannel = null;
  const results = await probeMobileReadOnly({
    fetchFn: (url, init) => sess.fetch(url, init),
    cookies,
    userAgent: PAGE_UA,
    timeoutMs: REQUEST_TIMEOUT_MS,
    channel,
  });
  mobileRoomProbeChannel = channel;
  return { ok: true, channel, results };
});

/**
 * Phase 28.0 mutations — DevTools only, typed confirm required:
 * await electronAPI.mobileProbeMutate({ endpoint, confirm: 'I_CONFIRM_THROWAY_ROOM', channel?, link?, userId? })
 */
ipcMain.handle('clubbox:mobile-probe-mutate', async (event, payload) => {
  if (process.env.CLUBBOX_PROBE_MOBILE !== '1') {
    return { ok: false, reason: 'Set CLUBBOX_PROBE_MOBILE=1' };
  }
  if (!isTrustedSender(event)) return { ok: false, reason: 'unauthorized' };
  const channel = typeof payload?.channel === 'string' && payload.channel
    ? payload.channel
    : currentRoomChannel;
  if (!channel || !ROOM_CHANNEL_ID.test(channel)) {
    return { ok: false, reason: 'no room channel' };
  }
  const sess = authSession();
  const cookies = await listClubhouseCookies(sess);
  const out = await probeMobileMutation({
    fetchFn: (url, init) => sess.fetch(url, init),
    cookies,
    userAgent: PAGE_UA,
    timeoutMs: REQUEST_TIMEOUT_MS,
    channel,
    endpoint: String(payload?.endpoint || ''),
    confirm: String(payload?.confirm || ''),
    link: typeof payload?.link === 'string' ? payload.link : undefined,
    userId: typeof payload?.userId === 'number' ? payload.userId : undefined,
  });
  if (out.refused) return { ok: false, reason: out.reason, confirmHint: MUTATION_CONFIRM };
  return { ok: true, channel, endpoint: payload?.endpoint, results: out.results };
});

/**
 * Phase 28.0 — CLI can poke the already-running Clubbox (live session cookies) via
 * second-instance argv. Never logs Cookie / CSRF values. Writes reports/mobile-probe-28.json.
 *
 *   electron . --clubbox-mobile-probe=readonly --channel=abc
 *   electron . --clubbox-mobile-probe=mutate --mutate=all --confirm=I_CONFIRM_THROWAY_ROOM --channel=abc
 */
async function runCliMobileProbeFromArgv(argv) {
  const probeFlag = argv.find((a) => a === '--clubbox-mobile-probe' || a.startsWith('--clubbox-mobile-probe='));
  if (!probeFlag) return false;
  const mode = probeFlag.includes('=') ? probeFlag.split('=').slice(1).join('=') : 'readonly';
  const channelArg = argv.find((a) => a.startsWith('--channel='));
  const channel = channelArg
    ? channelArg.slice('--channel='.length)
    : (currentRoomChannel || '');
  const confirmArg = argv.find((a) => a.startsWith('--confirm='));
  const confirm = confirmArg ? confirmArg.slice('--confirm='.length) : '';
  const mutateArg = argv.find((a) => a.startsWith('--mutate='));
  const mutate = mutateArg ? mutateArg.slice('--mutate='.length) : (mode.startsWith('mutate:') ? mode.slice(7) : '');
  const userIdArg = argv.find((a) => a.startsWith('--userId='));
  const userId = userIdArg && /^\d+$/.test(userIdArg.slice('--userId='.length))
    ? Number(userIdArg.slice('--userId='.length))
    : null;
  if (!channel || !ROOM_CHANNEL_ID.test(channel)) {
    console.error('[mobile-probe] no valid --channel= (or current room)');
    return true;
  }
  const sess = authSession();
  const cookies = await listClubhouseCookies(sess);
  const sessionLen = String(cookies.find((c) => c.name === 'sessionid')?.value || '').length;
  const csrfLen = String(cookies.find((c) => c.name === 'csrftoken')?.value || '').length;
  console.log(
    '[mobile-probe] cli via running app channel',
    channel,
    'cookieNames',
    cookies.map((c) => c.name).join(','),
    'sessionidLen',
    sessionLen,
    'csrfLen',
    csrfLen,
  );
  // Mirror clubhouse.com session onto the API host so Chromium can attach cookies
  // without relying on the forbidden Cookie header (Fetch spec).
  for (const cookie of cookies) {
    if (!cookie?.name || !cookie.value) continue;
    try {
      await sess.cookies.set({
        url: 'https://www.clubhouseapi.com/',
        name: cookie.name,
        value: cookie.value,
        path: '/',
        secure: true,
        httpOnly: !!cookie.httpOnly,
        sameSite: 'no_restriction',
      });
    } catch {
      /* ignore per-cookie mirror failures */
    }
  }
  const fetchNoAbort = async (url, init) => {
    const next = { ...init };
    delete next.signal;
    // Prefer headers without Cookie — browser sends mirrored api-host cookies.
    if (next.headers && typeof next.headers === 'object') {
      const h = { ...next.headers };
      delete h.Cookie;
      next.headers = h;
    }
    return sess.fetch(url, next);
  };
  const report = {
    channel,
    confirmRequired: MUTATION_CONFIRM,
    readOnly: [],
    mutations: {},
    authCanary: [],
    cookieNames: cookies.map((c) => c.name),
    sessionidLen: sessionLen,
    csrfLen,
    userData: app.getPath('userData'),
    via: 'second-instance',
  };
  // Auth canary + read-only discovery via Node https only (Cookie header kept).
  // Chromium session.fetch strips Cookie and is unreliable for clubhouseapi.com.
  {
    const headers = mobileAuthHeadersFromCookies(cookies, { userAgent: PAGE_UA });
    const httpsFetch = async (url, init) => {
      const result = await httpsPostJson(
        url,
        init.headers || headers,
        typeof init.body === 'string' ? init.body : JSON.stringify(init.body || {}),
        REQUEST_TIMEOUT_MS,
      );
      return {
        ok: result.ok,
        status: result.status,
        text: async () => result.body,
      };
    };
    let meUserId = null;
    try {
      const meRes = await sess.fetch('https://www.clubhouse.com/web_api/me', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=utf-8',
          'User-Agent': PAGE_UA,
        },
        body: '{}',
      });
      const meText = await meRes.text();
      const meJson = JSON.parse(meText);
      meUserId = meJson?.user_profile?.user_id ?? meJson?.user_id ?? null;
    } catch {
      /* ignore */
    }
    for (const [endpoint, body] of [
      ['get_profile', meUserId != null ? { user_id: meUserId } : {}],
      ['get_channels', {}],
      ['get_channel', { channel }],
      ['get_handraise_queue', { channel }],
      ['get_suggested_speakers', { channel }],
      ['check_channel_link', { channel, link: 'https://example.com/clubbox-probe' }],
      ['get_moderator_action_history', { channel }],
      // Phase 27 host tools — incomplete bodies only (auth class: 400 = session ok, 401 = Token-only).
      ['mute_speaker', { channel }],
      ['invite_speaker', { channel }],
      ['uninvite_speaker', { channel }],
      ['make_moderator', { channel }],
      ['block_from_channel', { channel }],
      ['end_channel', { channel }],
      ['change_handraise_settings', { channel }],
    ]) {
      try {
        const result = await httpsPostJson(
          `${MOBILE_API_BASE}/${endpoint}`,
          headers,
          JSON.stringify(body),
          REQUEST_TIMEOUT_MS,
        );
        let shape = `status=${result.status}`;
        try {
          const json = JSON.parse(result.body);
          shape += ` keys=${Object.keys(json).join(',')}`;
          if (json.detail) shape += ` detail=${String(json.detail).slice(0, 120)}`;
          if (json.error_message) shape += ` error_message=${String(json.error_message).slice(0, 160)}`;
          if (endpoint === 'get_channel' && Array.isArray(json.users) && json.users[0]) {
            shape += ` users[0].keys=${Object.keys(json.users[0]).join(',')}`;
          }
        } catch {
          shape += ` non-json`;
        }
        console.log('[mobile-probe] auth-canary https', endpoint, shape);
        report.authCanary.push({ endpoint, transport: 'https', status: result.status, shape });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log('[mobile-probe] auth-canary https', endpoint, 'error', msg.slice(0, 80));
        report.authCanary.push({ endpoint, transport: 'https', status: 0, shape: msg.slice(0, 80) });
      }
    }
    report.readOnly = await probeMobileReadOnly({
      fetchFn: httpsFetch,
      cookies,
      userAgent: PAGE_UA,
      timeoutMs: REQUEST_TIMEOUT_MS,
      channel,
    });
  }
  if (mode === 'mutate' || mode.startsWith('mutate') || mutate) {
    if (confirm !== MUTATION_CONFIRM) {
      console.log('[mobile-probe] mutations skipped — pass --confirm=' + MUTATION_CONFIRM);
    } else {
      const endpoints = mutate === 'all' || !mutate ? [...MUTATION_PROBE_ORDER] : [mutate];
      for (const endpoint of endpoints) {
        report.mutations[endpoint] = await probeMobileMutation({
          fetchFn: fetchNoAbort,
          cookies,
          userAgent: PAGE_UA,
          timeoutMs: REQUEST_TIMEOUT_MS,
          channel,
          endpoint,
          confirm,
          link: 'https://example.com/clubbox-probe',
          userId: endpoint === 'uninvite_speaker' ? userId : undefined,
        });
      }
    }
  }
  const outDir = path.join(__dirname, '..', 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  // Same payload for 28.x / 29.0 discovery (read-only list includes Phase 29 endpoints).
  const outPath28 = path.join(outDir, 'mobile-probe-28.json');
  const outPath29 = path.join(outDir, 'mobile-probe-29.json');
  const payload = `${JSON.stringify(report, null, 2)}\n`;
  fs.writeFileSync(outPath28, payload);
  fs.writeFileSync(outPath29, payload);
  fs.writeFileSync(path.join(outDir, 'mobile-probe-28.done'), `${Date.now()}\n`);
  fs.writeFileSync(path.join(outDir, 'mobile-probe-29.done'), `${Date.now()}\n`);
  console.log('[mobile-probe] wrote', outPath29);
  return true;
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  console.error('[Electron] Clubbox is already running. Close that window, then start again.');
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (argv.some((a) => a === '--clubbox-mobile-probe' || String(a).startsWith('--clubbox-mobile-probe='))) {
      void runCliMobileProbeFromArgv(argv);
      return;
    }
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

/** Phase 25.1: ask renderer to leave (3 s cap) before quit/close/suspend. */
let agoraLifecycleDone = false;
let quitInProgress = false;
let currentRoomChannel = null;
let rendererReportedLeft = false;
let mainLeaveSent = false;
let staleRoomRecoveryStarted = false;

function requestRendererAgoraLifecycle(reason) {
  return new Promise((resolve) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      resolve({ ok: false, reason: 'no_window' });
      return;
    }
    const timer = setTimeout(() => {
      ipcMain.removeListener('clubbox:agora-lifecycle-done', onDone);
      resolve({ ok: false, reason: 'timeout' });
    }, 3000);
    function onDone(_event, payload) {
      clearTimeout(timer);
      resolve(payload && typeof payload === 'object' ? payload : { ok: true });
    }
    ipcMain.once('clubbox:agora-lifecycle-done', onDone);
    try {
      mainWindow.webContents.send('clubbox:agora-lifecycle', { reason: String(reason || '') });
    } catch {
      clearTimeout(timer);
      ipcMain.removeListener('clubbox:agora-lifecycle-done', onDone);
      resolve({ ok: false, reason: 'send_failed' });
    }
  });
}

const ROOM_CHANNEL_ID = /^[A-Za-z0-9_-]{1,80}$/;

ipcMain.on('clubbox:room-presence', (event, payload) => {
  if (!isTrustedSender(event)) return;
  if (!payload || typeof payload !== 'object') return;
  if (payload.left === true) {
    currentRoomChannel = null;
    rendererReportedLeft = true;
    try {
      clearLastRoom(app.getPath('userData'));
    } catch {
      console.warn('[Clubbox] last-room clear failed');
    }
    return;
  }
  const channel = typeof payload.channel === 'string' ? payload.channel : '';
  if (!ROOM_CHANNEL_ID.test(channel)) return;
  currentRoomChannel = channel;
  rendererReportedLeft = false;
  try {
    writeLastRoom(app.getPath('userData'), channel);
  } catch {
    console.warn('[Clubbox] last-room write failed');
  }
  if (process.env.CLUBBOX_PROBE_MOBILE === '1') {
    void probeMobileRoomReadOnly(authSession(), channel);
  }
});

async function mainLeaveIfStillInRoom() {
  if (rendererReportedLeft || mainLeaveSent) return;
  const channel = currentRoomChannel;
  if (!channel) return;
  mainLeaveSent = true;
  try {
    await postWithWebSession('leave_channel', { channel });
  } catch {
    console.warn('[Clubbox] main leave_channel failed');
  }
  currentRoomChannel = null;
  rendererReportedLeft = true;
  try {
    clearLastRoom(app.getPath('userData'));
  } catch {
    // The startup stale-leave reads the file again if this delete fails.
  }
}

function recoverStaleRoom() {
  if (staleRoomRecoveryStarted) return;
  staleRoomRecoveryStarted = true;
  const userData = app.getPath('userData');
  let plan;
  try {
    plan = peekStaleRoom(userData);
  } catch {
    return;
  }
  if (!plan || plan.action === 'none') return;
  if (plan.action === 'drop') {
    try { clearLastRoom(userData); } catch { /* ignore */ }
    return;
  }
  if (currentRoomChannel) return;
  void postWithWebSession('leave_channel', { channel: plan.channel })
    .then(() => {
      console.log('[Clubbox] stale room leave sent');
    })
    .catch(() => {
      console.warn('[Clubbox] stale room leave failed');
    })
    .finally(() => {
      if (currentRoomChannel) return;
      try { clearLastRoom(userData); } catch { /* ignore */ }
    });
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  try {
    process.on(signal, () => {
      try {
        app.quit();
      } catch {
        // app may already be quitting
      }
    });
  } catch {
    // This platform does not support the signal.
  }
}

app.on('before-quit', (event) => {
  if (agoraLifecycleDone) return;
  event.preventDefault();
  quitInProgress = true;
  void requestRendererAgoraLifecycle('quit').finally(() => {
    void mainLeaveIfStillInRoom().finally(() => {
      agoraLifecycleDone = true;
      app.quit();
    });
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  purgeRetiredMobileAuth(app.getPath('userData'));
  purgeAbandonedAgoraDnsArtifacts();
  console.log('[Clubbox] microphone OS access:', microphoneAccessStatus());
  const savedShortcuts = readShortcutFile();
  if (savedShortcuts) applyGlobalShortcuts(savedShortcuts);
  armWebSessionCookieWatch();
  createWindow();
  startRecorderIfAllowed(process.argv);
  // Returning signed-in users never reopen /signin — still need PubNub/Agora keys in userData.
  scheduleBundleCrawl();

  try {
    powerMonitor.on('suspend', () => {
      void requestRendererAgoraLifecycle('suspend');
    });
    powerMonitor.on('resume', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      try {
        mainWindow.webContents.send('clubbox:agora-lifecycle', { reason: 'resume' });
      } catch {
        // ignore
      }
    });
  } catch (err) {
    console.warn('[Clubbox] powerMonitor unavailable:', err);
  }

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
