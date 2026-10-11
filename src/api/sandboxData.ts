import type { CHChannel, CHChatMessage, CHUser } from './types';

export const MOCK_ME: CHUser = {
  user_id: 100982,
  name: 'Sandbox User',
  username: 'sandbox',
  photo_url: null,
  bio: 'Fictional account used only by sandbox mode.',
  twitter: null,
  instagram: null,
  displayname: 'Sandbox',
  num_followers: 1420,
  num_following: 388,
  num_cofollows: 120,
  follows_me: false,
  has_protected_profile: false,
  is_speaker: true,
  is_moderator: true,
  is_muted: false,
};

export const INITIAL_MOCK_CHANNELS: CHChannel[] = [
  {
    channel_id: 'ch-tech-deep-dive',
    channel: 'tech-ai-audio-revolution',
    topic: 'Future of Social Audio, WebRTC & AI Voice Agents',
    club_name: 'Tech Innovators Club',
    privacy_tooltip: 'Open to everyone',
    privacy_settings: { type: 'house', display_text: 'Tech Innovators Club', tooltip_text: 'Open to everyone' },
    club_id: 42,
    creator_user_profile_id: 201,
    is_private: false,
    is_active_trending_topic_channel: true,
    url: 'https://www.clubhouse.com/room/sandbox',
    num_speakers: 4,
    num_all: 8,
    users: [
      {
        user_id: 201,
        name: 'Elena Rostova',
        username: 'elena_ai',
        photo_url: null,
        bio: 'Fictional host used only in sandbox mode.',
        is_speaker: true,
        is_moderator: true,
        is_speaking: true,
        is_muted: false,
      },
      {
        user_id: 202,
        name: 'Marcus Vance',
        username: 'marcus_v',
        photo_url: null,
        bio: 'Fictional speaker used only in sandbox mode.',
        is_speaker: true,
        is_moderator: true,
        is_speaking: false,
        is_muted: false,
      },
      {
        user_id: 203,
        name: 'Sora Tanaka',
        username: 'sora_t',
        photo_url: null,
        bio: 'Fictional speaker used only in sandbox mode.',
        is_speaker: true,
        is_moderator: false,
        is_speaking: false,
        is_muted: true,
      },
      {
        user_id: 100982,
        name: 'Sandbox User',
        username: 'sandbox',
        photo_url: null,
        is_speaker: true,
        is_moderator: true,
        is_speaking: false,
        is_muted: true,
      },
      {
        user_id: 301,
        name: 'Chloe Davis',
        username: 'chloed',
        photo_url: null,
        displayname: null,
        bio: 'Fictional stranger used only in sandbox mode.',
        num_followers: 12,
        num_following: 40,
        num_cofollows: 3,
        follows_me: false,
        has_protected_profile: false,
        is_speaker: false,
        is_speaking: false,
      },
      {
        user_id: 302,
        name: 'David Kim',
        username: 'dkim_dev',
        photo_url: null,
        displayname: 'Dave',
        bio: 'Fictional one-way profile used only in sandbox mode.',
        num_followers: 80,
        num_following: 20,
        num_cofollows: 4,
        follows_me: true,
        has_protected_profile: false,
        is_speaker: false,
        is_speaking: false,
      },
      {
        user_id: 303,
        name: 'Zack Thorne',
        username: 'zack_t',
        photo_url: null,
        displayname: 'Zack',
        bio: 'Fictional mutual profile used only in sandbox mode.',
        num_followers: 1452,
        num_following: 845,
        num_cofollows: 786,
        mutual_follows_count: 3,
        mutual_follows: [
          { user_id: 301, name: 'Chloe Davis', username: 'chloed', photo_url: null },
          { user_id: 302, name: 'David Kim', username: 'dkim_dev', photo_url: null },
        ],
        mutual_cofollows_count: 1,
        mutual_cofollows: [
          { user_id: 204, name: 'BeatMaker Kai', username: 'kaibeats', photo_url: null },
        ],
        follows_me: true,
        has_protected_profile: false,
        is_speaker: false,
        is_speaking: false,
      },
      {
        user_id: 304,
        name: 'Mina Adler',
        username: 'mina_a',
        photo_url: null,
        displayname: 'Mina',
        bio: 'Fictional private profile used only in sandbox mode.',
        num_followers: 4,
        num_following: 1,
        num_cofollows: 0,
        follows_me: false,
        has_protected_profile: true,
        is_speaker: false,
        is_speaking: false,
      },
    ],
  },
  {
    channel_id: 'ch-music-chill-lounge',
    channel: 'lofi-midnight-jam',
    topic: 'Lo-Fi Producers & Sound Designers Listening Party',
    club_name: 'Chill Beats Collective',
    visited: true,
    is_replay_enabled: true,
    is_clips_enabled: true,
    privacy_settings: { type: 'public', display_text: 'Public', tooltip_text: 'Interest-based public room' },
    privacy_tooltip: 'Interest-based public room',
    club_id: 108,
    is_private: false,
    num_speakers: 2,
    num_all: 2,
    users: [
      {
        user_id: 204,
        name: 'BeatMaker Kai',
        username: 'kaibeats',
        photo_url: null,
        bio: 'Fictional producer used only in sandbox mode.',
        is_speaker: true,
        is_moderator: true,
        is_speaking: true,
        is_muted: false,
      },
      {
        user_id: 205,
        name: 'Luna Song',
        username: 'lunasounds',
        photo_url: null,
        bio: 'Fictional vocalist used only in sandbox mode.',
        is_speaker: true,
        is_moderator: false,
        is_speaking: false,
        is_muted: false,
      },
    ],
  },
  {
    channel_id: 'ch-startup-founders-pitch',
    channel: 'founders-open-mic',
    topic: '2-Minute Startup Pitches & Brutal Feedback by VCs',
    club_name: 'Early Stage Venture',
    club_id: 99,
    is_private: false,
    is_social_mode: true,
    privacy_settings: { type: 'friends_of_friends', display_text: 'Friends of friends', tooltip_text: 'Friends of friends' },
    privacy_tooltip: 'Friends of friends',
    is_chat_enabled: false,
    is_handraise_enabled: false,
    should_join_muted: true,
    num_speakers: 1,
    num_all: 1,
    users: [
      {
        user_id: 206,
        name: 'Victoria Sterling',
        username: 'vsterling_vc',
        photo_url: null,
        bio: 'Fictional investor used only in sandbox mode.',
        is_speaker: true,
        is_moderator: true,
        is_speaking: true,
        is_muted: false,
      },
    ],
  },
];

