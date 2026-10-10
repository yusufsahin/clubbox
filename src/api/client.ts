import { canCall, evidenceOf, type Evidence, type Transport } from './capabilities';
import { businessFailure, classifyHttpFailure, type ApiErrorKind } from './guards';
import { INITIAL_MOCK_CHANNELS, MOCK_ME, SANDBOX_CHAT_MESSAGES, sandboxUserIds } from './sandboxData';
import type { CHAuthResponse, CHChannel, CHChannelDetail, CHChatMessage, CHConversation, CHUser, FeedTopic, MeSettings } from './types';

const REQUEST_TIMEOUT_MS = 20000;

function withTimeout<T>(work: Promise<T>, endpoint: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new ClubhouseApiError(0, endpoint, 'Request timed out', 'timeout'));
    }, REQUEST_TIMEOUT_MS);
    work.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export class ClubhouseApiError extends Error {
  status: number;
  endpoint: string;
  kind: ApiErrorKind;

  constructor(status: number, endpoint: string, message: string, kind: ApiErrorKind = 'unknown') {
    super(message);
    this.name = 'ClubhouseApiError';
    this.status = status;
    this.endpoint = endpoint;
    this.kind = kind;
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
  language: 'en' | 'tr';
  allowUnverified: boolean;
  hasSecureToken: boolean;
  allowLocalRecording: boolean;
}

const DEFAULT_CONFIG: ClubhouseConfig = {
  baseUrl: 'https://www.clubhouseapi.com/api',
  corsProxy: '', // If empty, direct fetch or sandbox
  authToken: null,
  userId: null,
  deviceId: 'clubbox-' + Math.random().toString(36).substring(2, 12),
  appBuild: '1038754',
  appVersion: '26.10.01',
  // Public Agora app id used by the Clubhouse clients. Confirm the response field
  // in docs/api/web-api.md (join_channel → Agora) after `npm run api:record`.
  // Until a capture names that field, this stays a default and settings can override it.
  agoraAppId: '938de3e8055e42b281bb8c6f69c21f78',
  useSandbox: true, // Default to sandbox so user can explore right away
  webSession: false,
  language: 'en',
  allowUnverified: false,
  hasSecureToken: false,
  allowLocalRecording: false,
};


const CONFIG_KEY = 'clubbox_config';
const LEGACY_CONFIG_KEY = 'clubdeck_config';
const STALE_AGORA_APP_ID = '938d3d95b5764796b3204b67d233436e';

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or a full quota should not break startup.
  }
}

function removeStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}

function readSavedConfig(): Partial<ClubhouseConfig> {
  let raw = readStorage(CONFIG_KEY);
  if (raw == null) {
    const legacy = readStorage(LEGACY_CONFIG_KEY);
    if (legacy != null) {
      writeStorage(CONFIG_KEY, legacy);
      removeStorage(LEGACY_CONFIG_KEY);
      raw = legacy;
    }
  }
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export interface RequestBody {
  [key: string]: unknown;
}

interface SandboxInput {
  channel?: string;
  userId?: number;
  raiseHands: boolean;
  topic?: string;
  isPrivate: boolean;
  isSocial: boolean;
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
  };
}

interface ApiAck {
  success?: boolean;
  error_message?: string;
}

function writeConfig(config: ClubhouseConfig, hideToken = false): void {
  const stored = hideToken ? { ...config, authToken: null } : config;
  writeStorage(CONFIG_KEY, JSON.stringify(stored));
}

type DesktopBridge = {
  isElectron?: boolean;
  tokenStatus?: () => Promise<{ present: boolean }>;
  setAuthToken?: (token: string | null) => Promise<boolean>;
};

function desktopBridge(): DesktopBridge | null {
  if (typeof window === 'undefined') return null;
  const api = (window as Window & { electronAPI?: DesktopBridge }).electronAPI;
  return api?.isElectron ? api : null;
}

function numericId(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value);
  return undefined;
}

function normalizeFeedUser(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const nested = record.user_profile ?? record.user;
  const profile = nested && typeof nested === 'object' && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : {};
  const name = typeof record.name === 'string' ? record.name : profile.name;
  return {
    ...profile,
    ...record,
    name: typeof name === 'string' ? name : '',
    username: typeof record.username === 'string' ? record.username : (typeof profile.username === 'string' ? profile.username : ''),
    photo_url: record.photo_url ?? profile.photo_url ?? null,
    user_id: numericId(record.user_id ?? profile.user_id) ?? record.user_id ?? profile.user_id,
    is_speaker: typeof record.is_speaker === 'boolean' ? record.is_speaker : profile.is_speaker,
    is_moderator: typeof record.is_moderator === 'boolean' ? record.is_moderator : profile.is_moderator,
  };
}

