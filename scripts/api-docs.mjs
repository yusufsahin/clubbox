/**
 * Turns local redacted captures into docs/api/web-api.md and docs/api/realtime.md.
 * Refuses to write a file that still contains a phone, email, token, or cookie.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { outputHasLeak } = require('../electron/redact.cjs');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const captureDir = path.join(root, 'api-captures');
const docsDir = path.join(root, 'docs', 'api');
const routesPath = path.join(root, 'electron', 'webApiRoutes.json');
const TELEMETRY_PATHS = new Set(['/web_api/record_action_trails']);

function readJsonlDir(dir) {
  if (!fs.existsSync(dir)) return [];
  const records = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.jsonl')) continue;
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        records.push(JSON.parse(line));
      } catch {
        // Skip a torn line from a recorder that was still writing.
      }
    }
  }
  return records;
}

function readCaptures() {
  const dirs = [captureDir];
  if (process.env.CLUBBOX_API_LOG) dirs.push(process.env.CLUBBOX_API_LOG);
  // Opt-in app request log (Task 10.2) — same redacted JSONL shape as the recorder.
  const localApiLog = path.join(root, 'api-log');
  if (fs.existsSync(localApiLog)) dirs.push(localApiLog);
  const records = [];
  for (const dir of dirs) records.push(...readJsonlDir(dir));
  return records;
}

function typeName(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return value.length ? `array<${typeName(value[0])}>` : 'array';
  if (typeof value === 'object') return 'object';
  return typeof value;
}

function schemaList(value, depth = 0) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || depth > 4) return [];
  const lines = [];
  for (const [key, child] of Object.entries(value)) {
    const pad = '  '.repeat(depth);
    lines.push(`${pad}- \`${key}\`: ${typeName(child)}`);
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      lines.push(...schemaList(child, depth + 1));
    } else if (Array.isArray(child) && child[0] && typeof child[0] === 'object' && !Array.isArray(child[0])) {
      lines.push(...schemaList(child[0], depth + 1));
    }
  }
  return lines;
}

function example(value) {
  if (value == null) return 'No body observed.';
  const pretty = JSON.stringify(value, null, 2).replaceAll('```', "'''");
  if (pretty.length > 4000) return `${pretty.slice(0, 4000)}\n…`;
  return pretty;
}

function groupHttp(records) {
  const groups = new Map();
  for (const record of records) {
    if (record.type !== 'http' || typeof record.path !== 'string') continue;
    const method = String(record.method || 'GET').toUpperCase();
    const key = `${method} ${record.path}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return groups;
}

function labelsOf(records) {
  return [...new Set(records.map((record) => record.label).filter((label) => typeof label === 'string' && label))];
}

function hintsOf(records) {
  return [...new Set(records.flatMap((record) => {
    const hints = record.hints || record.actions || [];
    return Array.isArray(hints) ? hints.filter((hint) => typeof hint === 'string') : [];
  }))];
}

function sectionFor(method, routePath, records) {
  const sample = records.find((record) => record.status >= 200 && record.status < 300) || records[0];
  const statuses = [...new Set(records.map((record) => record.status).filter((status) => status != null))];
  const labels = labelsOf(records);
  const hints = hintsOf(records);
  const succeeded = records.some((record) => record.status >= 200 && record.status < 300);
  const agora = records.map((record) => record.agora).find((entry) => entry && (entry.appIdKey || entry.channelKey || entry.uidKey));
  const lines = [
    `## ${method} ${routePath}`,
    '',
    labels.length ? `Seen when: ${labels.join('; ')}.` : 'Seen in a capture. The checklist did not label the click.',
    '',
  ];
  if (hints.length) {
    lines.push(`Hint match (not proof): ${hints.join('; ')}.`, '');
  }
  if (!succeeded) {
    lines.push('No successful response was captured, so this request body is not treated as the correct one.', '');
  }
  lines.push(
    '### Request',
    '',
    ...(schemaList(sample?.request).length ? schemaList(sample.request) : ['- No request body observed.']),
    '',
    '```json',
    example(sample?.request),
    '```',
    '',
    '### Response',
    '',
    ...(schemaList(sample?.response).length ? schemaList(sample.response) : ['- No JSON response body observed.']),
    '',
    '```json',
    example(sample?.response),
    '```',
    '',
    `Status codes seen: ${statuses.length ? statuses.join(', ') : 'none recorded'}.`,
    '',
  );
  if (agora) {
    lines.push('### Agora');
    lines.push('');
    lines.push(`- App id key: \`${agora.appIdKey || 'not present'}\``);
    lines.push(`- Channel key: \`${agora.channelKey || 'not present'}\``);
    lines.push(`- Uid key: \`${agora.uidKey || 'not present'}\``);
    lines.push('');
  }
  return lines.join('\n');
}

function unconfirmedSection(key, route) {
  return [
    `## ${route.method} ${route.path}`,
    '',
    `App endpoint key: \`${key}\`.`,
    '',
    'Not observed in a capture yet. No request or response example is included, because none was recorded.',
    '',
  ].join('\n');
}

function writeChecked(filePath, text) {
  if (outputHasLeak(text)) {
    console.error(`[Clubbox] Refusing to write ${filePath}: redaction check failed`);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

function buildWebApi(records, routes) {
  const groups = groupHttp(records);
  const used = new Set();
  const parts = [
    '# Clubhouse web API',
    '',
    'Generated by `scripts/api-docs.mjs` from local redacted captures. Raw captures stay in `api-captures/` and are gitignored. Examples use placeholders only.',
    '',
    'A path in `electron/webApiRoutes.json` is configuration, not proof. Sections marked “Not observed” stay unverified. Sandbox responses are not live evidence. Mobile-token calls are not treated as verified.',
    '',
    'Sign-in (`start_phone_number_web_auth`, `complete_phone_number_web_auth`, `resend_phone_number_auth`) is not part of this list. The user signs in themselves in the recorder window.',
    '',
  ];

  for (const [key, route] of Object.entries(routes)) {
    if (route.evidence === 'in-bundle') continue;
    const matchKey = `${String(route.method || 'POST').toUpperCase()} ${route.path}`;
    const observed = groups.get(matchKey) || [];
    used.add(matchKey);
    if (!observed.length) {
      parts.push(unconfirmedSection(key, route));
      continue;
    }
    const methods = [...new Set(observed.map((record) => String(record.method || '').toUpperCase()))];
    parts.push(sectionFor(methods[0] || route.method, route.path, observed));
    parts.push(`App endpoint key: \`${key}\`. Configured method: ${route.method}.`);
    parts.push('');
  }

  const extra = [...groups.keys()].filter((key) => !used.has(key)).sort();
  const telemetry = extra.filter((key) => TELEMETRY_PATHS.has(key.split(/ (.+)/)[1]));
  const unused = extra.filter((key) => !telemetry.includes(key));
  if (unused.length) {
    parts.push('## Captured paths the app does not call yet', '');
    for (const key of unused) {
      const [method, routePath] = key.split(/ (.+)/);
      parts.push(sectionFor(method, routePath, groups.get(key)));
    }
  }
  parts.push('## Telemetry, not used', '');
  if (!telemetry.length) {
    parts.push('No telemetry calls were captured.', '');
  } else {
    for (const key of telemetry) {
      parts.push(`- ${key} — captured, not an app route.`, '');
    }
  }
  parts.push('## Checklist coverage', '', ...checklistCoverage(records), '');

  return `${parts.join('\n').trim()}\n`;
}

function checklistCoverage(records) {
  const byLabel = new Map();
  for (const record of records) {
    if (record.type !== 'http' || typeof record.label !== 'string' || !record.label) continue;
    if (!byLabel.has(record.label)) byLabel.set(record.label, new Set());
    byLabel.get(record.label).add(`${record.method || 'GET'} ${record.path} (${record.status ?? 'no status'})`);
  }
  if (!byLabel.size) {
    return ['No labeled actions in the current captures. Regex hints are not treated as proof.'];
  }
  const lines = [];
  for (const [label, paths] of [...byLabel.entries()].sort()) {
    lines.push(`- \`${label}\`: ${[...paths].sort().join('; ')}`);
  }
  return lines;
}

/** Keep in sync with src/api/mutationFlags.ts (api_health.feature rule). */
function expectedMutation(endpoint) {
  const name = String(endpoint).replace(/^\//, '');
  const exact = new Set(['talk', 'emoji_reaction', 'gif_reaction', 'audience_reply', 'follow', 'unfollow']);
  if (exact.has(name)) return true;
  if (name.endsWith('_ping')) return true;
  if (name.startsWith('join') || name.startsWith('leave')) return true;
  if (name.startsWith('follow') || name.startsWith('unfollow')) return true;
  const prefixes = [
    'send_', 'create_', 'delete_', 'update_', 'set_', 'mark_', 'mute_', 'invite_', 'uninvite_',
    'make_', 'block_', 'end_', 'change_', 'hide_', 'accept_', 'reject_', 'become_', 'add_',
  ];
  return prefixes.some((prefix) => name.startsWith(prefix));
}

function evidenceRoutes(routes, records) {
  const groups = groupHttp(records);
  const next = {};
  for (const [key, route] of Object.entries(routes)) {
    if (TELEMETRY_PATHS.has(route.path)) continue;
    const method = String(route.method || 'POST').toUpperCase();
    const hits = groups.get(`${method} ${route.path}`) || [];
    const observed = hits.some((record) => record.status >= 200 && record.status < 300);
    let evidence;
    if (route.evidence === 'unsupported') evidence = 'unsupported';
    else if (observed) evidence = 'observed';
    else if (route.evidence === 'in-bundle') evidence = 'in-bundle';
    else if (route.evidence === 'community') evidence = 'community';
    else if (route.evidence === 'bundle') evidence = 'bundle';
    else if (route.evidence === 'observed') evidence = 'observed';
    else evidence = 'bundle';
    next[key] = { ...route, evidence, mutation: expectedMutation(key) };
  }
  return next;
}

function readBundleHits() {
  const file = path.join(captureDir, 'bundle-endpoints.json');
  if (!fs.existsSync(file)) return [];
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
  const scripts = Array.isArray(parsed?.scripts) ? parsed.scripts : [];
  const hits = [];
  for (const script of scripts) {
    if (typeof script?.path !== 'string' || script.path.includes('..')) continue;
    if (!Array.isArray(script.endpoints)) continue;
    for (const name of script.endpoints) {
      if (typeof name === 'string' && /^[a-z][a-z0-9_]*$/.test(name)) {
        hits.push({ name, path: script.path });
      }
    }
  }
  return hits;
}

function routeForName(routes, name) {
  if (routes[name]) return routes[name];
  const routePath = `/web_api/${name}`;
  return Object.values(routes).find((route) => route.path === routePath) || null;
}

function mergeBundleRoutes(routes, names) {
  const next = { ...routes };
  const paths = new Set(Object.values(routes).map((route) => route.path));
  for (const name of names) {
    const routePath = `/web_api/${name}`;
    if (next[name] || paths.has(routePath)) continue;
    next[name] = { path: routePath, method: 'POST', evidence: 'in-bundle' };
    paths.add(routePath);
  }
  return next;
}

function bundleStatus(name, savedRoutes, routes) {
  const saved = routeForName(savedRoutes, name);
  const current = routeForName(routes, name);
  if (current?.evidence === 'observed' || saved?.evidence === 'observed') return 'observed';
  if (saved) return 'configured';
  return 'in-bundle, not observed';
}

function buildBundleDoc(savedRoutes, routes, hits) {
  const byName = new Map();
  for (const hit of hits) {
    if (!byName.has(hit.name)) byName.set(hit.name, new Set());
    byName.get(hit.name).add(hit.path);
  }
  const lines = [
    '# Web bundle endpoints',
    '',
    'Generated by `scripts/api-docs.mjs` from `api-captures/bundle-endpoints.json`. The recorder reads script bodies on a normal clubhouse.com page load and keeps endpoint names plus the script path. A name found only in the bundle is `in-bundle` and is not callable.',
    '',
  ];
  if (!byName.size) {
    lines.push(
      'No bundle scan is stored yet. Open the API recorder and load clubhouse.com. It writes `api-captures/bundle-endpoints.json` from the scripts the page loads.',
      '',
      '## List endpoints',
      '',
      'Not scanned. This file cannot yet say whether the web bundle contains `get_followers`, `get_following`, `get_online_friends`, or any name with `follow`, `friend`, `cofollow`, or `mutual`.',
      '',
    );
    return `${lines.join('\n').trim()}\n`;
  }

  lines.push('## Question', '');
  for (const name of ['get_followers', 'get_following', 'get_online_friends']) {
    if (!byName.has(name)) {
      lines.push(`- \`${name}\` was not in the scanned scripts.`);
    } else {
      lines.push(`- \`${name}\` is in the bundle: ${bundleStatus(name, savedRoutes, routes)}.`);
    }
  }
  const related = [...byName.keys()].filter((name) => /follow|friend|cofollow|mutual/.test(name)).sort();
  lines.push('', 'Names matching `follow`, `friend`, `cofollow`, or `mutual`:', '');
  if (!related.length) {
    lines.push('None.', '');
  } else {
    for (const name of related) {
      const where = [...byName.get(name)].sort().map((entry) => `\`${entry}\``).join(', ');
      lines.push(`- \`${name}\` — ${bundleStatus(name, savedRoutes, routes)} — ${where}`);
    }
    lines.push('');
  }
  lines.push('If a list name is only `in-bundle, not observed`, leave it. Do not add a button that calls it.', '');
  lines.push('## Every name', '');
  for (const name of [...byName.keys()].sort()) {
    lines.push(`- \`${name}\` — ${bundleStatus(name, savedRoutes, routes)}`);
  }
  lines.push('');
  return `${lines.join('\n').trim()}\n`;
}

function sameText(left, right) {
  return left.replace(/\r\n/g, '\n') === right.replace(/\r\n/g, '\n');
}

const CALLSITE_NAMES = [
  'join_channel',
  'web_listener_join',
  'guest_join_channel',
  'active_ping',
  'web_listener_active_ping',
  'leave_channel',
  'audience_reply',
  'become_speaker',
  'send_channel_message',
  'get_channel_messages',
  'emoji_reaction',
  'set_channel_title',
  'get_conversation',
  'add_conversation_segment',
  'create_conversation',
  'get_social_club',
  'get_social_club_info',
  'get_social_club_members',
  'get_social_club_messages',
  'get_social_club_message_thread',
  'get_replay_channel',
];

function readCallsites() {
  const file = path.join(captureDir, 'bundle-callsites.json');
  if (!fs.existsSync(file)) return { scripts: [], realtime: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      scripts: Array.isArray(parsed?.scripts) ? parsed.scripts : [],
      realtime: parsed?.realtime && typeof parsed.realtime === 'object' ? parsed.realtime : {},
    };
  } catch {
    return { scripts: [], realtime: {} };
  }
}

