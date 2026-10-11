/**
 * Dev-only window that records clubhouse.com /web_api traffic while the user
 * clicks around themselves. Redacts every record before it is written.
 * Never logs tokens, cookies, phone numbers, or message bodies.
 */
const { BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { createRedactor, outputHasLeak } = require('./redact.cjs');
const {
  extractBundleEndpoints,
  extractCallSites,
  extractEndpointCalls,
  isBundleScript,
  keyShape,
  mineRealtime,
  scriptPath,
  trafficKind,
} = require('./bundleScan.cjs');

const PAGE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const CHECKLIST = [
  { id: 's1-host', group: 'S1 Host on web', label: 'Host a room with replays on and chat on', test: (ctx) => ctx.creating && ctx.replay === true && ctx.chatEnabled === true },
  { id: 's1-wait', group: 'S1 Host on web', label: 'Stay 90 seconds', test: () => false },
  { id: 's1-chat', group: 'S1 Host on web', label: 'Send one room chat message', test: (ctx) => ctx.path.includes('send_channel_message') },
  { id: 's1-title', group: 'S1 Host on web', label: 'Change the room title', test: (ctx) => ctx.path.includes('set_channel_title') },
  { id: 's1-end', group: 'S1 Host on web', label: 'End the room, or leave if there is no end button', test: (ctx) => /end_channel|leave_channel|web_listener_leave/.test(ctx.path) },
  { id: 's2-listen', group: 'S2 Listen on web', label: 'Open a public room with replays on', test: (ctx) => /join_channel|web_listener_join|guest_join/.test(ctx.path) },
  { id: 's2-wait', group: 'S2 Listen on web', label: 'Wait 60 seconds', test: () => false },
  { id: 's2-react', group: 'S2 Listen on web', label: 'Send a reaction if the page offers one', test: (ctx) => /emoji_reaction|gif_reaction/.test(ctx.path) },
  { id: 's2-leave', group: 'S2 Listen on web', label: 'Leave the room', test: (ctx) => /leave_channel|web_listener_leave|guest_leave/.test(ctx.path) },
  { id: 's3-replay', group: 'S3 Replay', label: 'Open one replay and play it for 30 seconds', test: (ctx) => /replay/.test(ctx.path) },
  { id: 'smoke-open', group: 'Room smoke test', label: 'Open a public room from the web hallway', test: (ctx) => ctx.path.includes('join_channel') },
  { id: 'smoke-listen', group: 'Room smoke test', label: 'Listen for 30 seconds', test: () => false },
  { id: 'smoke-leave', group: 'Room smoke test', label: 'Leave the room', test: (ctx) => ctx.path.includes('leave_channel') },
  { id: 'home', label: 'Open home feed', test: (ctx) => ctx.path.includes('feed') },
  { id: 'topic', label: 'Switch topic chip', test: (ctx) => ctx.path.includes('feed') && ctx.topicChanged },
  { id: 'search-open', label: 'Open search', test: (ctx) => ctx.path.includes('search') },
  { id: 'search-user', label: 'Search a user', test: (ctx) => ctx.path.includes('search') && ctx.hasSearchTerm },
  { id: 'house', label: 'Open a house page', test: (ctx) => /social_club|get_club|\/house|get_house/.test(ctx.path) && !/chat|message/.test(ctx.path) },
  { id: 'profile', label: 'Open a profile', test: (ctx) => ctx.path.includes('get_profile') || ctx.path.endsWith('/profile') },
  { id: 'followers-list', label: 'Open the followers list', test: (ctx) => /follower/.test(ctx.path) && !/request|notification/.test(ctx.path) },
  { id: 'following-list', label: 'Open the following list', test: (ctx) => /following/.test(ctx.path) && !/request/.test(ctx.path) },
  { id: 'friends-list', label: 'Open the friends list', test: (ctx) => /cofollow|mutual_follow|\/friends/.test(ctx.path) },
  { id: 'profile-counts-other', group: 'Profile lists', label: "On someone else's profile, click followers, following, friends, and mutual", test: () => false },
  { id: 'profile-counts-self', group: 'Profile lists', label: 'On your profile, click followers, following, friends, and mutual', test: () => false },
  { id: 'message-picker', group: 'Profile lists', label: 'Messages: new message, then scroll the friend picker', test: (ctx) => /suggested_invite|new_conversation|create_conversation/.test(ctx.path) },
  { id: 'invite-picker', group: 'Profile lists', label: 'In a room: share, then invite people', test: (ctx) => /invite/.test(ctx.path) && !/uninvite|speaker/.test(ctx.path) },
  { id: 'create-picker', group: 'Profile lists', label: 'Host a room as friends only or friends of friends, then open the people picker', test: (ctx) => ctx.creating && (ctx.privacy === 'friends' || ctx.privacy === 'friends-of-friends') },
  { id: 'search-add-friends', group: 'Profile lists', label: 'Search: people tab and the add-friends section', test: (ctx) => ctx.path.includes('search') && ctx.hasSearchTerm },
  { id: 'activity-requests', group: 'Profile lists', label: 'Activity: friend requests', test: (ctx) => /friend_request|follow_request|requested_follow/.test(ctx.path) },
  { id: 'house-members', group: 'Profile lists', label: 'House: members list', test: (ctx) => /member/.test(ctx.path) && /social_club|club|house/.test(ctx.path) },
  { id: 'online-friends', group: 'Profile lists', label: 'Messages: the online-friends row', test: (ctx) => /online_friend|get_online|presence/.test(ctx.path) },
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
  { id: 'create-friends', label: 'Create a friends-only room', test: (ctx) => ctx.creating && ctx.privacy === 'friends' },
  { id: 'create-fof', label: 'Create a friends-of-friends room', test: (ctx) => ctx.creating && ctx.privacy === 'friends-of-friends' },
  { id: 'create-house', label: 'Create a House room', test: (ctx) => ctx.creating && ctx.privacy === 'house' },
  { id: 'replays-on', label: 'Replays on at creation', test: (ctx) => ctx.creating && ctx.replay === true },
  { id: 'replays-off', label: 'Replays off at creation', test: (ctx) => ctx.creating && ctx.replay === false },
  { id: 'chat-off', label: 'Chat off', test: (ctx) => ctx.chatEnabled === false },
  { id: 'mute-all', label: 'Mute all speakers', test: (ctx) => /mute_all|mute_speakers|mute_everyone/.test(ctx.path) },
  { id: 'delete-chat', label: 'Delete a chat message', test: (ctx) => /delete_.*message|remove_channel_message|delete_channel_message/.test(ctx.path) },
  { id: 'mention', label: '@mention in room chat', test: (ctx) => ctx.mention },
  { id: 'hide-room', label: 'Hide a room from the hallway', test: (ctx) => /hide_channel|hide_room|dismiss_feed/.test(ctx.path) },
  { id: 'end', label: 'End the room', test: (ctx) => /end_channel|end_room|close_channel|delete_channel/.test(ctx.path) },
  { id: 'activity', label: 'Open activity or notifications', test: (ctx) => /notification|\/activity|get_activities|actionable/.test(ctx.path) },
  { id: 'events', label: 'Open the events tab', test: (ctx) => /get_events|\/events|scheduled_event/.test(ctx.path) },
  { id: 'house-rsvp', label: 'House event RSVP', test: (ctx) => /rsvp|event_rsvp/.test(ctx.path) },
  { id: 'vm-direct', label: 'VM 1:1', test: (ctx) => ctx.vm === 'direct' },
  { id: 'vm-group', label: 'VM group', test: (ctx) => ctx.vm === 'group' },
  { id: 'house-chat', label: 'House chat', test: (ctx) => /house_chat|club_chat|social_club_message|social_club_chat/.test(ctx.path) },
];

let recorderWindow = null;

function startApiRecorder(hooks) {
  const role = hooks?.role === 'host' || hooks?.role === 'listener' ? hooks.role : 'solo';
  const profile = hooks?.profile === 'b' ? 'b' : 'a';
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
  const capturePath = path.join(dir, `${stamp}-${role}${profile === 'b' ? '-b' : ''}.jsonl`);
  const stream = fs.createWriteStream(capturePath, { flags: 'a' });
  const pending = new Map();
  const finalized = new Set();
  const sockets = new Map();
  const bundlePending = new Map();
  const bundleScripts = new Map();
  const bundlePath = path.join(dir, 'bundle-endpoints.json');
  const callsitePath = path.join(dir, 'bundle-callsites.json');
  const callsiteScripts = new Map();
  try {
    const existing = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
    const scripts = Array.isArray(existing?.scripts) ? existing.scripts : [];
    for (const script of scripts) {
      if (typeof script?.path !== 'string' || !Array.isArray(script.endpoints)) continue;
      bundleScripts.set(script.path, {
        endpoints: new Set(script.endpoints.filter((name) => typeof name === 'string')),
        page: typeof script.page === 'string' ? script.page : '',
      });
    }
  } catch {
    // The first scan creates the file.
  }
  try {
    const existing = JSON.parse(fs.readFileSync(callsitePath, 'utf8'));
    const scripts = Array.isArray(existing?.scripts) ? existing.scripts : [];
    for (const script of scripts) {
      if (typeof script?.path === 'string') callsiteScripts.set(script.path, script);
    }
  } catch {
    // Call sites are filled as scripts load.
  }
  const done = new Set();
  const hinted = new Set();
  const notes = new Map();
  const seen = [];
  let lastTopic;
  let overlayQueued = false;
  let selectedId = CHECKLIST[0] ? CHECKLIST[0].id : '';
  let active = null;

  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    title: 'Clubbox API recorder',
    backgroundColor: '#080a0f',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      ...(profile === 'b' ? { partition: 'persist:clubbox-recorder-b' } : {}),
    },
  });
  recorderWindow = win;
  win.webContents.setUserAgent(PAGE_UA);
  hooks?.onWindow(win);

  function writeRecord(record) {
    record.role = role;
    if (active) {
      record.label = active.id;
      const note = notes.get(active.id);
      if (note) record.note = note;
    }
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

  function handleOverlayCommand(payload) {
    let message;
    try {
      message = JSON.parse(String(payload || ''));
    } catch {
      return;
    }
    if (!message || typeof message !== 'object') return;
    if (message.type === 'open-link' && typeof message.url === 'string') {
      let target;
      try {
        target = new URL(message.url.trim());
      } catch {
        return;
      }
      const host = target.hostname.toLowerCase();
      if (target.protocol !== 'https:' || (host !== 'www.clubhouse.com' && host !== 'clubhouse.com')) return;
      void win.loadURL(target.href);
      return;
    }
    if (message.type === 'select' && CHECKLIST.some((item) => item.id === message.id)) {
      selectedId = message.id;
    }
    if (message.type === 'note' && active && typeof message.text === 'string') {
      notes.set(active.id, message.text.slice(0, 240));
      return;
    }
    if (message.type === 'start' && !active && selectedId) {
      const item = CHECKLIST.find((entry) => entry.id === selectedId);
      if (!item) return;
      active = { id: item.id, label: item.label };
      win.setTitle(`Clubbox API recorder — ${item.label}`);
    }
    if (message.type === 'done' && active) {
      writeRecord({ type: 'action', event: 'done', label: active.id });
      done.add(active.id);
      active = null;
      win.setTitle('Clubbox API recorder');
    }
    scheduleOverlay();
  }

  async function pushOverlay() {
    if (win.isDestroyed()) return;
    const state = {
      fileName: path.basename(capturePath),
      activeId: active ? active.id : '',
      selectedId,
      note: active ? (notes.get(active.id) || '') : '',
      items: CHECKLIST.map((item) => ({
        id: item.id,
        group: item.group || 'Checklist',
        label: item.label,
        done: done.has(item.id),
        hint: hinted.has(item.id),
      })),
      seen: seen.slice(-8),
    };
    const script = `(() => {
      const state = ${JSON.stringify(state)};
      const send = (message) => {
        if (typeof window.clubboxRecorder === 'function') window.clubboxRecorder(JSON.stringify(message));
      };
      let panel = document.getElementById('clubbox-api-recorder');
      if (!panel) {
        panel = document.createElement('aside');
        panel.id = 'clubbox-api-recorder';
        panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;width:360px;max-height:80vh;overflow:auto;background:#12151c;color:#f4f6fb;font:12px/1.4 Segoe UI,sans-serif;border:1px solid #2a3142;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.35);padding:12px;';
        document.documentElement.appendChild(panel);
      }
      panel.replaceChildren();
      const title = document.createElement('div');
      title.textContent = 'Clubbox API recorder';
      title.style.cssText = 'font-weight:700;font-size:13px;margin-bottom:4px;';
      const help = document.createElement('p');
      help.textContent = 'Pick the next action, press Start, do it on this page, then press Done. A green box is only a hint.';
      help.style.cssText = 'margin:0 0 8px;color:#b7c0d4;';
      const file = document.createElement('div');
      file.textContent = state.fileName;
      file.style.cssText = 'margin-bottom:8px;color:#8ea0c0;word-break:break-all;';
      panel.append(title, help, file);
      const opener = document.createElement('form');
      opener.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;';
      const link = document.createElement('input');
      link.type = 'url';
      link.placeholder = 'https://www.clubhouse.com/...';
      link.style.cssText = 'flex:1;min-width:0;background:#0c0e14;color:#f4f6fb;border:1px solid #2a3142;border-radius:8px;padding:6px;';
      const open = document.createElement('button');
      open.type = 'submit';
      open.textContent = 'Open';
      open.style.cssText = 'border:0;border-radius:8px;background:#2a3142;color:#fff;padding:6px 8px;cursor:pointer;';
      opener.append(link, open);
      opener.addEventListener('submit', (event) => {
        event.preventDefault();
        send({ type: 'open-link', url: link.value });
      });
      panel.append(opener);
      const banner = document.createElement('div');
      const current = state.items.find((item) => item.id === state.activeId);
      banner.textContent = current ? ('Recording: ' + current.label) : 'Not recording a labeled action';
      banner.style.cssText = 'margin-bottom:8px;padding:8px;border-radius:8px;background:' + (current ? '#3b0764' : '#1c2230') + ';font-weight:700;';
      panel.append(banner);
      const action = document.createElement('button');
      action.type = 'button';
      action.textContent = state.activeId ? 'Done' : 'Start';
      action.disabled = !state.activeId && !state.selectedId;
      action.style.cssText = 'width:100%;margin-bottom:8px;padding:10px;border:0;border-radius:8px;background:#7c3aed;color:#fff;font-weight:700;cursor:pointer;';
      action.addEventListener('click', () => send({ type: state.activeId ? 'done' : 'start' }));
      panel.append(action);
      if (state.activeId) {
        const note = document.createElement('textarea');
        note.value = state.note;
        note.maxLength = 240;
        note.placeholder = 'Note, for example: room was public, I was moderator';
        note.style.cssText = 'width:100%;min-height:52px;margin-bottom:8px;box-sizing:border-box;background:#0c0e14;color:#f4f6fb;border:1px solid #2a3142;border-radius:8px;padding:6px;';
        note.addEventListener('input', () => send({ type: 'note', text: note.value }));
        panel.append(note);
      }
      let lastGroup = '';
      for (const item of state.items) {
        if (item.group !== lastGroup) {
          lastGroup = item.group;
          const heading = document.createElement('div');
          heading.textContent = item.group;
          heading.style.cssText = 'margin:10px 0 4px;font-weight:700;color:#c4b5fd;';
          panel.append(heading);
        }
        const row = document.createElement('button');
        row.type = 'button';
        const selected = item.id === state.selectedId;
        row.style.cssText = 'display:block;width:100%;text-align:left;margin:2px 0;padding:4px 6px;border-radius:6px;border:1px solid ' + (selected ? '#7c3aed' : 'transparent') + ';background:transparent;color:' + (item.done ? '#34d399' : '#d5dbe8') + ';cursor:pointer;';
        row.textContent = (item.done ? '✓ ' : '○ ') + item.label + (item.hint ? ' — looks like it matched' : '');
        row.addEventListener('click', () => send({ type: 'select', id: item.id }));
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
    const hints = [];
    for (const item of CHECKLIST) {
      let matched;
      try {
        matched = !!item.test(ctx);
      } catch {
        matched = false;
      }
      if (!matched) continue;
      hints.push(item.label);
      hinted.add(item.id);
    }
    scheduleOverlay();
    return hints;
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
      replay: boolField(body, ['is_replay_enabled', 'replay_enabled', 'replays']),
      chatEnabled: boolField(body, ['is_chat_enabled', 'chat_enabled']),
      mention: mentionOf(body),
      vm: vmKind(pathName, body),
    };
  }

  function rememberBundle(urlString, source) {
    const where = scriptPath(urlString);
    if (!where) return;
    const page = scriptPath(win.webContents.getURL()) || '/';
    const found = extractBundleEndpoints(source);
    if (found.length > 0) {
      const current = bundleScripts.get(where) || { endpoints: new Set(), page: '' };
      for (const name of found) current.endpoints.add(name);
      if (page) current.page = page;
      bundleScripts.set(where, current);
      const scripts = [...bundleScripts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([script, entry]) => ({
          path: script,
          page: entry.page,
          endpoints: [...entry.endpoints].sort(),
        }));
      fs.writeFileSync(bundlePath, JSON.stringify({ scripts }, null, 2));
    }
    const calls = extractEndpointCalls(source);
    const sites = extractCallSites(source);
    const mined = mineRealtime(source);
    if (calls.length === 0 && sites.length === 0 && !mined.appIdLiteral && !mined.pubnubOrigin && mined.createClient.length === 0) return;
    callsiteScripts.set(where, {
      path: where,
      page,
      calls,
      sites,
      realtime: {
        createClient: mined.createClient,
        appIdLiteral: mined.appIdLiteral,
        appIdEnv: mined.appIdEnv,
        pubnubOrigin: mined.pubnubOrigin,
        messageTypes: mined.messageTypes,
      },
    });
    const mergedRealtime = {
      createClient: [],
      appIdFoundIn: '',
      appIdEnv: false,
      pubnubOrigin: null,
      messageTypes: [],
    };
    for (const script of callsiteScripts.values()) {
      const realtime = script.realtime || {};
      if (Array.isArray(realtime.createClient)) mergedRealtime.createClient.push(...realtime.createClient);
      if (realtime.appIdLiteral) mergedRealtime.appIdFoundIn = script.path;
      if (realtime.appIdEnv) mergedRealtime.appIdEnv = true;
      if (realtime.pubnubOrigin) mergedRealtime.pubnubOrigin = realtime.pubnubOrigin;
      for (const kind of realtime.messageTypes || []) {
        if (!mergedRealtime.messageTypes.includes(kind)) mergedRealtime.messageTypes.push(kind);
      }
    }
    fs.writeFileSync(callsitePath, JSON.stringify({
      scripts: [...callsiteScripts.values()].sort((left, right) => left.path.localeCompare(right.path)),
      realtime: mergedRealtime,
    }, null, 2));
  }

  async function scanBundleScript(requestId, urlString) {
    try {
      const result = await win.webContents.debugger.sendCommand('Network.getResponseBody', { requestId });
      if (!result || result.base64Encoded || typeof result.body !== 'string') return;
      rememberBundle(urlString, result.body);
    } catch {
      // A script body that Chrome will not return is skipped.
    }
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
    const kind = trafficKind(urlString);
    if (!kind) return null;
    try {
      return { url: new URL(urlString), kind };
    } catch {
      return null;
    }
  }

  async function onDebug(method, params) {
    if (method === 'Runtime.bindingCalled' && params?.name === 'clubboxRecorder') {
      handleOverlayCommand(params.payload);
      return;
    }

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
      if (entry) entry.status = params.response?.status;
      const url = params.response?.url;
      if (isBundleScript(url, params.type, win.webContents.getURL())) {
        bundlePending.set(params.requestId, url);
      }
      return;
    }

    if (method === 'Network.loadingFailed') {
      if (!claimFinalize(finalized, params.requestId)) return;
      const entry = pending.get(params.requestId);
      pending.delete(params.requestId);
      if (!entry?.url) return;
      const record = buildNetworkErrorRecord(entry, params);
      if (!FAILURE_MARKS_CHECKLIST) writeRecord(record);
      return;
    }

    if (method === 'Network.loadingFinished') {
      if (!claimFinalize(finalized, params.requestId)) return;
      const scriptUrl = bundlePending.get(params.requestId);
      bundlePending.delete(params.requestId);
      const entry = pending.get(params.requestId);
      pending.delete(params.requestId);
      if (scriptUrl) await scanBundleScript(params.requestId, scriptUrl);
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
      if (!socket) return;
      const sent = method === 'Network.webSocketFrameSent';
      if (socket.kind === 'agora') {
        const payload = params.response?.payloadData;
        writeRecord({
          type: 'websocket',
          event: sent ? 'sent' : 'received',
          url: socket.url ? `${socket.url.origin}${socket.url.pathname}` : null,
          hostKind: 'agora',
          opcode: params.response?.opcode ?? null,
          bytes: typeof payload === 'string' ? payload.length : 0,
        });
        return;
      }
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
      const record = {
        type: 'websocket',
        event: sent ? 'sent' : 'received',
        url: socket.url ? `${socket.url.origin}${socket.url.pathname}` : null,
        opcode: params.response?.opcode,
      };
      if (socket.kind === 'pubnub') record.shape = keyShape(parsed);
      else record.payload = parsed;
      writeRecord(record);
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
    const hints = entry.kind === 'web_api' ? noteHttp(entry.method, entry.url, entry.body) : [];
    const record = {
      type: entry.kind === 'pubnub' ? 'pubnub' : 'http',
      method: entry.method,
      path: entry.url.pathname,
      query: entry.kind === 'pubnub' ? keyShape(query) : query,
      request: entry.kind === 'pubnub' ? keyShape(entry.body) : entry.body,
      status: entry.status ?? null,
      response: entry.kind === 'pubnub' ? keyShape(response) : response,
      timingMs: entry.started != null && finishedAt != null ? Math.round((finishedAt - entry.started) * 1000) : null,
      hints,
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

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.control || !input.shift) return;
    if (String(input.key).toLowerCase() !== 'm') return;
    event.preventDefault();
    writeRecord({ type: 'marker', at: new Date().toISOString() });
  });

  win.webContents.on('did-finish-load', () => {
    scheduleOverlay();
    if (win.webContents.debugger.isAttached()) {
      void win.webContents.debugger.sendCommand('Network.enable', { maxPostDataSize: 65536 });
    }
  });
  win.webContents.on('did-navigate-in-page', () => {
    scheduleOverlay();
  });
  win.webContents.on('did-fail-load', (_event, code, description, validatedURL) => {
    let where;
    try {
      const url = new URL(validatedURL);
      where = url.origin + (url.pathname.startsWith('/@') ? '/@profile' : url.pathname);
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
    void win.webContents.debugger.sendCommand('Runtime.addBinding', { name: 'clubboxRecorder' });
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

function boolField(body, keys) {
  const value = field(body, keys);
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return null;
}

function privacyOf(body) {
  const value = field(body, ['privacy', 'privacy_level', 'visibility', 'room_privacy', 'audience']);
  const nested = body && typeof body === 'object' && body.privacy_settings && typeof body.privacy_settings === 'object'
    ? body.privacy_settings.type
    : undefined;
  const text = `${value ?? ''} ${nested ?? ''}`.toLowerCase();
  if (/friends?_of_friends|friend_of_friend/.test(text)) return 'friends-of-friends';
  if (text.includes('friend')) return 'friends';
  if (text.includes('house') || text.includes('social_club')) return 'house';
  if (text.includes('public') || text.includes('interest') || text === 'open') return 'public';
  return '';
}

function mentionOf(body) {
  const message = field(body, ['message', 'text', 'body']);
  return typeof message === 'string' && /@\w/.test(message);
}

function vmKind(pathName, body) {
  if (!/voice_message|send_vm|audio_message|vm_/.test(pathName)) return '';
  const ids = body && Array.isArray(body.user_ids) ? body.user_ids.length : 0;
  const group = boolField(body, ['is_group', 'group']) === true || ids > 1;
  return group ? 'group' : 'direct';
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

const FAILURE_MARKS_CHECKLIST = false;

function claimFinalize(finalized, requestId) {
  const id = String(requestId ?? '');
  if (!id || finalized.has(id)) return false;
  finalized.add(id);
  return true;
}

function safeErrorText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/https?:\/\/[^\s]+/gi, (url) => {
    try {
      const parsed = new URL(url);
      return `${parsed.host}${parsed.pathname}`;
    } catch {
      return '<redacted>';
    }
  }).replace(/[?#][^\s]*/g, '').slice(0, 180);
}

function scenarioLabels(method, url) {
  const pathName = url.pathname.toLowerCase();
  const ctx = {
    method: String(method || 'GET').toUpperCase(),
    path: pathName,
    topicChanged: false,
    hasSearchTerm: false,
    hand: null,
    creating: pathName.includes('create_channel'),
    privacy: '',
  };
  const labels = [];
  for (const item of CHECKLIST) {
    try {
      if (item.test(ctx)) labels.push(item.label);
    } catch {
      // A checklist predicate must not break capture.
    }
  }
  return labels;
}

function buildNetworkErrorRecord(entry, params) {
  const url = entry.url;
  const started = typeof entry.started === 'number' ? entry.started : null;
  const finished = typeof params.timestamp === 'number' ? params.timestamp : null;
  const record = {
    type: 'network_error',
    requestId: String(params.requestId || ''),
    method: String(entry.method || 'GET'),
    host: url.hostname,
    path: url.pathname,
    errorText: safeErrorText(params.errorText),
    canceled: params.canceled === true,
    scenarios: scenarioLabels(entry.method, url),
  };
  if (started != null && finished != null) {
    record.timingMs = Math.max(0, Math.round((finished - started) * 1000));
  }
  if (typeof params.blockedReason === 'string' && params.blockedReason) {
    record.blockedReason = params.blockedReason.slice(0, 120);
  }
  return record;
}

module.exports = {
  startApiRecorder,
  buildNetworkErrorRecord,
  claimFinalize,
  FAILURE_MARKS_CHECKLIST,
};