function feedChannel(item: unknown): Record<string, unknown> | null {
  if (!item || typeof item !== 'object') return null;
  const record = item as Record<string, unknown>;
  const nested = record.channel;
  const channel = nested && typeof nested === 'object' && !Array.isArray(nested)
    ? { ...(nested as Record<string, unknown>) }
    : (record.channel_id != null || typeof record.topic === 'string' ? { ...record } : null);
  if (!channel) return null;
  const creator = numericId(channel.creator_user_profile_id);
  if (creator != null) channel.creator_user_profile_id = creator;
  channel.users = Array.isArray(channel.users)
    ? channel.users.map(normalizeFeedUser).filter((user): user is Record<string, unknown> => !!user)
    : [];
  const club = channel.social_club;
  if (club && typeof club === 'object') {
    const house = club as { name?: unknown; photo_url?: unknown };
    if (typeof channel.club_name !== 'string' && typeof house.name === 'string') channel.club_name = house.name;
    if (typeof house.photo_url === 'string') channel.club_photo_url = house.photo_url;
  }
  const privacy = channel.privacy_settings;
  if (privacy && typeof privacy === 'object') {
    const text = privacy as { display_text?: unknown; tooltip_text?: unknown };
    if (typeof text.display_text === 'string') channel.privacy_label = text.display_text;
    if (typeof text.tooltip_text === 'string') channel.privacy_tooltip = text.tooltip_text;
  }
  if (typeof channel.topic !== 'string') channel.topic = 'Live room';
  if (typeof channel.is_private !== 'boolean') channel.is_private = false;
  if (typeof channel.num_all !== 'number') channel.num_all = (channel.users as unknown[]).length;
  if (typeof channel.num_speakers !== 'number') {
    channel.num_speakers = (channel.users as Array<{ is_speaker?: boolean }>).filter((user) => user.is_speaker).length;
  }
  return channel;
}

function normalizeChannelPayload(data: Record<string, unknown>): void {
  const parentHash = typeof data.channel === 'string' ? data.channel : null;
  const nested = data.channel;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const channel = nested as Record<string, unknown>;
    if (data.token != null && channel.token == null) channel.token = data.token;
    channel.users = Array.isArray(channel.users)
      ? channel.users.map(normalizeFeedUser).filter((user): user is Record<string, unknown> => !!user)
      : [];
    const hash = typeof channel.channel === 'string' ? channel.channel : parentHash;
    Object.assign(data, channel);
    if (hash) data.channel = hash;
  } else {
    data.users = Array.isArray(data.users)
      ? data.users.map(normalizeFeedUser).filter((user): user is Record<string, unknown> => !!user)
      : [];
  }
}

