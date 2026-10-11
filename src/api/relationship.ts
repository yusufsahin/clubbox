import type { CHUser } from './types';

/** Viewer relationship. Unknown until a captured follow_status string maps to it. */
export type Relationship = 'unknown' | 'none' | 'following' | 'follower' | 'friends' | 'requested';

/**
 * Web parseUserProfile follow_status strings (bundle + profile.feature).
 * following / not_following / requested → Relationship.
 */
export const FOLLOW_STATUS: Readonly<Record<string, Exclude<Relationship, 'unknown'>>> = {
  following: 'following',
  not_following: 'none',
  requested: 'requested',
};

/** Count boxes + local mutual lists. Web has no followers/following/friends list endpoints. */
export type PeopleListKind = 'followers' | 'following' | 'friends' | 'mutual_friends' | 'mutual_follows';

export const PEOPLE_LIST_ENDPOINTS: Record<'followers' | 'following', string> = {
  followers: 'get_followers',
  following: 'get_following',
};

/** Label for the profile follow control (SO-8). */
export function followControlLabel(user: {
  follow_status?: string | null;
  follows_me?: boolean;
  has_protected_profile?: boolean;
}): 'Follow' | 'Follow back' | 'Following' | 'Friends' | 'Requested' | 'Request' {
  const status = typeof user.follow_status === 'string' ? user.follow_status : '';
  const rel = relationshipFromStatus(status);
  if (rel === 'requested' || status === 'requested') return 'Requested';
  if (rel === 'following' || status === 'following') {
    return user.follows_me === true ? 'Friends' : 'Following';
  }
  if (user.has_protected_profile === true && (rel === 'none' || rel === 'unknown')) {
    return 'Request';
  }
  if (user.follows_me === true) return 'Follow back';
  return 'Follow';
}

export interface PeopleListPage {
  users: CHUser[];
  nextCursor: string | null;
}

/**
 * Reads the sandbox people-list body: a `users` array and an optional `next_cursor`.
 * No captured web response has named this array, so any other shape yields no people.
 */
export function readPeopleList(raw: unknown): PeopleListPage {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { users: [], nextCursor: null };
  }
  const record = raw as Record<string, unknown>;
  const rows = Array.isArray(record.users) ? record.users : [];
  const users = rows
    .map((row) => readProfile(row))
    .filter((user): user is CHUser => user != null);
  const cursor = record.next_cursor;
  const nextCursor = typeof cursor === 'string' && cursor.length > 0 ? cursor : null;
  return { users, nextCursor };
}

export function relationshipFromStatus(status: string | null | undefined): Relationship {
  if (typeof status !== 'string' || status.length === 0) return 'unknown';
  return FOLLOW_STATUS[status] ?? 'unknown';
}

/** Mutual follow — Friends on the profile control (following + follows_me). */
export function isFriend(user: {
  follow_status?: string | null;
  follows_me?: boolean;
}): boolean {
  return relationshipFromStatus(user.follow_status) === 'following' && user.follows_me === true;
}

/** Protected profile locked for non-friends (Help Center / SO-9). */
export function isPrivateLocked(user: {
  has_protected_profile?: boolean;
  follow_status?: string | null;
  follows_me?: boolean;
}): boolean {
  return user.has_protected_profile === true && !isFriend(user);
}

/** True when they follow me and I have not followed them yet (SO-7). */
export function shouldOfferFollowBack(user: {
  follows_me?: boolean;
  follow_status?: string | null;
}): boolean {
  if (user.follows_me !== true) return false;
  const rel = relationshipFromStatus(user.follow_status);
  return rel === 'none' || rel === 'unknown' || rel === 'follower';
}

export function profileCountsMissing(user: CHUser): boolean {
  return user.num_followers == null || user.num_following == null || user.num_cofollows == null;
}

function numericId(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return undefined;
}

