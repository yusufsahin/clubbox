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

function readCaptures() {
  if (!fs.existsSync(captureDir)) return [];
  const records = [];
  for (const name of fs.readdirSync(captureDir)) {
    if (!name.endsWith('.jsonl')) continue;
    const text = fs.readFileSync(path.join(captureDir, name), 'utf8');
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

function evidenceRoutes(routes, records) {
  const groups = groupHttp(records);
  const next = {};
  for (const [key, route] of Object.entries(routes)) {
    if (TELEMETRY_PATHS.has(route.path)) continue;
    const method = String(route.method || 'POST').toUpperCase();
    const hits = groups.get(`${method} ${route.path}`) || [];
    const observed = hits.some((record) => record.status >= 200 && record.status < 300);
    const evidence = route.evidence === 'unsupported'
      ? 'unsupported'
      : (observed ? 'observed' : 'configured-unverified');
    next[key] = { ...route, evidence };
  }
  return next;
}

function sameText(left, right) {
  return left.replace(/\r\n/g, '\n') === right.replace(/\r\n/g, '\n');
}

function buildRealtime(records) {
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

  return `${lines.join('\n').trim()}\n`;
}

const savedRoutes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
const records = readCaptures();
const routes = evidenceRoutes(savedRoutes, records);
const webApi = buildWebApi(records, routes);
const realtime = buildRealtime(records);
const routesText = `${JSON.stringify(routes, null, 2)}\n`;
const webPath = path.join(docsDir, 'web-api.md');
const realtimePath = path.join(docsDir, 'realtime.md');

if (process.argv.includes('--check')) {
  const stale = [];
  if (!sameText(fs.readFileSync(routesPath, 'utf8'), routesText)) stale.push(routesPath);
  if (!sameText(fs.readFileSync(webPath, 'utf8'), webApi)) stale.push(webPath);
  if (!sameText(fs.readFileSync(realtimePath, 'utf8'), realtime)) stale.push(realtimePath);
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
  fs.writeFileSync(routesPath, routesText);
  console.log(`[Clubbox] Wrote docs from ${records.length} capture lines`);
}