function normalizeConversations(data: { conversations?: unknown }): CHConversation[] {
  const list = Array.isArray(data.conversations) ? data.conversations : [];
  const conversations: CHConversation[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as Record<string, unknown>;
    const id = typeof raw.conversation_id === 'string' ? raw.conversation_id : '';
    if (!id) continue;
    const privacy = raw.privacy_settings && typeof raw.privacy_settings === 'object'
      ? raw.privacy_settings as { display_text?: unknown; tooltip_text?: unknown }
      : null;
    const creator = raw.creator_user_profile && typeof raw.creator_user_profile === 'object'
      ? raw.creator_user_profile as { name?: unknown }
      : null;
    const permissions = raw.permissions && typeof raw.permissions === 'object'
      ? raw.permissions as { can_reply?: unknown; cant_reply_reason?: unknown }
      : null;
    const club = raw.social_club && typeof raw.social_club === 'object'
      ? raw.social_club as { name?: unknown; photo_url?: unknown }
      : null;
    const clubName = typeof raw.social_club_name === 'string'
      ? raw.social_club_name
      : (club && typeof club.name === 'string' ? club.name : '');
    const authors = Array.isArray(raw.segments_authors)
      ? raw.segments_authors.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const name = (entry as { name?: unknown }).name;
        return typeof name === 'string' && name.trim() ? [name] : [];
      }).slice(0, 3)
      : [];
    const listened = raw.logging_context && typeof raw.logging_context === 'object'
      ? (raw.logging_context as { has_listened?: unknown }).has_listened
      : undefined;
    const pendingNames = Array.isArray(raw.pending_participants)
      ? raw.pending_participants.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const name = (entry as { name?: unknown }).name;
        return typeof name === 'string' && name.trim() ? [name] : [];
      }).slice(0, 3)
      : [];
    const photo = club && typeof club.photo_url === 'string'
      ? club.photo_url
      : (typeof raw.social_club_photo_url === 'string' ? raw.social_club_photo_url : '');
    conversations.push({
      conversation_id: id,
      title: typeof raw.title === 'string' ? raw.title : '',
      short_title: typeof raw.short_title === 'string' ? raw.short_title : '',
      preview_segment_text: typeof raw.preview_segment_text === 'string' ? raw.preview_segment_text : '',
      summary: typeof raw.summary === 'string' ? raw.summary : '',
      author_name: creator && typeof creator.name === 'string' ? creator.name : '',
      author_names: authors,
      social_club_name: clubName,
      social_club_photo: photo,
      is_subscribed: raw.is_subscribed === true ? true : raw.is_subscribed === false ? false : null,
      can_reply: permissions?.can_reply === true,
      cant_reply_reason: permissions && typeof permissions.cant_reply_reason === 'string' ? permissions.cant_reply_reason : '',
      pending_count: Array.isArray(raw.pending_participants) ? raw.pending_participants.length : 0,
      pending_names: pendingNames,
      has_listened: listened === true ? true : listened === false ? false : null,
      permanent_house_chat: raw.is_permanent_social_club_conversation === true,
      share_url: typeof raw.share_url === 'string' ? raw.share_url : '',
      preview_segment_type: typeof raw.preview_segment_type === 'string' ? raw.preview_segment_type : '',
      is_archived: raw.is_archived === true,
      privacy_label: privacy && typeof privacy.display_text === 'string' ? privacy.display_text : '',
      privacy_tooltip: privacy && typeof privacy.tooltip_text === 'string' ? privacy.tooltip_text : '',
      has_new_segments: raw.has_new_segments === true,
      time_content_updated: typeof raw.time_content_updated === 'string' ? raw.time_content_updated : '',
    });
  }
  return conversations;
}

function mapChatMessages(data: { messages?: unknown[] }): CHChatMessage[] {
  const list = Array.isArray(data.messages) ? data.messages : [];
  const messages: CHChatMessage[] = [];
  list.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const raw = entry as Record<string, unknown>;
    const profile = raw.user_profile && typeof raw.user_profile === 'object'
      ? raw.user_profile as Record<string, unknown>
      : null;
    const message = typeof raw.message === 'string' ? raw.message : '';
    if (!message) return;
    const photo = raw.photo_url ?? raw.from_photo_url ?? profile?.photo_url ?? null;
    messages.push({
      id: String(raw.message_id ?? raw.id ?? index),
      user_id: Number(raw.user_id ?? raw.from_user_id ?? profile?.user_id ?? 0),
      username: String(raw.username ?? profile?.username ?? ''),
      name: String(raw.name ?? raw.from_name ?? profile?.name ?? 'Member'),
      photo_url: typeof photo === 'string' ? photo : null,
      message,
      timestamp: String(raw.time_created ?? raw.time_received ?? raw.timestamp ?? ''),
    });
  });
  return messages;
}

function assertNoSandboxLeak(value: unknown, ids: Set<number>): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) assertNoSandboxLeak(item, ids);
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.user_id === 'number' && ids.has(record.user_id)) {
    console.error('sandbox data leaked into live mode');
  }
  for (const child of Object.values(record)) {
    if (child && typeof child === 'object') assertNoSandboxLeak(child, ids);
  }
}

export class ClubhouseApiClient {
  private config: ClubhouseConfig;
  private mockChannels: CHChannel[];
  private currentChannel: CHChannelDetail | null = null;
  private handRaised: boolean = false;
  private sandboxTick: number = 0;
  private sandboxSpeakerInvites = new Set<string>();
  private authExpiredCallbacks: (() => void)[] = [];
  private suppressAuthExpired = false;
  private secureToken = false;
  private secureStorageFailed = false;

