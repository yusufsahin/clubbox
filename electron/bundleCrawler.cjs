/**
 * DESIGN §6 — crawl Next.js chunks for web_api call sites and realtime config.
 * Secret values land only in userData/realtime-config.json.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  analyzeChunk,
  extractBuildId,
  parseBuildManifest,
  scrubBundleText,
} = require('./bundleScan.cjs');
const { outputHasLeak } = require('./redact.cjs');

// Bump when extraction logic changes so an existing cache for the same Clubhouse build is re-analyzed.
// 2: production config block (live Stripe key) instead of the first (dev) block for Agora/PubNub keys.
const EXTRACTOR_VERSION = 2;

const PAGE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MAX_CHUNKS = 200;
const MIN_GAP_MS = 1000;

const DISCOVERY_NAMES = [
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonChecked(file, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (outputHasLeak(text)) {
    throw new Error(`Refusing to write ${file}: redaction check failed`);
  }
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, text);
}

function mergeScripts(existing, incoming) {
  const map = new Map();
  for (const script of existing) {
    if (script && typeof script.path === 'string') map.set(script.path, script);
  }
  for (const script of incoming) {
    if (!script || typeof script.path !== 'string') continue;
    const prev = map.get(script.path) || {};
    map.set(script.path, {
      path: script.path,
      page: script.page || prev.page || '',
      endpoints: [...new Set([...(prev.endpoints || []), ...(script.endpoints || [])])].sort(),
      calls: mergeCalls(prev.calls, script.calls),
      sites: script.sites?.length ? script.sites : (prev.sites || []),
      realtime: mergeRealtimePart(prev.realtime, script.realtime),
    });
  }
  return [...map.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function mergeCalls(left = [], right = []) {
  const map = new Map();
  for (const call of [...left, ...right]) {
    if (!call || typeof call.name !== 'string') continue;
    const key = `${call.method || ''}:${call.name}:${(call.keys || []).join(',')}`;
    map.set(key, {
      name: call.name,
      method: call.method || null,
      keys: Array.isArray(call.keys) ? [...call.keys] : [],
      path: call.path || `/web_api/${call.name}`,
    });
  }
  return [...map.values()];
}

function mergeRealtimePart(left = {}, right = {}) {
  const messageTypes = [...new Set([...(left.messageTypes || []), ...(right.messageTypes || [])])];
  const channelTemplates = [...new Set([...(left.channelTemplates || []), ...(right.channelTemplates || [])])].sort();
  const createClient = [...(left.createClient || []), ...(right.createClient || [])];
  return {
    createClient,
    appIdLiteral: !!(left.appIdLiteral || right.appIdLiteral),
    appIdEnv: !!(left.appIdEnv || right.appIdEnv),
    pubnubOrigin: right.pubnubOrigin || left.pubnubOrigin || null,
    messageTypes,
    channelTemplates,
  };
}

function aggregateRealtime(scripts) {
  const merged = {
    createClient: [],
    appIdFoundIn: '',
    appIdEnv: false,
    pubnubOrigin: null,
    messageTypes: [],
    channelTemplates: [],
  };
  for (const script of scripts) {
    const realtime = script.realtime || {};
    if (Array.isArray(realtime.createClient)) merged.createClient.push(...realtime.createClient);
    if (realtime.appIdLiteral || realtime.appIdEnv) merged.appIdFoundIn = script.path;
    if (realtime.appIdEnv) merged.appIdEnv = true;
    if (realtime.pubnubOrigin) merged.pubnubOrigin = realtime.pubnubOrigin;
    for (const kind of realtime.messageTypes || []) {
      if (!merged.messageTypes.includes(kind)) merged.messageTypes.push(kind);
    }
    for (const template of realtime.channelTemplates || []) {
      if (!merged.channelTemplates.includes(template)) merged.channelTemplates.push(template);
    }
  }
  merged.channelTemplates.sort();
  return merged;
}

function promoteRoutesWithBodies(routesPath, scripts) {
  const routes = readJson(routesPath, {});
  let changed = false;
  for (const script of scripts) {
    for (const call of script.calls || []) {
      if (!call?.name || !Array.isArray(call.keys) || call.keys.length === 0) continue;
      const current = routes[call.name];
      if (!current) {
        routes[call.name] = {
          path: call.path || `/web_api/${call.name}`,
          method: call.method || 'POST',
          evidence: 'bundle',
          mutation: false,
        };
        changed = true;
        continue;
      }
      if (current.evidence === 'observed') continue;
      if (current.evidence !== 'bundle') {
        current.evidence = 'bundle';
        if (call.method) current.method = call.method;
        changed = true;
      }
    }
  }
  if (changed) writeJsonChecked(routesPath, routes);
  return changed;
}

function discoveryReport(scripts, realtime) {
  const found = new Set();
  for (const script of scripts) {
    for (const call of script.calls || []) found.add(call.name);
    for (const name of script.endpoints || []) found.add(name);
  }
  const lines = ['# Bundle discovery report', ''];
  for (const name of DISCOVERY_NAMES) {
    lines.push(`- \`${name}\`: ${found.has(name) ? 'found' : 'not found'}`);
  }
  const templates = realtime.channelTemplates || [];
  lines.push('', '## PubNub channel templates', '');
  if (!templates.length) {
    lines.push('No PubNub channel templates were found in the crawled chunks.');
  } else {
    for (const template of templates) lines.push(`- \`${scrubBundleText(template)}\``);
  }
  lines.push('');
  return `${lines.join('\n')}`;
}

/**
 * @param {{
 *   userDataPath: string,
 *   projectRoot: string,
 *   writeProjectArtifacts?: boolean,
 *   fetchFn?: typeof fetch,
 *   sleepFn?: (ms: number) => Promise<void>,
 *   now?: () => number,
 * }} options
 * writeProjectArtifacts: only npm run api:discover. Runtime/packaged must omit or pass false
 * so the app never writes api-captures/* or electron/webApiRoutes.json.
 */
