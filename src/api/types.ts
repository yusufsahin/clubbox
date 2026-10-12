export type SearchObjectType = 'UserProfile' | 'LiveChannel' | 'Replay' | 'SocialClub' | 'SegmentTranscription';

export type SearchHit =
  | { kind: 'user'; user: CHUser; followsMe: boolean }
  | { kind: 'room'; channel: string; topic: string; speakers: number; listeners: number }
  | { kind: 'replay'; channel: string; topic: string }
  | { kind: 'house'; id: number; name: string; slug: string; photoUrl: string | null; members: number | null; subtitle: string }
  | { kind: 'conversation'; id: string; title: string; summary: string };

export interface CHUser {
  user_id: number;
  name: string;
  username: string;
  photo_url: string | null;
  bio?: string;
  share_url?: string;
  twitter?: string | null;
  instagram?: string | null;
  displayname?: string | null;
  num_followers?: number;
  num_following?: number;
  num_cofollows?: number;
  follows_me?: boolean;
  mutual_follows_count?: number;
  mutual_follows?: CHUser[];
  mutual_cofollows_count?: number;
  mutual_cofollows?: CHUser[];
  /** Raw get_profile string. Unmapped values stay an unknown relationship. */
  follow_status?: string;
  has_protected_profile?: boolean;
  can_dm?: boolean;
  can_wave?: boolean;
  social_clubs?: { social_club_id: number; name: string; slug?: string; photo_url?: string | null; num_members?: number }[];
  chatting_with?: CHUser[];
  is_speaker?: boolean;
  is_moderator?: boolean;
  is_muted?: boolean;
  is_speaking?: boolean;
  is_hand_raised?: boolean;
  is_invited_to_speak?: boolean;
  time_joined?: string;
  invited_by_user_profile?: {
    user_id: number;
    name: string;
    photo_url: string | null;
    username: string;
  };
}

export interface CHChannel {
  channel_id: number | string;
  channel: string;
  topic: string;
  club_name?: string;
  club_id?: number;
  is_private: boolean;
  is_social_mode?: boolean;
  privacy_settings?: {
    type?: string;
    display_text?: string;
    tooltip_text?: string;
  };
  is_clips_enabled?: boolean;
  /** Present on some feed cards — used for “running for” on hallway cards. */
  time_created?: string;
  is_handraise_enabled?: boolean;
  /** Community: 1 = everyone, 2 = friends of speakers (when handraise is on). */
  handraise_permission?: number;
  is_chat_enabled?: boolean;
  should_join_muted?: boolean;
  creator_user_profile_id?: number;
  url?: string;
  club_photo_url?: string | null;
  privacy_label?: string;
  privacy_tooltip?: string;
  visited?: boolean;
  is_replay_enabled?: boolean;
  is_nsfw?: boolean;
  is_active_trending_topic_channel?: boolean;
  /** From feed logging_context when present — used for topic-chip filtering. */
  topic_key?: string;
  num_speakers: number;
  num_all: number;
  has_raised_hands?: boolean;
  users: CHUser[];
  token?: string; // Agora RTC token
  pubnub_token?: string;
  pubnub_origin?: string;
  pubnub_heartbeat_value?: number;
  pubnub_heartbeat_interval?: number;
  pubnub_time_token?: string;
}

export type UserCapabilities = Record<string, boolean | undefined>;

export interface CHChannelDetail extends CHChannel {
  description?: string;
  agora_native_mute?: boolean;
  /** When false, Clubhouse blocks web/WebRTC listeners — do not join Agora. */
  is_web_listening_enabled?: boolean;
  user_capabilities?: UserCapabilities;
}

export interface CHAuthResponse {
  success: boolean;
  is_waitlisted?: boolean;
  is_onboarding?: boolean;
  auth_token?: string;
  access_token?: string;
  refresh_token?: string;
  user_profile?: CHUser;
  error_message?: string;
  send_rc_token?: boolean;
  is_blocked?: boolean;
  is_verified?: boolean;
}

export interface FeedTopic {
  key: string;
  display_name: string;
}

export interface CHConversation {
  conversation_id: string;
  title: string;
  short_title: string;
  preview_segment_text: string;
  summary: string;
  author_name: string;
  author_names: string[];
  social_club_name: string;
  social_club_photo: string;
  is_subscribed: boolean | null;
  can_reply: boolean;
  cant_reply_reason: string;
  pending_count: number;
  pending_names: string[];
  has_listened: boolean | null;
  permanent_house_chat: boolean;
  share_url: string;
  preview_segment_type: string;
  is_archived: boolean;
  privacy_label: string;
  privacy_tooltip: string;
  has_new_segments: boolean;
  time_content_updated: string;
  can_add_members: boolean;
  can_invite: boolean;
  can_delete: boolean;
  can_leave: boolean;
  participants: CHUser[];
}

export interface ConversationSegment {
  id: string;
  kind: 'text' | 'voice';
  author_name: string;
  text: string;
}

export interface ConversationMember {
  name: string;
  hide_before: number;
}

export interface ConversationThread {
  segments: ConversationSegment[];
  members: ConversationMember[];
}

export interface PresenceFriend {
  user_id: number;
  name: string;
  username: string;
  status: 'online' | 'in-room';
  channel_id: string;
}

export interface MeSettings {
  contact_upload_enabled: boolean;
  follower_requests_enabled: boolean;
  private_conversations_enabled: boolean;
}

export interface CHNotification {
  notification_id: number;
  user_profile: CHUser;
  message: string;
  time_created: string;
  type: number;
  channel?: string;
}

export interface CHChatMessage {
  id: string;
  user_id: number;
  username: string;
  name: string;
  photo_url: string | null;
  message: string;
  timestamp: string;
}

export interface SoundEffectItem {
  id: string;
  name: string;
  hotkey: string;
  icon: string;
  type: 'synth' | 'custom';
  synthType?: 'applause' | 'airhorn' | 'laugh' | 'rimshot' | 'bell' | 'gong' | 'laser';
  audioBuffer?: AudioBuffer;
  sourceBytes?: ArrayBuffer;
  volume?: number;
  loop?: boolean;
}
