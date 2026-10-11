import webApiRoutes from '../../electron/webApiRoutes.json' with { type: 'json' };

export type Evidence = 'observed' | 'configured-unverified' | 'unsupported' | 'in-bundle';
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

export function evidenceOf(endpoint: string): Evidence {
  const route = ROUTES[endpoint];
  if (!route) return 'unsupported';
  if (route.evidence === 'observed' || route.evidence === 'unsupported' || route.evidence === 'in-bundle') {
    return route.evidence;
  }
  return 'configured-unverified';
}

export function transportsOf(endpoint: string): Array<'web-session'> {
  if (!ROUTES[endpoint]) return [];
  return ['web-session'];
}

export function canCall(
  endpoint: string,
  transport: Transport,
  options?: { allowUnverified?: boolean },
): boolean {
  if (transport === 'sandbox') return SANDBOX_ENDPOINTS.has(endpoint);
  const evidence = evidenceOf(endpoint);
  if (evidence === 'unsupported' || evidence === 'in-bundle') return false;
  if (transport !== 'web-session') return false;
  const route = ROUTES[endpoint];
  if (route?.evidence === 'observed') return true;
  if (route?.mutation) return options?.allowUnverified === true;
  return true;
}