function createBundleCrawler(options) {
  const userDataPath = options.userDataPath;
  const projectRoot = options.projectRoot;
  const writeProjectArtifacts = options.writeProjectArtifacts === true;
  const fetchFn = options.fetchFn || globalThis.fetch.bind(globalThis);
  const sleepFn = options.sleepFn || sleep;
  const now = options.now || Date.now;
  const cacheRoot = path.join(userDataPath, 'bundle-cache');
  const metaPath = path.join(cacheRoot, 'meta.json');
  const callsitePath = path.join(projectRoot, 'api-captures', 'bundle-callsites.json');
  const routesPath = path.join(projectRoot, 'electron', 'webApiRoutes.json');
  const realtimeConfigPath = path.join(userDataPath, 'realtime-config.json');
  const reportPath = path.join(projectRoot, 'api-captures', 'bundle-discovery.md');

  async function fetchText(url) {
    const response = await fetchFn(url, {
      headers: { 'User-Agent': PAGE_UA, Accept: '*/*' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.text();
  }

  async function crawl(input = {}) {
    const base = input.baseUrl || 'https://www.clubhouse.com';
    let html = input.html;
    if (!html) html = await fetchText(`${base}/`);
    const buildId = extractBuildId(html);
    if (!buildId) {
      return { ok: false, reason: 'build_id_missing', chunks: 0 };
    }

    const meta = readJson(metaPath, {});
    if (meta.buildId === buildId && meta.complete && meta.extractorVersion === EXTRACTOR_VERSION && !input.force) {
      return { ok: true, reason: 'cache_hit', buildId, chunks: meta.chunks || 0 };
    }

    const buildCacheDir = path.join(cacheRoot, buildId);
    ensureDir(buildCacheDir);

    let lastRequestAt = 0;
    async function pacedGet(url, cacheFile) {
      const wait = MIN_GAP_MS - (now() - lastRequestAt);
      if (wait > 0) await sleepFn(wait);
      lastRequestAt = now();
      if (cacheFile && fs.existsSync(cacheFile)) {
        return fs.readFileSync(cacheFile, 'utf8');
      }
      const text = await fetchText(url);
      if (cacheFile) fs.writeFileSync(cacheFile, text);
      return text;
    }

    const manifestUrl = `${base}/_next/static/${buildId}/_buildManifest.js`;
    const manifest = await pacedGet(manifestUrl, path.join(buildCacheDir, '_buildManifest.js'));
    const chunkPaths = parseBuildManifest(manifest, buildId).slice(0, MAX_CHUNKS);

    const analyzed = [];
    const secretValues = readJson(realtimeConfigPath, {});
    for (const chunkPath of chunkPaths) {
      const url = chunkPath.startsWith('http') ? chunkPath : `${base}${chunkPath}`;
      const cacheName = chunkPath.replace(/[\\/]/g, '__');
      const body = await pacedGet(url, path.join(buildCacheDir, cacheName));
      const result = analyzeChunk(body, { path: chunkPath, page: 'crawler' });
      const values = result._secretValues;
      delete result._secretValues;
      if (values.agoraAppId) secretValues.agoraAppId = values.agoraAppId;
      if (values.pubnubPublishKey) secretValues.pubnubPublishKey = values.pubnubPublishKey;
      if (values.pubnubSubscribeKey) secretValues.pubnubSubscribeKey = values.pubnubSubscribeKey;
      if (values.envKeys?.length) {
        secretValues.envKeys = [...new Set([...(secretValues.envKeys || []), ...values.envKeys])].sort();
      }
      if (
        result.calls.length
        || result.sites.length
        || result.endpoints.length
        || result.realtime.createClient.length
        || result.realtime.pubnubOrigin
        || result.realtime.channelTemplates.length
      ) {
        analyzed.push(result);
      }
    }

    ensureDir(path.dirname(realtimeConfigPath));
    // Secrets file is local-only; still refuse obvious phone/email leaks.
    const secretsText = `${JSON.stringify(secretValues, null, 2)}\n`;
    if (outputHasLeak(secretsText)) {
      throw new Error('Refusing to write realtime-config.json: redaction check failed');
    }
    fs.writeFileSync(realtimeConfigPath, secretsText);
    writeJsonChecked(metaPath, { buildId, complete: true, chunks: chunkPaths.length, extractorVersion: EXTRACTOR_VERSION });

    let scripts = analyzed;
    let reportPathOut = null;
    if (writeProjectArtifacts) {
      const existing = readJson(callsitePath, { scripts: [], realtime: {} });
      scripts = mergeScripts(existing.scripts || [], analyzed);
      const realtime = aggregateRealtime(scripts);
      const payload = { scripts, realtime, buildId, crawledAt: new Date(now()).toISOString() };
      writeJsonChecked(callsitePath, payload);
      promoteRoutesWithBodies(routesPath, scripts);
      const report = discoveryReport(scripts, realtime);
      if (outputHasLeak(report)) throw new Error('discovery report failed redaction');
      ensureDir(path.dirname(reportPath));
      fs.writeFileSync(reportPath, report);
      reportPathOut = reportPath;
    }

    return {
      ok: true,
      reason: 'crawled',
      buildId,
      chunks: chunkPaths.length,
      scripts: scripts.length,
      reportPath: reportPathOut,
      realtimeConfigPath,
      writeProjectArtifacts,
    };
  }

  function cachedBuildId() {
    return readJson(metaPath, {}).buildId || null;
  }

  return { crawl, cachedBuildId, discoveryReport, promoteRoutesWithBodies, DISCOVERY_NAMES };
}

module.exports = {
  createBundleCrawler,
  discoveryReport,
  mergeScripts,
  promoteRoutesWithBodies,
  DISCOVERY_NAMES,
  PAGE_UA,
  MAX_CHUNKS,
};
