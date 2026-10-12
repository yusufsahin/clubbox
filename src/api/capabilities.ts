import webApiRoutes from '../../electron/webApiRoutes.json' with { type: 'json' };

export type Evidence =
  | 'observed'
  | 'bundle'
  | 'community'
  | 'unsupported'
  | 'in-bundle'
  | 'mobile-spike';
export type Transport = 'web-session' | 'sandbox' | 'mobile';

type RouteRecord = {
  path: string;
  method: string;
  evidence?: string;
  mutation?: boolean;
  pathParams?: string[];
  transport?: string;
  mobilePath?: string;
};

const ROUTES = webApiRoutes as Record<string, RouteRecord>;

export function routeRecord(endpoint: string): RouteRecord | undefined {
  return ROUTES[endpoint];
}

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
  'become_speaker',
  'invite_speaker',
  'mute_speaker',
  'make_moderator',
  'uninvite_speaker',
  'block_from_channel',
  'create_channel',
  'end_channel',
  'get_group_suggested_invites',
  'get_edge_stories',
  'get_notifications',
  'get_events',
  'get_conversations',
  'get_conversation',
  'send_conversation_emoji_reaction',
  'get_conversation_unread_summary',
  'get_user_social_clubs',
  'get_social_club',
  'get_social_club_members',
  'get_social_club_messages',
  'send_social_club_message',
  'get_replay_channel',
  'get_replay_channel_chunk',
  'get_highlight',
  'delete_conversation',
  'update_conversation_title',
  'add_conversation_segment',
  'create_conversation',
  'mark_conversation_segment_listened',
  'gif_reaction',
  'get_social_club_message_thread',
  'send_social_club_message_emoji_reaction',
  'send_social_club_threaded_message',
  'update_last_read_social_club_message',
  'hide_channel',
  'change_handraise_settings',
  'set_channel_title',
  'emoji_reaction',
  'invite_to_existing_channel',
  'make_channel_public',
  'make_channel_social',
  'reject_speaker_invite',
  'save_replay',
  'check_channel_link',
  'add_channel_link',
  'remove_channel_link',
  'enable_channel_messages',
  'disable_channel_messages',
  'delete_channel_message',
  'disable_replay',
  'get_handraise_queue',
  'get_suggested_speakers',
  'update_nsfw_status',
  'get_moderator_action_history',
  'update_handraise_queue_setting',
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
  /**
   * Phase 27: web session authenticates on clubhouseapi.com (mobileAuthStatus.linked).
   * Required for transport:"mobile" / evidence mobile-spike host tools.
   */
  mobileLinked?: boolean;
};

/** Moderation endpoints that use the mobile API host (Phase 27). */
export const MOBILE_HOST_ENDPOINTS = new Set([
  'invite_speaker',
  'uninvite_speaker',
  'mute_speaker',
  'make_moderator',
  'block_from_channel',
  'end_channel',
  'change_handraise_settings',
  'get_channel',
  'reject_speaker_invite',
  'invite_to_existing_channel',
  'hide_channel',
  'save_replay',
  'check_channel_link',
  'add_channel_link',
  'remove_channel_link',
  'enable_channel_messages',
  'disable_channel_messages',
  'delete_channel_message',
  'disable_replay',
  'get_handraise_queue',
  'get_suggested_speakers',
  'update_nsfw_status',
  'get_moderator_action_history',
  'update_handraise_queue_setting',
]);

/**
 * Remaining room-host tools that still go through the web session (PRD C).
 * Speculative community reads (events, notifications, …) still need the toggle.
 */
export const HOST_COMMUNITY_ENDPOINTS = new Set([
  'make_channel_public',
  'make_channel_social',
]);

export function isMobileHostEndpoint(endpoint: string): boolean {
  const route = ROUTES[endpoint];
  return route?.transport === 'mobile' || MOBILE_HOST_ENDPOINTS.has(endpoint);
}

export function isHostCommunityEndpoint(endpoint: string): boolean {
  return HOST_COMMUNITY_ENDPOINTS.has(endpoint) || isMobileHostEndpoint(endpoint);
}

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
    || value === 'mobile-spike'
  ) {
    return value;
  }
  return 'unsupported';
}

export function transportsOf(endpoint: string): Array<'web-session' | 'mobile'> {
  if (!ROUTES[endpoint]) return [];
  if (ROUTES[endpoint].transport === 'mobile') return ['mobile'];
  return ['web-session'];
}

export function routeMethod(endpoint: string): string {
  return ROUTES[endpoint]?.method ?? 'POST';
}

export function routePath(endpoint: string): string {
  return ROUTES[endpoint]?.path ?? `/web_api/${endpoint}`;
}

export function mobileRoutePath(endpoint: string): string {
  const route = ROUTES[endpoint];
  if (route?.mobilePath) return route.mobilePath.replace(/^\//, '');
  if (route?.transport === 'mobile') return endpoint;
  return endpoint;
}

export function canCall(
  endpoint: string,
  transport: Transport,
  options?: CanCallOptions,
): boolean {
  if (transport === 'sandbox') return SANDBOX_ENDPOINTS.has(endpoint);

  const disabled = options?.sessionDisabled ? new Set(options.sessionDisabled) : null;
  if (disabled?.has(endpoint)) return false;

  const mobileHost = isMobileHostEndpoint(endpoint);
  const hostTool = isHostCommunityEndpoint(endpoint);

  const markedAt = options?.unsupportedRoutes?.[endpoint];
  // Host tools stay callable after a 404 — burying mute/end room made the app unusable.
  if (!hostTool && markedAt && (!options.appVersion || markedAt === options.appVersion)) return false;

  const evidence = evidenceOf(endpoint, options?.evidenceOverrides);
  if (evidence === 'in-bundle') return false;

  if (mobileHost || evidence === 'mobile-spike') {
    if (transport !== 'web-session' && transport !== 'mobile') return false;
    return options?.mobileLinked === true;
  }

  if (evidence === 'unsupported' && !hostTool) return false;
  if (transport !== 'web-session') return false;
  if (evidence === 'observed' || evidence === 'bundle') return true;
  if (evidence === 'community' || (evidence === 'unsupported' && hostTool)) {
    if (HOST_COMMUNITY_ENDPOINTS.has(endpoint)) return true;
    return options?.experimentalActions === true;
  }
  return false;
}
