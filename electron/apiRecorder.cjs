/**
 * Dev-only window that records clubhouse.com /web_api traffic while the user
 * clicks around themselves. Redacts every record before it is written.
 * Never logs tokens, cookies, phone numbers, or message bodies.
 */
const { BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { createRedactor, outputHasLeak } = require('./redact.cjs');

const PAGE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const CHECKLIST = [
  { id: 'home', label: 'Open home feed', test: (ctx) => ctx.path.includes('feed') },
  { id: 'topic', label: 'Switch topic chip', test: (ctx) => ctx.path.includes('feed') && ctx.topicChanged },
  { id: 'search-open', label: 'Open search', test: (ctx) => ctx.path.includes('search') },
  { id: 'search-user', label: 'Search a user', test: (ctx) => ctx.path.includes('search') && ctx.hasSearchTerm },
  { id: 'house', label: 'Open a house page', test: (ctx) => /social_club|get_club|\/house|get_house/.test(ctx.path) && !/chat|message/.test(ctx.path) },
  { id: 'profile', label: 'Open a profile', test: (ctx) => ctx.path.includes('get_profile') || ctx.path.endsWith('/profile') },
  { id: 'follow', label: 'Follow', test: (ctx) => ctx.path.includes('/follow') && !ctx.path.includes('unfollow') },
  { id: 'unfollow', label: 'Unfollow', test: (ctx) => ctx.path.includes('unfollow') },
  { id: 'preview', label: 'Preview or unmute a room from the hallway', test: (ctx) => /preview|unmute|listen_channel/.test(ctx.path) },
  { id: 'join', label: 'Join a room', test: (ctx) => ctx.path.includes('join_channel') },
  { id: 'leave', label: 'Leave a room', test: (ctx) => ctx.path.includes('leave_channel') },
  { id: 'raise', label: 'Raise hand', test: (ctx) => ctx.hand === true || /raise_hand|hand_raise/.test(ctx.path) && ctx.hand !== false },
  { id: 'lower', label: 'Lower hand', test: (ctx) => ctx.hand === false || /unraise|lower_hand/.test(ctx.path) },
  { id: 'invite', label: 'Invite a listener', test: (ctx) => ctx.path.includes('invite') && !ctx.path.includes('uninvite') },
  { id: 'mute', label: 'Mute a speaker', test: (ctx) => ctx.path.includes('mute') },
  { id: 'moderator', label: 'Make moderator', test: (ctx) => ctx.path.includes('moderator') },
  { id: 'audience', label: 'Move to audience', test: (ctx) => /uninvite|become_audience|move_to_audience|remove_speaker/.test(ctx.path) },
  { id: 'accept', label: 'Accept a speaker invite', test: (ctx) => /become_speaker|accept_speaker/.test(ctx.path) },
  { id: 'leave-stage', label: 'Leave stage', test: (ctx) => /become_audience|leave_stage/.test(ctx.path) },
  { id: 'read-chat', label: 'Read room messages', test: (ctx) => ctx.path.includes('get_channel_messages') || (ctx.path.includes('channel_message') && ctx.method === 'GET') },
  { id: 'send-chat', label: 'Send a room message', test: (ctx) => ctx.path.includes('send_channel_message') },
  { id: 'reaction', label: 'Send a reaction', test: (ctx) => /reaction|emoji/.test(ctx.path) },
  { id: 'create-public', label: 'Create a public room', test: (ctx) => ctx.creating && ctx.privacy === 'public' },
  { id: 'create-social', label: 'Create a social room', test: (ctx) => ctx.creating && ctx.privacy === 'social' },
  { id: 'create-closed', label: 'Create a closed room', test: (ctx) => ctx.creating && ctx.privacy === 'closed' },
  { id: 'end', label: 'End the room', test: (ctx) => /end_channel|end_room|close_channel|delete_channel/.test(ctx.path) },
  { id: 'activity', label: 'Open activity or notifications', test: (ctx) => /notification|\/activity|get_activities|actionable/.test(ctx.path) },
  { id: 'events', label: 'Open the events tab', test: (ctx) => /get_events|\/events|scheduled_event/.test(ctx.path) },
  { id: 'messages', label: 'Open messages', test: (ctx) => /get_chats|get_inbox|chat_list|\/conversations|\/messages/.test(ctx.path) },
  { id: 'dm', label: 'Open a DM', test: (ctx) => /get_conversation|conversation_messages|direct_message|get_dm/.test(ctx.path) },
  { id: 'send-text', label: 'Send a text', test: (ctx) => /send_message|send_chat|send_dm|create_message/.test(ctx.path) && !ctx.path.includes('channel_message') },
  { id: 'house-chat', label: 'Open a house chat', test: (ctx) => /house_chat|club_chat|social_club_message|social_club_chat/.test(ctx.path) },
];

let recorderWindow = null;

function startApiRecorder(hooks) {
  if (recorderWindow && !recorderWindow.isDestroyed()) {
    recorderWindow.show();
    recorderWindow.focus();
    return recorderWindow;
  }

  const redactor = createRedactor();
  const root = path.join(__dirname, '..');
  const dir = path.join(root, 'api-captures');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const capturePath = path.join(dir, `${stamp}.jsonl`);
  const stream = fs.createWriteStream(capturePath, { flags: 'a' });
  const pending = new Map();
  const sockets = new Map();
  const done = new Set();
  const seen = [];
  let lastTopic;
  let overlayQueued = false;

  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    title: 'Clubbox API recorder',
    backgroundColor: '#080a0f',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  recorderWindow = win;
  win.webContents.setUserAgent(PAGE_UA);
  hooks?.onWindow(win);

  function writeRecord(record) {
    const safe = redactor.redact(record, { preserveKeys: ['agoraAppId'] });
    const line = JSON.stringify(safe);
    if (outputHasLeak(line)) {
      console.error('[Clubbox] Dropped a capture line that failed the redaction check');
      return;
    }
    stream.write(`${line}\n`);
  }

  function rememberPath(pathname) {
    if (seen.includes(pathname)) return;
    seen.push(pathname);
    if (seen.length > 40) seen.shift();
  }

  function scheduleOverlay() {
    if (overlayQueued) return;
    overlayQueued = true;
    setTimeout(() => {
      overlayQueued = false;
      void pushOverlay();
    }, 200);
  }

  async function pushOverlay() {
    if (win.isDestroyed()) return;
    const state = {
      fileName: path.basename(capturePath),
      items: CHECKLIST.map((item) => ({ id: item.id, label: item.label, done: done.has(item.id) })),
      seen: seen.slice(-8),
    };
    const script = `(() => {
      const state = ${JSON.stringify(state)};
      let panel = document.getElementById('clubbox-api-recorder');
      if (!panel) {
        panel = document.createElement('aside');
        panel.id = 'clubbox-api-recorder';
        panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;width:320px;max-height:70vh;overflow:auto;background:#12151c;color:#f4f6fb;font:12px/1.4 Segoe UI,sans-serif;border:1px solid #2a3142;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.35);padding:12px;';
        document.documentElement.appendChild(panel);
      }
      panel.replaceChildren();
      const title = document.createElement('div');
      title.textContent = 'Clubbox API recorder';
      title.style.cssText = 'font-weight:700;font-size:13px;margin-bottom:4px;';
      const help = document.createElement('p');
      help.textContent = 'Sign in on this page yourself. Clubbox does not ask for your number or code. Captures are redacted and stay on this computer.';
      help.style.cssText = 'margin:0 0 8px;color:#b7c0d4;';
      const file = document.createElement('div');
      file.textContent = state.fileName;
      file.style.cssText = 'margin-bottom:8px;color:#8ea0c0;word-break:break-all;';
      panel.append(title, help, file);
      const doneCount = state.items.filter((item) => item.done).length;
      const summary = document.createElement('div');
      summary.textContent = doneCount + ' / ' + state.items.length + ' checklist items seen';
      summary.style.cssText = 'margin-bottom:8px;font-weight:650;';
      panel.append(summary);
      for (const item of state.items) {
        const row = document.createElement('label');
        row.style.cssText = 'display:flex;gap:8px;align-items:flex-start;margin:2px 0;color:' + (item.done ? '#34d399' : '#d5dbe8') + ';';
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.disabled = true;
        box.checked = item.done;
        const text = document.createElement('span');
        text.textContent = item.label;
        row.append(box, text);
        panel.append(row);
      }
      if (state.seen.length) {
        const heading = document.createElement('div');
        heading.textContent = 'Recent web API paths';
        heading.style.cssText = 'margin:10px 0 4px;font-weight:700;';
        panel.append(heading);
        for (const entry of state.seen) {
          const line = document.createElement('div');
          line.textContent = entry;
          line.style.cssText = 'color:#8ea0c0;word-break:break-all;';
          panel.append(line);
        }
      }
    })()`;
    try {
      await win.webContents.executeJavaScript(script);
    } catch {
      // The page may still be navigating.
    }
  }

  function noteHttp(method, url, body) {
    const pathname = url.pathname;
    rememberPath(pathname);
    const ctx = requestContext(method, pathname, url, body);
    const actions = [];
    for (const item of CHECKLIST) {
      if (!item.test(ctx)) continue;
      actions.push(item.label);
      done.add(item.id);
    }
    scheduleOverlay();
    return actions;
  }

  function requestContext(method, pathname, url, body) {
    const pathName = pathname.toLowerCase();
    const privacy = privacyOf(body);
    const topic = field(body, ['topic', 'topic_id', 'category', 'feed_topic', 'pill_id']);
    let topicChanged = false;
    if (topic != null) {
      const text = String(topic);
      topicChanged = lastTopic !== undefined && lastTopic !== text;
      lastTopic = text;
    }
    const query = {};
    for (const [key, value] of url.searchParams.entries()) query[key] = value;
    const searchTerm = field(body, ['query', 'q', 'term', 'username', 'search']);
    return {
      method: String(method || 'GET').toUpperCase(),
      path: pathName,
      topicChanged,
      hasSearchTerm: (typeof searchTerm === 'string' && searchTerm.trim().length > 0) || !!(query.q || query.query),
      hand: handOf(body),
      creating: pathName.includes('create_channel'),
      privacy,
    };
  }

  function parseBody(text) {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { raw: String(text).slice(0, 4000) };
    }
  }

  function agoraFields(body) {
    const found = {};
    walkAgora(body, '', found, 0);
    if (!found.appIdKey && !found.channelKey && !found.uidKey) return null;
    return {
      appIdKey: found.appIdKey || null,
      agoraAppId: found.agoraAppId || null,
      channelKey: found.channelKey || null,
      channel: found.channelKey ? '<redacted>' : null,
      uidKey: found.uidKey || null,
      uid: found.uidKey ? '<id>' : null,
    };
  }

  function classify(urlString) {
    let url;
    try {
      url = new URL(urlString);
    } catch {
      return null;
    }
    const host = url.hostname.toLowerCase();
    if (url.pathname.includes('/web_api/')) return { url, kind: 'web_api' };
    if (host === 'pubnub.com' || host.endsWith('.pubnub.com') || host === 'pndsn.com' || host.endsWith('.pndsn.com')) {
      return { url, kind: 'pubnub' };
    }
    if (host === 'agora.io' || host.endsWith('.agora.io') || host === 'sd-rtn.com' || host.endsWith('.sd-rtn.com')) {
      return { url, kind: 'agora' };
    }
    return null;
  }

  async function onDebug(method, params) {
    if (method === 'Network.requestWillBeSent') {
      const hit = classify(params?.request?.url || '');
      if (!hit) return;
      pending.set(params.requestId, {
        kind: hit.kind,
        url: hit.url,
        method: params.request?.method || 'GET',
        started: params.timestamp,
        body: parseBody(params.request?.postData),
      });
      return;
    }

    if (method === 'Network.responseReceived') {
      const entry = pending.get(params.requestId);
      if (!entry) return;
      entry.status = params.response?.status;
      return;
    }

    if (method === 'Network.loadingFailed') {
      pending.delete(params.requestId);
      return;
    }

    if (method === 'Network.loadingFinished') {
      const entry = pending.get(params.requestId);
      pending.delete(params.requestId);
      if (!entry) return;
      await finishHttp(params.requestId, entry, params.timestamp);
      return;
    }

    if (method === 'Network.webSocketCreated') {
      const hit = classify(params?.url || '') || { url: safeUrl(params?.url), kind: 'websocket' };
      sockets.set(params.requestId, { url: hit?.url || null, kind: hit?.kind || 'websocket' });
      if (!hit?.url) return;
      if (hit.kind === 'agora') {
        writeRecord({ type: 'websocket', event: 'created', url: `${hit.url.origin}${hit.url.pathname}` });
        return;
      }
      writeRecord({
        type: 'websocket',
        event: 'created',
        url: hit.url.origin + hit.url.pathname,
        hostKind: hit.kind,
      });
      return;
    }

    if (method === 'Network.webSocketFrameReceived' || method === 'Network.webSocketFrameSent') {
      const socket = sockets.get(params.requestId);
      if (!socket || socket.kind === 'agora') return;
      if (params.response?.opcode === 2) {
        writeRecord({
          type: 'websocket',
          event: method === 'Network.webSocketFrameSent' ? 'sent' : 'received',
          url: socket.url ? `${socket.url.origin}${socket.url.pathname}` : null,
          binary: true,
        });
        return;
      }
      const payload = params.response?.payloadData;
      if (typeof payload !== 'string' || !payload) return;
      let parsed = payload.slice(0, 8000);
      try {
        parsed = JSON.parse(payload);
      } catch {
        // Keep the truncated text and redact it as a string.
      }
      writeRecord({
        type: 'websocket',
        event: method === 'Network.webSocketFrameSent' ? 'sent' : 'received',
        url: socket.url ? `${socket.url.origin}${socket.url.pathname}` : null,
        opcode: params.response?.opcode,
        payload: parsed,
      });
    }
  }

  async function finishHttp(requestId, entry, finishedAt) {
    let response;
    try {
      const result = await win.webContents.debugger.sendCommand('Network.getResponseBody', { requestId });
      if (result?.base64Encoded) response = { binary: true };
      else response = parseBody(result?.body);
    } catch {
      response = null;
    }

    if (entry.kind === 'agora') {
      writeRecord({ type: 'agora', url: `${entry.url.origin}${entry.url.pathname}` });
      return;
    }

    const query = {};
    for (const [key, value] of entry.url.searchParams.entries()) query[key] = value;
    const actions = entry.kind === 'web_api' ? noteHttp(entry.method, entry.url, entry.body) : [];
    const record = {
      type: entry.kind === 'pubnub' ? 'pubnub' : 'http',
      method: entry.method,
      path: entry.url.pathname,
      query,
      request: entry.body,
      status: entry.status ?? null,
      response,
      timingMs: entry.started != null && finishedAt != null ? Math.round((finishedAt - entry.started) * 1000) : null,
      actions,
    };
    if (entry.url.pathname.toLowerCase().includes('join_channel') && response) {
      record.agora = agoraFields(response);
    }
    writeRecord(record);
  }

  writeRecord({ type: 'meta', startedAt: new Date().toISOString(), tool: 'clubbox-api-recorder' });
  console.log('[Clubbox] API recorder writing local captures (gitignored)');

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://www.clubhouse.com/') || url.startsWith('https://clubhouse.com/')) {
      void win.loadURL(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('did-finish-load', () => {
    scheduleOverlay();
  });
  win.webContents.on('did-navigate-in-page', () => {
    scheduleOverlay();
  });
  win.webContents.on('did-fail-load', (_event, code, description, validatedURL) => {
    let where;
    try {
      const url = new URL(validatedURL);
      where = url.origin + url.pathname;
    } catch {
      where = 'the recorder page';
    }
    console.error('[Clubbox] Recorder failed to load', where, code, description);
  });

  win.on('closed', () => {
    if (recorderWindow === win) recorderWindow = null;
    stream.end();
    try {
      if (win.webContents.debugger.isAttached()) win.webContents.debugger.detach();
    } catch {
      // The debugger was already detached.
    }
  });

  try {
    win.webContents.debugger.attach('1.3');
    win.webContents.debugger.on('message', (_event, method, params) => {
      void onDebug(method, params).catch((err) => {
        console.error('[Clubbox] Recorder event failed', err instanceof Error ? err.message : 'error');
      });
    });
    void win.webContents.debugger.sendCommand('Network.enable', { maxPostDataSize: 65536 });
  } catch (err) {
    console.error('[Clubbox] Could not attach the API recorder', err instanceof Error ? err.message : 'error');
  }

  void win.loadURL('https://www.clubhouse.com/home');
  return win;
}

function field(body, keys) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  for (const key of keys) {
    if (body[key] != null && body[key] !== '') return body[key];
  }
  return undefined;
}

