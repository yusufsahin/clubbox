/**
 * Build features/fixtures/*.json from the newest redacted capture (or synthetic
 * from web-client-methods.md when no capture exists).
 *
 * Usage: node scripts/make-fixtures.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { outputHasLeak } = require('../electron/redact.cjs');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const captureDir = path.join(root, 'api-captures');
const fixturesDir = path.join(root, 'features', 'fixtures');

/** Fixture file name → capture path segment (under /web_api/). */
const FIXTURE_CAPTURE = {
  get_channels: 'get_feed_v3',
  me: 'me',
  get_conversations: 'get_conversations',
  get_conversation: 'get_conversation',
  get_profile: 'get_profile',
  create_channel: 'create_channel',
  join_channel: 'join_channel',
  search_users: 'search',
  get_channel_messages: 'get_channel_messages',
  get_social_club_messages: 'get_social_club_messages',
};

function readJsonlDir(dir) {
  if (!fs.existsSync(dir)) return [];
  const records = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.jsonl')) continue;
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        records.push({ file: name, ...JSON.parse(line) });
      } catch {
        /* skip torn line */
      }
    }
  }
  return records;
}

function captureEndpoint(record) {
  if (typeof record.endpoint === 'string') return record.endpoint;
  if (typeof record.path !== 'string') return '';
  return record.path.replace(/^.*\/web_api\//, '').replace(/\/$/, '').split('/')[0];
}

function latestCapture(segment) {
  const records = [
    ...readJsonlDir(captureDir),
    ...readJsonlDir(path.join(root, 'api-log')),
  ];
  let best = null;
  for (const record of records) {
    if (record.type && record.type !== 'http') continue;
    if (typeof record.status === 'number' && (record.status < 200 || record.status >= 300)) continue;
    if (captureEndpoint(record) !== segment) continue;
    const response = record.response ?? record.responseBody;
    if (!response || typeof response !== 'object') continue;
    best = { record, response };
  }
  return best;
}

/** Hand-tuned synthetic bodies when no capture exists (still marked synthetic). */
const SYNTHETIC_TEMPLATES = {
  join_channel: {
    success: true,
    channel: 'abc123',
    topic: 'Tech Talk',
    token: 'agora_rtc_token_fixture',
    pubnub_token: 'pubnub_token_fixture',
    pubnub_origin: 'clubhouse.pubnubapi.com',
    pubnub_heartbeat_value: 20,
    pubnub_heartbeat_interval: 9,
    pubnub_time_token: '0',
    users: [
      { user_id: 1, name: 'Host', username: 'host', is_speaker: true, is_moderator: true },
      { user_id: 42, name: 'Me', username: 'me', is_speaker: false, is_moderator: false },
    ],
    num_speakers: 1,
    num_all: 1,
  },
  get_channel_messages: { success: true, messages: [] },
  get_social_club_messages: {
    success: true,
    can_post: true,
    messages: [{
      message_id: 'hm-1',
      message: 'Welcome to the house',
      user_profile: { name: 'Ayse', username: 'ayse' },
      time_created: '2026-10-11T12:00:00.000Z',
    }],
  },
};

function materializePlaceholders(value, counters = { id: 1 }) {
  if (Array.isArray(value)) return value.map((entry) => materializePlaceholders(entry, counters));
  if (!value || typeof value !== 'object') {
    if (value === '<id>') return counters.id++;
    if (typeof value === 'string' && value.startsWith('<') && value.endsWith('>')) return null;
    return value;
  }
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    out[key] = materializePlaceholders(child, counters);
  }
  return out;
}

function syntheticBody(endpoint) {
  if (SYNTHETIC_TEMPLATES[endpoint]) {
    return { ...JSON.parse(JSON.stringify(SYNTHETIC_TEMPLATES[endpoint])), synthetic: true };
  }
  return { success: true, synthetic: true };
}

/** Keep capture shape; trim huge arrays; never invent topic_key on feed rooms. */
function slimResponse(endpoint, response) {
  const clone = JSON.parse(JSON.stringify(response));
  if (endpoint === 'get_channels' || endpoint === 'get_feed_v3') {
    if (Array.isArray(clone.items)) clone.items = clone.items.slice(0, 3);
    if (Array.isArray(clone.channels)) clone.channels = clone.channels.slice(0, 3);
    if (Array.isArray(clone.available_topics)) clone.available_topics = clone.available_topics.slice(0, 8);
    // Assert live invariant in the written fixture.
    for (const item of clone.items || []) {
      const ch = item?.channel ?? item;
      if (ch && typeof ch === 'object' && 'topic_key' in ch) delete ch.topic_key;
    }
  }
  if (endpoint === 'get_conversations' && Array.isArray(clone.conversations)) {
    clone.conversations = clone.conversations.slice(0, 5);
  }
  if (endpoint === 'search' || endpoint === 'search_users') {
    if (Array.isArray(clone.items)) clone.items = clone.items.slice(0, 5);
  }
  return clone;
}

function keyShape(value, depth = 0) {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) {
    if (!value.length || depth > 3) return 'array';
    return [keyShape(value[0], depth + 1)];
  }
  if (typeof value === 'object') {
    if (depth > 3) return 'object';
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (key === 'synthetic') continue;
      out[key] = keyShape(value[key], depth + 1);
    }
    return out;
  }
  return typeof value;
}

fs.mkdirSync(fixturesDir, { recursive: true });
const manifest = {};

for (const [fixtureName, captureName] of Object.entries(FIXTURE_CAPTURE)) {
  const hit = latestCapture(captureName);
  let body;
  let synthetic = false;
  let sourceFile = null;
  if (hit) {
    body = materializePlaceholders(slimResponse(fixtureName, hit.response));
    sourceFile = hit.record.file || null;
    // Profile BDD expects a numeric user_id; keep capture shape with a stable id.
    if (fixtureName === 'get_profile' && body.user_profile && typeof body.user_profile === 'object') {
      body.user_profile.user_id = 1;
      if (!body.user_profile.username) body.user_profile.username = 'u1';
    }
  } else {
    body = syntheticBody(captureName);
    synthetic = true;
  }
  if (synthetic) body.synthetic = true;
  else delete body.synthetic;

  const text = `${JSON.stringify(body, null, 2)}\n`;
  if (outputHasLeak(text)) {
    console.error(`[make-fixtures] leak in ${fixtureName}; refusing to write`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(fixturesDir, `${fixtureName}.json`), text);
  manifest[fixtureName] = {
    captureEndpoint: captureName,
    synthetic,
    sourceFile,
    shape: keyShape(body),
  };
  console.log(`${fixtureName}: ${synthetic ? 'synthetic' : `from ${sourceFile}`}`);
}

fs.writeFileSync(
  path.join(fixturesDir, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log('[make-fixtures] wrote', Object.keys(manifest).length, 'fixtures + manifest.json');
