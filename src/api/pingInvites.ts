import type { CHUser, SearchHit } from './types.ts';

export type PingCandidate = {
  userId: number;
  name: string;
  username: string;
  photoUrl: string;
  source: 'suggested' | 'search';
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readUser(raw: Record<string, unknown>): PingCandidate | null {
  const nested = asRecord(raw.user_profile) ?? asRecord(raw.user) ?? raw;
  const userId = typeof nested.user_id === 'number'
    ? nested.user_id
    : (typeof nested.user_id === 'string' && /^\d+$/.test(nested.user_id) ? Number(nested.user_id) : NaN);
  const name = typeof nested.name === 'string' ? nested.name.trim() : '';
  if (!Number.isFinite(userId) || !name) return null;
  return {
    userId,
    name,
    username: typeof nested.username === 'string' ? nested.username : '',
    photoUrl: typeof nested.photo_url === 'string' ? nested.photo_url : '',
    source: 'suggested',
  };
}

export function readSuggestedInvites(payload: unknown): PingCandidate[] {
  const root = asRecord(payload);
  if (!root) return [];
  const list = Array.isArray(root.suggestions)
    ? root.suggestions
    : (Array.isArray(root.users) ? root.users : (Array.isArray(root.items) ? root.items : []));
  const out: PingCandidate[] = [];
  for (const entry of list) {
    const raw = asRecord(entry);
    if (!raw) continue;
    const candidate = readUser(raw);
    if (candidate) out.push(candidate);
  }
  return out;
}

export function readSearchPingCandidates(hits: SearchHit[] | CHUser[]): PingCandidate[] {
  const out: PingCandidate[] = [];
  for (const hit of hits) {
    if (hit && typeof hit === 'object' && 'kind' in hit) {
      const typed = hit as SearchHit;
      if (typed.kind !== 'user' || !typed.user) continue;
      out.push({
        userId: typed.user.user_id,
        name: typed.user.name,
        username: typed.user.username || '',
        photoUrl: typed.user.photo_url || '',
        source: 'search',
      });
      continue;
    }
    const user = hit as CHUser;
    if (typeof user.user_id !== 'number' || !user.name) continue;
    out.push({
      userId: user.user_id,
      name: user.name,
      username: user.username || '',
      photoUrl: user.photo_url || '',
      source: 'search',
    });
  }
  return out;
}

/** Prefer search hits when both sources mention the same user. */
export function mergePingCandidates(suggested: PingCandidate[], searched: PingCandidate[]): PingCandidate[] {
  const byId = new Map<number, PingCandidate>();
  for (const item of suggested) byId.set(item.userId, item);
  for (const item of searched) byId.set(item.userId, item);
  return [...byId.values()];
}
