import type { RequestBody } from './client';
import { getEndpoint } from './registry';

/** Body keys documented in docs/api/bundle-callsites.md or observed captures (web-api.md). */
export function documentedBodyKeys(endpoint: string): string[] {
  const entry = (() => {
    try {
      return getEndpoint(endpoint);
    } catch {
      return null;
    }
  })();
  if (entry?.buildRequest) {
    const sample = sampleParamsForDocumentedBody(endpoint);
    return Object.keys(entry.buildRequest(sample)).sort();
  }
  switch (endpoint) {
    case 'get_conversation':
      return ['conversation_id'];
    case 'mark_conversation_segment_listened':
      return ['conversation_id', 'segment_id'];
    case 'add_conversation_segment':
      return [
        'attached_url',
        'audio_file',
        'audio_format_type',
        'client_segment_id',
        'conversation_id',
        'duration',
        'message',
        'segment_batch_id',
      ];
    case 'create_conversation':
      return ['is_private', 'privacy_level', 'social_club_id', 'source', 'user_ids'];
    case 'send_conversation_emoji_reaction':
      return ['conversation_id', 'emoji', 'segment_id'];
    case 'get_conversation_unread_summary':
      return [];
    case 'get_user_social_clubs':
      return [];
    case 'get_social_club':
      return ['social_club_slug'];
    case 'get_social_club_members':
      return ['social_club_id'];
    case 'get_social_club_messages':
      return ['social_club_id', 'social_club_slug'];
    case 'send_social_club_message':
      return ['message', 'social_club_id', 'social_club_slug'];
    case 'get_replay_channel':
      return ['channel'];
    case 'get_highlight':
      return ['highlight_id'];
    default:
      return [];
  }
}

export function documentedQueryKeys(endpoint: string): string[] {
  if (endpoint === 'get_notifications') return ['page', 'page_size'];
  if (endpoint === 'get_events') return ['is_filtered', 'page', 'page_size'];
  return [];
}

export function sampleParamsForDocumentedBody(endpoint: string): RequestBody {
  switch (endpoint) {
    case 'get_conversation':
      return { conversation_id: 'c1' };
    case 'mark_conversation_segment_listened':
      return { conversation_id: 'c1', segment_id: 'seg-1' };
    case 'add_conversation_segment':
      return {
        conversation_id: 'c1',
        message: 'hello',
        audio_file: '',
        audio_format_type: 'aac',
        client_segment_id: 'client-1',
        segment_batch_id: 'batch-1',
        duration: 0,
        attached_url: '',
      };
    case 'create_conversation':
      return {
        privacy_level: 'private',
        social_club_id: 0,
        is_private: true,
        user_ids: [1, 2],
        source: 14,
      };
    case 'send_conversation_emoji_reaction':
      return { conversation_id: 'c1', segment_id: 'seg-1', emoji: '❤️' };
    case 'get_social_club':
      return { social_club_slug: 'h1' };
    case 'get_social_club_members':
      return { social_club_id: 1 };
    case 'get_social_club_messages':
      return { social_club_id: 1, social_club_slug: 'h1' };
    case 'send_social_club_message':
      return { social_club_id: 1, social_club_slug: 'h1', message: 'hello' };
    case 'get_replay_channel':
      return { channel: 'replay-1' };
    case 'get_highlight':
      return { highlight_id: 'hl-1' };
    default:
      return {};
  }
}
