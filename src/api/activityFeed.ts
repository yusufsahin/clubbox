import { readProfile } from './relationship';
import type { CHNotification, CHUser } from './types';

export type ActivitySource = 'edge' | 'notification';

export type ActivityItem = {
  id: string;
  source: ActivitySource;
  message: string;
  time: string;
  user: CHUser | null;
  channel: string | null;
  /** True when message looks like a live-room ping. */
  isPing: boolean;
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

function readChannel(raw: Record<string, unknown>): string | null {
  const direct = readString(raw.channel, raw.channel_id);
  if (direct) return direct;
  const nested = asRecord(raw.channel_info) ?? asRecord(raw.channel_data);
  if (nested) {
    const fromNested = readString(nested.channel, nested.channel_id);
    if (fromNested) return fromNested;
  }
  return null;
}

function looksLikePing(message: string, channel: string | null): boolean {
  if (!channel) return false;
  const lower = message.toLowerCase();
  return lower.includes('pinged you into')
    || lower.includes('invited you to')
    || lower.includes('wants you to join')
    || lower.includes('seni odaya');
}

export function readNotification(entry: unknown): CHNotification | null {
  const raw = asRecord(entry);
  if (!raw) return null;
  const idNum = typeof raw.notification_id === 'number'
    ? raw.notification_id
    : Number(raw.notification_id);
  const message = readString(raw.message, raw.text, raw.title);
  if (!message && !Number.isFinite(idNum)) return null;
  const user = readProfile(raw.user_profile) ?? readProfile(raw.actor) ?? null;
  return {
    notification_id: Number.isFinite(idNum) ? idNum : 0,
    user_profile: user ?? {
      user_id: 0,
      name: '',
      username: '',
      photo_url: null,
    },
    message,
    time_created: readString(raw.time_created, raw.time, raw.created_at),
    type: typeof raw.type === 'number' ? raw.type : (typeof raw.notification_type === 'number' ? raw.notification_type : 0),
    channel: readChannel(raw) ?? undefined,
  };
}

export function readNotificationsPayload(payload: unknown): CHNotification[] {
  const root = asRecord(payload);
  if (!root) return [];
  const list = Array.isArray(root.notifications)
    ? root.notifications
    : (Array.isArray(root.items) ? root.items : []);
  return list.map((entry) => readNotification(entry)).filter((entry): entry is CHNotification => !!entry);
}

export function readEdgeActivity(entry: unknown, index: number): ActivityItem | null {
  const raw = asRecord(entry);
  if (!raw) return null;
  const message = readString(
    raw.message,
    raw.text,
    raw.title,
    raw.action_text,
    raw.subtitle,
    asRecord(raw.logging_context)?.action_text,
  );
  const user = readProfile(raw.user_profile)
    ?? readProfile(raw.actor)
    ?? readProfile(raw.from_user_profile)
    ?? null;
  const channel = readChannel(raw);
  const time = readString(raw.time_created, raw.time, raw.created_at, raw.timestamp);
  const id = readString(raw.activity_id, raw.id, raw.story_id) || `edge-${index}`;
  if (!message && !user && !channel) return null;
  const text = message || (user ? `${user.name}` : 'Update');
  return {
    id: `edge:${id}`,
    source: 'edge',
    message: text,
    time,
    user,
    channel,
    isPing: looksLikePing(text, channel),
  };
}

export function readEdgeStoriesPayload(payload: unknown): ActivityItem[] {
  const root = asRecord(payload);
  if (!root) return [];
  const list = Array.isArray(root.activities)
    ? root.activities
    : (Array.isArray(root.stories) ? root.stories : (Array.isArray(root.items) ? root.items : []));
  return list
    .map((entry, index) => readEdgeActivity(entry, index))
    .filter((entry): entry is ActivityItem => !!entry);
}

export function notificationToActivity(notification: CHNotification): ActivityItem {
  const message = notification.message || 'Notification';
  const channel = notification.channel ?? null;
  return {
    id: `notif:${notification.notification_id || message}`,
    source: 'notification',
    message,
    time: notification.time_created,
    user: notification.user_profile?.user_id ? notification.user_profile : null,
    channel,
    isPing: looksLikePing(message, channel),
  };
}

/** Merge edge stories + notifications; notifications win on duplicate channel+message. */
export function mergeActivityFeed(edge: ActivityItem[], notifications: ActivityItem[]): ActivityItem[] {
  const seen = new Set<string>();
  const out: ActivityItem[] = [];
  for (const item of [...notifications, ...edge]) {
    const key = `${item.message}|${item.channel ?? ''}|${item.time}`;
    if (seen.has(key) || seen.has(item.id)) continue;
    seen.add(key);
    seen.add(item.id);
    out.push(item);
  }
  return out;
}
