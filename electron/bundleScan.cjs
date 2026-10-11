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
  return {
    createClient: clients,
    appIdLiteral,
    appIdEnv: envKey,
    pubnubOrigin: origin ? origin[1] : null,
    messageTypes,
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
  extractBundleEndpoints,
  extractCallSites,
  extractEndpointCalls,
  isBundleScript,
  keyShape,
  mineRealtime,
  scriptPath,
  scrubBundleText,
  trafficKind,
};