  constructor(customConfig?: Partial<ClubhouseConfig>) {
    const parsedSaved = readSavedConfig();
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
    if (this.config.agoraAppId === STALE_AGORA_APP_ID) {
      this.config.agoraAppId = DEFAULT_CONFIG.agoraAppId;
    }
    if (this.config.language !== 'en' && this.config.language !== 'tr') {
      this.config.language = 'en';
    }
    if ((parsedSaved.appBuild && !clientIsCurrent) || parsedSaved.agoraAppId === STALE_AGORA_APP_ID) {
      writeConfig(this.config);
    }

    this.mockChannels = JSON.parse(JSON.stringify(INITIAL_MOCK_CHANNELS));
  }

  public supports(endpoint: string): boolean {
    return canCall(endpoint, this.transport(), { allowUnverified: this.config.allowUnverified === true });
  }

  public evidence(endpoint: string): Evidence {
    return evidenceOf(endpoint);
  }

  public takeSecureStorageFailure(): boolean {
    const failed = this.secureStorageFailed;
    this.secureStorageFailed = false;
    return failed;
  }

  private transport(): Transport {
    if (this.config.useSandbox) return 'sandbox';
    if (this.config.webSession) return 'web-session';
    return 'mobile-token';
  }

  public getConfig(): ClubhouseConfig {
    return { ...this.config };
  }

  public async loadSecureToken(): Promise<void> {
    const bridge = desktopBridge();
    if (!bridge?.tokenStatus || !bridge.setAuthToken) return;
    this.secureToken = true;
    const legacy = this.config.authToken;
    this.config.authToken = null;
    let present: boolean;
    try {
      present = (await bridge.tokenStatus()).present === true;
    } catch {
      present = false;
    }
    if (!present && legacy) {
      const saved = await bridge.setAuthToken(legacy);
      present = saved === true;
      if (!saved) this.secureStorageFailed = true;
    }
    this.config.hasSecureToken = present;
    this.config.authToken = null;
    writeConfig(this.config, true);
  }

  public async updateConfig(newConfig: Partial<ClubhouseConfig>): Promise<void> {
    const tokenChanged = Object.prototype.hasOwnProperty.call(newConfig, 'authToken');
    this.config = { ...this.config, ...newConfig };
    if (tokenChanged && this.secureToken) {
      const token = this.config.authToken;
      this.config.authToken = null;
      const saved = await desktopBridge()?.setAuthToken?.(token);
      this.config.hasSecureToken = !!token && saved === true;
      if (token && saved !== true) this.secureStorageFailed = true;
      writeConfig(this.config, true);
      return;
    }
    writeConfig(this.config, this.secureToken);
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
    if (!this.secureToken && this.config.authToken && !this.config.webSession) {
      headers['Authorization'] = `Token ${this.config.authToken}`;
    }
    if (this.config.webSession) {
      headers['X-Clubbox-Web-Session'] = '1';
    }

    return headers;
  }

