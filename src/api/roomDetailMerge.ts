import type { CHChannelDetail } from './types.ts';

/**
 * Copy PubNub / poll fields onto the live channel without dropping
 * handraise settings or host capability gates.
 */
export function mergeRoomDetailFields(current: CHChannelDetail, detail: CHChannelDetail): void {
  if (detail.users) current.users = detail.users;
  if (typeof detail.num_all === 'number') current.num_all = detail.num_all;
  if (typeof detail.num_ever === 'number') current.num_ever = detail.num_ever;
  if (typeof detail.num_shares === 'number') current.num_shares = detail.num_shares;
  if (typeof detail.num_clips === 'number') current.num_clips = detail.num_clips;
  if (typeof detail.num_speakers === 'number') current.num_speakers = detail.num_speakers;
  if (typeof detail.are_highlights_enabled === 'boolean') {
    current.are_highlights_enabled = detail.are_highlights_enabled;
  }
  if (typeof detail.is_web_listening_enabled === 'boolean') {
    current.is_web_listening_enabled = detail.is_web_listening_enabled;
  }
  if (typeof detail.is_chat_enabled === 'boolean') current.is_chat_enabled = detail.is_chat_enabled;
  if (detail.chat_post_block !== undefined) current.chat_post_block = detail.chat_post_block;
  if (detail.chat_permission != null) current.chat_permission = detail.chat_permission;
  if (detail.clips_permission != null) current.clips_permission = detail.clips_permission;
  if (typeof detail.has_raised_hands === 'boolean') current.has_raised_hands = detail.has_raised_hands;
  if (typeof detail.is_replay_enabled === 'boolean') current.is_replay_enabled = detail.is_replay_enabled;
  if (typeof detail.is_clips_enabled === 'boolean') current.is_clips_enabled = detail.is_clips_enabled;
  if (detail.privacy_settings) current.privacy_settings = detail.privacy_settings;
  if (typeof detail.is_handraise_enabled === 'boolean') {
    current.is_handraise_enabled = detail.is_handraise_enabled;
  }
  if (typeof detail.handraise_queue_setting === 'number') {
    current.handraise_queue_setting = detail.handraise_queue_setting;
  }
  if (typeof detail.handraise_permission === 'number') {
    current.handraise_permission = detail.handraise_permission;
  }
  if (Array.isArray(detail.handraise_queue_options)) {
    current.handraise_queue_options = detail.handraise_queue_options;
  }
  if (typeof detail.is_social_mode === 'boolean') current.is_social_mode = detail.is_social_mode;
  if (typeof detail.is_private === 'boolean') current.is_private = detail.is_private;
  if (typeof detail.topic === 'string' && detail.topic) current.topic = detail.topic;
  if (typeof detail.language === 'string') current.language = detail.language;
  if (typeof detail.time_created === 'string') current.time_created = detail.time_created;
  if (typeof detail.club_name === 'string') current.club_name = detail.club_name;
  if (typeof detail.is_nsfw === 'boolean') current.is_nsfw = detail.is_nsfw;
  if (typeof detail.privacy_label === 'string') current.privacy_label = detail.privacy_label;
  if (Array.isArray(detail.topics)) current.topics = detail.topics;
  if (Array.isArray(detail.emoji_reaction_options)) {
    current.emoji_reaction_options = detail.emoji_reaction_options;
  }
  if (typeof detail.show_last_speaker_warning === 'boolean') {
    current.show_last_speaker_warning = detail.show_last_speaker_warning;
  }
  if (typeof detail.hide_moderator_indicator === 'boolean') {
    current.hide_moderator_indicator = detail.hide_moderator_indicator;
  }
  if (detail.welcome_for_user_profile !== undefined) {
    current.welcome_for_user_profile = detail.welcome_for_user_profile;
  }
  if (detail.user_capabilities && typeof detail.user_capabilities === 'object') {
    current.user_capabilities = {
      ...(current.user_capabilities ?? {}),
      ...detail.user_capabilities,
    };
  }
}
