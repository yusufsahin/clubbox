const { app, BrowserWindow, dialog, session, ipcMain, globalShortcut, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { isAllowedEndpoint, isPlainPayload, pickHeaders } = require('./ipcGuard.cjs');

const REQUEST_TIMEOUT_MS = 20000;
const DEV_SERVER_ORIGIN = 'http://localhost:5173';

const CH_WEB_APP_VERSION = '22.2.0';
const RECAPTCHA_SITE_KEY_FALLBACK = '6Lf8IJcsAAAAAHr6Puq4KiD0A7jnz0ndgJUihuN2';

app.setName('Clubbox');
if (process.platform === 'win32') {
  app.setAppUserModelId('app.clubbox.desktop');
}

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

function startRecorderIfAllowed(argv) {
  if (!recorderRequested(argv)) return;
  const { startApiRecorder } = require('./apiRecorder.cjs');
  startApiRecorder({ onWindow: watchRecorderWindow });
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

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[Electron] Failed to load URL:', validatedURL, errorCode, errorDescription);
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppDocumentUrl(url)) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isClubhouseHttps(url)) {
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

const WEB_AUTH_ENDPOINTS = {
  start_phone_number_web_auth: '/web_api/start_phone_number_web_auth',
  complete_phone_number_web_auth: '/web_api/complete_phone_number_web_auth',
  resend_phone_number_auth: '/web_api/resend_phone_number_auth',
};

// Shared with src/api/client.ts. Chat methods stay as configured until a capture
// in docs/api/web-api.md confirms them. get_channel and unfollow are omitted, so
// web sign-in shows that live updates are unavailable instead of failing silently.
const WEB_SESSION_PATHS = require('./webApiRoutes.json');

let authPage = null;
let authPageReady = null;

function authPageWindow() {
  if (authPage && !authPage.isDestroyed()) return authPage;
  authPage = new BrowserWindow({
    show: false,
    width: 480,
    height: 720,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });
  authPage.webContents.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  );
  authPage.on('closed', () => {
    authPage = null;
    authPageReady = null;
  });
  authPageReady = authPage.loadURL('https://www.clubhouse.com/signin');
  return authPage;
}

async function recaptchaSiteKey(win) {
  try {
    const fromPage = await win.webContents.executeJavaScript(`(() => {
      const script = document.querySelector('script[src*="recaptcha"]');
      if (!script || !script.src) return '';
      try { return new URL(script.src).searchParams.get('render') || ''; }
      catch { return ''; }
    })()`, true);
    if (typeof fromPage === 'string' && fromPage) return fromPage;
  } catch {
    // The sign-in page can still use the known site key.
  }
  return RECAPTCHA_SITE_KEY_FALLBACK;
}

