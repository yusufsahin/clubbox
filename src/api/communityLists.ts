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
