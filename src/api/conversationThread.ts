import type { ConversationSegment, ConversationThread } from './types';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function segmentText(raw: Record<string, unknown>): string {
  if (typeof raw.user_text === 'string' && raw.user_text.trim()) return raw.user_text;
  if (typeof raw.text === 'string' && raw.text.trim()) return raw.text;
  if (typeof raw.transcription === 'string' && raw.transcription.trim()) return raw.transcription;
  if (Array.isArray(raw.transcription)) {
    return raw.transcription
      .map((entry) => {
        const row = asRecord(entry);
        return row && typeof row.text === 'string' ? row.text : '';
      })
      .filter(Boolean)
      .join(' ')
      .trim();
  }
  return '';
}

function segmentKind(raw: Record<string, unknown>): 'text' | 'voice' {
  if (raw.kind === 'voice') return 'voice';
  if (typeof raw.segment_audio_url === 'string' && raw.segment_audio_url.length > 0) return 'voice';
  if (typeof raw.duration === 'number' && raw.duration > 0 && !segmentText(raw)) return 'voice';
  if (raw.shared_without_voice === true) return 'text';
  if (typeof raw.audio_status === 'string' && raw.audio_status !== '' && raw.audio_status !== 'NONE') {
    return 'voice';
  }
  return 'text';
}

function readSegment(entry: unknown): ConversationSegment | null {
  const raw = asRecord(entry);
  if (!raw) return null;
  const id = typeof raw.segment_id === 'string' && raw.segment_id
    ? raw.segment_id
    : (typeof raw.id === 'string' && raw.id ? raw.id : '');
  if (!id) return null;
  const creator = asRecord(raw.creator_user_profile);
  const author = creator && typeof creator.name === 'string' ? creator.name : '';
  const text = segmentText(raw);
  const kind = segmentKind(raw);
  return {
    id,
    kind,
    author_name: author,
    text: text || (kind === 'voice' ? '' : ''),
  };
}

/** Map get_conversation (flat or nested) into the Messages thread model. */
export function readConversationThread(payload: unknown): ConversationThread | null {
  const root = asRecord(payload);
  if (!root) return null;
  const nested = asRecord(root.conversation);
  const raw = nested ?? root;
  if (!Array.isArray(raw.segments)) return null;
  const segments = raw.segments
    .map((entry) => readSegment(entry))
    .filter((entry): entry is ConversationSegment => !!entry);
  return { segments, members: [] };
}
