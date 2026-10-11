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

module.exports = { extractBundleEndpoints, isBundleScript, scriptPath };
