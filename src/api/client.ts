import type { CHAuthResponse, CHChannel, CHChannelDetail, CHUser } from './types';

export class ClubhouseApiError extends Error {
  status: number;
  endpoint: string;

  constructor(status: number, endpoint: string, message: string) {
    super(message);
    this.name = 'ClubhouseApiError';
    this.status = status;
    this.endpoint = endpoint;
  }
}

export interface ClubhouseConfig {
  baseUrl: string;
  corsProxy: string;
  authToken: string | null;
  userId: number | null;
  deviceId: string;
  appBuild: string;
  appVersion: string;
  agoraAppId: string;
  useSandbox: boolean;
  webSession: boolean;
}

const DEFAULT_CONFIG: ClubhouseConfig = {
  baseUrl: 'https://www.clubhouseapi.com/api',
  corsProxy: '', // If empty, direct fetch or sandbox
  authToken: null,
  userId: null,
  deviceId: 'clubdeck-v2-' + Math.random().toString(36).substring(2, 12),
  appBuild: '1038754',
  appVersion: '26.10.01',
  agoraAppId: '938d3d95b5764796b3204b67d233436e',
  useSandbox: true, // Default to sandbox so user can explore right away
  webSession: false,
};

// Realistic mock data for the Sandbox mode
const MOCK_ME: CHUser = {
  user_id: 100982,
  name: 'Alex Rivera',
  username: 'alexrivera',
  photo_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
  bio: 'Audio tech enthusiast & creator. Building the future of real-time voice communities on Clubdeck v2.',
  twitter: 'alexrivera',
  instagram: 'alexrivera_sound',
  num_followers: 1420,
  num_following: 388,
  is_speaker: true,
  is_moderator: true,
  is_muted: false,
};

