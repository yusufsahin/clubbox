import { canCall, evidenceOf, type Evidence, type Transport } from './capabilities';
import { PEOPLE_LIST_ENDPOINTS, readPeopleList, readProfile, type PeopleListKind, type PeopleListPage } from './relationship';
import { businessFailure, classifyHttpFailure, nextBackoffMs, type ApiErrorKind } from './guards';
import { permissionOn } from './roomActions';
import { INITIAL_MOCK_CHANNELS, MOCK_ME, SANDBOX_CHAT_MESSAGES, sandboxPeoplePage, sandboxUserIds } from './sandboxData';
import type { CHAuthResponse, CHChannel, CHChannelDetail, CHChatMessage, CHConversation, CHUser, ConversationSegment, ConversationThread, FeedTopic, MeSettings, PresenceFriend, SearchHit, SearchObjectType } from './types';

const REQUEST_TIMEOUT_MS = 20000;
const OFFICIAL_WEB_API = 'https://www.clubhouse.com/web_api';

function isWebAuthEndpoint(endpoint: string): boolean {
  const name = endpoint.replace(/^\//, '');
  return name === 'start_phone_number_web_auth'
    || name === 'complete_phone_number_web_auth'
    || name === 'resend_phone_number_auth';
}

function browserRequestUrl(endpoint: string): string {
  const name = endpoint.replace(/^\//, '');
  if (!isWebAuthEndpoint(name)) {
    throw new Error('Token sign-in is not supported. Use web sign-in.');
  }
  return `${OFFICIAL_WEB_API}/${name}`;
}

function headersForBrowser(headers: Record<string, string>, url: string): Record<string, string> {
  const parsed = new URL(url);
  const localhost = parsed.protocol === 'http:' && parsed.hostname === 'localhost';
  if (localhost) {
    const next = { ...headers };
    delete next.Authorization;
    return next;
  }
  const official = parsed.protocol === 'https:' && parsed.hostname === 'www.clubhouse.com';
  if (!official) {
    throw new Error('Browser requests only go to Clubhouse or localhost');
  }
  return headers;
}

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
  userId: number | null;
  deviceId: string;
  appBuild: string;
  appVersion: string;
  agoraAppId: string;
  useSandbox: boolean;
  webSession: boolean;
  language: 'en' | 'tr';
  allowUnverified: boolean;
  allowLocalRecording: boolean;
}

const DEFAULT_CONFIG: ClubhouseConfig = {
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
    if (!parsed || typeof parsed !== 'object') return {};
    delete parsed.baseUrl;
    delete parsed.corsProxy;
    delete parsed.authToken;
    delete parsed.hasSecureToken;
    return parsed;
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
  audience?: string;
  replayEnabled: boolean;
  chatEnabled: boolean;
  talkUserId?: number;
  talkUserName?: string;
  talkUserUsername?: string;
  cursor?: string;
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
  };
}

interface ApiAck {
  success?: boolean;
  error_message?: string;
}

