import webApiRoutes from '../../electron/webApiRoutes.json' with { type: 'json' };

export type Evidence = 'observed' | 'bundle' | 'community' | 'unsupported' | 'in-bundle';
export type Transport = 'web-session' | 'sandbox';

type RouteRecord = {
  path: string;
  method: string;
  evidence?: string;
  mutation?: boolean;
};

const ROUTES = webApiRoutes as Record<string, RouteRecord>;

const SANDBOX_ENDPOINTS = new Set([
  'start_phone_number_auth',
  'complete_phone_number_auth',
  'me',
  'get_channels',
  'get_channel',
  'join_channel',
  'leave_channel',
  'active_ping',
  'audience_reply',
  'accept_speaker_invite',
  'invite_speaker',
  'mute_speaker',
  'make_moderator',
  'uninvite_speaker',
  'create_channel',
  'end_channel',
  'get_group_suggested_invites',
  'get_edge_stories',
  'get_conversations',
  'get_profile',
  'get_followers',
  'get_following',
  'follow',
  'unfollow',
  'search_users',
  'get_channel_messages',
  'send_channel_message',
]);

export type CanCallOptions = {
  experimentalActions?: boolean;
  /** endpoint → appVersion that marked it unsupported after 404/405 */
  unsupportedRoutes?: Record<string, string>;
  appVersion?: string;
  sessionDisabled?: Iterable<string>;
  /** Local promotions / test overrides (e.g. observed after a logged 2xx). */
  evidenceOverrides?: Record<string, Evidence>;
};

export function evidenceOf(endpoint: string, overrides?: Record<string, Evidence>): Evidence {
  const overridden = overrides?.[endpoint];
  if (overridden) return overridden;
  const route = ROUTES[endpoint];
  if (!route) return 'unsupported';
  const value = route.evidence;
  if (
    value === 'observed'
    || value === 'bundle'
    || value === 'community'
    || value === 'unsupported'
    || value === 'in-bundle'
  ) {
    return value;
  }
  return 'unsupported';
}

export function transportsOf(endpoint: string): Array<'web-session'> {
  if (!ROUTES[endpoint]) return [];
  return ['web-session'];
}

export function routeMethod(endpoint: string): string {
  return ROUTES[endpoint]?.method ?? 'POST';
}

export function routePath(endpoint: string): string {
  return ROUTES[endpoint]?.path ?? `/web_api/${endpoint}`;
}

export function canCall(
  endpoint: string,
  transport: Transport,
  options?: CanCallOptions,
): boolean {
  if (transport === 'sandbox') return SANDBOX_ENDPOINTS.has(endpoint);

  const disabled = options?.sessionDisabled ? new Set(options.sessionDisabled) : null;
  if (disabled?.has(endpoint)) return false;

  const markedAt = options?.unsupportedRoutes?.[endpoint];
  if (markedAt && (!options.appVersion || markedAt === options.appVersion)) return false;

  const evidence = evidenceOf(endpoint, options?.evidenceOverrides);
  if (evidence === 'unsupported' || evidence === 'in-bundle') return false;
  if (transport !== 'web-session') return false;
  if (evidence === 'observed' || evidence === 'bundle') return true;
  if (evidence === 'community') return options?.experimentalActions === true;
  return false;
}