function countOf(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

function flag(value: unknown): boolean | undefined {
  if (value === true || value === false) return value;
  return undefined;
}

export interface MutualParts {
  shown: CHUser[];
  others: number;
}

/** First two captured names, plus the leftover from `count` when the array is shorter. */
export function mutualParts(people: CHUser[] | undefined, count: number | undefined): MutualParts | null {
  const list = Array.isArray(people) ? people.filter((person) => person.name) : [];
  const total = typeof count === 'number' && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : list.length;
  const shown = list.slice(0, 2);
  const others = Math.max(0, total - shown.length);
  if (shown.length === 0 && others === 0) return null;
  return { shown, others };
}

/** People named on observed conversation rows. This is not a friends list. */
export function talkPartners(conversations: { participants?: CHUser[] }[], myId: number | null): CHUser[] {
  const seen = new Set<number>();
  const people: CHUser[] = [];
  for (const conversation of conversations) {
    for (const person of conversation.participants ?? []) {
      if (myId != null && person.user_id === myId) continue;
      if (seen.has(person.user_id)) continue;
      seen.add(person.user_id);
      people.push(person);
    }
  }
  return people;
}

function readMutualList(value: unknown): CHUser[] {
  if (!Array.isArray(value)) return [];
  const people: CHUser[] = [];
  for (const entry of value) {
    const user = readProfile(entry, 1);
    if (user?.name) people.push(user);
  }
  return people;
}

/** Reads get_profile fields. Drops is_following; that flag is not the friend marker. */
export function readProfile(raw: unknown, depth = 0): CHUser | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const id = numericId(record.user_id);
  if (id == null) return null;
  const photo = record.photo_url;
  const display = record.displayname;
  const status = record.follow_status;
  const bio = record.bio;
  const user: CHUser = {
    user_id: id,
    name: typeof record.name === 'string' ? record.name : '',
    username: typeof record.username === 'string' ? record.username : '',
    photo_url: typeof photo === 'string' ? photo : null,
  };
  if (typeof bio === 'string' && bio.length > 0) user.bio = bio;
  if (typeof record.share_url === 'string') user.share_url = record.share_url;
  else if (typeof record.url === 'string') user.share_url = record.url;
  if (record.twitter === null || typeof record.twitter === 'string') user.twitter = record.twitter;
  if (record.instagram === null || typeof record.instagram === 'string') user.instagram = record.instagram;
  const canDm = flag(record.can_dm);
  const canWave = flag(record.can_wave);
  if (canDm != null) user.can_dm = canDm;
  if (canWave != null) user.can_wave = canWave;
  if (depth === 0 && Array.isArray(record.social_clubs)) {
    user.social_clubs = record.social_clubs
      .map((club) => {
        if (!club || typeof club !== 'object') return null;
        const row = club as Record<string, unknown>;
        const clubId = numericId(row.social_club_id);
        if (clubId == null || typeof row.name !== 'string') return null;
        return {
          social_club_id: clubId,
          name: row.name,
          slug: typeof row.slug === 'string' ? row.slug : undefined,
          photo_url: typeof row.photo_url === 'string' ? row.photo_url : null,
          num_members: countOf(row.num_members),
        };
      })
      .filter((club): club is NonNullable<typeof club> => club != null);
  }
  if (depth === 0 && Array.isArray(record.chatting_with)) {
    user.chatting_with = record.chatting_with
      .map((entry) => readProfile(entry, 1))
      .filter((person): person is CHUser => person != null)
      .slice(0, 5);
  }
  const followers = countOf(record.num_followers);
  const following = countOf(record.num_following);
  const cofollows = countOf(record.num_cofollows);
  if (followers != null) user.num_followers = followers;
  if (following != null) user.num_following = following;
  if (cofollows != null) user.num_cofollows = cofollows;
  const followsMe = flag(record.follows_me);
  if (followsMe != null) user.follows_me = followsMe;
  if (typeof status === 'string' && status.length > 0) user.follow_status = status;
  if (depth === 0) {
    const mutualFollows = readMutualList(record.mutual_follows);
    const mutualFriends = readMutualList(record.mutual_cofollows);
    const mutualFollowsCount = countOf(record.mutual_follows_count);
    const mutualFriendsCount = countOf(record.mutual_cofollows_count);
    if (mutualFollowsCount != null) user.mutual_follows_count = mutualFollowsCount;
    if (mutualFriendsCount != null) user.mutual_cofollows_count = mutualFriendsCount;
    if (mutualFollows.length > 0) user.mutual_follows = mutualFollows;
    if (mutualFriends.length > 0) user.mutual_cofollows = mutualFriends;
  }
  const protectedProfile = flag(record.has_protected_profile);
  if (protectedProfile != null) user.has_protected_profile = protectedProfile;
  if (typeof display === 'string' || display === null) user.displayname = display;
  const speaker = flag(record.is_speaker);
  const moderator = flag(record.is_moderator);
  const muted = flag(record.is_muted);
  const speaking = flag(record.is_speaking);
  const hand = flag(record.is_hand_raised);
  const invited = flag(record.is_invited_to_speak);
  if (speaker != null) user.is_speaker = speaker;
  if (moderator != null) user.is_moderator = moderator;
  if (muted != null) user.is_muted = muted;
  if (speaking != null) user.is_speaking = speaking;
  if (hand != null) user.is_hand_raised = hand;
  if (invited != null) user.is_invited_to_speak = invited;
  return user;
}

