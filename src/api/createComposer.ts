import webApiRoutes from '../../electron/webApiRoutes.json' with { type: 'json' };

/** Privacy choices aligned with get_create_channel_targets.channel_capabilities keys. */
export type CreateAudience =
  | 'public'
  | 'social'
  | 'friends'
  | 'friends-of-friends'
  | 'closed'
  | 'house';

export type ChannelCapability = {
  is_handraise_available?: boolean;
  is_topics_available?: boolean;
  is_pinned_links_available?: boolean;
  is_automatic_speaker_approval_available?: boolean;
  is_replay_available?: boolean;
  is_previewing_enabled?: boolean;
  chat_permission_default?: number;
  handraise_queue_default?: number;
};

export type CreateChannelTargets = {
  channel_capabilities?: Record<string, ChannelCapability>;
  channel_chat_default_on?: boolean;
  web_listening_default_on?: boolean;
  clubs?: Array<{
    social_club_id?: number;
    name?: string;
    photo_url?: string | null;
    is_open_to_anyone?: boolean;
    access_label?: string;
  }>;
  events?: unknown[];
  targets?: unknown[];
  /** Topic catalog when a dedicated list endpoint is ever bound; unused today. */
  topics?: Array<{ topic_id?: number; id?: number; name?: string; title?: string }>;
};

/** Candidate topic-list endpoints — none are in the web client module today (DX-1). */
export const TOPIC_LIST_ENDPOINT_CANDIDATES = [
  'get_topics',
  'get_available_topics',
  'get_channel_topics',
  'search_topics',
] as const;

/** Create-body keys that would mean auto-approve speakers (DX-3). None documented yet. */
export const AUTOMATIC_SPEAKER_APPROVAL_BODY_KEYS = [
  'is_automatic_speaker_approval',
  'automatic_speaker_approval',
  'auto_speaker_approval',
] as const;

export function topicListEndpointDocumented(
  routes: Record<string, { path?: string }> = webApiRoutes as Record<string, { path?: string }>,
): boolean {
  return TOPIC_LIST_ENDPOINT_CANDIDATES.some((name) => Boolean(routes[name]?.path));
}

export function automaticSpeakerApprovalBodyKeyDocumented(
  routeBodyKeys: string[] | undefined = (webApiRoutes as Record<string, { bodyKeys?: string[] }>).create_channel?.bodyKeys,
): boolean {
  const keys = new Set(routeBodyKeys ?? []);
  return AUTOMATIC_SPEAKER_APPROVAL_BODY_KEYS.some((key) => keys.has(key));
}

export function showTopicPicker(
  targets: CreateChannelTargets | null | undefined,
  audience: CreateAudience,
  routes: Record<string, { path?: string }> = webApiRoutes as Record<string, { path?: string }>,
): boolean {
  return topicListEndpointDocumented(routes)
    && capabilityForAudience(targets, audience)?.is_topics_available === true;
}

export function showAutomaticSpeakerApproval(
  targets: CreateChannelTargets | null | undefined,
  audience: CreateAudience,
): boolean {
  return automaticSpeakerApprovalBodyKeyDocumented()
    && capabilityForAudience(targets, audience)?.is_automatic_speaker_approval_available === true;
}

/** Body key for house rooms (bundle call site). */
export const CLUB_CREATE_BODY_KEY = 'social_club_id';

const PRIVACY_LABEL_KEYS: Record<CreateAudience, string> = {
  public: 'privacyPublic',
  social: 'privacySocial',
  friends: 'privacyFriends',
  'friends-of-friends': 'privacyFof',
  closed: 'privacyPrivate',
  house: 'privacyHouse',
};

export function privacyKeyForAudience(audience: CreateAudience): string {
  if (audience === 'friends') return 'friend';
  if (audience === 'friends-of-friends') return 'friend_of_friend';
  if (audience === 'house') return 'club';
  if (audience === 'closed') return 'closed';
  if (audience === 'social') return 'social';
  return 'public';
}

export function audienceFromPrivacyKey(key: string): CreateAudience | null {
  if (key === 'public') return 'public';
  if (key === 'social') return 'social';
  if (key === 'friend') return 'friends';
  if (key === 'friend_of_friend') return 'friends-of-friends';
  if (key === 'closed') return 'closed';
  if (key === 'club') return 'house';
  return null;
}

export function privacyLabelKey(audience: CreateAudience): string {
  return PRIVACY_LABEL_KEYS[audience];
}

export function composerPrivacyOptions(targets: CreateChannelTargets): CreateAudience[] {
  const caps = targets.channel_capabilities ?? {};
  const audiences: CreateAudience[] = [];
  for (const key of ['public', 'social', 'friend_of_friend', 'friend', 'closed']) {
    if (key in caps) {
      const audience = audienceFromPrivacyKey(key);
      if (audience) audiences.push(audience);
    }
  }
  if ('club' in caps && (targets.clubs?.length ?? 0) > 0) {
    audiences.push('house');
  }
  if (audiences.length === 0) {
    return ['public', 'friends', 'friends-of-friends', 'house'];
  }
  return audiences;
}

export function capabilityForAudience(
  targets: CreateChannelTargets | null | undefined,
  audience: CreateAudience,
): ChannelCapability | undefined {
  const key = privacyKeyForAudience(audience);
  return targets?.channel_capabilities?.[key];
}

export function createDefaults(
  targets: CreateChannelTargets | null | undefined,
  audience: CreateAudience,
): { replayEnabled: boolean; chatEnabled: boolean } {
  const cap = capabilityForAudience(targets, audience);
  const chatDefault = targets?.channel_chat_default_on !== false;
  return {
    chatEnabled: chatDefault,
    // Mobile parity (RH-14): replays on by default when the capability allows them.
    replayEnabled: cap?.is_replay_available !== false,
  };
}

export function buildCreateChannelBody(
  topic: string,
  options: {
    audience?: CreateAudience;
    replayEnabled?: boolean;
    chatEnabled?: boolean;
    socialClubId?: number | string;
    topicIds?: number[];
    userIds?: number[];
    handraisePermission?: number;
    link?: string;
  } = {},
): Record<string, unknown> {
  const audience = options.audience ?? 'public';
  const privacy_level = privacyKeyForAudience(audience);
  const is_social_mode = audience === 'social';
  const is_public_room = audience === 'public' || audience === 'social';
  const is_private = audience === 'closed';
  const body: Record<string, unknown> = {
    topic,
    privacy_level,
    is_public_room,
    is_private,
    is_social_mode,
    is_replay_enabled: options.replayEnabled !== false,
    is_chat_enabled: options.chatEnabled !== false,
    user_ids: options.userIds ?? [],
    topic_ids: options.topicIds ?? [],
    source: 14,
  };
  if (audience === 'house' && (typeof options.socialClubId === 'number' || typeof options.socialClubId === 'string')) {
    body[CLUB_CREATE_BODY_KEY] = options.socialClubId;
  }
  if (typeof options.handraisePermission === 'number') {
    body.handraise_permission = options.handraisePermission;
  }
  if (typeof options.link === 'string' && options.link.trim()) {
    body.link = options.link.trim();
  }
  return body;
}
