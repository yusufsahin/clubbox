/** Clubhouse web room URL used for phone open / QR (Phase 30.3). */

const ROOM_ID = /^[A-Za-z0-9_-]{1,80}$/;

/**
 * Canonical phone-open link from a channel id (join `channel` string).
 * Returns '' when the id is empty or not a safe Clubhouse room token.
 */
export function roomPhoneUrl(channelId: string | null | undefined): string {
  const id = typeof channelId === 'string' ? channelId.trim() : '';
  if (!ROOM_ID.test(id)) return '';
  return `https://www.clubhouse.com/room/${id}`;
}

/** Prefer join `channel` over numeric channel_id for the public room path. */
export function roomPhoneUrlFromChannel(channel: {
  channel?: string | null;
  channel_id?: string | number | null;
} | null | undefined): string {
  if (!channel) return '';
  const fromChannel = roomPhoneUrl(channel.channel ?? undefined);
  if (fromChannel) return fromChannel;
  return roomPhoneUrl(channel.channel_id != null ? String(channel.channel_id) : undefined);
}