export function mergeProfile(base: CHUser, incoming: CHUser): CHUser {
  return {
    ...base,
    ...incoming,
    name: incoming.name || base.name,
    username: incoming.username || base.username,
    num_followers: incoming.num_followers ?? base.num_followers,
    num_following: incoming.num_following ?? base.num_following,
    num_cofollows: incoming.num_cofollows ?? base.num_cofollows,
    mutual_follows_count: incoming.mutual_follows_count ?? base.mutual_follows_count,
    mutual_cofollows_count: incoming.mutual_cofollows_count ?? base.mutual_cofollows_count,
    mutual_follows: incoming.mutual_follows ?? base.mutual_follows,
    mutual_cofollows: incoming.mutual_cofollows ?? base.mutual_cofollows,
    follows_me: incoming.follows_me ?? base.follows_me,
    follow_status: incoming.follow_status ?? base.follow_status,
    has_protected_profile: incoming.has_protected_profile ?? base.has_protected_profile,
    displayname: incoming.displayname !== undefined ? incoming.displayname : base.displayname,
    bio: incoming.bio ?? base.bio,
    share_url: incoming.share_url ?? base.share_url,
    can_dm: incoming.can_dm ?? base.can_dm,
    can_wave: incoming.can_wave ?? base.can_wave,
    social_clubs: incoming.social_clubs ?? base.social_clubs,
    chatting_with: incoming.chatting_with ?? base.chatting_with,
    twitter: incoming.twitter !== undefined ? incoming.twitter : base.twitter,
    instagram: incoming.instagram !== undefined ? incoming.instagram : base.instagram,
  };
}

/**
 * Applies a follow response only when it names a status or a profile.
 * A protected profile keeps its previous friend count until the other person accepts.
 */
export function applyFollowResponse(user: CHUser, response: unknown): CHUser {
  const record = response && typeof response === 'object' && !Array.isArray(response)
    ? response as Record<string, unknown>
    : {};
  const nested = readProfile(record.user_profile);
  const status = typeof record.follow_status === 'string' && record.follow_status.length > 0
    ? record.follow_status
    : undefined;
  let next = nested ? mergeProfile(user, nested) : { ...user };
  if (status) next = { ...next, follow_status: status };
  if (user.has_protected_profile === true) {
    next = { ...next, num_cofollows: user.num_cofollows, has_protected_profile: true };
  }
  return next;
}
