import { profileRefreshUserId } from './roomProfileCache.ts';
import type { CHChannelDetail, CHChatMessage, CHUser } from './types.ts';

export type RealtimeStageEvent =
  | 'user_joined'
  | 'user_left'
  | 'hand_raised'
  | 'speaker_added'
  | 'speaker_removed'
  | 'moderator_added'
  | 'invite_to_speak'
  | 'hand_lowered'
  | 'user_removed'
  | 'room_ended';

export type RealtimeChatEvent = {
  kind: 'channel_message';
  message: CHChatMessage;
};

export type RealtimeReactionEvent = {
  kind: 'channel_reaction';
  emoji: string;
  fromName: string;
  targetName: string;
};

export type RealtimeUnknownEvent = {
  kind: 'unknown';
  type: string;
  keys: string[];
};

export type RealtimeSpeakerCallStatusEvent = {
  kind: 'speaker_call_status';
  userId: number;
  isOnCall: boolean;
  audioProfile?: string | number;
};

export type ParsedRealtimeEvent =
  | { kind: 'stage'; type: RealtimeStageEvent; userName: string; userId?: number | null; profile?: Partial<CHUser> | null }
  | { kind: 'ignored'; reason: 'other_channel' | 'noop' }
  | { kind: 'channel_patch'; patch: Partial<CHChannelDetail> }
  | RealtimeChatEvent
  | RealtimeReactionEvent
  | RealtimeSpeakerCallStatusEvent
  | RealtimeUnknownEvent
  | { kind: 'room_ended' };

/** Logged once per distinct profile value (shape only — never tokens). */
const seenAudioProfiles = new Set<string>();

/** True when PubNub audio_profile indicates music mode. */
export function isMusicAudioProfile(profile: string | number | undefined | null): boolean {
  if (profile == null) return false;
  return String(profile).toLowerCase().includes('music');
}

/** Log unknown audio_profile values once (type + length only). */
export function noteAudioProfileSeen(profile: string | number | undefined): void {
  if (profile === undefined) return;
  if (isMusicAudioProfile(profile)) return;
  const key = `${typeof profile}:${String(profile)}`;
  if (seenAudioProfiles.has(key)) return;
  seenAudioProfiles.add(key);
  // Known non-music shapes (speech / default / small ints) stay quiet after first note.
  console.info('[clubbox] audio_profile', {
    typeof: typeof profile,
    len: String(profile).length,
  });
}

export type ApplyRoomEventOpts = {
  myUserId?: number | null;
  /** Agora mute overlay applied after stage/user mutations. */
  overlayUsers?: (users: CHUser[]) => CHUser[];
};

export type ApplyRoomEventResult = {
  channel: CHChannelDetail;
  effects: {
    ended?: boolean;
    invite?: boolean;
    chat?: CHChatMessage;
    reaction?: RealtimeReactionEvent;
    unknown?: { type: string; keys: string[] };
    ignored?: boolean;
    /** Re-fetch get_profile for this user (add_speaker / uninvite / make_moderator). */
    profileRefreshUserId?: number;
  };
};

/**
 * Pure room reducer: join snapshot + PubNub deltas (+ optional mute overlay).
 * Side effects (toasts, leave) stay in the coordinator; this only returns next state.
 */
