/**
 * Sync electron/webApiRoutes.json from docs/api/web-client-methods.md.
 * Never downgrades evidence "observed". Sets method, path, pathParams, bodyKeys, evidence "bundle".
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mdPath = path.join(root, 'docs', 'api', 'web-client-methods.md');
const routesPath = path.join(root, 'electron', 'webApiRoutes.json');

const PATH_PARAM_NAMES = {
  get_replay_channel: ['channel'],
  get_replay_channel_chunk: ['channel', 'chunk'],
  get_highlight: ['id'],
  guest_active_ping: ['a', 'b', 'c', 'd'],
  guest_join_channel: ['a', 'b', 'c'],
  guest_leave_channel: ['a', 'b', 'c', 'd'],
};

function parseTable(md) {
  const rows = [];
  for (const line of md.split(/\r?\n/)) {
    if (!line.startsWith('|') || line.includes('---') || line.includes('Client method')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 5) continue;
    const http = cells[1];
    const pathCell = cells[2];
    const pathParamsRaw = cells[3];
    const bodyRaw = cells.slice(4).join(' | ');
    const apiPath = pathCell.replace(/`/g, '').trim();
    if (!apiPath.startsWith('/web_api/')) continue;
    const bodyKeys = !bodyRaw || bodyRaw === '(none)' || bodyRaw.includes('passed through')
      ? []
      : bodyRaw.split(',').flatMap((part) => part.split(/\s*[|/]\s*/).map((k) => k.trim()).filter(Boolean));
    rows.push({
      method: http.trim().toUpperCase(),
      path: apiPath,
      pathParamCount: Number(pathParamsRaw) || 0,
      bodyKeys: [...new Set(bodyKeys.filter((k) => k && k !== '(none)'))],
    });
  }
  return rows;
}

const ENDPOINT_ALIASES = {
  search: 'search_users',
};

function endpointKey(apiPath) {
  const cleaned = apiPath.replace(/\/web_api\//, '').replace(/\/+$/, '');
  if (cleaned.startsWith('talk/')) return cleaned.replace(/\//g, '_');
  const base = cleaned.split('/')[0];
  if (!base) return null;
  return ENDPOINT_ALIASES[base] || base;
}

function expandPathTemplate(apiPath, endpoint) {
  const names = PATH_PARAM_NAMES[endpoint];
  if (!names?.length) {
    const normalized = apiPath.replace(/\{param\}/g, '{id}');
    return { path: normalized.replace(/\/+$/, '') || normalized, pathParams: undefined };
  }
  let i = 0;
  const pathOut = apiPath.replace(/\{param\}/g, () => `{${names[i++] || 'param'}}`);
  return { path: pathOut, pathParams: names.slice(0, (apiPath.match(/\{param\}/g) || []).length) };
}

function mutationGuess(endpoint, method) {
  if (method === 'GET') return false;
  if (
    endpoint === 'me'
    || endpoint === 'search_users'
    || endpoint === 'search'
    || endpoint.startsWith('get_')
    || endpoint.startsWith('talk_get_')
  ) return false;
  if (endpoint.includes('active_ping')) return true;
  if (endpoint.startsWith('record_')) return true;
  const writes = [
    'follow', 'join_', 'leave_', 'create_', 'delete_', 'send_', 'add_', 'update_', 'mark_',
    'set_', 'become_', 'emoji', 'gif', 'hide_', 'invite_', 'mute_', 'make_',
    'block_', 'end_', 'change_', 'reject_', 'uninvite_', 'audience_',
  ];
  return writes.some((p) => endpoint === p || endpoint.startsWith(p));
}

/** Apply web-client-methods.md onto a routes object (mutates and returns it). */
export function applyWebClientMethodsToRoutes(routes, mdText = fs.readFileSync(mdPath, 'utf8')) {
  const rows = parseTable(mdText);
  let updated = 0;
  for (const row of rows) {
    const key = endpointKey(row.path);
    if (!key) continue;
    const { path: templated, pathParams } = expandPathTemplate(row.path, key);
    const existing = routes[key] || {};
    const evidence = existing.evidence === 'observed' ? 'observed' : 'bundle';
    const next = {
      ...existing,
      path: templated,
      method: row.method,
      evidence,
      mutation: mutationGuess(key, row.method),
    };
    if (pathParams?.length) next.pathParams = pathParams;
    else delete next.pathParams;
    if (row.bodyKeys.length) next.bodyKeys = row.bodyKeys;
    else delete next.bodyKeys;
    routes[key] = next;
    updated += 1;

    if (key === 'get_feed_v3' && routes.get_channels) {
      routes.get_channels = {
        ...routes.get_channels,
        path: templated,
        method: row.method,
        evidence: routes.get_channels.evidence === 'observed' ? 'observed' : 'bundle',
        bodyKeys: row.bodyKeys,
        mutation: false,
      };
    }
  }

  if (routes.get_conversation_unread_summary) {
    const e = routes.get_conversation_unread_summary;
    routes.get_conversation_unread_summary = {
      ...e,
      method: 'POST',
      path: '/web_api/get_conversation_unread_summary',
      evidence: e.evidence === 'observed' ? 'observed' : 'bundle',
      mutation: false,
      bodyKeys: ['conversation_id'],
    };
  }

  if (routes.follow && routes.follow.evidence !== 'observed') {
    routes.follow.evidence = 'bundle';
    routes.follow.bodyKeys = ['user_id', 'source'];
  }

  if (routes.search && routes.search_users) delete routes.search;
  return { routes, updated };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const routes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
  const { updated } = applyWebClientMethodsToRoutes(routes);
  fs.writeFileSync(routesPath, `${JSON.stringify(routes, null, 2)}\n`);
  console.log(`[sync-web-client-methods] updated ${updated} routes from web-client-methods.md`);
}
