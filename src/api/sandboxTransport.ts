import type { ApiTransport, RequestBody } from './client';
import type { PeopleListKind } from './relationship';
import {
  INITIAL_MOCK_CHANNELS,
  MOCK_ME,
  SANDBOX_CHAT_MESSAGES,
  sandboxPeoplePage,
} from './sandboxData';
import type {
  CHChannel,
  CHChannelDetail,
  ConversationSegment,
  ConversationThread,
  PresenceFriend,
} from './types';

interface SandboxInput {
  channel?: string;
  userId?: number;
  raiseHands: boolean;
  topic?: string;
  isPrivate: boolean;
  isSocial: boolean;
  audience?: string;
  replayEnabled: boolean;
  chatEnabled: boolean;
  talkUserId?: number;
  talkUserName?: string;
  talkUserUsername?: string;
  cursor?: string;
  socialClubSlug?: string;
}

function readRequestBody(body: RequestBody | undefined): SandboxInput {
  const record = body ?? {};
  return {
    channel: typeof record.channel === 'string' ? record.channel : undefined,
    userId: typeof record.user_id === 'number' ? record.user_id : undefined,
    raiseHands: record.raise_hands === true,
    topic: typeof record.topic === 'string' ? record.topic : undefined,
    isPrivate: record.is_private === true,
    isSocial: record.is_social_mode === true,
    audience: typeof record.audience === 'string' ? record.audience : undefined,
    replayEnabled: record.is_replay_enabled !== false,
    chatEnabled: record.is_chat_enabled !== false,
    talkUserId: typeof record.talk_user_id === 'number' ? record.talk_user_id : undefined,
    talkUserName: typeof record.talk_user_name === 'string' ? record.talk_user_name : undefined,
    talkUserUsername: typeof record.talk_user_username === 'string' ? record.talk_user_username : undefined,
    cursor: typeof record.next_cursor === 'string' && record.next_cursor.length > 0 ? record.next_cursor : undefined,
    socialClubSlug: typeof record.social_club_slug === 'string' ? record.social_club_slug : undefined,
  };
}

export type SandboxBackendHooks = {
  onAdoptSandboxSession?: (userId: number) => void;
};

export class SandboxBackend {
  private mockChannels: CHChannel[];
  private sandboxConversationRecords: Record<string, unknown>[] = [];
  private sandboxThreads = new Map<string, ConversationThread>();
  private currentChannel: CHChannelDetail | null = null;
  private handRaised = false;
  private sandboxTick = 0;
  private sandboxSpeakerInvites = new Set<string>();
  private readonly hooks: SandboxBackendHooks;

  constructor(hooks: SandboxBackendHooks = {}) {
    this.hooks = hooks;
    this.mockChannels = JSON.parse(JSON.stringify(INITIAL_MOCK_CHANNELS)) as CHChannel[];
    this.seedSandboxInbox();
  }

  getCurrentChannel(): CHChannelDetail | null {
    return this.currentChannel;
  }

  isHandRaised(): boolean {
    return this.handRaised;
  }

  setHandRaised(raised: boolean): void {
    this.handRaised = raised;
  }

  presence(): PresenceFriend[] {
    return [
      {
        user_id: 201,
        name: 'Elena Rostova',
        username: 'elena_ai',
        status: 'in-room',
        channel_id: 'ch-tech-deep-dive',
      },
      {
        user_id: 401,
        name: 'Noah Ellis',
        username: 'noah_e',
        status: 'online',
        channel_id: '',
      },
    ];
  }

  thread(conversationId: string): ConversationThread | null {
    const thread = this.sandboxThreads.get(conversationId);
    if (!thread) return null;
    return {
      segments: thread.segments.map((segment) => ({ ...segment })),
      members: thread.members.map((member) => ({ ...member })),
    };
  }