function privacyOf(body) {
  const value = field(body, ['privacy', 'privacy_level', 'visibility', 'room_privacy']);
  const text = String(value ?? '').toLowerCase();
  if (text === 'public' || text === 'open') return 'public';
  if (text.includes('social')) return 'social';
  if (text.includes('private') || text.includes('closed')) return 'closed';
  return '';
}

function handOf(body) {
  const value = field(body, ['raise_hands', 'raise_hand', 'is_raised', 'hand_raised', 'raised']);
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return null;
}

function walkAgora(value, prefix, found, depth) {
  if (!value || typeof value !== 'object' || depth > 6) return;
  const entries = Array.isArray(value) ? [] : Object.entries(value);
  for (const [key, child] of entries) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (/app_id|agora_app/i.test(key) && typeof child === 'string' && /^[a-f0-9]{32}$/i.test(child) && !found.appIdKey) {
      found.appIdKey = name;
      found.agoraAppId = child;
    }
    if (/^(channel|channel_name|agora_channel)$/i.test(key) && (typeof child === 'string' || typeof child === 'number') && !found.channelKey) {
      found.channelKey = name;
    }
    if (/^(uid|agora_uid)$/i.test(key) && (typeof child === 'string' || typeof child === 'number') && !found.uidKey) {
      found.uidKey = name;
    }
    walkAgora(child, name, found, depth + 1);
  }
}

function safeUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

module.exports = { startApiRecorder };
