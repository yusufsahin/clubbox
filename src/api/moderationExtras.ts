import webApiRoutes from '../../electron/webApiRoutes.json' with { type: 'json' };
import { documentedBodyKeys } from './documentedBodies.ts';

type RouteTable = Record<string, { path?: string; evidence?: string }>;

const routes = webApiRoutes as RouteTable;

function hasCallableEndpoint(endpoint: string): boolean {
  return Boolean(routes[endpoint]?.path) && documentedBodyKeys(endpoint).length > 0;
}

export function moderationEndpoint(feature: 'room_chat_off' | 'delete_message' | 'pinned_link' | 'web_listening'): string | null {
  switch (feature) {
    case 'room_chat_off':
      return hasCallableEndpoint('disable_channel_messages') ? 'disable_channel_messages' : null;
    case 'delete_message':
      return hasCallableEndpoint('delete_channel_message') ? 'delete_channel_message' : null;
    case 'pinned_link':
      return hasCallableEndpoint('add_channel_link') ? 'add_channel_link' : null;
    case 'web_listening':
      return hasCallableEndpoint('set_web_listening_enabled') ? 'set_web_listening_enabled' : null;
    default: {
      const _exhaustive: never = feature;
      return _exhaustive;
    }
  }
}

export function visibilityChangeEndpoint(visibility: 'open' | 'social'): string | null {
  if (visibility === 'open' && routes.make_channel_public?.path) return 'make_channel_public';
  if (visibility === 'social' && routes.make_channel_social?.path) return 'make_channel_social';
  return null;
}
