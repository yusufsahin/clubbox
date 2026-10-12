import { permissionOn } from './roomActions.ts';
import type { CHUser, UserCapabilities } from './types.ts';

export type HandraiseQueueOption = {
  value: number;
  label: string;
  short_label?: string;
  sub_label?: string;
};

export type ModeratorActionItem = {
  id: string;
  action: string;
  actorName: string;
  targetName: string;
  timeLabel: string;
  timeSort: number;
};

export type ModeratorActionsFlags = {
  canOpenPanel: boolean;
  canRequests: boolean;
  canHistory: boolean;
  canEditQueueMode: boolean;
};

const loggedUnknownActions = new Set<string>();

/** Gate Moderator actions panel by capability + supports(). */
export function moderatorActionsFlags(
  caps: UserCapabilities | undefined,
  supports: (endpoint: string) => boolean,
): ModeratorActionsFlags {
  const allow = (key: string) => !caps || !(key in caps) || permissionOn(caps[key]);
  const canEditQueue = allow('can_edit_handraise_queue') && supports('get_handraise_queue');
  const canInvite = allow('can_invite') && supports('invite_speaker');
  const canHistory = allow('can_view_moderator_actions_history')
    && supports('get_moderator_action_history');
  const canEditQueueMode = allow('can_edit_handraise_queue')
    && supports('update_handraise_queue_setting');
  const canRequests = canEditQueue || (canInvite && supports('get_handraise_queue'));
  return {
    canOpenPanel: canRequests || canHistory,
    canRequests,
    canHistory,
    canEditQueueMode,
  };
}

export function readHandraiseQueueOptions(raw: unknown): HandraiseQueueOption[] {
  if (!Array.isArray(raw)) return [];
  const out: HandraiseQueueOption[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const value = Number(rec.value);
    if (!Number.isFinite(value)) continue;
    const label = typeof rec.label === 'string' && rec.label.trim()
      ? rec.label.trim()
      : typeof rec.short_label === 'string' && rec.short_label.trim()
        ? rec.short_label.trim()
        : String(value);
    out.push({
      value,
      label,
      short_label: typeof rec.short_label === 'string' ? rec.short_label : undefined,
      sub_label: typeof rec.sub_label === 'string' ? rec.sub_label : undefined,
    });
  }
  return out;
}

function readName(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  const rec = raw as Record<string, unknown>;
  if (typeof rec.name === 'string' && rec.name.trim()) return rec.name.trim();
  if (typeof rec.username === 'string' && rec.username.trim()) return `@${rec.username.trim()}`;
  if (typeof rec.user_id === 'number') return String(rec.user_id);
  return '';
}

function readTimeSort(raw: Record<string, unknown>): { sort: number; label: string } {
  const candidates = [raw.time_created, raw.created_at, raw.time, raw.timestamp];
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const ms = value < 1e12 ? value * 1000 : value;
      return { sort: ms, label: new Date(ms).toLocaleString() };
    }
    if (typeof value === 'string' && value.trim()) {
      const ms = Date.parse(value);
      if (Number.isFinite(ms)) return { sort: ms, label: new Date(ms).toLocaleString() };
      return { sort: 0, label: value.trim() };
    }
  }
  return { sort: 0, label: '' };
}

function historyArrays(raw: Record<string, unknown>): unknown[] {
  for (const key of ['history', 'actions', 'moderator_actions', 'items']) {
    const arr = raw[key];
    if (Array.isArray(arr)) return arr;
  }
  return [];
}

function actionName(rec: Record<string, unknown>): string {
  for (const key of ['action', 'action_type', 'type', 'kind', 'name']) {
    const value = rec[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return 'unknown';
}

/** Normalize get_moderator_action_history payload; newest first. */
export function parseModeratorActionHistory(raw: unknown): {
  items: ModeratorActionItem[];
  nextCursor: string | null;
} {
  if (!raw || typeof raw !== 'object') return { items: [], nextCursor: null };
  const root = raw as Record<string, unknown>;
  const items: ModeratorActionItem[] = [];
  let index = 0;
  for (const row of historyArrays(root)) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const action = actionName(rec);
    noteUnknownModeratorAction(action);
    const actorName = readName(rec.actor)
      || readName(rec.actor_user_profile)
      || readName(rec.from_user)
      || readName(rec.user_profile)
      || '—';
    const targetName = readName(rec.target)
      || readName(rec.target_user_profile)
      || readName(rec.to_user)
      || readName(rec.user)
      || '';
    const time = readTimeSort(rec);
    const id = typeof rec.id === 'string' || typeof rec.id === 'number'
      ? String(rec.id)
      : `${action}-${index}-${time.sort}`;
    items.push({
      id,
      action,
      actorName,
      targetName,
      timeLabel: time.label,
      timeSort: time.sort,
    });
    index += 1;
  }
  items.sort((a, b) => b.timeSort - a.timeSort);
  const next = root.next_cursor ?? root.cursor ?? root.pagination_cursor;
  const nextCursor = typeof next === 'string' && next.trim() ? next.trim() : null;
  return { items, nextCursor };
}

/** Log unknown action kinds once (shape only — no PII). */
export function noteUnknownModeratorAction(action: string): void {
  if (!action || action === 'unknown') return;
  const known = new Set([
    'mute_speaker',
    'unmute_speaker',
    'invite_speaker',
    'uninvite_speaker',
    'make_moderator',
    'block_from_channel',
    'remove_speaker',
    'end_channel',
    'raise_hands',
    'unraise_hands',
  ]);
  if (known.has(action)) return;
  if (loggedUnknownActions.has(action)) return;
  loggedUnknownActions.add(action);
  console.info('[Clubbox] unknown moderator action kind', { action });
}

/** Reset for unit tests. */
export function resetUnknownModeratorActionLog(): void {
  loggedUnknownActions.clear();
}

/** Queue row time label when present on the user object. */
export function queueRaisedLabel(user: CHUser): string {
  const rec = user as CHUser & Record<string, unknown>;
  const candidates = [
    rec.time_raised,
    rec.raised_hands_next_time_ts,
    rec.time_created,
  ];
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      const ms = value < 1e12 ? value * 1000 : value;
      return new Date(ms).toLocaleString();
    }
    if (typeof value === 'string' && value.trim()) {
      const ms = Date.parse(value);
      if (Number.isFinite(ms)) return new Date(ms).toLocaleString();
      return value.trim();
    }
  }
  return '';
}

/**
 * Decline/dismiss only when the API row exposes an explicit field
 * (no fake decline — Task 28.6).
 */
export function queueRowHasDismiss(user: CHUser): boolean {
  const rec = user as CHUser & Record<string, unknown>;
  return rec.can_dismiss === true
    || rec.can_decline === true
    || typeof rec.dismiss_action === 'string'
    || typeof rec.decline_action === 'string';
}
