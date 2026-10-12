import webApiRoutes from '../../electron/webApiRoutes.json' with { type: 'json' };
import type { Evidence } from './capabilities';
import type { RequestBody } from './client';
import type { CreateAudience } from './createComposer';
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

/** Request builders for contract-tested and common call sites. */
const REQUEST_BUILDERS: Partial<Record<string, (params: RequestBody) => RequestBody>> = {
  create_channel: (params) => {
    const topic = requireString(params, 'topic');
    const audience = typeof params.audience === 'string' ? params.audience as CreateAudience : 'public';
    const replayEnabled = params.replayEnabled !== false;
    const chatEnabled = params.chatEnabled !== false;
    const socialClubId = typeof params.socialClubId === 'number' || typeof params.socialClubId === 'string'
      ? params.socialClubId
      : undefined;
    const handraisePermission = typeof params.handraisePermission === 'number' ? params.handraisePermission : undefined;
    const link = typeof params.link === 'string' ? params.link : undefined;
    const userIds = Array.isArray(params.userIds)
      ? params.userIds.filter((id): id is number => typeof id === 'number' && Number.isFinite(id))
      : typeof params.talk_user_id === 'number'
        ? [params.talk_user_id]
        : undefined;
    const body: RequestBody = createChannelBody(topic, {
      audience,
      replayEnabled,
      chatEnabled,
      socialClubId,
      handraisePermission,
      link,
      userIds,
    });
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
  become_speaker: (params) => {
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
    // Community clients send numeric channel_id alongside the channel code.
    const rawId = params.channel_id ?? channel;
    const asNum = typeof rawId === 'number' ? rawId : Number(rawId);
    const channel_id = Number.isFinite(asNum) && String(rawId).trim() === String(asNum)
      ? asNum
      : rawId;
    return { channel, channel_id };
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
    // Community clients (stypr/clubhouse-py): 1 = everyone, 2 = friends of speakers.
    handraise_permission: requireNumber(params, 'handraisePermission'),
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
  get_conversation: (params) => ({ conversation_id: requireString(params, 'conversation_id') }),
  mark_conversation_segment_listened: (params) => ({
    conversation_id: requireString(params, 'conversation_id'),
    segment_id: requireString(params, 'segment_id'),
  }),
  add_conversation_segment: (params) => {
    const body: RequestBody = {
      conversation_id: requireString(params, 'conversation_id'),
      audio_file: typeof params.audio_file === 'string' ? params.audio_file : '',
      audio_format_type: typeof params.audio_format_type === 'string' ? params.audio_format_type : 'aac',
      client_segment_id: typeof params.client_segment_id === 'string' ? params.client_segment_id : 'client-segment',
      segment_batch_id: typeof params.segment_batch_id === 'string' ? params.segment_batch_id : 'batch',
      duration: typeof params.duration === 'number' ? params.duration : 0,
      attached_url: typeof params.attached_url === 'string' ? params.attached_url : '',
    };
    body.message = typeof params.message === 'string' ? params.message : '';
    return body;
  },
  create_conversation: (params) => ({
    privacy_level: typeof params.privacy_level === 'string' ? params.privacy_level : 'private',
    social_club_id: typeof params.social_club_id === 'number' ? params.social_club_id : 0,
    is_private: params.is_private !== false,
    user_ids: Array.isArray(params.user_ids) ? params.user_ids : [],
    source: typeof params.source === 'number' ? params.source : 14,
  }),
  send_conversation_emoji_reaction: (params) => ({
    conversation_id: requireString(params, 'conversation_id'),
    segment_id: requireString(params, 'segment_id'),
    emoji: requireString(params, 'emoji'),
  }),
  get_conversation_unread_summary: (params) => ({
    conversation_id: requireString(params, 'conversation_id'),
  }),
  update_conversation_title: (params) => ({
    conversation_id: requireString(params, 'conversation_id'),
    title: requireString(params, 'title'),
  }),
  delete_conversation: (params) => ({
    conversation_id: requireString(params, 'conversation_id'),
  }),
  get_conversations: (params) => {
    const body: RequestBody = {
      is_private_only: params.is_private_only !== false,
    };
    if (typeof params.next_cursor === 'string' && params.next_cursor) body.next_cursor = params.next_cursor;
    return body;
  },
  get_channels: (params) => {
    const body: RequestBody = {};
    if (typeof params.next_cursor === 'string' && params.next_cursor) body.next_cursor = params.next_cursor;
    return body;
  },
  get_feed_v3: (params) => {
    const body: RequestBody = {};
    if (typeof params.next_cursor === 'string' && params.next_cursor) body.next_cursor = params.next_cursor;
    return body;
  },
  get_edge_stories: (params) => {
    const body: RequestBody = {};
    if (typeof params.next_cursor === 'string' && params.next_cursor) body.next_cursor = params.next_cursor;
    return body;
  },
  get_group_suggested_invites: (params) => {
    const body: RequestBody = {};
    if (typeof params.query === 'string') body.query = params.query;
    if (typeof params.social_club_id === 'number') body.social_club_id = params.social_club_id;
    return body;
  },
  get_profile: (params) => {
    if (typeof params.username === 'string' && params.username.trim()) {
      return { username: params.username.trim().replace(/^@/, '') };
    }
    return { user_id: requireNumber(params, 'user_id') };
  },
  follow: (params) => ({
    user_id: requireNumber(params, 'user_id'),
    source: typeof params.source === 'number' ? params.source : 4,
  }),
  gif_reaction: (params) => ({
    channel: requireString(params, 'channel'),
    giphy_id: requireString(params, 'giphy_id'),
  }),
  get_user_social_clubs: () => ({}),
  get_social_club: (params) => {
    if (typeof params.social_club_id === 'number') {
      const body: RequestBody = { social_club_id: params.social_club_id };
      if (params.is_for_social_club_open === true) body.is_for_social_club_open = true;
      return body;
    }
    return { social_club_slug: requireString(params, 'social_club_slug') };
  },
  get_social_club_members: (params) => ({ social_club_id: requireNumber(params, 'social_club_id') }),
  get_social_club_messages: (params) => ({
    social_club_id: requireNumber(params, 'social_club_id'),
    social_club_slug: requireString(params, 'social_club_slug'),
  }),
  send_social_club_message: (params) => ({
    social_club_id: requireNumber(params, 'social_club_id'),
    social_club_slug: requireString(params, 'social_club_slug'),
    message: requireString(params, 'message'),
  }),
  get_social_club_message_thread: (params) => ({
    social_club_id: requireNumber(params, 'social_club_id'),
    message_id_str: requireString(params, 'message_id_str'),
  }),
  send_social_club_message_emoji_reaction: (params) => ({
    social_club_id: requireNumber(params, 'social_club_id'),
    message_id: requireString(params, 'message_id'),
    add_reaction: params.add_reaction !== false,
    emoji_id: requireString(params, 'emoji_id'),
  }),
  send_social_club_threaded_message: (params) => ({
    social_club_id: requireNumber(params, 'social_club_id'),
    message_id_str: requireString(params, 'message_id_str'),
    message: requireString(params, 'message'),
  }),
  update_last_read_social_club_message: (params) => ({
    message_id: requireString(params, 'message_id'),
    social_club_id: requireNumber(params, 'social_club_id'),
  }),
  // Path-param GETs: body carries path segments; Electron expands the URL.
  get_replay_channel: (params) => ({ channel: requireString(params, 'channel') }),
  get_replay_channel_chunk: (params) => ({
    channel: requireString(params, 'channel'),
    chunk: requireString(params, 'chunk'),
  }),
  get_highlight: (params) => ({
    id: typeof params.id === 'string' ? params.id : requireString(params, 'highlight_id'),
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
  'become_speaker',
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
  become_speaker: { channel: 'abc123' },
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
  end_channel: { channel: 'abc123', channel_id: 42 },
  make_channel_public: { channel: 'abc123' },
  make_channel_social: { channel: 'abc123' },
  change_handraise_settings: {
    channel: 'abc123',
    isEnabled: true,
    handraisePermission: 2,
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