export function applyRoomEvent(
  channel: CHChannelDetail,
  event: ParsedRealtimeEvent,
  opts: ApplyRoomEventOpts = {},
): ApplyRoomEventResult {
  const overlay = opts.overlayUsers ?? ((users: CHUser[]) => users);

  switch (event.kind) {
    case 'ignored':
      return { channel, effects: { ignored: true } };
    case 'unknown':
      return { channel, effects: { unknown: { type: event.type, keys: event.keys } } };
    case 'room_ended':
      return { channel, effects: { ended: true } };
    case 'channel_message':
      return { channel, effects: { chat: event.message } };
    case 'channel_reaction':
      return { channel, effects: { reaction: event } };
    case 'channel_patch': {
      const nextCaps = event.patch.user_capabilities
        ? { ...(channel.user_capabilities ?? {}), ...event.patch.user_capabilities }
        : channel.user_capabilities;
      return {
        channel: {
          ...channel,
          ...event.patch,
          user_capabilities: nextCaps,
          users: channel.users,
        },
        effects: {},
      };
    }
    case 'speaker_call_status': {
      noteAudioProfileSeen(event.audioProfile);
      const users = channel.users.map((user) => {
        if (user.user_id !== event.userId) return user;
        const next: CHUser = { ...user, is_on_call: event.isOnCall };
        if (event.audioProfile !== undefined) next.audio_profile = event.audioProfile;
        return next;
      });
      return { channel: { ...channel, users: overlay(users) }, effects: {} };
    }
    case 'stage': {
      const stageEvent: Extract<ParsedRealtimeEvent, { kind: 'stage' }> =
        event.type === 'invite_to_speak' && opts.myUserId != null
          ? { ...event, userId: opts.myUserId, profile: null }
          : event;
      const users = applyStageEvent(channel.users, stageEvent);
      const refreshId = profileRefreshUserId(event);
      return {
        channel: mergeChannelUsers(channel, overlay(users)),
        effects: {
          ...(event.type === 'invite_to_speak' ? { invite: true } : {}),
          ...(refreshId != null ? { profileRefreshUserId: refreshId } : {}),
        },
      };
    }
    default: {
      const _exhaustive: never = event;
      void _exhaustive;
      return { channel, effects: {} };
    }
  }
}

function readName(raw: Record<string, unknown>, fallback = 'Guest'): string {
  if (typeof raw.name === 'string' && raw.name) return raw.name;
  if (typeof raw.from_name === 'string' && raw.from_name) return raw.from_name;
  const profile = raw.user_profile ?? raw.action_user_profile ?? raw.target_user_profile;
  if (profile && typeof profile === 'object' && typeof (profile as { name?: string }).name === 'string') {
    return (profile as { name: string }).name;
  }
  return fallback;
}

/**
 * PubNub channels the official clients subscribe to for a room (grishka/Houseclub, seovchinnikov/clubhouse-web).
 * channel_speakers is only granted to moderators; subscribing without the grant fails the whole request.
 */
export function roomPubNubChannels(channel: string, userId: number | string, isModerator: boolean): string[] {
  const channels = [`users.${userId}`, `channel_user.${channel}.${userId}`, `channel_all.${channel}`];
  if (isModerator) channels.push(`channel_speakers.${channel}`);
  return channels;
}

/** Clubhouse room actions (payload key "action") mapped to the stage events Clubbox applies. */
const CLUBHOUSE_ACTIONS: Record<string, RealtimeStageEvent | 'room_ended'> = {
  join_channel: 'user_joined',
  leave_channel: 'user_left',
  remove_from_channel: 'user_removed',
  raise_hands: 'hand_raised',
  unraise_hands: 'hand_lowered',
  add_speaker: 'speaker_added',
  remove_speaker: 'speaker_removed',
  /** Official web EVENTS name — same stage effect as remove_speaker. */
  uninvite_speaker: 'speaker_removed',
  make_moderator: 'moderator_added',
  invite_speaker: 'invite_to_speak',
  end_channel: 'room_ended',
};