  appendSegment(
    conversationId: string,
    segment: { kind: 'text' | 'voice'; author_name: string; text: string },
  ): ConversationSegment | null {
    const thread = this.sandboxThreads.get(conversationId);
    const record = this.sandboxConversationRecords.find((entry) => entry.conversation_id === conversationId);
    if (!thread || !record) return null;
    const next: ConversationSegment = {
      id: `seg-${Date.now()}`,
      kind: segment.kind,
      author_name: segment.author_name,
      text: segment.text,
    };
    thread.segments.push(next);
    record.preview_segment_text = segment.text;
    record.preview_segment_type = segment.kind === 'voice' ? 'TEXT_TO_SPEECH' : 'TEXT';
    record.time_content_updated = new Date().toISOString();
    return next;
  }

  addMember(conversationId: string, name: string): boolean {
    const thread = this.sandboxThreads.get(conversationId);
    if (!thread || thread.members.some((member) => member.name === name)) return false;
    thread.members.push({ name, hide_before: thread.segments.length });
    return true;
  }

  removeConversation(conversationId: string): void {
    this.sandboxConversationRecords = this.sandboxConversationRecords.filter(
      (entry) => entry.conversation_id !== conversationId,
    );
    this.sandboxThreads.delete(conversationId);
  }

  startVm(friend: { userId: number; name: string; username: string }): string {
    const id = `sandbox-vm-${friend.userId}`;
    if (!this.sandboxConversationRecords.some((entry) => entry.conversation_id === id)) {
      this.sandboxConversationRecords.unshift({
        conversation_id: id,
        title: friend.name,
        short_title: friend.name,
        preview_segment_text: '',
        summary: '',
        creator_user_profile: {
          user_id: friend.userId,
          name: friend.name,
          username: friend.username,
          photo_url: null,
        },
        segments_authors: [{
          user_id: friend.userId,
          name: friend.name,
          username: friend.username,
          photo_url: null,
        }],
        is_subscribed: true,
        is_permanent_social_club_conversation: false,
        preview_segment_type: '',
        is_archived: false,
        permissions: {
          can_reply: true,
          can_add_members: true,
          can_invite: true,
          can_delete: true,
          can_leave: true,
          cant_reply_reason: '',
        },
        privacy_settings: { display_text: 'Private', tooltip_text: 'Voice message' },
        has_new_segments: true,
        time_content_updated: new Date().toISOString(),
      });
      this.sandboxThreads.set(id, { segments: [], members: [] });
    }
    return id;
  }

