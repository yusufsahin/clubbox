export interface CHUser {
  user_id: number;
  name: string;
  username: string;
  photo_url: string | null;
  bio?: string;
  twitter?: string | null;
  instagram?: string | null;
  num_followers?: number;
  num_following?: number;
  is_speaker?: boolean;
  is_moderator?: boolean;
  is_muted?: boolean;
  is_speaking?: boolean;
  is_hand_raised?: boolean;
  is_invited_to_speak?: boolean;
  is_following?: boolean;
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
  creator_user_profile_id?: number;
  url?: string;
  num_speakers: number;
  num_all: number;
  has_raised_hands?: boolean;
  users: CHUser[];
  token?: string; // Agora RTC token
  pubnub_token?: string;
  pubnub_heartbeat_interval?: number;
}

export interface CHChannelDetail extends CHChannel {
  description?: string;
  agora_native_mute?: boolean;
  is_handraise_enabled?: boolean;
  is_chat_enabled?: boolean;
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
}