function buildCallsitesDoc(data) {
  const lines = [
    '# Bundle call sites',
    '',
    'Generated by `scripts/api-docs.mjs` from `api-captures/bundle-callsites.json`. Snippets come from script bodies the recorder already loaded. They are `in-bundle` only and are not callable. Secrets in those snippets are replaced before this file is written.',
    '',
  ];
  const calls = [];
  for (const script of data.scripts) {
    if (!Array.isArray(script?.calls)) continue;
    for (const call of script.calls) {
      if (!call || typeof call.name !== 'string') continue;
      calls.push({ ...call, script: script.path, page: script.page || '' });
    }
  }
  if (!calls.length) {
    lines.push('No call sites are stored yet. Load clubhouse.com in the API recorder so it can read the scripts the page loads.', '');
    return `${lines.join('\n').trim()}\n`;
  }
  for (const name of CALLSITE_NAMES) {
    const found = calls.filter((call) => call.name === name);
    lines.push(`## ${name}`, '');
    if (!found.length) {
      lines.push('Not in the scanned scripts. A room page may still load it in a later chunk.', '');
      continue;
    }
    const methods = [...new Set(found.map((call) => call.method).filter(Boolean))];
    const keys = [...new Set(found.flatMap((call) => (Array.isArray(call.keys) ? call.keys : [])))];
    const where = [...new Set(found.map((call) => `${call.script}${call.page ? ` (page ${call.page})` : ''}`))];
    lines.push(`- Method in the bundle: ${methods.length ? methods.join(', ') : 'unknown'}`);
    lines.push(`- Body keys: ${keys.length ? keys.map((key) => `\`${key}\``).join(', ') : 'no JSON body in the call'}`);
    lines.push(`- Script: ${where.map((entry) => `\`${entry}\``).join('; ')}`);
    lines.push('- Evidence: in-bundle, not observed. Do not call it until a capture shows the request.', '');
  }
  lines.push('These names stay `in-bundle` until a redacted capture records a real response. The snippets are local only.', '');
  return `${lines.join('\n').trim()}\n`;
}

function bundleRealtimeLines(data) {
  const realtime = data?.realtime || {};
  const lines = [
    '## From the web bundle',
    '',
    'This section is the homepage scripts only. Room pages load more chunks later. Nothing here is a captured request.',
    '',
  ];
  const clients = Array.isArray(realtime.createClient) ? realtime.createClient : [];
  if (!clients.length) {
    lines.push('Agora `createClient({mode, codec})` was not in the scanned scripts. The SDK chunk is not on the homepage.');
  } else {
    for (const client of clients) {
      lines.push(`Agora \`createClient\`: mode \`${client.mode || 'unknown'}\`, codec \`${client.codec || 'unknown'}\`.`);
    }
  }
  lines.push('');
  if (realtime.appIdFoundIn) {
    const source = realtime.appIdEnv
      ? '`NEXT_PUBLIC_AGORA_KEY`, falling back to the `agora.key` literal'
      : 'the `agora.key` literal';
    lines.push(`Agora app id: found in \`${realtime.appIdFoundIn}\` (${source}). The value is not copied into this file.`);
  } else {
    lines.push('Agora app id: not found in the scanned scripts.');
  }
  lines.push('');
  if (realtime.pubnubOrigin) {
    lines.push(`PubNub origin in the bundle: \`${realtime.pubnubOrigin}\`. Publish and subscribe key names are present; the key values are not copied here.`);
  } else {
    lines.push('PubNub origin was not in the scanned scripts.');
  }
  lines.push('');
  const types = Array.isArray(realtime.messageTypes) ? realtime.messageTypes : [];
  if (!types.length) {
    lines.push('No PubNub message types were named in the scanned scripts. The subscribe channel string was also absent, so a room chunk still has to be loaded.');
  } else {
    lines.push(`PubNub message types the room UI parses: ${types.map((entry) => `\`${entry}\``).join(', ')}.`);
    lines.push('');
    lines.push('- `channel_message` keys read by the ticker: `message_id`, `from_user_id`, `from_name`, `from_photo_url`, `message`, `message_type`, `time_received`.');
    lines.push('- `channel_reaction` keys read by the ticker: `message_id`, `action_user_profile` (`id`, `name`, `photo_url`), `message`, `message_type`, `time_received`, `reaction`, `target_user_profile`.');
  }
  lines.push('');
  const templates = Array.isArray(realtime.channelTemplates) ? realtime.channelTemplates : [];
  if (!templates.length) {
    lines.push('PubNub channel templates: not found in the scanned chunks (run `npm run api:discover` after sign-in).');
  } else {
    lines.push(`PubNub channel templates: ${templates.map((entry) => `\`${entry}\``).join(', ')}.`);
  }
  lines.push('');
  return lines;
}

function buildRealtime(records, callsites) {
  const sockets = records.filter((record) => record.type === 'websocket');
  const pubnub = records.filter((record) => record.type === 'pubnub');
  const agora = records.filter((record) => record.type === 'agora' || record.type === 'agora_join');
  const lines = [
    '# Realtime traffic',
    '',
    'Generated by `scripts/api-docs.mjs`. Payloads are redacted placeholders.',
    '',
    '## Websockets',
    '',
  ];
  if (!sockets.length) {
    lines.push('No websocket frames captured yet.');
    lines.push('');
  } else {
    const byUrl = new Map();
    for (const record of sockets) {
      const key = record.url || 'unknown';
      if (!byUrl.has(key)) byUrl.set(key, []);
      byUrl.get(key).push(record);
    }
    for (const [url, frames] of byUrl) {
      lines.push(`### ${url}`, '');
      const types = new Set();
      for (const frame of frames) {
        const payload = frame.payload;
        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
          const kind = payload.action || payload.type || payload.event || payload.message_type;
          if (typeof kind === 'string') types.add(kind);
        }
      }
      lines.push(`Frames seen: ${frames.length}.`);
      lines.push(types.size ? `Message type fields: ${[...types].map((entry) => `\`${entry}\``).join(', ')}.` : 'No action/type/event field was present on the sampled frames.');
      const sample = frames.find((frame) => frame.payload && typeof frame.payload === 'object');
      if (sample) {
        lines.push('', ...(schemaList(sample.payload).length ? schemaList(sample.payload) : ['- Empty object.']));
        lines.push('', '```json', example(sample.payload), '```', '');
      } else {
        lines.push('');
      }
    }
  }

  lines.push('## PubNub HTTP', '');
  if (!pubnub.length) {
    lines.push('No PubNub HTTP calls captured yet.');
    lines.push('');
  } else {
    for (const record of pubnub.slice(0, 20)) {
      lines.push(`- ${record.method || 'GET'} \`${record.path || 'unknown'}\` status ${record.status ?? 'unknown'}`);
    }
    lines.push('');
  }

  lines.push('## Agora URLs', '');
  lines.push('No Agora token-refresh endpoint was captured. The app does not invent one. When live audio fails to connect, it says so and asks you to leave and join again after that request is recorded.');
  lines.push('');
  if (!agora.length) {
    lines.push('No Agora URLs captured yet. The app id, channel, and uid keys are recorded on `join_channel` in `web-api.md` when that response includes them.');
    lines.push('');
  } else {
    for (const record of agora) {
      lines.push(`- \`${record.url || 'unknown'}\``);
    }
    lines.push('');
  }

  lines.push(...bundleRealtimeLines(callsites));
  return `${lines.join('\n').trim()}\n`;
}