  async handleRequest<T>(endpoint: string, body?: RequestBody): Promise<T> {
    const input = readRequestBody(body);
    await new Promise((resolve) => setTimeout(resolve, 150));

    switch (endpoint) {
      case 'start_phone_number_auth':
        return { success: true } as T;

      case 'complete_phone_number_auth': {
        this.hooks.onAdoptSandboxSession?.(MOCK_ME.user_id);
        return {
          success: true,
          user_profile: MOCK_ME,
          is_verified: true,
        } as T;
      }

      case 'me':
        return {
          success: true,
          user_profile: { ...MOCK_ME, share_url: 'https://www.clubhouse.com/@sandbox' },
          user_settings: {
            contact_upload_enabled: false,
            follower_requests_enabled: true,
            private_conversations_enabled: false,
          },
          has_unread_notifications: true,
          unread_conversations_count: 1,
          notifications_enabled: false,
          enable_sound_effect: true,
          anonymous_settings: { is_enabled: false, emoji: '' },
          following_ids: [],
          requested_following_ids: [304],
          blocked_ids: [],
          default_room_title_options: ['Join the conversation', 'Come hang out', 'Let’s talk'],
        } as T;

      case 'get_channels':
        return {
          success: true,
          channels: [...this.mockChannels],
          available_topics: [
            { key: 'business', display_name: 'Business' },
            { key: 'tech', display_name: 'Tech' },
          ],
          events: [],
        } as T;

      case 'get_channel': {
        const found = this.mockChannels.find((c) => c.channel_id === input.channel || c.channel === input.channel);
        const channel = found || this.mockChannels[0];
        this.evolveSandboxChannel(channel);
        return {
          success: true,
          ...channel,
          users: channel.users.map((user) => ({ ...user })),
        } as T;
      }

      case 'join_channel': {
        const targetId = input.channel;
        const channel = this.mockChannels.find((c) => c.channel_id === targetId || c.channel === targetId)
          || this.mockChannels[0];

        if (!channel.users.some((u) => u.user_id === MOCK_ME.user_id)) {
          channel.users.push({
            ...MOCK_ME,
            is_speaker: false,
            is_moderator: false,
            is_muted: true,
            is_speaking: false,
          });
          channel.num_all += 1;
        }

        const channelDetail: CHChannelDetail = {
          ...channel,
          token: `agora_rtc_token_mock_${Math.random().toString(36).substring(2, 10)}`,
          pubnub_token: 'pubnub_token_mock',
          pubnub_heartbeat_interval: 10,
        };

        this.currentChannel = channelDetail;
        return { success: true, ...channelDetail } as T;
      }

      case 'leave_channel': {
        const channel = this.mockChannels.find((entry) => this.sameChannel(entry, input.channel));
        if (channel) {
          channel.users = channel.users.filter((user) => user.user_id !== MOCK_ME.user_id);
          this.syncChannelCounts(channel);
          if (!channel.users.some((user) => user.is_moderator)) this.dropMockChannel(channel);
        }
        this.currentChannel = null;
        this.handRaised = false;
        return { success: true } as T;
      }

      case 'end_channel': {
        const channel = this.mockChannels.find((entry) => this.sameChannel(entry, input.channel));
        if (channel) this.dropMockChannel(channel);
        this.currentChannel = null;
        this.handRaised = false;
        return { success: true } as T;
      }

      case 'active_ping':
        return { success: true } as T;

      case 'audience_reply': {
        this.handRaised = input.raiseHands;
        return { success: true } as T;
      }

      case 'become_speaker': {
        const channel = this.findMockChannel(input.channel);
        const user = channel?.users.find((entry) => entry.user_id === (input.userId ?? MOCK_ME.user_id));
        if (user) {
          user.is_speaker = true;
          user.is_invited_to_speak = false;
          user.is_hand_raised = false;
        }
        if (channel) this.syncChannelCounts(channel);
        return { success: true } as T;
      }

      case 'invite_speaker': {
        const channel = this.findMockChannel(input.channel);
        const user = channel?.users.find((entry) => entry.user_id === input.userId);
        if (user && !user.is_speaker) {
          user.is_invited_to_speak = true;
          user.is_hand_raised = false;
        }
        return { success: true } as T;
      }

      case 'mute_speaker': {
        const channel = this.findMockChannel(input.channel);
        const user = channel?.users.find((entry) => entry.user_id === input.userId);
        if (user) user.is_muted = !user.is_muted;
        return { success: true } as T;
      }

      case 'make_moderator': {
        const channel = this.findMockChannel(input.channel);
        const user = channel?.users.find((entry) => entry.user_id === input.userId);
        if (user) user.is_moderator = true;
        return { success: true } as T;
      }

      case 'uninvite_speaker': {
        const channel = this.findMockChannel(input.channel);
        const user = channel?.users.find((entry) => entry.user_id === input.userId);
        if (user) {
          user.is_speaker = false;
          user.is_moderator = false;
          user.is_muted = false;
          user.is_invited_to_speak = false;
          user.is_speaking = false;
        }
        if (channel) this.syncChannelCounts(channel);
        return { success: true } as T;
      }

      case 'create_channel': {
        const audience = input.audience === 'friends' || input.audience === 'friends-of-friends' || input.audience === 'house'
          ? input.audience
          : 'public';
        const privacyType = audience === 'friends-of-friends' ? 'friends_of_friends' : audience;
        const newChan: CHChannel = {
          channel_id: `ch-${Date.now()}`,
          channel: `room-${Date.now()}`,
          topic: input.topic || 'Untitled Community Stage',
          club_name: input.topic?.startsWith('Talk Live') ? 'Talk Live' : 'Creator Stage',
          is_private: false,
          is_social_mode: false,
          privacy_settings: { type: privacyType, display_text: audience, tooltip_text: audience },
          privacy_tooltip: audience,
          is_replay_enabled: input.replayEnabled,
          is_chat_enabled: input.chatEnabled,
          is_clips_enabled: false,
          num_speakers: 1,
          num_all: 1,
          users: [{
            ...MOCK_ME,
            is_speaker: true,
            is_moderator: true,
            is_muted: false,
            is_speaking: false,
          }],
        };
        if (input.talkUserId) {
          newChan.users.push({
            user_id: input.talkUserId,
            name: input.talkUserName || 'Friend',
            username: input.talkUserUsername || 'friend',
            photo_url: null,
            is_speaker: true,
            is_moderator: false,
            is_muted: false,
            is_speaking: false,
          });
          newChan.num_speakers = newChan.users.filter((user) => user.is_speaker).length;
          newChan.num_all = newChan.users.length;
        }
        this.mockChannels.unshift(newChan);
        return { success: true, ...newChan } as T;
      }

      case 'get_group_suggested_invites':
        return { success: true, suggestions: [], next_cursor: null } as T;

      case 'get_edge_stories':
        return {
          success: true,
          activities: [
            {
              activity_id: 'sandbox-ping-1',
              message: 'Ayse pinged you into Morning Show',
              channel: this.mockChannels[0]?.channel || 'sandbox-room',
              time_created: new Date().toISOString(),
              user_profile: {
                user_id: 10,
                name: 'Ayse',
                username: 'ayse',
                photo_url: null,
              },
            },
            {
              activity_id: 'sandbox-follow-1',
              message: 'Ali started following you',
              time_created: new Date(Date.now() - 3600_000).toISOString(),
              user_profile: {
                user_id: 11,
                name: 'Ali',
                username: 'ali',
                photo_url: null,
              },
            },
          ],
          next_cursor: '',
        } as T;

      case 'get_notifications':
        return {
          success: true,
          notifications: [
            {
              notification_id: 101,
              message: 'Noah pinged you into Late Night',
              channel: this.mockChannels[1]?.channel || this.mockChannels[0]?.channel || 'sandbox-room',
              time_created: new Date().toISOString(),
              type: 1,
              user_profile: {
                user_id: 12,
                name: 'Noah Ellis',
                username: 'noah_e',
                photo_url: null,
              },
            },
          ],
        } as T;

      case 'get_conversation_unread_summary':
        return { success: true, unread_count: 2 } as T;

      case 'get_events':
        return {
          success: true,
          events: [{
            event_id: 'ev-1',
            name: 'Sandbox Town Hall',
            time_start: new Date(Date.now() + 86400_000).toISOString(),
            time_end: new Date(Date.now() + 90000_000).toISOString(),
            url: 'https://www.clubhouse.com/event/sandbox-town-hall',
            social_club: { name: 'Sandbox House' },
          }],
        } as T;

      case 'get_user_social_clubs':
        return {
          success: true,
          social_clubs: [{
            social_club_id: '1',
            slug: 'h1',
            name: 'Sandbox House',
            description: 'A house for sandbox demos',
            photo_url: null,
            num_members: 42,
            is_member: true,
          }],
        } as T;

      case 'get_social_club':
        return {
          success: true,
          social_club: {
            social_club_id: '1',
            slug: input.socialClubSlug || 'h1',
            name: 'Sandbox House',
            description: 'A house for sandbox demos',
            photo_url: null,
            num_members: 42,
            is_member: true,
          },
        } as T;

      case 'get_social_club_members':
        return {
          success: true,
          members: [
            { user_id: 10, name: 'Ayse', username: 'ayse', photo_url: null },
            { user_id: 11, name: 'Ali', username: 'ali', photo_url: null },
          ],
        } as T;

      case 'hide_channel':
        return { success: true } as T;

      case 'get_conversations':
        return {
          success: true,
          conversations: this.sandboxConversationRecords,
          new_dm_requests_count: 1,
        } as T;

      case 'get_profile': {
        const userId = input.userId;
        const channelUser = this.mockChannels
          .flatMap((c) => c.users)
          .find((u) => u.user_id === userId);
        return {
          success: true,
          user_profile: channelUser || MOCK_ME,
        } as T;
      }

      case 'get_followers':
      case 'get_following': {
        const kind: PeopleListKind = endpoint === 'get_followers' ? 'followers' : 'following';
        const page = sandboxPeoplePage(kind, input.cursor, input.userId);
        return { success: true, users: page.users, next_cursor: page.next_cursor } as T;
      }

      case 'follow':
      case 'unfollow':
        return { success: true } as T;

      case 'search_users':
        return {
          success: true,
          users: this.mockChannels.flatMap((c) => c.users),
        } as T;

      case 'get_channel_messages': {
        const channel = this.mockChannels.find((entry) => this.sameChannel(entry, input.channel));
        const messages = channel?.is_chat_enabled === false
          ? []
          : SANDBOX_CHAT_MESSAGES.map((message) => ({ ...message }));
        return { success: true, messages } as T;
      }

      default:
        return { success: true } as T;
    }
  }

