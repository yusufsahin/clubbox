const fs = require('fs');
const path = require('path');
const { outputHasLeak } = require('./redact.cjs');
const { apiLogDir } = require('./apiLog.cjs');

function readJsonlDir(dir) {
  if (!fs.existsSync(dir)) return [];
  const records = [];
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.jsonl')).sort()) {
    const text = fs.readFileSync(path.join(dir, name), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      if (outputHasLeak(line)) continue;
      try {
        records.push(JSON.parse(line));
      } catch {
        // skip bad lines
      }
    }
  }
  return records;
}

function failureKey(record) {
  const error = String(record.error || record.message || '').slice(0, 120);
  return `${record.endpoint}|${record.status}|${error}`;
}

function groupFailures(records) {
  const groups = new Map();
  for (const record of records) {
    const status = Number(record.status) || 0;
    if (status < 400 && record.kind !== 'pubnub-unknown' && record.kind !== 'agora') continue;
    if (record.kind === 'web_api' && status < 400) continue;
    const key = failureKey(record);
    if (!groups.has(key)) groups.set(key, record);
  }
  return groups;
}

function promotionsFromRecords(records) {
  const promoted = [];
  for (const record of records) {
    const status = Number(record.status) || 0;
    if (status < 200 || status >= 300) continue;
    if (!record.endpoint) continue;
    if (record.evidence !== 'bundle' && record.evidence !== 'community') continue;
    promoted.push(String(record.endpoint));
  }
  return [...new Set(promoted)];
}

/**
 * In-process triage for normal app use (no recorder).
 * Writes userData/api-log/triage-pending.json for npm run api:triage.
 */
function runStartupTriage(userDataPath) {
  const logDir = apiLogDir(userDataPath);
  fs.mkdirSync(logDir, { recursive: true });
  const records = readJsonlDir(logDir);
  const failures = [...groupFailures(records).values()].map((record) => ({
    endpoint: String(record.endpoint || ''),
    status: Number(record.status) || 0,
    error: String(record.error || record.message || '').slice(0, 200),
    bodyKeys: Array.isArray(record.bodyKeys) ? record.bodyKeys.map(String) : [],
    evidence: String(record.evidence || ''),
    kind: String(record.kind || 'web_api'),
    timestamp: String(record.timestamp || ''),
  }));
  const promotions = promotionsFromRecords(records);
  const pendingPath = path.join(logDir, 'triage-pending.json');
  const payload = {
    updatedAt: new Date().toISOString(),
    failures,
    promotions,
  };
  const text = `${JSON.stringify(payload, null, 2)}\n`;
  if (!outputHasLeak(text)) {
    fs.writeFileSync(pendingPath, text, 'utf8');
  }
  return {
    ok: true,
    logDir,
    pendingPath,
    promotions,
    failures,
    recordCount: records.length,
  };
}

module.exports = {
  runStartupTriage,
  readJsonlDir,
  groupFailures,
  promotionsFromRecords,
  failureKey,
};
