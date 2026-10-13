import type { ChatPostBlock, CHChannelDetail } from './types.ts';

/** Clubhouse “follow to chat” / spam gate from join or send_channel_message. */
export function parseChatPostBlock(raw: unknown): ChatPostBlock | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const title = typeof row.title === 'string' ? row.title.trim() : '';
  const body = typeof row.body === 'string' ? row.body.trim() : '';
  const summary = typeof row.summary === 'string' ? row.summary.trim() : '';
  const reason = typeof row.reason === 'string' ? row.reason.trim() : '';
  const name = typeof row.name === 'string' ? row.name.trim() : '';
  const avatarUrl = typeof row.avatar_url === 'string' ? row.avatar_url : null;
  let cta: ChatPostBlock['cta'];
  if (row.cta && typeof row.cta === 'object') {
    const c = row.cta as Record<string, unknown>;
    const type = typeof c.type === 'string' ? c.type : '';
    const target = typeof c.target_user_id === 'number'
      ? c.target_user_id
      : (typeof c.target_user_id === 'string' && /^\d+$/.test(c.target_user_id)
        ? Number(c.target_user_id)
        : NaN);
    if (type && Number.isFinite(target)) {
      cta = {
        type,
        target_user_id: target,
        current_state: typeof c.current_state === 'string' ? c.current_state : undefined,
      };
    }
  }
  if (!title && !body && !summary && !cta) return null;
  return {
    reason: reason || undefined,
    title: title || undefined,
    body: body || undefined,
    summary: summary || undefined,
    name: name || undefined,
    avatar_url: avatarUrl,
    cta,
  };
}

export function roomChatComposerState(channel: CHChannelDetail | null | undefined): {
  canPost: boolean;
  block: ChatPostBlock | null;
} {
  if (!channel) return { canPost: false, block: null };
  if (channel.is_chat_enabled === false) return { canPost: false, block: null };
  const block = parseChatPostBlock(channel.chat_post_block);
  if (block) return { canPost: false, block };
  if (channel.user_capabilities?.can_post_to_chat === false) {
    return { canPost: false, block: null };
  }
  return { canPost: true, block: null };
}
