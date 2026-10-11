import webApiRoutes from '../../electron/webApiRoutes.json' with { type: 'json' };
import type { Evidence } from './capabilities';
import type { RequestBody } from './client';
import { createChannelBody } from './roomActions';

type RouteJson = {
  path: string;
  method: string;
  evidence?: string;
  mutation?: boolean;
};

const ROUTES = webApiRoutes as Record<string, RouteJson>;

export type EndpointDefinition = {
  name: string;
  path: string;
  method: string;
  evidence: Evidence;
  mutation: boolean;
  buildRequest?: (params: RequestBody) => RequestBody;
  map?: (json: unknown) => unknown;
};

function asEvidence(value: string | undefined): Evidence {
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

function requireString(params: RequestBody, key: string): string {
  const value = params[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing or invalid ${key}`);
  }
  return value;
}

function requireNumber(params: RequestBody, key: string): number {
  const value = params[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Missing or invalid ${key}`);
  }
  return value;
}

function audiencePrivacyLevel(audience: string): string {
  if (audience === 'friends') return 'friend';
  if (audience === 'friends-of-friends') return 'friend_of_friend';
  if (audience === 'house') return 'house';
  return 'public';
}

/** Request builders for contract-tested and common call sites. */
const REQUEST_BUILDERS: Partial<Record<string, (params: RequestBody) => RequestBody>> = {
  create_channel: (params) => {
    const topic = requireString(params, 'topic');
    const audience = typeof params.audience === 'string' ? params.audience : 'public';
    const replayEnabled = params.replayEnabled !== false;
    const chatEnabled = params.chatEnabled !== false;
    const captured = createChannelBody(topic, { audience, replayEnabled, chatEnabled });
    const body: RequestBody = captured ?? {
      topic,
      is_chat_enabled: chatEnabled,
      is_replay_enabled: replayEnabled,
      is_public_room: audience === 'public',
      is_private: false,
      is_social_mode: false,
      privacy_level: audiencePrivacyLevel(audience),
      user_ids: [],
      topic_ids: [],
    };
    if (params._sandbox === true) {
      if (typeof params.audience === 'string') body.audience = params.audience;
      if (typeof params.talk_user_id === 'number') body.talk_user_id = params.talk_user_id;
      if (typeof params.talk_user_name === 'string') body.talk_user_name = params.talk_user_name;
      if (typeof params.talk_user_username === 'string') body.talk_user_username = params.talk_user_username;
    }
    return body;
  },
  join_channel: (params) => ({ channel: requireString(params, 'channel') }),
  leave_channel: (params) => ({ channel: requireString(params, 'channel') }),
  active_ping: (params) => ({ channel: requireString(params, 'channel') }),
  audience_reply: (params) => {
    const raise = params.raise === true;
    return {
      channel: requireString(params, 'channel'),
      raise_hands: raise,
      unraise_hands: !raise,
    };
  },
  accept_speaker_invite: (params) => {
    const body: RequestBody = { channel: requireString(params, 'channel') };
    if (typeof params.user_id === 'number') body.user_id = params.user_id;
    return body;
  },
  send_channel_message: (params) => ({
    channel: requireString(params, 'channel'),
    message: requireString(params, 'message'),
  }),
  get_channel_messages: (params) => ({ channel: requireString(params, 'channel') }),
  emoji_reaction: (params) => ({
    channel: requireString(params, 'channel'),
    emoji: requireString(params, 'emoji'),
  }),
  set_channel_title: (params) => ({
    channel: requireString(params, 'channel'),
    title: requireString(params, 'title'),
  }),
  invite_speaker: (params) => ({
    channel: requireString(params, 'channel'),
    user_id: requireNumber(params, 'user_id'),
  }),
  uninvite_speaker: (params) => ({
    channel: requireString(params, 'channel'),
    user_id: requireNumber(params, 'user_id'),
  }),
  mute_speaker: (params) => ({
    channel: requireString(params, 'channel'),
    user_id: requireNumber(params, 'user_id'),
  }),
  make_moderator: (params) => ({
    channel: requireString(params, 'channel'),
    user_id: requireNumber(params, 'user_id'),
  }),
  block_from_channel: (params) => ({
    channel: requireString(params, 'channel'),
    user_id: requireNumber(params, 'user_id'),
  }),
  reject_speaker_invite: (params) => ({
    channel: requireString(params, 'channel'),
    user_id: requireNumber(params, 'user_id'),
  }),
  invite_to_existing_channel: (params) => ({
    channel: requireString(params, 'channel'),
    user_id: requireNumber(params, 'user_id'),
  }),
  end_channel: (params) => {
    const channel = requireString(params, 'channel');
    return { channel, channel_id: channel };
  },
  make_channel_public: (params) => {
    const channel = requireString(params, 'channel');
    return { channel, channel_id: channel };
  },
  make_channel_social: (params) => {
    const channel = requireString(params, 'channel');
    return { channel, channel_id: channel };
  },
  change_handraise_settings: (params) => ({
    channel: requireString(params, 'channel'),
    is_enabled: params.isEnabled === true,
    handraise_permission: requireString(params, 'handraisePermission'),
  }),
  hide_channel: (params) => ({
    channel: requireString(params, 'channel'),
    hide: params.hide === true,
  }),
  get_online_friends: () => ({}),
  get_notifications: (params) => ({
    page_size: typeof params.page_size === 'number' ? params.page_size : 20,
    page: typeof params.page === 'number' ? params.page : 1,
  }),
  get_events: (params) => ({
    is_filtered: params.is_filtered === true,
    page_size: typeof params.page_size === 'number' ? params.page_size : 20,
    page: typeof params.page === 'number' ? params.page : 1,
  }),
};

