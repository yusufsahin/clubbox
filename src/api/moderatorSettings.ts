import { permissionOn } from './roomActions.ts';
import type { CHUser, UserCapabilities } from './types.ts';

export type ModeratorSettingsFlags = {
  canPinnedLink: boolean;
  canToggleChat: boolean;
  canDeleteChat: boolean;
  canDisableReplay: boolean;
  canNsfw: boolean;
  canHandraiseQueue: boolean;
  canSuggestedSpeakers: boolean;
};

/** Gate Phase 28.3 room-settings controls by capability + supports(). */
export function moderatorSettingsFlags(
  caps: UserCapabilities | undefined,
  channel: {
    is_replay_enabled?: boolean;
    is_pinned_links_available?: boolean;
    is_chat_enabled?: boolean;
  } | null | undefined,
  supports: (endpoint: string) => boolean,
): ModeratorSettingsFlags {
  const allow = (key: string) => !caps || !(key in caps) || permissionOn(caps[key]);
  return {
    canPinnedLink: allow('can_edit_pinned_links')
      && channel?.is_pinned_links_available !== false
      && supports('check_channel_link')
      && supports('add_channel_link')
      && supports('remove_channel_link'),
    canToggleChat: allow('can_disable_room_chat')
      && supports('enable_channel_messages')
      && supports('disable_channel_messages'),
    canDeleteChat: allow('can_disable_room_chat') && supports('delete_channel_message'),
    canDisableReplay: allow('can_disable_replay')
      && channel?.is_replay_enabled === true
      && supports('disable_replay'),
    canNsfw: supports('update_nsfw_status'),
    canHandraiseQueue: allow('can_edit_handraise_queue') && supports('get_handraise_queue'),
    canSuggestedSpeakers: allow('can_invite') && supports('get_suggested_speakers'),
  };
}

/** Normalize queue / suggested lists from mobile responses. */
export function usersFromQueuePayload(raw: {
  users?: CHUser[];
  users_in_queue?: CHUser[];
  queue?: CHUser[];
  suggested_speakers?: CHUser[];
  speakers?: CHUser[];
} | null | undefined): CHUser[] {
  if (!raw) return [];
  const list = raw.users_in_queue ?? raw.queue ?? raw.suggested_speakers ?? raw.speakers ?? raw.users;
  return Array.isArray(list) ? list.filter((u) => u && typeof u.user_id === 'number') : [];
}
