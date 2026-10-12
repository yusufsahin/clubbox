/**
 * Phase 30.2 — detect when Clubhouse web adds moderation `/web_api` routes.
 * Pure helpers; names only — never tokens/cookies.
 */

/** Endpoints that would unlock desktop host tools if they appear as web_api. */
const MODERATION_WATCHLIST = [
  'end_channel',
  'mute_speaker',
  'invite_speaker',
  'uninvite_speaker',
  'make_moderator',
  'block_from_channel',
  'remove_from_channel',
  'disable_channel_messages',
  'enable_channel_messages',
  'delete_channel_message',
  'disable_replay',
  'add_channel_link',
  'remove_channel_link',
  'get_handraise_queue',
  'get_moderator_action_history',
];

/**
 * @param {Iterable<string>|null|undefined} previous
 * @param {Iterable<string>|null|undefined} current
 * @returns {{ added: string[], removed: string[], unchanged: string[] }}
 */
function diffEndpointSets(previous, current) {
  const prev = new Set([...(previous || [])].filter((n) => typeof n === 'string' && n));
  const curr = new Set([...(current || [])].filter((n) => typeof n === 'string' && n));
  const added = [...curr].filter((n) => !prev.has(n)).sort();
  const removed = [...prev].filter((n) => !curr.has(n)).sort();
  const unchanged = [...curr].filter((n) => prev.has(n)).sort();
  return { added, removed, unchanged };
}

/**
 * @param {Iterable<string>|null|undefined} added
 * @param {Iterable<string>|null|undefined} [watchlist]
 * @returns {string[]}
 */
function watchlistHits(added, watchlist = MODERATION_WATCHLIST) {
  const watch = new Set(watchlist);
  return [...new Set([...(added || [])].filter((n) => watch.has(n)))].sort();
}

/**
 * Collect endpoint names from crawler script analysis (calls + endpoints arrays).
 * @param {Array<{ endpoints?: string[], calls?: Array<{ name?: string }> }>|null|undefined} scripts
 * @returns {string[]}
 */
function endpointNamesFromScripts(scripts) {
  const names = new Set();
  for (const script of scripts || []) {
    for (const name of script.endpoints || []) {
      if (typeof name === 'string' && name) names.add(name);
    }
    for (const call of script.calls || []) {
      if (typeof call?.name === 'string' && call.name) names.add(call.name);
    }
  }
  return [...names].sort();
}

/**
 * @param {object} input
 * @param {string} input.buildId
 * @param {string[]} input.previous
 * @param {string[]} input.current
 * @param {string} [input.previousBuildId]
 * @returns {{ buildId: string, previousBuildId: string|null, added: string[], removed: string[], unchanged: string[], watchlistHits: string[] }}
 */
function buildEndpointsDiff(input) {
  const diff = diffEndpointSets(input.previous, input.current);
  return {
    buildId: input.buildId,
    previousBuildId: input.previousBuildId || null,
    added: diff.added,
    removed: diff.removed,
    unchanged: diff.unchanged,
    watchlistHits: watchlistHits(diff.added),
  };
}

module.exports = {
  MODERATION_WATCHLIST,
  diffEndpointSets,
  watchlistHits,
  endpointNamesFromScripts,
  buildEndpointsDiff,
};
