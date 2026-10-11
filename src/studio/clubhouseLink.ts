export type ParsedClubhouseLink =
  | { kind: 'room'; channelId: string }
  | { kind: 'profile'; username: string }
  | { kind: 'event'; eventId: string }
  | { kind: 'replay'; replayId: string };

const ALLOWED_HOSTS = new Set(['www.clubhouse.com', 'clubhouse.com']);

export function parseClubhouseLink(raw: string): ParsedClubhouseLink | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  if (parts[0] === 'room' && parts[1]) return { kind: 'room', channelId: parts[1] };
  if (parts[0]?.startsWith('@')) {
    const username = parts[0].slice(1);
    if (username) return { kind: 'profile', username };
  }
  if (parts[0] === 'event' && parts[1]) return { kind: 'event', eventId: parts[1] };
  if (parts[0] === 'replay' && parts[1]) return { kind: 'replay', replayId: parts[1] };
  return null;
}

export function isClubhouseWebUrl(raw: string): boolean {
  return parseClubhouseLink(raw) !== null;
}