function writeConfig(config: ClubhouseConfig): void {
  writeStorage(CONFIG_KEY, JSON.stringify(config));
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
  const user: Record<string, unknown> = {
    ...profile,
    ...record,
    name: typeof name === 'string' ? name : '',
    username: typeof record.username === 'string' ? record.username : (typeof profile.username === 'string' ? profile.username : ''),
    photo_url: record.photo_url ?? profile.photo_url ?? null,
    user_id: numericId(record.user_id ?? profile.user_id) ?? record.user_id ?? profile.user_id,
    is_speaker: typeof record.is_speaker === 'boolean' ? record.is_speaker : profile.is_speaker,
    is_moderator: typeof record.is_moderator === 'boolean' ? record.is_moderator : profile.is_moderator,
    displayname: record.displayname ?? profile.displayname,
    num_followers: record.num_followers ?? profile.num_followers,
    num_following: record.num_following ?? profile.num_following,
    num_cofollows: record.num_cofollows ?? profile.num_cofollows,
    follows_me: record.follows_me ?? profile.follows_me,
    follow_status: typeof record.follow_status === 'string' ? record.follow_status : profile.follow_status,
    has_protected_profile: record.has_protected_profile ?? profile.has_protected_profile,
  };
  delete user.is_following;
  return user;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function searchUser(raw: Record<string, unknown>): CHUser | null {
  const normalized = normalizeFeedUser(raw);
  if (!normalized) return null;
  return readProfile(normalized);
}

function hitsFromSearch(data: Record<string, unknown>): SearchHit[] {
  const items = Array.isArray(data.items) ? data.items : Array.isArray(data.users) ? data.users : [];
  const hits: SearchHit[] = [];
  for (const entry of items) {
    const item = asRecord(entry);
    if (!item) continue;
    const channel = asRecord(item.channel);
    const conversation = asRecord(item.conversation);
    const user = asRecord(item.user) ?? (numericId(item.user_id) != null ? item : null);
    const club = asRecord(item.social_club);
    const replay = asRecord(item.replay);
    if (channel && typeof channel.channel === 'string') {
      hits.push({
        kind: 'room',
        channel: channel.channel,
        topic: textOf(channel.topic) || 'Live room',
        speakers: typeof channel.num_speakers === 'number' ? channel.num_speakers : 0,
        listeners: typeof channel.num_all === 'number' ? channel.num_all : 0,
      });
      continue;
    }
    if (conversation && typeof conversation.conversation_id === 'string') {
      hits.push({
        kind: 'conversation',
        id: conversation.conversation_id,
        title: textOf(conversation.title) || textOf(conversation.short_title),
        summary: textOf(conversation.summary) || textOf(conversation.preview_segment_text),
      });
      continue;
    }
    if (user) {
      const parsed = searchUser(user);
      if (parsed) hits.push({ kind: 'user', user: parsed, followsMe: user.follows_me === true });
      continue;
    }
    if (club && typeof club.name === 'string') {
      const id = numericId(club.social_club_id);
      hits.push({
        kind: 'house',
        id: id ?? 0,
        name: club.name,
        photoUrl: typeof club.photo_url === 'string' ? club.photo_url : null,
        members: typeof club.num_members === 'number' ? club.num_members : null,
        subtitle: textOf(club.subtitle),
      });
      continue;
    }
    const replayChannel = asRecord(replay?.channel);
    if (replayChannel && typeof replayChannel.channel === 'string') {
      hits.push({
        kind: 'replay',
        channel: replayChannel.channel,
        topic: textOf(replayChannel.topic) || 'Replay',
      });
    }
  }
  return hits;
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

function readConversationPeople(raw: Record<string, unknown>): CHUser[] {
  const rows = [
    raw.creator_user_profile,
    ...(Array.isArray(raw.segments_authors) ? raw.segments_authors : []),
    ...(Array.isArray(raw.pending_participants) ? raw.pending_participants : []),
  ];
  const people: CHUser[] = [];
  const seen = new Set<number>();
  for (const row of rows) {
    const user = readProfile(row);
    if (!user || seen.has(user.user_id)) continue;
    seen.add(user.user_id);
    people.push(user);
  }
  return people;
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
      ? raw.permissions as {
        can_reply?: unknown;
        cant_reply_reason?: unknown;
        can_add_members?: unknown;
        can_invite?: unknown;
        can_delete?: unknown;
        can_leave?: unknown;
      }
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
    const participants = readConversationPeople(raw);
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
      can_add_members: permissionOn(permissions?.can_add_members),
      can_invite: permissionOn(permissions?.can_invite),
      can_delete: permissionOn(permissions?.can_delete),
      can_leave: permissionOn(permissions?.can_leave),
      participants,
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
  private sandboxConversationRecords: Record<string, unknown>[] = [];
  private sandboxThreads = new Map<string, ConversationThread>();
  private currentChannel: CHChannelDetail | null = null;
  private handRaised: boolean = false;
  private sandboxTick: number = 0;
  private sandboxSpeakerInvites = new Set<string>();
  private authExpiredCallbacks: (() => void)[] = [];
  private suppressAuthExpired = false;
  private backoffMs = new Map<string, number>();
  private blockedUntil = new Map<string, number>();

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
    this.seedSandboxInbox();
  }

  public supports(endpoint: string): boolean {
    return canCall(endpoint, this.transport(), { allowUnverified: this.config.allowUnverified === true });
  }

  public evidence(endpoint: string): Evidence {
    return evidenceOf(endpoint);
  }

  private transport(): Transport {
    if (this.config.useSandbox) return 'sandbox';
    return 'web-session';
  }

  public getConfig(): ClubhouseConfig {
    return { ...this.config };
  }

  public async updateConfig(newConfig: Partial<ClubhouseConfig>): Promise<void> {
    this.config = { ...this.config, ...newConfig };
    writeConfig(this.config);
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
      'CH-Languages': 'en-US',
      'CH-Locale': 'en_US',
      'CH-AppVersion': this.config.appVersion,
      'CH-AppBuild': this.config.appBuild,
      'CH-DeviceId': this.config.deviceId,
    };

    if (this.config.webSession) {
      headers['X-Clubbox-Web-Session'] = '1';
    }

    return headers;
  }

  private rateLimitRemaining(endpoint: string): number {
    const until = this.blockedUntil.get(endpoint) ?? 0;
    return Math.max(0, until - Date.now());
  }

  private noteRateLimit(endpoint: string): void {
    const next = nextBackoffMs(this.backoffMs.get(endpoint) ?? 0);
    this.backoffMs.set(endpoint, next);
    this.blockedUntil.set(endpoint, Date.now() + next);
  }

  private clearRateLimit(endpoint: string): void {
    this.backoffMs.delete(endpoint);
    this.blockedUntil.delete(endpoint);
  }

  private async request<T>(endpoint: string, body?: RequestBody, forceLive = false): Promise<T> {
    if (this.config.useSandbox && !forceLive) {
      return this.handleSandboxRequest<T>(endpoint, body);
    }
    if (this.rateLimitRemaining(endpoint) > 0) {
      throw new ClubhouseApiError(429, endpoint, 'Too many requests', 'rate-limit');
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

      const url = browserRequestUrl(endpoint);
      const response = await fetch(url, {
        method: 'POST',
        headers: headersForBrowser(headers, url),
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
      if (failure.kind === 'rate-limit') this.noteRateLimit(endpoint);
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
      const failure = classifyHttpFailure(status, failed);
      if (failure.kind === 'rate-limit') this.noteRateLimit(endpoint);
      throw new ClubhouseApiError(status, endpoint, failed, failure.kind === 'rate-limit' ? 'rate-limit' : 'business');
    }
    this.clearRateLimit(endpoint);
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
    if (endpoint === 'search_users') {
      const hits = hitsFromSearch(data as unknown as Record<string, unknown>);
      (data as { hits?: SearchHit[]; users?: CHUser[] }).hits = hits;
      (data as { users?: CHUser[] }).users = hits.flatMap((hit) => hit.kind === 'user' ? [hit.user] : []);
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
        this.updateConfig({ userId: MOCK_ME.user_id, webSession: true });
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
        const audience = input.audience === 'friends' || input.audience === 'friends-of-friends' || input.audience === 'house'
          ? input.audience
          : 'public';
        const privacyType = audience === 'friends-of-friends' ? 'friends_of_friends' : audience;
        const newChan: CHChannel = {
          channel_id: 'ch-' + Date.now(),
          channel: 'room-' + Date.now(),
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
        return { success: true, activities: [], next_cursor: '' } as T;

      case 'get_conversations':
        return {
          success: true,
          conversations: normalizeConversations({ conversations: this.sandboxConversationRecords }),
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
    if (!desktop || this.config.webSession) return false;
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
        useSandbox: true,
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
    options: {
      audience?: 'public' | 'friends' | 'friends-of-friends' | 'house';
      replayEnabled?: boolean;
      chatEnabled?: boolean;
      talkWith?: { userId: number; name: string; username: string };
    } = {}
  ): Promise<CHChannelDetail> {
    const audience = options.audience ?? 'public';
    const replayEnabled = options.replayEnabled !== false;
    const chatEnabled = options.chatEnabled !== false;
    const privacyLevel = audience === 'friends'
      ? 'friend'
      : audience === 'friends-of-friends'
        ? 'friend_of_friend'
        : audience === 'house'
          ? 'house'
          : 'public';
    const body = {
      topic,
      is_chat_enabled: chatEnabled,
      is_replay_enabled: replayEnabled,
      is_public_room: audience === 'public',
      is_private: false,
      is_social_mode: false,
      privacy_level: privacyLevel,
      user_ids: [] as number[],
      topic_ids: [] as number[],
    };
    if (this.config.useSandbox) {
      return this.handleSandboxRequest('create_channel', {
        ...body,
        audience,
        talk_user_id: options.talkWith?.userId,
        talk_user_name: options.talkWith?.name,
        talk_user_username: options.talkWith?.username,
      });
    }
    return this.request('create_channel', body);
  }

  public async endChannel(channelId: string): Promise<ApiAck> {
    if (!this.config.useSandbox) {
      throw new ClubhouseApiError(0, 'end_channel', 'Not captured', 'unknown');
    }
    return this.request('end_channel', { channel: channelId });
  }

  public sandboxPresence(): PresenceFriend[] {
    if (!this.config.useSandbox) return [];
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

  public sandboxThread(conversationId: string): ConversationThread | null {
    if (!this.config.useSandbox) return null;
    const thread = this.sandboxThreads.get(conversationId);
    if (!thread) return null;
    return {
      segments: thread.segments.map((segment) => ({ ...segment })),
      members: thread.members.map((member) => ({ ...member })),
    };
  }

  public sandboxAppendSegment(
    conversationId: string,
    segment: { kind: 'text' | 'voice'; author_name: string; text: string },
  ): ConversationSegment | null {
    if (!this.config.useSandbox) return null;
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

  public sandboxAddMember(conversationId: string, name: string): boolean {
    if (!this.config.useSandbox) return false;
    const thread = this.sandboxThreads.get(conversationId);
    if (!thread || thread.members.some((member) => member.name === name)) return false;
    thread.members.push({ name, hide_before: thread.segments.length });
    return true;
  }

  public sandboxRemoveConversation(conversationId: string): void {
    if (!this.config.useSandbox) return;
    this.sandboxConversationRecords = this.sandboxConversationRecords.filter((entry) => entry.conversation_id !== conversationId);
    this.sandboxThreads.delete(conversationId);
  }

  public sandboxStartVm(friend: { userId: number; name: string; username: string }): string {
    const id = `sandbox-vm-${friend.userId}`;
    if (!this.config.useSandbox) return id;
    if (!this.sandboxConversationRecords.some((entry) => entry.conversation_id === id)) {
      this.sandboxConversationRecords.unshift({
        conversation_id: id,
        title: friend.name,
        short_title: friend.name,
        preview_segment_text: '',
        summary: '',
        creator_user_profile: { user_id: friend.userId, name: friend.name, username: friend.username, photo_url: null },
        segments_authors: [{ user_id: friend.userId, name: friend.name, username: friend.username, photo_url: null }],
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

  public async getPeopleList(kind: PeopleListKind, userId: number, cursor?: string | null): Promise<PeopleListPage> {
    const endpoint = PEOPLE_LIST_ENDPOINTS[kind];
    if (!this.supports(endpoint)) return { users: [], nextCursor: null };
    const body: RequestBody = { user_id: userId };
    if (cursor) body.next_cursor = cursor;
    return readPeopleList(await this.request(endpoint, body));
  }

  public async getProfile(userId: number): Promise<{ success: boolean; user_profile: CHUser }> {
    const res = await this.request<{ success?: boolean; user_profile?: unknown }>('get_profile', { user_id: userId });
    const user = readProfile(res.user_profile);
    if (!user) throw new ClubhouseApiError(200, 'get_profile', 'Profile was missing', 'unknown');
    return { success: res.success !== false, user_profile: user };
  }

  public async follow(userId: number): Promise<ApiAck> {
    return this.request('follow', { user_id: userId });
  }

  public async unfollow(userId: number): Promise<ApiAck> {
    return this.request('unfollow', { user_id: userId });
  }

  public async search(query: string, types: SearchObjectType[]): Promise<{ success: boolean; hits: SearchHit[]; users: CHUser[] }> {
    const res = await this.request<{ success: boolean; hits?: SearchHit[]; users?: CHUser[] }>('search_users', {
      query,
      limit_to_object_types: types,
    });
    const hits = res.hits ?? (res.users ?? []).map((user) => ({ kind: 'user' as const, user, followsMe: false }));
    return { ...res, success: res.success !== false, hits, users: res.users ?? hits.flatMap((hit) => hit.kind === 'user' ? [hit.user] : []) };
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

  private sameChannel(entry: CHChannel, channelId: string | undefined): boolean {
    if (!channelId) return false;
    return entry.channel === channelId || String(entry.channel_id) === channelId;
  }

  private dropMockChannel(channel: CHChannel): void {
    this.mockChannels = this.mockChannels.filter((entry) => !this.sameChannel(entry, channel.channel) && !this.sameChannel(entry, String(channel.channel_id)));
  }

  private findMockChannel(channelId: string | undefined): CHChannel | undefined {
    if (channelId) {
      const found = this.mockChannels.find((channel) => channel.channel_id === channelId || channel.channel === channelId);
      if (found) return found;
    }
    return this.currentChannel ?? undefined;
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

  private syncChannelCounts(channel: CHChannel): void {
    channel.num_all = channel.users.length;
    channel.num_speakers = channel.users.filter((user) => user.is_speaker).length;
    channel.has_raised_hands = channel.users.some((user) => user.is_hand_raised);
  }
}

export const clubhouseClient = new ClubhouseApiClient();
