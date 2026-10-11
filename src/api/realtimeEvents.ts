import type { CHChannelDetail, CHChatMessage, CHUser } from './types.ts';

export type RealtimeStageEvent =
  | 'user_joined'
  | 'user_left'
  | 'hand_raised'
  | 'speaker_added'
  | 'speaker_removed'
  | 'moderator_added'
  | 'invite_to_speak'
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

export type ParsedRealtimeEvent =
  | { kind: 'stage'; type: RealtimeStageEvent; userName: string }
  | RealtimeChatEvent
  | RealtimeReactionEvent
  | RealtimeUnknownEvent
  | { kind: 'room_ended' };

function readName(raw: Record<string, unknown>, fallback = 'Guest'): string {
  if (typeof raw.name === 'string' && raw.name) return raw.name;
  if (typeof raw.from_name === 'string' && raw.from_name) return raw.from_name;
  const profile = raw.user_profile ?? raw.action_user_profile ?? raw.target_user_profile;
  if (profile && typeof profile === 'object' && typeof (profile as { name?: string }).name === 'string') {
    return (profile as { name: string }).name;
  }
  return fallback;
}

export function normalizeRealtimeType(raw: Record<string, unknown>): string {
  if (typeof raw.type === 'string') return raw.type.trim().toLowerCase().replace(/\s+/g, '_');
  if (typeof raw.message_type === 'string') return raw.message_type.trim().toLowerCase();
  return 'unknown';
}

export function parseRealtimeMessage(raw: Record<string, unknown>): ParsedRealtimeEvent {
  const type = normalizeRealtimeType(raw);
  const keys = Object.keys(raw).sort();

  if (type === 'channel_message') {
    const message: CHChatMessage = {
      id: String(raw.message_id ?? `msg-${Date.now()}`),
      user_id: Number(raw.from_user_id ?? 0),
      name: readName(raw),
      username: typeof raw.from_username === 'string' ? raw.from_username : '',
      photo_url: typeof raw.from_photo_url === 'string' ? raw.from_photo_url : null,
      message: typeof raw.message === 'string' ? raw.message : '',
      timestamp: typeof raw.time_received === 'string' ? raw.time_received : 'now',
    };
    return { kind: 'channel_message', message };
  }

  if (type === 'channel_reaction') {
    const target = raw.target_user_profile;
    const actor = raw.action_user_profile;
    return {
      kind: 'channel_reaction',
      emoji: typeof raw.reaction === 'string' ? raw.reaction : typeof raw.message === 'string' ? raw.message : '👏',
      fromName: actor && typeof actor === 'object' ? readName(actor as Record<string, unknown>) : readName(raw, 'Someone'),
      targetName: target && typeof target === 'object' ? readName(target as Record<string, unknown>) : readName(raw, 'Speaker'),
    };
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

function nextGuestId(users: CHUser[]): number {
  const max = users.reduce((acc, user) => Math.max(acc, user.user_id), 0);
  return max + 1;
}

export function applyStageEvent(users: CHUser[], event: Extract<ParsedRealtimeEvent, { kind: 'stage' }>): CHUser[] {
  const name = event.userName;
  const copy = users.map((user) => ({ ...user }));

  switch (event.type) {
    case 'user_joined': {
      if (findUserByName(copy, name)) return copy;
      copy.push({
        user_id: nextGuestId(copy),
        name,
        username: name.toLowerCase().replace(/\s+/g, ''),
        photo_url: null,
        is_speaker: false,
        is_moderator: false,
        is_hand_raised: false,
      });
      return copy;
    }
    case 'user_left':
      return copy.filter((user) => user.name !== name);
    case 'hand_raised': {
      const existingHand = findUserByName(copy, name);
      if (!existingHand) {
        copy.push({
          user_id: nextGuestId(copy),
          name,
          username: name.toLowerCase().replace(/\s+/g, ''),
          photo_url: null,
          is_speaker: false,
          is_moderator: false,
          is_hand_raised: true,
        });
        return copy;
      }
      existingHand.is_hand_raised = true;
      return copy;
    }
    case 'speaker_added': {
      const existingSpeaker = findUserByName(copy, name);
      if (!existingSpeaker) {
        copy.push({
          user_id: nextGuestId(copy),
          name,
          username: name.toLowerCase().replace(/\s+/g, ''),
          photo_url: null,
          is_speaker: true,
          is_moderator: false,
          is_hand_raised: false,
        });
        return copy;
      }
      existingSpeaker.is_speaker = true;
      existingSpeaker.is_hand_raised = false;
      return copy;
    }
    case 'speaker_removed': {
      const existingAudience = findUserByName(copy, name);
      if (!existingAudience) {
        copy.push({
          user_id: nextGuestId(copy),
          name,
          username: name.toLowerCase().replace(/\s+/g, ''),
          photo_url: null,
          is_speaker: false,
          is_moderator: false,
          is_hand_raised: false,
        });
        return copy;
      }
      existingAudience.is_speaker = false;
      existingAudience.is_moderator = false;
      return copy;
    }
    case 'moderator_added': {
      const existingMod = findUserByName(copy, name);
      if (!existingMod) {
        copy.push({
          user_id: nextGuestId(copy),
          name,
          username: name.toLowerCase().replace(/\s+/g, ''),
          photo_url: null,
          is_speaker: true,
          is_moderator: true,
          is_hand_raised: false,
        });
        return copy;
      }
      existingMod.is_moderator = true;
      return copy;
    }
    case 'invite_to_speak': {
      const existingInvite = findUserByName(copy, name);
      if (!existingInvite) {
        copy.push({
          user_id: nextGuestId(copy),
          name,
          username: name.toLowerCase().replace(/\s+/g, ''),
          photo_url: null,
          is_speaker: false,
          is_moderator: false,
          is_hand_raised: false,
          is_invited_to_speak: true,
        });
        return copy;
      }
      existingInvite.is_invited_to_speak = true;
      return copy;
    }
    default:
      return copy;
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
