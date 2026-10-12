import type { RequestBody } from './client';
import { routePath, routeRecord } from './capabilities';
import { getEndpoint } from './registry';

/** Body keys documented in docs/api/bundle-callsites.md or observed captures (web-api.md). */
export function documentedBodyKeys(endpoint: string): string[] {
  const route = routeRecord(endpoint);
  // Path-param GETs put segments in the URL; JSON body is empty after expand.
  if (route?.method === 'GET' && (route.pathParams?.length || routePath(endpoint).includes('{'))) {
    return [];
  }
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
      return ['conversation_id'];
    case 'update_conversation_title':
      return ['conversation_id', 'title'];
    case 'delete_conversation':
      return ['conversation_id'];
    case 'get_conversations':
      return ['is_private_only', 'next_cursor'];
    case 'get_channels':
    case 'get_feed_v3':
      return ['next_cursor'];
    case 'gif_reaction':
      return ['channel', 'giphy_id'];
    case 'get_replay_channel_chunk':
    case 'get_replay_channel':
    case 'get_highlight':
      // Path-param GETs: segments leave the JSON body after expandRoutePath.
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
    case 'get_social_club_message_thread':
      return ['message_id_str', 'social_club_id'];
    case 'send_social_club_threaded_message':
      return ['message', 'message_id_str', 'social_club_id'];
    case 'send_social_club_message_emoji_reaction':
      return ['add_reaction', 'emoji_id', 'message_id', 'social_club_id'];
    case 'update_last_read_social_club_message':
      return ['message_id', 'social_club_id'];
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
    case 'gif_reaction':
      return { channel: 'abc123', giphy_id: '3oEjI6SIIHBdRxXI40' };
    case 'get_social_club_message_thread':
      return { social_club_id: 1, message_id_str: 'hm-1' };
    case 'send_social_club_threaded_message':
      return { social_club_id: 1, message_id_str: 'hm-1', message: 'nice' };
    case 'send_social_club_message_emoji_reaction':
      return { social_club_id: 1, message_id: 'hm-1', add_reaction: true, emoji_id: '❤️' };
    case 'update_last_read_social_club_message':
      return { social_club_id: 1, message_id: 'hm-1' };
    case 'get_conversation_unread_summary':
      return { conversation_id: 'c1' };
    case 'update_conversation_title':
      return { conversation_id: 'c1', title: 'Weekend plans' };
    case 'delete_conversation':
      return { conversation_id: 'c1' };
    case 'get_replay_channel':
      return { channel: 'replay-1' };
    case 'get_replay_channel_chunk':
      return { channel: 'replay-1', chunk: '0' };
    case 'get_highlight':
      return { id: 'hl-1' };
    case 'add_channel_link':
      return { channel: 'abc123', link: 'https://example.com' };
    case 'disable_channel_messages':
    case 'enable_channel_messages':
      return { channel: 'abc123' };
    case 'delete_channel_message':
      return { channel: 'abc123', message_id: '1' };
    default:
      return {};
  }
}