async function postClubhouseWebAuth(endpoint, body) {
  const win = authPageWindow();
  await authPageReady;
  const siteKey = await recaptchaSiteKey(win);
  const script = `(async () => {
    const endpoint = ${JSON.stringify(endpoint)};
    const body = ${JSON.stringify(body || {})};
    const deadline = Date.now() + 15000;
    while (!(window.grecaptcha && window.grecaptcha.execute) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!(window.grecaptcha && window.grecaptcha.execute)) {
      return { ok: false, status: 0, body: 'Clubhouse verification did not load. Try again.' };
    }
    await new Promise((resolve) => window.grecaptcha.ready(resolve));
    const token = await window.grecaptcha.execute(${JSON.stringify(siteKey)}, { action: 'auth' });
    if (!body.web_rc_token) body.web_rc_token = token;
    if (body.tokens && !body.tokens.web_rc_token) body.tokens.web_rc_token = token;
    if (body.invite_code == null) delete body.invite_code;
    const csrf = (document.cookie.match(/(?:^|; )csrftoken=([^;]*)/) || [])[1] || '';
    const paths = ${JSON.stringify(WEB_AUTH_ENDPOINTS)};
    const response = await fetch(paths[endpoint], {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'X-CSRFToken': decodeURIComponent(csrf),
        'CH-Web-AppVersion': ${JSON.stringify(CH_WEB_APP_VERSION)},
        'CH-Web-Version': ${JSON.stringify(CH_WEB_APP_VERSION)},
      },
      body: JSON.stringify(body),
    });
    return {
      ok: response.ok,
      status: response.status,
      body: await response.text(),
      csrfLength: decodeURIComponent(csrf).length,
      tokenLength: token.length,
    };
  })()`;
  const result = await win.webContents.executeJavaScript(script, true);
  try {
    const parsed = JSON.parse(result.body);
    console.log('[auth]', endpoint, result.status, parsed.success, parsed.error_message || '', 'csrf', result.csrfLength, 'token', result.tokenLength);
  } catch {
    console.log('[auth]', endpoint, result?.status);
  }
  return result;
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
  if (endpoint !== 'join_channel' && endpoint !== 'get_channels') return;
  try {
    const parsed = JSON.parse(text);
    const keys = parsed && typeof parsed === 'object' ? Object.keys(parsed) : [];
    console.log('[web]', endpoint, 'keys', keys.join(','));
    const nested = parsed && parsed.channel;
    if (nested && typeof nested === 'object') {
      console.log('[web]', endpoint, 'channel keys', Object.keys(nested).join(','));
    }
    const first = Array.isArray(parsed?.items) ? parsed.items[0] : null;
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

async function postWithWebSession(endpoint, body) {
  const route = WEB_SESSION_PATHS[endpoint];
  if (!route) {
    return {
      ok: false,
      status: 0,
      body: JSON.stringify({ error_message: 'This action is not available on the web session yet.' }),
    };
  }
  const cookies = await session.defaultSession.cookies.get({
    url: 'https://www.clubhouse.com',
    name: 'csrftoken',
  });
  const csrf = cookies[0]?.value || '';
  const method = route.method || 'POST';
  const response = await session.defaultSession.fetch(webSessionUrl(route.path, method, body), {
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
    body: method === 'GET' ? undefined : (body == null ? '{}' : JSON.stringify(body)),
  });
  const text = await response.text();
  console.log('[web]', endpoint, response.status);
  logResponseShape(endpoint, text);
  return { ok: response.ok, status: response.status, body: text };
}

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
    try {
      return await postClubhouseWebAuth(endpoint, payload?.body);
    } catch (err) {
      return { ok: false, status: 0, body: err instanceof Error ? err.message : 'Network error' };
    }
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
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (argv.includes('--api-recorder')) {
      startRecorderIfAllowed(argv);
      return;
    }
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

function setupAutoUpdate() {
  // GitHub releases only. Dev and the portable exe stay on the version that was launched.
  if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_DIR) return;
  let autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
  } catch {
    return;
  }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', () => {
    // A missing release or a private repo should not interrupt the studio.
  });
  autoUpdater.on('update-available', (info) => {
    const version = info && typeof info.version === 'string' ? info.version : '';
    dialog
      .showMessageBox({
        type: 'info',
        buttons: ['Download', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Clubbox update',
        message: version ? `Version ${version} is available.` : 'An update is available.',
      })
      .then((result) => {
        if (result.response === 0) autoUpdater.downloadUpdate().catch(() => {});
      })
      .catch(() => {});
  });
  autoUpdater.on('update-downloaded', (info) => {
    const version = info && typeof info.version === 'string' ? info.version : '';
    dialog
      .showMessageBox({
        type: 'info',
        buttons: ['Restart', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Clubbox update',
        message: version ? `Version ${version} is ready to install.` : 'The update is ready to install.',
      })
      .then((result) => {
        if (result.response === 0) autoUpdater.quitAndInstall();
      })
      .catch(() => {});
  });
  autoUpdater.checkForUpdates().catch(() => {});
}

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  const savedShortcuts = readShortcutFile();
  if (savedShortcuts) applyGlobalShortcuts(savedShortcuts);
  createWindow();
  setupAutoUpdate();
  startRecorderIfAllowed(process.argv);

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
