export type HouseListItem = {
  id: string;
  slug: string;
  name: string;
  description: string;
  photoUrl: string;
  members: number;
  isMember: boolean;
};

export type EventListItem = {
  id: string;
  title: string;
  timeStart: string;
  timeEnd: string;
  url: string;
  houseName: string;
};

export type HouseChatMessage = {
  id: string;
  authorName: string;
  text: string;
  time: string;
};

export type HouseMemberItem = {
  userId: number;
  name: string;
  username: string;
  photoUrl: string | null;
};

export type HouseChatState = {
  messages: HouseChatMessage[];
  canPost: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function readHousesPayload(payload: unknown): HouseListItem[] {
  const root = asRecord(payload);
  if (!root) return [];
  const list = Array.isArray(root.social_clubs)
    ? root.social_clubs
    : (Array.isArray(root.clubs) ? root.clubs : (Array.isArray(root.items) ? root.items : []));
  const out: HouseListItem[] = [];
  for (const entry of list) {
    const raw = asRecord(entry);
    if (!raw) continue;
    const id = readString(raw.social_club_id, raw.club_id, raw.id);
    const slug = readString(raw.slug, raw.social_club_slug, id);
    const name = readString(raw.name, raw.title);
    if (!id && !slug && !name) continue;
    out.push({
      id: id || slug || name,
      slug: slug || id,
      name: name || slug || id,
      description: readString(raw.description),
      photoUrl: readString(raw.photo_url),
      members: typeof raw.num_members === 'number' ? raw.num_members : 0,
      isMember: raw.is_member === true || raw.viewer_is_member === true,
    });
  }
  return out;
}

export function readHouseDetail(payload: unknown): HouseListItem | null {
  const root = asRecord(payload);
  if (!root) return null;
  const nested = asRecord(root.social_club) ?? root;
  const list = readHousesPayload({ social_clubs: [nested] });
  return list[0] ?? null;
}

export function readHouseChatPayload(payload: unknown): HouseChatState {
  const root = asRecord(payload);
  if (!root) return { messages: [], canPost: false };
  const list = Array.isArray(root.messages)
    ? root.messages
    : (Array.isArray(root.items) ? root.items : []);
  const messages: HouseChatMessage[] = [];
  for (const entry of list) {
    const raw = asRecord(entry);
    if (!raw) continue;
    const author = asRecord(raw.user_profile) ?? asRecord(raw.user) ?? asRecord(raw.author);
    const text = readString(raw.message, raw.text, raw.body);
    const id = readString(raw.message_id, raw.id, String(messages.length + 1));
    if (!text && !id) continue;
    messages.push({
      id: id || `m-${messages.length + 1}`,
      authorName: author ? readString(author.name, author.username) : readString(raw.author_name, raw.name),
      text: text || '',
      time: readString(raw.time_created, raw.created_at, raw.time),
    });
  }
  const permissions = asRecord(root.permissions);
  const hasCapabilitySignal = [
    root.can_post,
    root.viewer_can_post,
    root.is_admin,
    root.is_leader,
    root.viewer_is_admin,
    root.viewer_is_leader,
    permissions?.can_post,
  ].some((value) => typeof value === 'boolean');
  const canPost = !hasCapabilitySignal
    ? true
    : (
      root.can_post === true
      || root.viewer_can_post === true
      || root.is_admin === true
      || root.is_leader === true
      || root.viewer_is_admin === true
      || root.viewer_is_leader === true
      || permissions?.can_post === true
    );
  return { messages, canPost };
}

export function readHouseMembersPayload(payload: unknown): HouseMemberItem[] {
  const root = asRecord(payload);
  if (!root) return [];
  const list = Array.isArray(root.members)
    ? root.members
    : (Array.isArray(root.users) ? root.users : (Array.isArray(root.items) ? root.items : []));
  const out: HouseMemberItem[] = [];
  for (const entry of list) {
    const raw = asRecord(entry);
    if (!raw) continue;
    const profile = asRecord(raw.user_profile) ?? asRecord(raw.user) ?? raw;
    const userIdRaw = profile.user_id ?? profile.id ?? raw.user_id;
    const userId = typeof userIdRaw === 'number'
      ? userIdRaw
      : (typeof userIdRaw === 'string' && userIdRaw.trim() ? Number(userIdRaw) : NaN);
    const name = readString(profile.name, raw.name);
    const username = readString(profile.username, raw.username);
    if (!Number.isFinite(userId) && !name && !username) continue;
    out.push({
      userId: Number.isFinite(userId) ? userId : out.length + 1,
      name: name || username || String(userId),
      username: username || String(userId),
      photoUrl: typeof profile.photo_url === 'string'
        ? profile.photo_url
        : (typeof raw.photo_url === 'string' ? raw.photo_url : null),
    });
  }
  return out;
}

export function readEventsPayload(payload: unknown): EventListItem[] {
  const root = asRecord(payload);
  if (!root) return [];
  const list = Array.isArray(root.events) ? root.events : (Array.isArray(root.items) ? root.items : []);
  const out: EventListItem[] = [];
  for (const entry of list) {
    const raw = asRecord(entry);
    if (!raw) continue;
    const id = readString(raw.event_id, raw.id);
    const title = readString(raw.name, raw.title, raw.topic);
    if (!id && !title) continue;
    const club = asRecord(raw.social_club) ?? asRecord(raw.club);
    out.push({
      id: id || title,
      title: title || id,
      timeStart: readString(raw.time_start, raw.start_time, raw.time_created),
      timeEnd: readString(raw.time_end, raw.end_time),
      url: readString(raw.url, raw.share_url),
      houseName: club ? readString(club.name) : readString(raw.club_name, raw.social_club_name),
    });
  }
  return out;
}

/** Minimal VEVENT for "Add to calendar". */
export function buildEventIcs(event: EventListItem): string {
  const stamp = (value: string) => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  };
  const dtStart = stamp(event.timeStart) || stamp(new Date().toISOString());
  const dtEnd = stamp(event.timeEnd) || dtStart;
  const escape = (text: string) => text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const url = /^https:\/\//i.test(event.url) ? event.url : '';
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Clubbox//EN',
    'BEGIN:VEVENT',
    `UID:${escape(event.id)}@clubbox.local`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escape(event.title)}`,
    url ? `URL:${url}` : '',
    event.houseName ? `LOCATION:${escape(event.houseName)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}