  private evolveSandboxChannel(channel: CHChannel): void {
    this.sandboxTick += 1;
    const speakers = channel.users.filter((user) => user.is_speaker && user.user_id !== MOCK_ME.user_id);
    if (speakers.length > 0) {
      const speaker = speakers[this.sandboxTick % speakers.length];
      speaker.is_speaking = !speaker.is_speaking;
    }

    const listeners = channel.users.filter((user) => !user.is_speaker && user.user_id < 9000);
    if (listeners.length > 0 && this.sandboxTick % 2 === 0) {
      const listener = listeners[this.sandboxTick % listeners.length];
      listener.is_hand_raised = !listener.is_hand_raised;
    }

    if (this.sandboxTick % 3 === 0) {
      const guestId = 9000 + (this.sandboxTick % 4);
      const existing = channel.users.findIndex((user) => user.user_id === guestId);
      if (existing >= 0) {
        channel.users.splice(existing, 1);
      } else {
        channel.users.push({
          user_id: guestId,
          name: `Taylor ${guestId - 8999}`,
          username: `guest${guestId}`,
          photo_url: null,
          is_speaker: false,
          is_muted: false,
          is_speaking: false,
        });
      }
    }

    const inviteKey = String(channel.channel_id);
    if (!this.sandboxSpeakerInvites.has(inviteKey)) {
      const listener = channel.users.find((user) => user.user_id === MOCK_ME.user_id && !user.is_speaker);
      if (listener) {
        listener.is_invited_to_speak = true;
        this.sandboxSpeakerInvites.add(inviteKey);
      }
    }

    this.syncChannelCounts(channel);
  }