const INITIAL_MOCK_CHANNELS: CHChannel[] = [
  {
    channel_id: 'ch-tech-deep-dive',
    channel: 'tech-ai-audio-revolution',
    topic: '🎙️ Future of Social Audio, WebRTC & AI Voice Agents',
    club_name: 'Tech Innovators Club',
    club_id: 42,
    is_private: false,
    num_speakers: 4,
    num_all: 128,
    users: [
      {
        user_id: 201,
        name: 'Elena Rostova',
        username: 'elena_ai',
        photo_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
        bio: 'AI Voice Researcher @ DeepAudio. Hosting weekly debates on generative sound models.',
        is_speaker: true,
        is_moderator: true,
        is_speaking: true,
        is_muted: false,
      },
      {
        user_id: 202,
        name: 'Marcus Vance',
        username: 'marcus_v',
        photo_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
        bio: 'Audio DSP Engineer & Sound Producer. Building low-latency audio pipelines.',
        is_speaker: true,
        is_moderator: true,
        is_speaking: false,
        is_muted: false,
      },
      {
        user_id: 203,
        name: 'Sora Tanaka',
        username: 'sora_t',
        photo_url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&auto=format&fit=crop&q=80',
        bio: 'Podcast host and tech journalist. Exploring interactive desktop broadcasting.',
        is_speaker: true,
        is_moderator: false,
        is_speaking: false,
        is_muted: true,
      },
      {
        user_id: 100982,
        name: 'Alex Rivera (You)',
        username: 'alexrivera',
        photo_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
        is_speaker: true,
        is_moderator: true,
        is_speaking: false,
        is_muted: true,
      },
      {
        user_id: 301,
        name: 'Chloe Davis',
        username: 'chloed',
        photo_url: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200&auto=format&fit=crop&q=80',
        is_speaker: false,
        is_speaking: false,
      },
      {
        user_id: 302,
        name: 'David Kim',
        username: 'dkim_dev',
        photo_url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&auto=format&fit=crop&q=80',
        is_speaker: false,
        is_speaking: false,
      },
      {
        user_id: 303,
        name: 'Zack Thorne',
        username: 'zack_t',
        photo_url: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&auto=format&fit=crop&q=80',
        is_speaker: false,
        is_speaking: false,
      },
    ],
  },
  {
    channel_id: 'ch-music-chill-lounge',
    channel: 'lofi-midnight-jam',
    topic: '☕ Lo-Fi Producers & Sound Designers Listening Party',
    club_name: 'Chill Beats Collective',
    club_id: 108,
    is_private: false,
    num_speakers: 3,
    num_all: 312,
    users: [
      {
        user_id: 204,
        name: 'BeatMaker Kai',
        username: 'kaibeats',
        photo_url: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200&auto=format&fit=crop&q=80',
        bio: 'Chillhop music producer. Sharing new synth patches and drum kits.',
        is_speaker: true,
        is_moderator: true,
        is_speaking: true,
        is_muted: false,
      },
      {
        user_id: 205,
        name: 'Luna Song',
        username: 'lunasounds',
        photo_url: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&auto=format&fit=crop&q=80',
        bio: 'Vocalist and keyboard player.',
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
    topic: '🚀 2-Minute Startup Pitches & Brutal Feedback by VCs',
    club_name: 'Early Stage Venture',
    club_id: 99,
    is_private: false,
    num_speakers: 5,
    num_all: 840,
    users: [
      {
        user_id: 206,
        name: 'Victoria Sterling',
        username: 'vsterling_vc',
        photo_url: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&auto=format&fit=crop&q=80',
        bio: 'General Partner @ Apex Capital. Seed & Series A investor.',
        is_speaker: true,
        is_moderator: true,
        is_speaking: true,
        is_muted: false,
      },
    ],
  },
];

export class ClubhouseApiClient {
  private config: ClubhouseConfig;
  private mockChannels: CHChannel[];
  private currentChannel: CHChannelDetail | null = null;
  private handRaised: boolean = false;
  private sandboxTick: number = 0;
  private sandboxSpeakerInvites = new Set<string>();
  private authExpiredCallbacks: (() => void)[] = [];
  private suppressAuthExpired = false;

  constructor(customConfig?: Partial<ClubhouseConfig>) {
    const saved = localStorage.getItem('clubdeck_config');
    const parsedSaved = saved ? JSON.parse(saved) : {};
    const savedBuild = Number(parsedSaved.appBuild);
    const clientIsCurrent = Number.isFinite(savedBuild) && savedBuild >= 1_000_000;
    if (parsedSaved.appBuild && !clientIsCurrent) {
      parsedSaved.appBuild = DEFAULT_CONFIG.appBuild;
      parsedSaved.appVersion = DEFAULT_CONFIG.appVersion;
    }

    this.config = {
      ...DEFAULT_CONFIG,
      ...parsedSaved,
      ...customConfig,
    };
    if (parsedSaved.appBuild && !clientIsCurrent) {
      localStorage.setItem('clubdeck_config', JSON.stringify(this.config));
    }

    this.mockChannels = JSON.parse(JSON.stringify(INITIAL_MOCK_CHANNELS));
  }

  public getConfig(): ClubhouseConfig {
    return { ...this.config };
  }

  public updateConfig(newConfig: Partial<ClubhouseConfig>): void {
    this.config = { ...this.config, ...newConfig };
    localStorage.setItem('clubdeck_config', JSON.stringify(this.config));
  }

  public getCurrentUserId(): number | null {
    if (this.config.userId != null) return this.config.userId;
    if (this.config.useSandbox) return MOCK_ME.user_id;
    return null;
  }

  public onAuthExpired(cb: () => void): () => void {
    this.authExpiredCallbacks.push(cb);
    return () => {
      this.authExpiredCallbacks = this.authExpiredCallbacks.filter((c) => c !== cb);
    };
  }

  private emitAuthExpired(): void {
    this.authExpiredCallbacks.forEach((cb) => cb());
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json; charset=utf-8',
      'Accept': 'application/json',
      'User-Agent': `clubhouse/android/${this.config.appBuild}`,
      'CH-Languages': 'en-US',
      'CH-Locale': 'en_US',
      'CH-AppVersion': this.config.appVersion,
      'CH-AppBuild': this.config.appBuild,
      'CH-DeviceId': this.config.deviceId,
    };

    if (this.config.userId && !this.config.webSession) {
      headers['CH-UserID'] = this.config.userId.toString();
    }
    if (this.config.authToken && !this.config.webSession) {
      headers['Authorization'] = `Token ${this.config.authToken}`;
    }
    if (this.config.webSession) {
      headers['X-Clubdeck-Web-Session'] = '1';
    }

    return headers;
  }

  private async request<T>(endpoint: string, body?: any, forceLive = false): Promise<T> {
    if (this.config.useSandbox && !forceLive) {
      return this.handleSandboxRequest<T>(endpoint, body);
    }

    const headers = this.getHeaders();
    if (
      endpoint === 'start_phone_number_web_auth' ||
      endpoint === 'complete_phone_number_web_auth' ||
      endpoint === 'resend_phone_number_auth'
    ) {
      headers['CH-Web-AppVersion'] = this.config.appVersion;
      headers['CH-Web-Version'] = this.config.appVersion;
    }
    const desktopRequest = (window as Window & {
      electronAPI?: {
        request?: (
          endpoint: string,
          body: unknown,
          headers: Record<string, string>
        ) => Promise<{ ok: boolean; status: number; body: string }>;
      };
    }).electronAPI?.request;

    try {
      if (desktopRequest) {
        const result = await desktopRequest(endpoint, body ?? null, headers);
        return this.parseLiveResponse<T>(endpoint, result.status, result.body, result.ok);
      }

      let url = `${this.config.baseUrl}/${endpoint.replace(/^\//, '')}`;
      if (endpoint === 'start_phone_number_web_auth') {
        url = 'https://www.clubhouse.com/web_api/start_phone_number_web_auth';
      } else if (endpoint === 'complete_phone_number_web_auth') {
        url = 'https://www.clubhouse.com/web_api/complete_phone_number_web_auth';
      } else if (endpoint === 'resend_phone_number_auth') {
        url = 'https://www.clubhouse.com/web_api/resend_phone_number_auth';
      }
      if (this.config.corsProxy) {
        url = `${this.config.corsProxy.replace(/\/$/, '')}/${url}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await response.text();
      return this.parseLiveResponse<T>(endpoint, response.status, text, response.ok);
    } catch (err) {
      if (err instanceof ClubhouseApiError) throw err;
      const message = err instanceof Error ? err.message : 'Network error';
      throw new ClubhouseApiError(0, endpoint, message);
    }
  }

  private parseLiveResponse<T>(endpoint: string, status: number, text: string, ok: boolean): T {
    if (!ok) {
      let message = text || `HTTP ${status}`;
      try {
        const parsed = JSON.parse(text) as { error_message?: string };
        if (parsed.error_message) message = parsed.error_message;
      } catch {
        // The body is not JSON.
      }
      if ((status === 401 || status === 403) && !this.suppressAuthExpired) {
        this.emitAuthExpired();
      }
      throw new ClubhouseApiError(status, endpoint, message);
    }

    const data = JSON.parse(text) as T & { items?: Array<{ channel?: { users?: unknown[] } }>; channels?: unknown[] };
    if (endpoint === 'get_channels' && Array.isArray(data.items) && !Array.isArray(data.channels)) {
      data.channels = data.items
        .map((item) => item.channel)
        .filter((channel): channel is { users?: unknown[] } => !!channel)
        .map((channel) => {
          if (!Array.isArray(channel.users)) channel.users = [];
          return channel;
        });
    }
    return data;
  }

  // Sandbox simulation handler
  private async handleSandboxRequest<T>(endpoint: string, body: any): Promise<T> {
    // Artificial small latency to simulate network
    await new Promise((resolve) => setTimeout(resolve, 150));

    switch (endpoint) {
      case 'start_phone_number_auth':
        return { success: true } as any;

      case 'complete_phone_number_auth': {
        const token = 'mock_token_' + Math.random().toString(36).substring(2, 12);
        this.updateConfig({ authToken: token, userId: MOCK_ME.user_id });
        return {
          success: true,
          auth_token: token,
          access_token: token,
          refresh_token: token + '_refresh',
          user_profile: MOCK_ME,
        } as any;
      }

      case 'me':
        return { success: true, user_profile: MOCK_ME } as any;

      case 'get_channels':
        return {
          success: true,
          channels: this.mockChannels,
          events: [],
        } as any;

      case 'get_channel': {
        const found = this.mockChannels.find((c) => c.channel_id === body?.channel || c.channel === body?.channel);
        const channel = found || this.mockChannels[0];
        this.evolveSandboxChannel(channel);
        return {
          success: true,
          ...channel,
          users: channel.users.map((user) => ({ ...user })),
        } as any;
      }

      case 'join_channel': {
        const targetId = body?.channel;
        const channel = this.mockChannels.find((c) => c.channel_id === targetId || c.channel === targetId) || this.mockChannels[0];
        
        // Add current user to users if not present
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
          token: 'agora_rtc_token_mock_' + Math.random().toString(36).substring(2, 10),
          pubnub_token: 'pubnub_token_mock',
          pubnub_heartbeat_interval: 10,
        };

        this.currentChannel = channelDetail;
        return { success: true, ...channelDetail } as any;
      }

      case 'leave_channel':
        this.currentChannel = null;
        this.handRaised = false;
        return { success: true } as any;

      case 'active_ping':
        return { success: true } as any;

      case 'audience_reply': {
        this.handRaised = !!body?.raise_hands;
        return { success: true } as any;
      }

      case 'accept_speaker_invite': {
        const channel = this.findMockChannel(body?.channel);
        const user = channel?.users.find((entry) => entry.user_id === (body?.user_id ?? MOCK_ME.user_id));
        if (user) {
          user.is_speaker = true;
          user.is_invited_to_speak = false;
          user.is_hand_raised = false;
        }
        if (channel) this.syncChannelCounts(channel);
        return { success: true } as any;
      }

      case 'invite_speaker': {
        const channel = this.findMockChannel(body?.channel);
        const user = channel?.users.find((entry) => entry.user_id === body?.user_id);
        if (user && !user.is_speaker) {
          user.is_invited_to_speak = true;
          user.is_hand_raised = false;
        }
        return { success: true } as any;
      }

      case 'mute_speaker': {
        const channel = this.findMockChannel(body?.channel);
        const user = channel?.users.find((entry) => entry.user_id === body?.user_id);
        if (user) user.is_muted = !user.is_muted;
        return { success: true } as any;
      }

      case 'make_moderator': {
        const channel = this.findMockChannel(body?.channel);
        const user = channel?.users.find((entry) => entry.user_id === body?.user_id);
        if (user) user.is_moderator = true;
        return { success: true } as any;
      }

      case 'uninvite_speaker': {
        const channel = this.findMockChannel(body?.channel);
        const user = channel?.users.find((entry) => entry.user_id === body?.user_id);
        if (user) {
          user.is_speaker = false;
          user.is_moderator = false;
          user.is_muted = false;
          user.is_invited_to_speak = false;
          user.is_speaking = false;
        }
        if (channel) this.syncChannelCounts(channel);
        return { success: true } as any;
      }

      case 'create_channel': {
        const newChan: CHChannel = {
          channel_id: 'ch-' + Date.now(),
          channel: 'room-' + Date.now(),
          topic: body?.topic || 'Untitled Community Stage',
          club_name: 'Creator Stage',
          is_private: !!body?.is_private,
          is_social_mode: !!body?.is_social_mode,
          num_speakers: 1,
          num_all: 1,
          users: [
            {
              ...MOCK_ME,
              is_speaker: true,
              is_moderator: true,
              is_muted: false,
              is_speaking: false,
            },
          ],
        };
        this.mockChannels.unshift(newChan);
        return { success: true, ...newChan } as any;
      }

      case 'get_profile': {
        const userId = body?.user_id;
        const channelUser = this.mockChannels
          .flatMap((c) => c.users)
          .find((u) => u.user_id === userId);
        return {
          success: true,
          user_profile: channelUser || MOCK_ME,
        } as any;
      }

      case 'follow':
      case 'unfollow': {
        const following = endpoint === 'follow';
        for (const channel of this.mockChannels) {
          const user = channel.users.find((entry) => entry.user_id === body?.user_id);
          if (user) user.is_following = following;
        }
        return { success: true } as any;
      }

      case 'search_users':
        return {
          success: true,
          users: this.mockChannels.flatMap((c) => c.users),
        } as any;

      default:
        return { success: true } as any;
    }
  }

  // --- Public API Methods ---

  public async startPhoneNumberAuth(phoneNumber: string): Promise<any> {
    return this.request('start_phone_number_web_auth', {
      phone_number: phoneNumber,
      web_rc_token: null,
      invite_code: null,
    }, true);
  }

  public async completePhoneNumberAuth(phoneNumber: string, code: string): Promise<CHAuthResponse> {
    return this.request<CHAuthResponse>('complete_phone_number_web_auth', {
      phone_number: phoneNumber,
      verification_code: code,
      web_rc_token: null,
      invite_code: null,
    }, true);
  }

  public async resendPhoneNumberAuth(phoneNumber: string): Promise<any> {
    return this.request('resend_phone_number_auth', {
      phone_number: phoneNumber,
      tokens: { web_rc_token: null },
    }, true);
  }

  public async adoptWebSession(): Promise<boolean> {
    const desktop = typeof window !== 'undefined' && !!(window as Window & { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron;
    if (!desktop) return false;
    const previous = this.config.webSession;
    this.config.webSession = true;
    this.suppressAuthExpired = true;
    try {
      const res = await this.request<{ success: boolean; user_profile?: CHUser }>('me', {}, true);
      if (!res?.user_profile) {
        this.clearAdoptedWebSession(previous);
        return false;
      }
      this.updateConfig({
        webSession: true,
        useSandbox: false,
        authToken: null,
        userId: res.user_profile.user_id,
      });
      return true;
    } catch {
      this.clearAdoptedWebSession(previous);
      return false;
    } finally {
      this.suppressAuthExpired = false;
    }
  }

  private clearAdoptedWebSession(previous: boolean): void {
    this.config.webSession = false;
    if (previous) {
      this.updateConfig({
        webSession: false,
        ...(this.config.authToken ? {} : { useSandbox: true }),
      });
    }
  }

  public async getMe(): Promise<{ success: boolean; user_profile: CHUser }> {
    return this.request('me');
  }

  public async getChannels(): Promise<{ success: boolean; channels: CHChannel[] }> {
    return this.request('get_channels');
  }

  public async getChannel(channelId: string): Promise<CHChannelDetail> {
    return this.request('get_channel', { channel: channelId });
  }

  public async joinChannel(channelId: string): Promise<CHChannelDetail> {
    return this.request('join_channel', { channel: channelId });
  }

  public async leaveChannel(channelId: string): Promise<any> {
    const result = await this.request('leave_channel', { channel: channelId });
    this.handRaised = false;
    return result;
  }

  public async createChannel(
    topic: string,
    options: { isPrivate?: boolean; isSocial?: boolean } = {}
  ): Promise<CHChannelDetail> {
    return this.request('create_channel', {
      topic,
      is_private: !!options.isPrivate,
      is_social_mode: !!options.isSocial,
      user_ids: [],
    });
  }

  public async activePing(channelId: string): Promise<any> {
    return this.request('active_ping', { channel: channelId });
  }

  public async raiseHand(channelId: string, raise: boolean = true): Promise<any> {
    const result = await this.request('audience_reply', {
      channel: channelId,
      raise_hands: raise,
      unraise_hands: !raise,
    });
    this.handRaised = raise;
    return result;
  }

  public async acceptSpeakerInvite(channelId: string, userId: number): Promise<any> {
    return this.request('accept_speaker_invite', {
      channel: channelId,
      user_id: userId,
    });
  }

  public async inviteSpeaker(channelId: string, userId: number): Promise<any> {
    return this.request('invite_speaker', {
      channel: channelId,
      user_id: userId,
    });
  }

  public async muteSpeaker(channelId: string, userId: number): Promise<any> {
    return this.request('mute_speaker', {
      channel: channelId,
      user_id: userId,
    });
  }

  public async makeModerator(channelId: string, userId: number): Promise<any> {
    return this.request('make_moderator', {
      channel: channelId,
      user_id: userId,
    });
  }

  public async uninviteSpeaker(channelId: string, userId: number): Promise<any> {
    return this.request('uninvite_speaker', {
      channel: channelId,
      user_id: userId,
    });
  }

  public async getProfile(userId: number): Promise<{ success: boolean; user_profile: CHUser }> {
    return this.request('get_profile', { user_id: userId });
  }

  public async follow(userId: number): Promise<any> {
    return this.request('follow', { user_id: userId });
  }

  public async unfollow(userId: number): Promise<any> {
    return this.request('unfollow', { user_id: userId });
  }

  public async searchUsers(query: string): Promise<{ success: boolean; users: CHUser[] }> {
    return this.request('search_users', { query, cofollow_mode: false });
  }

  public getCurrentChannel(): CHChannelDetail | null {
    return this.currentChannel;
  }

  public isHandRaised(): boolean {
    return this.handRaised;
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

    channel.num_all = channel.users.length;
    channel.num_speakers = channel.users.filter((user) => user.is_speaker).length;
    channel.has_raised_hands = channel.users.some((user) => user.is_hand_raised);
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
}

export const clubhouseClient = new ClubhouseApiClient();