export const SANDBOX_CHAT_MESSAGES: CHChatMessage[] = [
  {
    id: 'msg-1',
    user_id: 201,
    name: 'Elena Rostova',
    username: 'elena_ai',
    photo_url: null,
    message: 'Welcome everyone. Drop your questions for the speakers here.',
    timestamp: '2m ago',
  },
  {
    id: 'msg-2',
    user_id: 202,
    name: 'Marcus Vance',
    username: 'marcus_v',
    photo_url: null,
    message: 'Checking the sandbox mix. This room is fictional.',
    timestamp: '1m ago',
  },
];

export function sandboxUserIds(): Set<number> {
  const ids = new Set<number>([MOCK_ME.user_id]);
  for (const channel of INITIAL_MOCK_CHANNELS) {
    for (const user of channel.users) ids.add(user.user_id);
  }
  for (const message of SANDBOX_CHAT_MESSAGES) ids.add(message.user_id);
  return ids;
}

function sandboxPerson(id: number): CHUser | null {
  for (const channel of INITIAL_MOCK_CHANNELS) {
    const user = channel.users.find((entry) => entry.user_id === id);
    if (user) return user;
  }
  return null;
}

function sandboxPeoplePages(kind: 'followers' | 'following'): CHUser[][] {
  const row = (id: number): CHUser[] => {
    const user = sandboxPerson(id);
    return user ? [user] : [];
  };
  if (kind === 'followers') return [row(301), row(302)];
  return [row(303)];
}

/** Fictional pages for sandbox only. The second page is addressed by cursor "2". */
export function sandboxPeoplePage(
  kind: 'followers' | 'following',
  cursor: string | undefined,
  userId?: number,
): { users: CHUser[]; next_cursor: string | null } {
  const people = sandboxPeoplePages(kind).flat().filter((user) => user.user_id !== userId);
  const index = cursor == null ? 0 : cursor === '2' ? 1 : -1;
  if (index < 0) return { users: [], next_cursor: null };
  const users = people.slice(index, index + 1);
  const next_cursor = people.length > index + 1 ? '2' : null;
  return { users, next_cursor };
}