  private sameChannel(entry: CHChannel, channelId: string | undefined): boolean {
    if (!channelId) return false;
    return entry.channel === channelId || String(entry.channel_id) === channelId;
  }

  private dropMockChannel(channel: CHChannel): void {
    this.mockChannels = this.mockChannels.filter(
      (entry) => !this.sameChannel(entry, channel.channel) && !this.sameChannel(entry, String(channel.channel_id)),
    );
  }

  private findMockChannel(channelId: string | undefined): CHChannel | undefined {
    if (channelId) {
      const found = this.mockChannels.find((channel) => channel.channel_id === channelId || channel.channel === channelId);
      if (found) return found;
    }
    return this.currentChannel ?? undefined;
  }

  private syncChannelCounts(channel: CHChannel): void {
    channel.num_all = channel.users.length;
    channel.num_speakers = channel.users.filter((user) => user.is_speaker).length;
    channel.has_raised_hands = channel.users.some((user) => user.is_hand_raised);
  }

  private seedSandboxInbox(): void {
    this.sandboxConversationRecords = [
      {
        conversation_id: 'sandbox-vm',
        title: 'Chloe Davis',
        short_title: 'Chloe Davis',
        preview_segment_text: 'Sandbox voice note',
        summary: 'Private voice message',
        creator_user_profile: { user_id: 301, name: 'Chloe Davis', username: 'chloed', photo_url: null },
        segments_authors: [{ user_id: 301, name: 'Chloe Davis', username: 'chloed', photo_url: null }],
        is_subscribed: true,
        logging_context: { has_listened: false },
        is_permanent_social_club_conversation: false,
        preview_segment_type: 'TEXT_TO_SPEECH',
        is_archived: false,
        permissions: {
          can_reply: true,
          can_add_members: true,
          can_invite: true,
          can_delete: true,
          can_leave: true,
          cant_reply_reason: '',
        },
        privacy_settings: { display_text: 'Private', tooltip_text: 'Voice message' },
        has_new_segments: true,
        time_content_updated: '2026-10-10T12:00:00Z',
      },
      {
        conversation_id: 'sandbox-house',
        title: 'House board',
        short_title: 'House board',
        preview_segment_text: 'House update',
        summary: 'House chat',
        creator_user_profile: { name: 'Sandbox User' },
        social_club: { name: 'Sandbox house', photo_url: '' },
        segments_authors: [{ name: 'Sandbox User' }],
        is_subscribed: true,
        is_permanent_social_club_conversation: true,
        preview_segment_type: 'TEXT',
        is_archived: false,
        share_url: 'https://www.clubhouse.com/c/sandbox-house',
        permissions: {
          can_reply: true,
          can_add_members: false,
          can_invite: false,
          can_delete: false,
          can_leave: true,
          cant_reply_reason: '',
        },
        privacy_settings: { display_text: 'House', tooltip_text: 'House members' },
        has_new_segments: false,
        time_content_updated: '2026-10-09T12:00:00Z',
      },
      {
        conversation_id: 'sandbox-archive',
        title: 'Old friend chat',
        short_title: 'Old friend chat',
        preview_segment_text: 'Archived hallway chat',
        summary: 'Read-only archive',
        creator_user_profile: { name: 'Sandbox friend' },
        segments_authors: [{ name: 'Sandbox friend' }],
        is_subscribed: false,
        is_permanent_social_club_conversation: false,
        preview_segment_type: 'TEXT',
        is_archived: true,
        permissions: { can_reply: false, cant_reply_reason: 'Replies are not available yet' },
        privacy_settings: { display_text: 'Archive', tooltip_text: 'Friend chats are archived' },
        has_new_segments: false,
        time_content_updated: '2024-01-01T12:00:00Z',
      },
    ];
    this.sandboxThreads.set('sandbox-vm', {
      segments: [
        { id: 'seg-vm-1', kind: 'text', author_name: 'Noah Ellis', text: 'Are you around?' },
        { id: 'seg-vm-2', kind: 'voice', author_name: 'Noah Ellis', text: 'Sandbox voice note' },
      ],
      members: [],
    });
    this.sandboxThreads.set('sandbox-house', {
      segments: [
        { id: 'seg-house-1', kind: 'text', author_name: 'Sandbox User', text: 'House update' },
      ],
      members: [],
    });
    this.sandboxThreads.set('sandbox-archive', {
      segments: [
        { id: 'seg-archive-1', kind: 'text', author_name: 'Sandbox friend', text: 'Archived hallway chat' },
      ],
      members: [],
    });
  }
}

export class SandboxTransport implements ApiTransport {
  private readonly backend: SandboxBackend;

  constructor(backend: SandboxBackend) {
    this.backend = backend;
  }

  async request(input: {
    endpoint: string;
    method: string;
    path: string;
    body?: RequestBody | null;
    headers: Record<string, string>;
  }): Promise<{ ok: boolean; status: number; body: string }> {
    void input.method;
    void input.path;
    void input.headers;
    const payload = await this.backend.handleRequest(input.endpoint, input.body ?? undefined);
    return { ok: true, status: 200, body: JSON.stringify(payload) };
  }
}
