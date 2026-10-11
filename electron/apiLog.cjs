const fs = require('fs');
const path = require('path');
const { createRedactor, outputHasLeak } = require('./redact.cjs');
const { keyShape } = require('./bundleScan.cjs');
const webApiRoutes = require('./webApiRoutes.json');

const MAX_BYTES = 20 * 1024 * 1024;
const KEEP_DAYS = 14;

function bodyKeysOnly(body) {
  if (!body || typeof body !== 'object') return [];
  return Object.keys(body).sort();
}

function safeErrorMessage(text) {
  if (typeof text !== 'string' || !text) return '';
  try {
    const parsed = JSON.parse(text);
    const msg = parsed?.error_message || parsed?.error || parsed?.detail;
    if (typeof msg === 'string') return String(msg).slice(0, 200);
  } catch {
    // not JSON
  }
  return String(text).slice(0, 120).replace(/[A-Fa-f0-9]{16,}/g, '<redacted>');
}

function buildRecord(input) {
  const route = webApiRoutes[input.endpoint] || {};
  let responseShape = null;
  try {
    responseShape = input.responseBody ? keyShape(JSON.parse(input.responseBody)) : null;
  } catch {
    responseShape = { parse: 'error' };
  }
  return {
    endpoint: input.endpoint,
    method: route.method || input.method || 'POST',
    path: route.path || input.path || `/web_api/${input.endpoint}`,
    status: input.status,
    bodyKeys: bodyKeysOnly(input.body),
    bodyShape: keyShape(input.body || {}),
    responseShape,
    error: input.status >= 400 || !input.ok ? safeErrorMessage(input.responseBody || input.error || '') : '',
    evidence: route.evidence || 'unsupported',
    appVersion: input.appVersion || '',
    kind: input.kind || 'web_api',
    timestamp: input.timestamp || new Date().toISOString(),
  };
}

function apiLogDir(userDataPath) {
  return path.join(userDataPath, 'api-log');
}

function rotateLogs(dir) {
  if (!fs.existsSync(dir)) return;
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  let total = 0;
  const files = fs.readdirSync(dir)
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      total += stat.size;
      return { name, full, mtime: stat.mtimeMs, size: stat.size };
    })
    .sort((a, b) => a.mtime - b.mtime);

  for (const file of files) {
    if (file.mtime < cutoff) {
      fs.unlinkSync(file.full);
      total -= file.size;
    }
  }
  while (total > MAX_BYTES && files.length > 0) {
    const oldest = files.shift();
    if (!oldest || !fs.existsSync(oldest.full)) continue;
    total -= oldest.size;
    fs.unlinkSync(oldest.full);
  }
}

function appendApiLog(userDataPath, input) {
  const dir = apiLogDir(userDataPath);
  fs.mkdirSync(dir, { recursive: true });
  rotateLogs(dir);
  const record = buildRecord(input);
  const redactor = createRedactor();
  const safe = redactor.redact(record);
  const line = `${JSON.stringify(safe)}\n`;
  if (outputHasLeak(line)) {
    console.warn('[Clubbox] Dropped api-log line that failed the redaction check');
    return false;
  }
  const day = (record.timestamp || new Date().toISOString()).slice(0, 10);
  fs.appendFileSync(path.join(dir, `${day}.jsonl`), line, 'utf8');
  return true;
}

module.exports = {
  appendApiLog,
  apiLogDir,
  buildRecord,
  rotateLogs,
  bodyKeysOnly,
  safeErrorMessage,
};