function readUserId(raw: Record<string, unknown>): number | null {
  const profile = raw.user_profile;
  const fromProfile = profile && typeof profile === 'object' ? (profile as { user_id?: unknown }).user_id : undefined;
  const id = Number(fromProfile ?? raw.user_id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export function normalizeRealtimeType(raw: Record<string, unknown>): string {
  if (typeof raw.action === 'string') return raw.action.trim().toLowerCase();
  if (typeof raw.type === 'string') return raw.type.trim().toLowerCase().replace(/\s+/g, '_');
  if (typeof raw.message_type === 'string') return raw.message_type.trim().toLowerCase();
  return 'unknown';
}

function readChatMessage(raw: Record<string, unknown>): CHChatMessage {
  return {
    id: String(raw.message_id ?? `msg-${Date.now()}`),
    user_id: Number(raw.from_user_id ?? 0),
    name: readName(raw),
    username: typeof raw.from_username === 'string' ? raw.from_username : '',
    photo_url: typeof raw.from_photo_url === 'string' ? raw.from_photo_url : null,
    message: typeof raw.message === 'string' ? raw.message : '',
    timestamp: typeof raw.time_received === 'string' ? raw.time_received : 'now',
  };
}

function readReaction(raw: Record<string, unknown>): RealtimeReactionEvent {
  const target = raw.target_user_profile;
  const actor = raw.action_user_profile;
  const emoji =
    typeof raw.reaction === 'string' ? raw.reaction
      : typeof raw.emoji === 'string' ? raw.emoji
        : typeof raw.gif_url === 'string' ? '🎞️'
          : typeof raw.message === 'string' ? raw.message
            : '👏';
  return {
    kind: 'channel_reaction',
    emoji,
    fromName: actor && typeof actor === 'object' ? readName(actor as Record<string, unknown>) : readName(raw, 'Someone'),
    targetName: target && typeof target === 'object' ? readName(target as Record<string, unknown>) : readName(raw, 'Speaker'),
  };
}

function readBooleanFlag(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  return undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Live PubNub `update_user_capabilities` — only can_* flags (ignore channel / stage_removed). */
export function readCapabilityPatch(raw: Record<string, unknown>): Record<string, boolean> {
  const caps: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!key.startsWith('can_') || typeof value !== 'boolean') continue;
    caps[key] = value;
  }
  return caps;
}

export function parseRealtimeMessage(raw: Record<string, unknown>, currentChannel?: string | null): ParsedRealtimeEvent {
  if (currentChannel && typeof raw.channel === 'string' && raw.channel && raw.channel !== currentChannel) {
    return { kind: 'ignored', reason: 'other_channel' };
  }
  const type = normalizeRealtimeType(raw);
  const action = CLUBHOUSE_ACTIONS[type];
  if (action === 'room_ended') return { kind: 'room_ended' };
  if (action) {
    const profile = raw.user_profile && typeof raw.user_profile === 'object' ? (raw.user_profile as Partial<CHUser>) : null;
    const userId = action === 'invite_to_speak' ? null : readUserId(raw);
    return { kind: 'stage', type: action, userId, profile, userName: readName(raw) };
  }
  const keys = Object.keys(raw).sort();

  // Web ticker uses channel_*; live PubNub often prefixes new_.
  if (type === 'channel_message' || type === 'new_channel_message') {
    return { kind: 'channel_message', message: readChatMessage(raw) };
  }

  // Web EVENTS names emoji_reaction / gif_reaction; live PubNub often uses new_channel_reaction.
  if (
    type === 'channel_reaction'
    || type === 'new_channel_reaction'
    || type === 'emoji_reaction'
    || type === 'gif_reaction'
  ) {
    return readReaction(raw);
  }

  if (type === 'set_channel_title') {
    const title =
      typeof raw.title === 'string' ? raw.title
        : typeof raw.topic === 'string' ? raw.topic
          : undefined;
    if (!title) return { kind: 'ignored', reason: 'noop' };
    return { kind: 'channel_patch', patch: { topic: title } };
  }

  if (type === 'change_handraise_settings') {
    const patch: Partial<CHChannelDetail> = {};
    const enabled = readBooleanFlag(raw.is_enabled);
    if (enabled !== undefined) patch.is_handraise_enabled = enabled;
    const queue = readFiniteNumber(raw.handraise_queue_setting);
    if (queue !== undefined) patch.handraise_queue_setting = queue;
    const permission = readFiniteNumber(raw.handraise_permission);
    if (permission !== undefined) patch.handraise_permission = permission;
    return { kind: 'channel_patch', patch };
  }

  if (type === 'update_user_capabilities') {
    return { kind: 'channel_patch', patch: { user_capabilities: readCapabilityPatch(raw) } };
  }

  if (type === 'cumulative_count_update') {
    const numEver = readFiniteNumber(raw.num_ever);
    if (numEver === undefined) return { kind: 'ignored', reason: 'noop' };
    // Keep cumulative separate from live num_all (Task 29.1).
    return { kind: 'channel_patch', patch: { num_ever: numEver } };
  }

  if (type === 'update_speaker_call_status') {
    const userId = readUserId(raw);
    const isOnCall = readBooleanFlag(raw.is_on_call);
    if (userId == null || isOnCall === undefined) return { kind: 'ignored', reason: 'noop' };
    const profile = raw.audio_profile;
    const audioProfile =
      typeof profile === 'string' || typeof profile === 'number' ? profile : undefined;
    return { kind: 'speaker_call_status', userId, isOnCall, audioProfile };
  }

  if (type === 'room_ended' || type === 'room ended') {
    return { kind: 'room_ended' };
  }

  const stageTypes: RealtimeStageEvent[] = [
    'user_joined',
    'user_left',
    'hand_raised',
    'speaker_added',
    'speaker_removed',
    'moderator_added',
    'invite_to_speak',
  ];
  if (stageTypes.includes(type as RealtimeStageEvent)) {
    return { kind: 'stage', type: type as RealtimeStageEvent, userName: readName(raw) };
  }

  if (type === 'speaker_invite' || type === 'invited_to_speak') {
    return { kind: 'stage', type: 'invite_to_speak', userName: readName(raw) };
  }

  return { kind: 'unknown', type, keys };
}

function findUserByName(users: CHUser[], name: string): CHUser | undefined {
  return users.find((user) => user.name === name);
}

function findTarget(users: CHUser[], event: { userId?: number | null; userName: string }): CHUser | undefined {
  if (event.userId != null) return users.find((user) => user.user_id === event.userId);
  return findUserByName(users, event.userName);
}

function userFromEvent(users: CHUser[], event: { userId?: number | null; userName: string; profile?: Partial<CHUser> | null }, flags: Partial<CHUser>): CHUser {
  const profile = event.profile ?? {};
  return {
    user_id: event.userId ?? nextGuestId(users),
    name: typeof profile.name === 'string' && profile.name ? profile.name : event.userName,
    username: typeof profile.username === 'string' ? profile.username : event.userName.toLowerCase().replace(/s+/g, ''),
    photo_url: typeof profile.photo_url === 'string' ? profile.photo_url : null,
    is_speaker: profile.is_speaker === true,
    is_moderator: profile.is_moderator === true,
    is_hand_raised: false,
    ...flags,
  };
}

function nextGuestId(users: CHUser[]): number {
  const max = users.reduce((acc, user) => Math.max(acc, user.user_id), 0);
  return max + 1;
}

export function applyStageEvent(users: CHUser[], event: Extract<ParsedRealtimeEvent, { kind: 'stage' }>): CHUser[] {
  const copy = users.map((user) => ({ ...user }));
  const target = findTarget(copy, event);
  const upsert = (flags: Partial<CHUser>): CHUser[] => {
    if (target) {
      Object.assign(target, flags);
      return copy;
    }
    copy.push(userFromEvent(copy, event, flags));
    return copy;
  };

  switch (event.type) {
    case 'user_joined':
      if (target) {
        if (event.profile) Object.assign(target, userFromEvent(copy, event, { is_hand_raised: target.is_hand_raised }));
        return copy;
      }
      copy.push(userFromEvent(copy, event, {}));
      return copy;
    case 'user_left':
    case 'user_removed':
      return target ? copy.filter((user) => user !== target) : copy;
    case 'hand_raised':
      return upsert({ is_hand_raised: true });
    case 'hand_lowered':
      if (target) target.is_hand_raised = false;
      return copy;
    case 'speaker_added':
      return upsert({ is_speaker: true, is_hand_raised: false, is_invited_to_speak: false });
    case 'speaker_removed':
      if (target) Object.assign(target, { is_speaker: false, is_moderator: false });
      return copy;
    case 'moderator_added':
      return upsert({ is_moderator: true, is_speaker: true, is_hand_raised: false });
    case 'invite_to_speak':
      return upsert({ is_invited_to_speak: true });
    case 'room_ended':
      return copy;
    default: {
      const _exhaustive: never = event.type;
      void _exhaustive;
      return copy;
    }
  }
}

export function mergeChannelUsers(channel: CHChannelDetail, users: CHUser[]): CHChannelDetail {
  const speakers = users.filter((user) => user.is_speaker).length;
  return {
    ...channel,
    users,
    num_speakers: speakers,
    num_all: users.length,
    has_raised_hands: users.some((user) => user.is_hand_raised),
  };
}