const { applyWebClientMethodsToRoutes } = await import('./sync-web-client-methods.mjs');
const savedRoutes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
const records = readCaptures();
const bundleHits = readBundleHits();
const callsites = readCallsites();
const bundleNames = [...new Set(bundleHits.map((hit) => hit.name))].sort();
const routes = evidenceRoutes(mergeBundleRoutes(savedRoutes, bundleNames), records);
applyWebClientMethodsToRoutes(routes);
const webApi = buildWebApi(records, routes);
const realtime = buildRealtime(records, callsites);
const bundleDoc = buildBundleDoc(savedRoutes, routes, bundleHits);
const callsiteDoc = buildCallsitesDoc(callsites);
const routesText = `${JSON.stringify(routes, null, 2)}\n`;
const webPath = path.join(docsDir, 'web-api.md');
const realtimePath = path.join(docsDir, 'realtime.md');
const bundlePath = path.join(docsDir, 'web-bundle-endpoints.md');
const callsitePath = path.join(docsDir, 'bundle-callsites.md');

if (process.argv.includes('--check')) {
  const stale = [];
  if (!sameText(fs.readFileSync(routesPath, 'utf8'), routesText)) stale.push(routesPath);
  if (!sameText(fs.readFileSync(webPath, 'utf8'), webApi)) stale.push(webPath);
  if (!sameText(fs.readFileSync(realtimePath, 'utf8'), realtime)) stale.push(realtimePath);
  if (!fs.existsSync(bundlePath) || !sameText(fs.readFileSync(bundlePath, 'utf8'), bundleDoc)) stale.push(bundlePath);
  if (!fs.existsSync(callsitePath) || !sameText(fs.readFileSync(callsitePath, 'utf8'), callsiteDoc)) stale.push(callsitePath);
  if (stale.length) {
    console.error(`[Clubbox] API docs are behind the captures. Run npm run api:docs.\n${stale.join('\n')}`);
    process.exit(1);
  }
  console.log(`[Clubbox] API docs match ${records.length} capture lines`);
} else {
  if (outputHasLeak(routesText)) {
    console.error('[Clubbox] Refusing to write route evidence: redaction check failed');
    process.exit(1);
  }
  writeChecked(webPath, webApi);
  writeChecked(realtimePath, realtime);
  writeChecked(bundlePath, bundleDoc);
  writeChecked(callsitePath, callsiteDoc);
  fs.writeFileSync(routesPath, routesText);
  console.log(`[Clubbox] Wrote docs from ${records.length} capture lines`);
}
