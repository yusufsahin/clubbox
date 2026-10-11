/**
 * Mutation rule from features/api_health.feature (PRD §2 rule 1).
 * Prefixes/names that create, send, delete, update, join, leave, ping, react, follow, mute, invite, or mark.
 */
const MUTATION_PREFIXES = [
  'send_',
  'create_',
  'delete_',
  'update_',
  'set_',
  'mark_',
  'mute_',
  'invite_',
  'uninvite_',
  'make_',
  'block_',
  'end_',
  'change_',
  'hide_',
  'accept_',
  'reject_',
  'become_',
  'add_',
] as const;

const MUTATION_NAMES = new Set([
  'talk',
  'emoji_reaction',
  'gif_reaction',
  'audience_reply',
  'follow',
  'unfollow',
]);

export function expectedMutation(endpoint: string): boolean {
  const name = endpoint.replace(/^\//, '');
  if (MUTATION_NAMES.has(name)) return true;
  if (name.endsWith('_ping')) return true;
  if (name.startsWith('join') || name.startsWith('leave')) return true;
  if (name.startsWith('follow') || name.startsWith('unfollow')) return true;
  return MUTATION_PREFIXES.some((prefix) => name.startsWith(prefix));
}
