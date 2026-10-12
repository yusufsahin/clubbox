import type { CHChannelDetail, CHUser } from './types.ts';

function asBool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * Map a get_channel / join users[] row onto CHUser (roles + mute + hand).
 */
export function mapChannelUser(raw: unknown): CHUser | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const userId = asNumber(row.user_id);
  if (userId == null) return null;
  const name = asString(row.name) ?? asString(row.firstname) ?? '';
  const username = asString(row.username) ?? '';
  const photo = asString(row.photo_url) ?? null;
  const user: CHUser = {
    user_id: userId,
    name,
    username,
    photo_url: photo,
  };
  const isModerator = asBool(row.is_moderator);
  if (isModerator !== undefined) user.is_moderator = isModerator;
  const isSpeaker = asBool(row.is_speaker);
  if (isSpeaker !== undefined) user.is_speaker = isSpeaker;
  const isMuted = asBool(row.is_muted);
  if (isMuted !== undefined) user.is_muted = isMuted;
  const isSpeaking = asBool(row.is_speaking);
  if (isSpeaking !== undefined) user.is_speaking = isSpeaking;
  const isHandRaised = asBool(row.is_hand_raised);
  if (isHandRaised !== undefined) user.is_hand_raised = isHandRaised;
  const invited = asBool(row.is_invited_to_speak);
  if (invited !== undefined) user.is_invited_to_speak = invited;
  const bio = asString(row.bio);
  if (bio !== undefined) user.bio = bio;
  return user;
}

function keepToken(snapshot: string | undefined, current: string | undefined): string | undefined {
  if (typeof snapshot === 'string' && snapshot.length > 0) return snapshot;
  return current;
}

/**
 * Merge order (Task 28.1): get_channel snapshot → keep local speaking / tokens →
 * caller applies Agora mute overlay last.
 */
export function mergeRoomState(
  current: CHChannelDetail,
  snapshot: CHChannelDetail,
): CHChannelDetail {
  const mapped = (snapshot.users ?? [])
    .map(mapChannelUser)
    .filter((user): user is CHUser => !!user)
    .map((user) => {
      const prev = current.users.find((entry) => entry.user_id === user.user_id);
      if (prev && user.is_speaking == null && typeof prev.is_speaking === 'boolean') {
        return { ...user, is_speaking: prev.is_speaking };
      }
      return user;
    });

  return {
    ...current,
    channel_id: snapshot.channel_id ?? current.channel_id,
    channel: snapshot.channel || current.channel,
    topic: typeof snapshot.topic === 'string' ? snapshot.topic : current.topic,
    is_private: typeof snapshot.is_private === 'boolean' ? snapshot.is_private : current.is_private,
    is_social_mode: typeof snapshot.is_social_mode === 'boolean'
      ? snapshot.is_social_mode
      : current.is_social_mode,
    num_speakers: typeof snapshot.num_speakers === 'number' ? snapshot.num_speakers : current.num_speakers,
    num_all: typeof snapshot.num_all === 'number' ? snapshot.num_all : current.num_all,
    has_raised_hands: typeof snapshot.has_raised_hands === 'boolean'
      ? snapshot.has_raised_hands
      : current.has_raised_hands,
    is_replay_enabled: typeof snapshot.is_replay_enabled === 'boolean'
      ? snapshot.is_replay_enabled
      : current.is_replay_enabled,
    is_clips_enabled: typeof snapshot.is_clips_enabled === 'boolean'
      ? snapshot.is_clips_enabled
      : current.is_clips_enabled,
    is_handraise_enabled: typeof snapshot.is_handraise_enabled === 'boolean'
      ? snapshot.is_handraise_enabled
      : current.is_handraise_enabled,
    handraise_queue_setting: typeof snapshot.handraise_queue_setting === 'number'
      ? snapshot.handraise_queue_setting
      : current.handraise_queue_setting,
    handraise_permission: typeof snapshot.handraise_permission === 'number'
      ? snapshot.handraise_permission
      : current.handraise_permission,
    is_chat_enabled: typeof snapshot.is_chat_enabled === 'boolean'
      ? snapshot.is_chat_enabled
      : current.is_chat_enabled,
    privacy_settings: snapshot.privacy_settings ?? current.privacy_settings,
    user_capabilities: snapshot.user_capabilities
      ? { ...(current.user_capabilities ?? {}), ...snapshot.user_capabilities }
      : current.user_capabilities,
    users: mapped.length ? mapped : current.users,
    token: keepToken(snapshot.token, current.token),
    pubnub_token: keepToken(snapshot.pubnub_token, current.pubnub_token),
    pubnub_origin: keepToken(snapshot.pubnub_origin, current.pubnub_origin),
  };
}