function buildRegistry(): Record<string, EndpointDefinition> {
  const registry: Record<string, EndpointDefinition> = {};
  for (const [name, route] of Object.entries(ROUTES)) {
    registry[name] = {
      name,
      path: route.path,
      method: route.method,
      evidence: asEvidence(route.evidence),
      mutation: route.mutation === true,
      buildRequest: REQUEST_BUILDERS[name],
    };
  }
  return registry;
}

export const ENDPOINT_REGISTRY: Record<string, EndpointDefinition> = buildRegistry();

export function getEndpoint(name: string): EndpointDefinition {
  const entry = ENDPOINT_REGISTRY[name];
  if (!entry) throw new Error(`Unknown endpoint: ${name}`);
  return entry;
}

/** Endpoints covered by tests/contract.test.ts */
export const CONTRACT_ENDPOINTS = [
  'create_channel',
  'join_channel',
  'leave_channel',
  'active_ping',
  'audience_reply',
  'accept_speaker_invite',
  'send_channel_message',
  'get_channel_messages',
  'emoji_reaction',
  'set_channel_title',
  'invite_speaker',
  'uninvite_speaker',
  'mute_speaker',
  'make_moderator',
  'block_from_channel',
  'reject_speaker_invite',
  'invite_to_existing_channel',
  'end_channel',
  'make_channel_public',
  'make_channel_social',
  'change_handraise_settings',
  'hide_channel',
  'get_online_friends',
  'get_notifications',
  'get_events',
] as const;

export type ContractEndpointName = (typeof CONTRACT_ENDPOINTS)[number];

/** Sample params that mirror tests/contract.test.ts client wrappers. */
export const CONTRACT_SAMPLE_PARAMS: Record<ContractEndpointName, RequestBody> = {
  create_channel: {
    topic: 'contract-room',
    audience: 'friends-of-friends',
    replayEnabled: false,
    chatEnabled: false,
  },
  join_channel: { channel: 'abc123' },
  leave_channel: { channel: 'abc123' },
  active_ping: { channel: 'abc123' },
  audience_reply: { channel: 'abc123', raise: true },
  accept_speaker_invite: { channel: 'abc123' },
  send_channel_message: { channel: 'abc123', message: 'hello' },
  get_channel_messages: { channel: 'abc123' },
  emoji_reaction: { channel: 'abc123', emoji: '🔥' },
  set_channel_title: { channel: 'abc123', title: 'New title' },
  invite_speaker: { channel: 'abc123', user_id: 7 },
  uninvite_speaker: { channel: 'abc123', user_id: 7 },
  mute_speaker: { channel: 'abc123', user_id: 7 },
  make_moderator: { channel: 'abc123', user_id: 7 },
  block_from_channel: { channel: 'abc123', user_id: 7 },
  reject_speaker_invite: { channel: 'abc123', user_id: 7 },
  invite_to_existing_channel: { channel: 'abc123', user_id: 7 },
  end_channel: { channel: 'abc123' },
  make_channel_public: { channel: 'abc123' },
  make_channel_social: { channel: 'abc123' },
  change_handraise_settings: {
    channel: 'abc123',
    isEnabled: true,
    handraisePermission: 'friends_of_speakers',
  },
  hide_channel: { channel: 'abc123', hide: true },
  get_online_friends: {},
  get_notifications: {},
  get_events: {},
};

export function contractBodyKeys(endpoint: ContractEndpointName): string[] {
  const entry = getEndpoint(endpoint);
  if (!entry.buildRequest) throw new Error(`No buildRequest for ${endpoint}`);
  return Object.keys(entry.buildRequest(CONTRACT_SAMPLE_PARAMS[endpoint])).sort();
}
