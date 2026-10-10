const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tokenCaptureWindow = null;

function headerValue(headers, name) {
  const target = name.toLowerCase();
  for (const key of Object.keys(headers || {})) {
    if (key.toLowerCase() === target) return headers[key];
  }
  return '';
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1040,
    minHeight: 680,
    title: 'Clubdeck Next-Gen | Clubhouse Desktop Studio',
    backgroundColor: '#080a0f',
    frame: true,
    autoHideMenuBar: true,
    center: true,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
    },
  });

  // Auto-grant microphone & media permissions in desktop app
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      return callback(true);
    }
    callback(false);
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error('[Electron] Failed to load URL:', validatedURL, errorCode, errorDescription);
  });

  const distPath = path.join(__dirname, '../dist/index.html');
  const devUrl = 'http://localhost:5173';

  if (fs.existsSync(distPath)) {
    console.log('[Electron] Loading dist file:', distPath);
    mainWindow.loadFile(distPath).catch(() => {
      mainWindow.loadURL(devUrl);
    });
  } else {
    console.log('[Electron] Loading dev server:', devUrl);
    mainWindow.loadURL(devUrl);
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

// In-app Clubhouse Web Login Helper to capture tokens automatically
function openTokenCaptureWindow() {
  if (tokenCaptureWindow && !tokenCaptureWindow.isDestroyed()) {
    tokenCaptureWindow.focus();
    return;
  }

  const loginWindow = new BrowserWindow({
    width: 620,
    height: 780,
    title: 'Clubhouse Web Login (Auto-capture Token)',
    parent: mainWindow || undefined,
    modal: true,
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  tokenCaptureWindow = loginWindow;

  const filter = { urls: ['https://*.clubhouseapi.com/*', 'https://*.clubhouse.com/*'] };
  const captureSession = loginWindow.webContents.session;
  let finished = false;
  let token = '';
  let userId = null;
  let tokenWait = null;

  const detach = () => {
    if (tokenWait) {
      clearTimeout(tokenWait);
      tokenWait = null;
    }
    try {
      captureSession.webRequest.onSendHeaders(filter, null);
    } catch {
      // Listener was already removed.
    }
  };

  const finish = () => {
    if (finished || !token) return;
    finished = true;
    detach();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('clubhouse-token-captured', { token, userId });
    }
    if (!loginWindow.isDestroyed()) {
      loginWindow.close();
    }
  };

  const scheduleFinish = () => {
    if (finished || !token) return;
    if (userId != null) {
      finish();
      return;
    }
    if (tokenWait) clearTimeout(tokenWait);
    tokenWait = setTimeout(finish, 1200);
  };

  captureSession.webRequest.onSendHeaders(filter, (details) => {
    if (finished) return;
    const authHeader = headerValue(details.requestHeaders, 'authorization');
    const userHeader = headerValue(details.requestHeaders, 'ch-userid');
    if (authHeader && /^Token\s+/i.test(authHeader)) {
      token = authHeader.replace(/^Token\s+/i, '').trim();
    }
    if (userHeader && /^\d+$/.test(String(userHeader).trim())) {
      userId = Number(String(userHeader).trim());
    }
    scheduleFinish();
  });

  loginWindow.on('closed', () => {
    detach();
    if (tokenCaptureWindow === loginWindow) {
      tokenCaptureWindow = null;
    }
  });

  try {
    const dbg = loginWindow.webContents.debugger;
    dbg.attach('1.3');
    dbg.on('message', async (_event, method, params) => {
      if (finished || method !== 'Network.responseReceived') return;
      const url = String(params?.response?.url || '');
      if (!url.includes('complete_phone_number')) return;
      try {
        const result = await dbg.sendCommand('Network.getResponseBody', { requestId: params.requestId });
        const data = JSON.parse(result.body);
        const captured = data?.auth_token || data?.access_token;
        const capturedUser = data?.user_profile?.user_id;
        if (typeof captured === 'string' && captured) token = captured;
        if (typeof capturedUser === 'number') userId = capturedUser;
        scheduleFinish();
      } catch {
        // The response body was not JSON, or the request had already finished.
      }
    });
    void dbg.sendCommand('Network.enable');
  } catch (err) {
    console.error('[Electron] Could not watch the sign-in response:', err instanceof Error ? err.message : err);
  }

  loginWindow.loadURL('https://www.clubhouse.com/signin');
}

ipcMain.on('open-token-capture', () => {
  openTokenCaptureWindow();
});

const WEB_AUTH_ENDPOINTS = {
  start_phone_number_web_auth: '/web_api/start_phone_number_web_auth',
  complete_phone_number_web_auth: '/web_api/complete_phone_number_web_auth',
  resend_phone_number_auth: '/web_api/resend_phone_number_auth',
};

const WEB_SESSION_PATHS = {
  me: '/web_api/me',
  get_channels: '/web_api/get_feed_v3',
  get_channel: '/web_api/get_channel',
  join_channel: '/web_api/join_channel',
  leave_channel: '/web_api/leave_channel',
  active_ping: '/web_api/active_ping',
  create_channel: '/web_api/create_channel',
  get_profile: '/web_api/get_profile',
  follow: '/web_api/follow',
  unfollow: '/web_api/unfollow',
  search_users: '/web_api/search',
  accept_speaker_invite: '/web_api/become_speaker',
};

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

async function postClubhouseWebAuth(endpoint, body) {
  const win = authPageWindow();
  await authPageReady;
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
    const token = await window.grecaptcha.execute('6Lf8IJcsAAAAAHr6Puq4KiD0A7jnz0ndgJUihuN2', { action: 'auth' });
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
        'CH-Web-AppVersion': '22.2.0',
        'CH-Web-Version': '22.2.0',
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

async function postWithWebSession(endpoint, body) {
  const pathName = WEB_SESSION_PATHS[endpoint];
  if (!pathName) {
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
  const response = await session.defaultSession.fetch(`https://www.clubhouse.com${pathName}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      'X-CSRFToken': csrf,
      'CH-Web-AppVersion': '22.2.0',
      'CH-Web-Version': '22.2.0',
      Origin: 'https://www.clubhouse.com',
      Referer: 'https://www.clubhouse.com/home',
    },
    body: body == null ? '{}' : JSON.stringify(body),
  });
  const text = await response.text();
  console.log('[web]', endpoint, response.status);
  return { ok: response.ok, status: response.status, body: text };
}

ipcMain.handle('ch:request', async (_event, payload) => {
  const endpoint = String(payload?.endpoint || '').replace(/^\//, '');
  if (!/^[a-z0-9_]+$/i.test(endpoint)) {
    return { ok: false, status: 0, body: 'Invalid endpoint' };
  }

  const headers = {};
  const incoming = payload?.headers && typeof payload.headers === 'object' ? payload.headers : {};
  for (const [key, value] of Object.entries(incoming)) {
    if (typeof value === 'string') headers[key] = value;
  }
  const webSession = headers['X-Clubdeck-Web-Session'] === '1';
  delete headers['X-Clubdeck-Web-Session'];

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

  try {
    const response = await fetch(`https://www.clubhouseapi.com/api/${endpoint}`, {
      method: 'POST',
      headers,
      body: payload?.body == null ? undefined : JSON.stringify(payload.body),
    });
    const body = await response.text();
    return { ok: response.ok, status: response.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: err instanceof Error ? err.message : 'Network error' };
  }
});

app.whenReady().then(() => {
  createWindow();

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
