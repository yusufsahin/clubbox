/** Parse get_replay_channel / get_highlight payloads into a playable summary. */

export type ReplayPlayback = {
  id: string;
  title: string;
  audioUrl: string;
  kind: 'replay' | 'highlight';
  chunkCount?: number;
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

function httpsUrl(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (/^https:\/\//i.test(trimmed)) return trimmed;
  }
  return '';
}

function digAudioUrl(root: Record<string, unknown>): string {
  const nested = [
    asRecord(root.replay),
    asRecord(root.highlight),
    asRecord(root.channel),
    asRecord(root.media),
    asRecord(root.audio),
  ];
  const candidates: unknown[] = [
    root.audio_url,
    root.replay_url,
    root.media_url,
    root.download_url,
    root.url,
    root.mp3_url,
  ];
  for (const obj of nested) {
    if (!obj) continue;
    candidates.push(
      obj.audio_url,
      obj.replay_url,
      obj.media_url,
      obj.download_url,
      obj.url,
      obj.mp3_url,
    );
  }
  return httpsUrl(...candidates);
}

function readChunkCount(root: Record<string, unknown>, nested: Record<string, unknown>): number {
  for (const value of [nested.chunk_count, nested.num_chunks, root.chunk_count, root.num_chunks]) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return Math.floor(value);
  }
  return 0;
}

export function readReplayPayload(payload: unknown, fallbackId: string): ReplayPlayback | null {
  const root = asRecord(payload);
  if (!root) return null;
  const nested = asRecord(root.replay) ?? asRecord(root.channel) ?? root;
  const id = readString(nested.channel, nested.channel_id, nested.id, root.channel, fallbackId);
  const title = readString(nested.topic, nested.title, nested.name, root.topic, root.title) || 'Replay';
  const chunkCount = readChunkCount(root, nested);
  return {
    id: id || fallbackId,
    title,
    audioUrl: digAudioUrl(root),
    kind: 'replay',
    ...(chunkCount > 0 ? { chunkCount } : {}),
  };
}

export function readHighlightPayload(payload: unknown, fallbackId: string): ReplayPlayback | null {
  const root = asRecord(payload);
  if (!root) return null;
  const nested = asRecord(root.highlight) ?? root;
  const id = readString(nested.highlight_id, nested.id, root.highlight_id, fallbackId);
  const title = readString(nested.topic, nested.title, nested.name, root.topic, root.title) || 'Highlight';
  return {
    id: id || fallbackId,
    title,
    audioUrl: digAudioUrl(root),
    kind: 'highlight',
  };
}
