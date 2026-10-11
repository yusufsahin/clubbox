/**
 * Pulls endpoint names out of clubhouse.com script bodies.
 * The recorder stores names and script paths only — never the source.
 */

function extractBundleEndpoints(source) {
  if (typeof source !== 'string' || source.length === 0 || source.length > 12_000_000) return [];
  const names = new Set();
  for (const match of source.matchAll(/\/web_api\/([a-z][a-z0-9_]*)/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/web_api(?:\s*\.\s*[A-Za-z_$][\w$]*)?\s*\(\s*["'`]([a-z]+(?:_[a-z0-9]+)+)["'`]/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/["'`]([a-z]+(?:_[a-z0-9]+)+)["'`]\s*,\s*web_api\b/g)) {
    names.add(match[1]);
  }
  return [...names].sort();
}

function clubhouseHost(urlString) {
  try {
    const host = new URL(urlString).hostname.toLowerCase();
    return host === 'clubhouse.com' || host.endsWith('.clubhouse.com');
  } catch {
    return false;
  }
}

function isBundleScript(urlString, resourceType, pageUrl) {
  if (!clubhouseHost(pageUrl)) return false;
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (resourceType === 'Script') return true;
  const host = url.hostname.toLowerCase();
  const scriptPath = /\.m?js$/.test(url.pathname);
  return scriptPath && (host === 'clubhouse.com' || host.endsWith('.clubhouse.com'));
}

function scriptPath(urlString) {
  try {
    return new URL(urlString).pathname || '/';
  } catch {
    return '';
  }
}

function scrubBundleText(text) {
  return String(text)
    .replace(/pub-c-[A-Za-z0-9-]+/g, '<pub-key>')
    .replace(/sub-c-[A-Za-z0-9-]+/g, '<sub-key>')
    .replace(/\b[A-Fa-f0-9]{32}\b/g, '<hex32>');
}

function extractCallSites(source) {
  if (typeof source !== 'string' || source.length === 0 || source.length > 12_000_000) return [];
  const sites = [];
  const counts = new Map();
  for (const match of source.matchAll(/\/web_api\/([a-z][a-z0-9_]*)/g)) {
    const name = match[1];
    const count = counts.get(name) || 0;
    if (count >= 2) continue;
    counts.set(name, count + 1);
    const at = match.index;
    const snippet = scrubBundleText(source.slice(Math.max(0, at - 140), Math.min(source.length, at + 260)));
    sites.push({ name, snippet: snippet.slice(0, 400) });
  }
  return sites;
}

function objectKeys(body) {
  if (!body) return [];
  return [...body.matchAll(/[{,]?\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/g)].map((match) => match[1]);
}

function extractEndpointCalls(source) {
  if (typeof source !== 'string' || !source) return [];
  const paths = new Map();
  for (const match of source.matchAll(/([A-Z][A-Z0-9_]+)\s*:\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*[`'"](\/web_api\/[^`'"]+)[`'"]/g)) {
    paths.set(match[1], match[2]);
  }
  const calls = [];
  const callRe = /\.(post|get)\(\s*[A-Za-z0-9_.]*API_ENDPOINTS\.([A-Z0-9_]+)\([^)]*\)\s*(?:,\s*(\{[^}]*\}))?/g;
  for (const match of source.matchAll(callRe)) {
    const constant = match[2];
    const routePath = paths.get(constant) || '';
    const nameMatch = routePath.match(/\/web_api\/([a-z][a-z0-9_]*)/);
    if (!nameMatch) continue;
    calls.push({
      name: nameMatch[1],
      method: match[1].toUpperCase(),
      keys: objectKeys(match[3]),
      path: routePath.split('${')[0].replace(/\/+$/, '') || `/web_api/${nameMatch[1]}`,
    });
  }
  return calls;
}

function mineRealtime(source) {
  const text = typeof source === 'string' ? source : '';
  const clients = [];
  for (const match of text.matchAll(/createClient\s*\(\s*\{([^{}]{0,180})\}/g)) {
    const body = match[1];
    const mode = body.match(/mode\s*:\s*["']([a-z0-9]+)["']/i);
    const codec = body.match(/codec\s*:\s*["']([a-z0-9]+)["']/i);
    clients.push({
      mode: mode ? mode[1] : null,
      codec: codec ? codec[1] : null,
      keys: objectKeys(body),
    });
  }
  const origin = text.match(/pubnub\s*:\s*\{\s*origin\s*:\s*["']([^"']+)["']/);
  const appIdLiteral = /agora\s*:\s*\{\s*key\s*:\s*["'][A-Fa-f0-9]{32}["']/.test(text);
  const envKey = text.includes('NEXT_PUBLIC_AGORA_KEY');
  const messageTypes = [];
  if (text.includes('channel_message')) messageTypes.push('channel_message');
  if (text.includes('channel_reaction')) messageTypes.push('channel_reaction');
  const channelTemplates = extractPubNubTemplates(text);
  return {
    createClient: clients,
    appIdLiteral,
    appIdEnv: envKey,
    pubnubOrigin: origin ? origin[1] : null,
    messageTypes,
    channelTemplates,
  };
}

/** Next.js build id from an HTML document or a `/_next/static/<id>/…` URL. */
function extractBuildId(htmlOrUrl) {
  const text = typeof htmlOrUrl === 'string' ? htmlOrUrl : '';
  const fromStatic = text.match(/\/_next\/static\/([A-Za-z0-9_-]{8,})\/(?:_buildManifest|_ssgManifest)/);
  if (fromStatic) return fromStatic[1];
  const fromMeta = text.match(/"buildId"\s*:\s*"([A-Za-z0-9_-]{8,})"/);
  if (fromMeta) return fromMeta[1];
  return null;
}

/**
 * Lists JS chunk paths from a Next.js `_buildManifest.js` body.
 * Returns paths like `/_next/static/chunks/foo.js` (leading slash, no host).
 */
function parseBuildManifest(source, buildId) {
  const text = typeof source === 'string' ? source : '';
  const chunks = new Set();
  for (const match of text.matchAll(/["'](\/_next\/static\/(?:chunks|css)\/[^"']+\.js)["']/g)) {
    chunks.add(match[1]);
  }
  for (const match of text.matchAll(/["'](static\/(?:chunks|css)\/[^"']+\.js)["']/g)) {
    chunks.add(`/_next/${match[1]}`);
  }
  if (buildId) {
    for (const match of text.matchAll(new RegExp(`["'](/_next/static/${buildId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^"']+\\.js)["']`, 'g'))) {
      chunks.add(match[1]);
    }
  }
  return [...chunks].sort();
}

/** PubNub channel name templates (string literals with ${…} or channel_ prefixes). */
function extractPubNubTemplates(source) {
  const text = typeof source === 'string' ? source : '';
  const templates = new Set();
  for (const match of text.matchAll(/["'`]((?:channel|pubnub|pn)[_-][A-Za-z0-9_$.{}-]{2,80})["'`]/gi)) {
    templates.add(match[1]);
  }
  for (const match of text.matchAll(/["'`]([^"'`]*(?:\$\{[^}]+\}[^"'`]*)+)["'`]/g)) {
    const value = match[1];
    if (/channel|pubnub|subscribe/i.test(value) && value.length < 120) templates.add(value);
  }
  return [...templates].sort();
}

/**
 * Secret and env values pulled from a chunk. Callers must write values only to
 * userData/realtime-config.json — never to docs, logs, or git-tracked files.
 */
function extractSecrets(source) {
  const text = typeof source === 'string' ? source : '';
  const envKeys = [...new Set([...text.matchAll(/\b(NEXT_PUBLIC_[A-Z0-9_]+)\b/g)].map((m) => m[1]))].sort();
  const agora = text.match(/NEXT_PUBLIC_AGORA_KEY["'\s:=]+["']([A-Fa-f0-9]{32})["']/)
    || text.match(/agora\s*[:=]\s*\{\s*key\s*:\s*["']([A-Fa-f0-9]{32})["']/);
  const pub = text.match(/(?:publishKey|publish_key|PUBLISH_KEY)["'\s:=]+["'](pub-c-[A-Za-z0-9-]+)["']/i)
    || text.match(/["'](pub-c-[A-Za-z0-9-]+)["']/);
  const sub = text.match(/(?:subscribeKey|subscribe_key|SUBSCRIBE_KEY)["'\s:=]+["'](sub-c-[A-Za-z0-9-]+)["']/i)
    || text.match(/["'](sub-c-[A-Za-z0-9-]+)["']/);
  return {
    envKeys,
    agoraAppId: agora ? agora[1] : null,
    pubnubPublishKey: pub ? pub[1] : null,
    pubnubSubscribeKey: sub ? sub[1] : null,
  };
}

function analyzeChunk(source, meta = {}) {
  const calls = extractEndpointCalls(source);
  const sites = extractCallSites(source);
  const endpoints = extractBundleEndpoints(source);
  const realtime = mineRealtime(source);
  const secrets = extractSecrets(source);
  return {
    path: meta.path || '',
    page: meta.page || '',
    endpoints,
    calls,
    sites,
    realtime,
    secrets: {
      envKeys: secrets.envKeys,
      hasAgoraAppId: !!secrets.agoraAppId,
      hasPubnubPublishKey: !!secrets.pubnubPublishKey,
      hasPubnubSubscribeKey: !!secrets.pubnubSubscribeKey,
    },
    _secretValues: secrets,
  };
}

function trafficKind(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (url.pathname.includes('/web_api/')) return 'web_api';
  if (host.includes('pubnub')) return 'pubnub';
  if (
    host === 'agora.io' || host.endsWith('.agora.io')
    || host === 'agoraio.cn' || host.endsWith('.agoraio.cn')
    || host === 'sd-rtn.com' || host.endsWith('.sd-rtn.com')
  ) {
    return 'agora';
  }
  return null;
}

function keyShape(value, depth = 0) {
  if (depth > 4) return 'nested';
  if (Array.isArray(value)) return value.length ? [keyShape(value[0], depth + 1)] : [];
  if (!value || typeof value !== 'object') return typeof value;
  const output = {};
  for (const [key, child] of Object.entries(value)) {
    if (/channel/i.test(key)) {
      output[key] = '<channel>';
      continue;
    }
    if ((key === 'type' || key === 'action' || key === 'message_type' || key === 'event') && typeof child === 'string' && /^[a-z0-9_]{1,40}$/i.test(child)) {
      output[key] = child;
      continue;
    }
    output[key] = keyShape(child, depth + 1);
  }
  return output;
}

module.exports = {
  analyzeChunk,
  extractBuildId,
  extractBundleEndpoints,
  extractCallSites,
  extractEndpointCalls,
  extractPubNubTemplates,
  extractSecrets,
  isBundleScript,
  keyShape,
  mineRealtime,
  parseBuildManifest,
  scriptPath,
  scrubBundleText,
  trafficKind,
};