  private async request<T>(endpoint: string, body?: RequestBody, forceLive = false): Promise<T> {
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
        const result = await withTimeout(desktopRequest(endpoint, body ?? null, headers), endpoint);
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
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const text = await response.text();
      return this.parseLiveResponse<T>(endpoint, response.status, text, response.ok);
    } catch (err) {
      if (err instanceof ClubhouseApiError) throw err;
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new ClubhouseApiError(0, endpoint, 'Request timed out', 'timeout');
      }
      const message = err instanceof Error ? err.message : 'Network error';
      throw new ClubhouseApiError(0, endpoint, message, 'network');
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
      const failure = classifyHttpFailure(status, message);
      if (failure.expireSession && !this.suppressAuthExpired) {
        this.emitAuthExpired();
      }
      throw new ClubhouseApiError(status, endpoint, failure.message, failure.kind);
    }

    let data: T & {
      items?: unknown[];
      channels?: unknown[];
      messages?: unknown[];
      channel?: unknown;
      users?: unknown[];
      token?: unknown;
      success?: unknown;
    };
    try {
      data = JSON.parse(text) as typeof data;
    } catch {
      throw new ClubhouseApiError(status, endpoint, 'Invalid response', 'unknown');
    }
    const failed = businessFailure(data);
    if (failed) {
      throw new ClubhouseApiError(status, endpoint, failed, 'business');
    }
    if (endpoint === 'get_channels' && Array.isArray(data.items) && !Array.isArray(data.channels)) {
      data.channels = data.items
        .map((item) => feedChannel(item))
        .filter((channel): channel is Record<string, unknown> => !!channel);
    }
    if (endpoint === 'join_channel' || endpoint === 'create_channel' || endpoint === 'get_channel') {
      normalizeChannelPayload(data as unknown as Record<string, unknown>);
    }
    if (endpoint === 'get_channel_messages') {
      (data as { messages?: CHChatMessage[] }).messages = mapChatMessages(data);
    }
    if (endpoint === 'get_conversations') {
      (data as { conversations?: CHConversation[] }).conversations = normalizeConversations(data as { conversations?: unknown });
    }
    if (import.meta.env.DEV && !this.config.useSandbox) {
      assertNoSandboxLeak(data, sandboxUserIds());
    }
    return data;
  }

  // Sandbox simulation handler
  private async handleSandboxRequest<T>(endpoint: string, body?: RequestBody): Promise<T> {
    const input = readRequestBody(body);
    // Artificial small latency to simulate network
    await new Promise((resolve) => setTimeout(resolve, 150));

    switch (endpoint) {
      case 'start_phone_number_auth':
        return { success: true } as T;

      case 'complete_phone_number_auth': {
        const token = 'mock_token_' + Math.random().toString(36).substring(2, 12);
        this.updateConfig({ authToken: token, userId: MOCK_ME.user_id });
        return {
          success: true,
          auth_token: token,
          access_token: token,
          refresh_token: token + '_refresh',
          user_profile: MOCK_ME,
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
          blocked_ids: [],
          default_room_title_options: ['Join the conversation', 'Come hang out', 'Let’s talk'],
        } as T;

      case 'get_channels':
        return {
          success: true,
          channels: this.mockChannels,
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
        return { success: true, ...channelDetail } as T;
      }

      case 'leave_channel':
        this.currentChannel = null;
        this.handRaised = false;
        return { success: true } as T;

      case 'active_ping':
        return { success: true } as T;

      case 'audience_reply': {
        this.handRaised = input.raiseHands;
        return { success: true } as T;
      }

      case 'accept_speaker_invite': {
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
        const newChan: CHChannel = {
          channel_id: 'ch-' + Date.now(),
          channel: 'room-' + Date.now(),
          topic: input.topic || 'Untitled Community Stage',
          club_name: 'Creator Stage',
          is_private: input.isPrivate,
          is_social_mode: input.isSocial,
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
        return { success: true, ...newChan } as T;
      }

      case 'get_group_suggested_invites':
        return { success: true, suggestions: [], next_cursor: null } as T;

      case 'get_edge_stories':
        return { success: true, activities: [], next_cursor: '' } as T;

      case 'get_conversations':
        return {
          success: true,
          conversations: normalizeConversations({
            conversations: [
              {
                conversation_id: 'sandbox-dm',
                title: 'Sandbox friend',
                short_title: 'Sandbox friend',
                preview_segment_text: 'Sandbox preview',
                summary: 'Sandbox summary',
                creator_user_profile: { name: 'Sandbox friend' },
                social_club: { name: 'Sandbox house' },
                segments_authors: [{ name: 'Sandbox friend' }, { name: 'Sandbox guest' }],
                is_subscribed: false,
                logging_context: { has_listened: false },
                is_permanent_social_club_conversation: true,
                preview_segment_type: 'TEXT_TO_SPEECH',
                is_archived: true,
                share_url: 'https://www.clubhouse.com/c/sandbox',
                permissions: { can_reply: false, cant_reply_reason: 'Replies are not available yet' },
                pending_participants: [{ name: 'Sandbox guest' }],
                privacy_settings: { display_text: 'private' },
                has_new_segments: true,
                time_content_updated: '2026-10-10T12:00:00Z',
              },
            ],
          }),
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

      case 'follow':
      case 'unfollow': {
        const following = endpoint === 'follow';
        for (const channel of this.mockChannels) {
          const user = channel.users.find((entry) => entry.user_id === input.userId);
          if (user) user.is_following = following;
        }
        return { success: true } as T;
      }

      case 'search_users':
        return {
          success: true,
          users: this.mockChannels.flatMap((c) => c.users),
        } as T;

      case 'get_channel_messages':
        return {
          success: true,
          messages: SANDBOX_CHAT_MESSAGES.map((message) => ({ ...message })),
        } as T;

      default:
        return { success: true } as T;
    }
  }

  // --- Public API Methods ---

  public async startPhoneNumberAuth(phoneNumber: string): Promise<CHAuthResponse> {
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

  public async resendPhoneNumberAuth(phoneNumber: string): Promise<CHAuthResponse> {
    return this.request('resend_phone_number_auth', {
      phone_number: phoneNumber,
      tokens: { web_rc_token: null },
    }, true);
  }

  public async adoptWebSession(): Promise<boolean> {
    const desktop = typeof window !== 'undefined' && !!(window as Window & { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron;
    if (!desktop || this.config.authToken || this.config.hasSecureToken) return false;
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

  public async getMe(): Promise<{
    success: boolean;
    user_profile: CHUser;
    user_settings?: MeSettings;
    has_unread_notifications?: boolean;
    unread_conversations_count?: number;
    notifications_enabled?: boolean;
    enable_sound_effect?: boolean;
    anonymous_settings?: { is_enabled?: boolean };
    force_refresh_feed?: boolean;
    needs_age_verification?: boolean;
    is_onboarding?: boolean;
    should_show_explore_public_hallway?: boolean;
    is_admin?: boolean;
    requested_following_ids?: unknown[];
    following_ids?: unknown[];
    blocked_ids?: unknown[];
    default_room_title_options?: unknown[];
  }> {
    return this.request('me');
  }

  public async getChannels(): Promise<{ success: boolean; channels: CHChannel[]; available_topics?: FeedTopic[] }> {
    return this.request('get_channels');
  }

  public async getConversations(): Promise<{ success: boolean; conversations: CHConversation[]; new_dm_requests_count?: number }> {
    return this.request('get_conversations', { is_private_only: true });
  }

  public async getEdgeStories(): Promise<{ success: boolean; activities: unknown[] }> {
    return this.request('get_edge_stories');
  }

  public async getGroupSuggestedInvites(): Promise<{ success: boolean; suggestions: unknown[] }> {
    return this.request('get_group_suggested_invites', {});
  }

  public async getChannelMessages(channelId: string): Promise<{ messages: CHChatMessage[] }> {
    if (!this.config.useSandbox && !this.supports('get_channel_messages')) {
      return { messages: [] };
    }
    return this.request('get_channel_messages', { channel: channelId });
  }

  public async sendChannelMessage(channelId: string, message: string): Promise<unknown> {
    return this.request('send_channel_message', { channel: channelId, message });
  }

  public async getChannel(channelId: string): Promise<CHChannelDetail> {
    return this.request('get_channel', { channel: channelId });
  }

  public async joinChannel(channelId: string): Promise<CHChannelDetail> {
    return this.request('join_channel', { channel: channelId });
  }

  public async leaveChannel(channelId: string): Promise<ApiAck> {
    const result = await this.request<ApiAck>('leave_channel', { channel: channelId });
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
      is_public_room: !options.isPrivate && !options.isSocial,
      is_chat_enabled: true,
      is_replay_enabled: false,
      user_ids: [],
      topic_ids: [],
    });
  }

  public async activePing(channelId: string): Promise<ApiAck> {
    return this.request('active_ping', { channel: channelId });
  }

  public async raiseHand(channelId: string, raise: boolean = true): Promise<ApiAck> {
    const result = await this.request<ApiAck>('audience_reply', {
      channel: channelId,
      raise_hands: raise,
      unraise_hands: !raise,
    });
    this.handRaised = raise;
    return result;
  }

  public async acceptSpeakerInvite(channelId: string, userId: number): Promise<ApiAck> {
    return this.request('accept_speaker_invite', this.config.webSession
      ? { channel: channelId }
      : { channel: channelId, user_id: userId });
  }

  public async inviteSpeaker(channelId: string, userId: number): Promise<ApiAck> {
    return this.request('invite_speaker', {
      channel: channelId,
      user_id: userId,
    });
  }

  // The public web client has no mute request. channel_speaker_mute is an analytics name only.
  public async muteSpeaker(channelId: string, userId: number): Promise<ApiAck> {
    return this.request('mute_speaker', {
      channel: channelId,
      user_id: userId,
    });
  }

  public async makeModerator(channelId: string, userId: number): Promise<ApiAck> {
    return this.request('make_moderator', {
      channel: channelId,
      user_id: userId,
    });
  }

  public async uninviteSpeaker(channelId: string, userId: number): Promise<ApiAck> {
    return this.request('uninvite_speaker', {
      channel: channelId,
      user_id: userId,
    });
  }

  public async getProfile(userId: number): Promise<{ success: boolean; user_profile: CHUser }> {
    return this.request('get_profile', { user_id: userId });
  }

  public async follow(userId: number): Promise<ApiAck> {
    return this.request('follow', { user_id: userId });
  }

  public async unfollow(userId: number): Promise<ApiAck> {
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

  public setHandRaised(raised: boolean): void {
    this.handRaised = raised;
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
