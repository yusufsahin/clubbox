import { ApiHealthStore, type ApiHealthFailure, type RedactedRequestLogEntry } from './apiHealth';
import { canCall, evidenceOf, routeMethod, routePath, routeRecord, type Evidence, type Transport } from './capabilities';
import { PEOPLE_LIST_ENDPOINTS, readPeopleList, readProfile, type PeopleListPage } from './relationship';
import { businessFailure, classifyHttpFailure, nextBackoffMs, type ApiErrorKind } from './guards';
import { FEED_MAX_PAGES, mergeFeedChannels, nextFeedCursor, type FeedPage } from './feedPagination';
import { parseGiphyId } from './giphyId';
import { expandRoutePath } from './routeExpand';
import { getEndpoint } from './registry';
import { permissionOn } from './roomActions';
import { SandboxBackend, SandboxTransport } from './sandboxTransport';
import { MOCK_ME, sandboxUserIds } from './sandboxData';
import type { CHAuthResponse, CHChannel, CHChannelDetail, CHChatMessage, CHConversation, CHUser, FeedTopic, MeSettings, SearchHit, SearchObjectType } from './types';

const REQUEST_TIMEOUT_MS = 20000;
const OFFICIAL_WEB_API = 'https://www.clubhouse.com/web_api';

function routeMeta(endpoint: string): { method: string; path: string } {
  return { method: routeMethod(endpoint), path: routePath(endpoint) };
}

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
  /** @deprecated Prefer experimentalActions for community routes; bundle/observed are always callable. */
  allowUnverified: boolean;
  allowLocalRecording: boolean;
  experimentalActions: boolean;
  requestLogging: boolean;
  /** endpoint → appVersion that recorded a 404/405 */
  unsupportedRoutes: Record<string, string>;
  /** Local evidence overrides (unsupported / observed promotions) */
  evidenceOverrides: Record<string, Evidence>;
  /** Community routes the user confirmed as experimental */
  confirmedExperimentalRoutes: string[];
}

const DEFAULT_CONFIG: ClubhouseConfig = {
  userId: null,
  deviceId: 'clubbox-' + Math.random().toString(36).substring(2, 12),
  appBuild: '1038754',
  appVersion: '26.10.01',
  // Web bundle agora.key in /_next/static/chunks/2g12grilkkngb.js, the fallback
  // after NEXT_PUBLIC_AGORA_KEY. The previous default was not that literal.
  // Production key from the clubhouse.com bundle (config block with a live Stripe key). Room tokens are issued for it.
  agoraAppId: '938de3e8055e42b281bb8c6f69c21f78',
  useSandbox: true, // Default to sandbox so user can explore right away
  webSession: false,
  language: 'en',
  allowUnverified: false,
  allowLocalRecording: false,
  experimentalActions: false,
  requestLogging: true,
  unsupportedRoutes: {},
  evidenceOverrides: {},
  confirmedExperimentalRoutes: [],
};


const CONFIG_KEY = 'clubbox_config';
const LEGACY_CONFIG_KEY = 'clubdeck_config';
const STALE_AGORA_APP_IDS = new Set([
  '938d3d95b5764796b3204b67d233436e',
  // Dev/staging key from the same bundle; it was picked by mistake because it is the first config block.
  '3489b00d5d104a45a00513316a32d3e4',
]);

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

/** Injected HTTP seam for BDD / contract tests — not used in production. */
export interface ApiTransport {
  request(input: {
    endpoint: string;
    method: string;
    path: string;
    body?: RequestBody | null;
    headers: Record<string, string>;
  }): Promise<{ ok: boolean; status: number; body: string }>;
}

export type ClubhouseClientOptions = Partial<ClubhouseConfig> & {
  transport?: ApiTransport;
  now?: () => number;
};

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
      const slug = textOf(club.slug) || textOf(club.social_club_slug) || (id != null ? String(id) : '');
      hits.push({
        kind: 'house',
        id: id ?? 0,
        name: club.name,
        slug,
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
  const logging = asRecord(channel.logging_context);
  if (logging && typeof logging.topic_key === 'string' && logging.topic_key.length > 0) {
    channel.topic_key = logging.topic_key;
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
  private handRaised: boolean = false;
  private authExpiredCallbacks: (() => void)[] = [];
  private suppressAuthExpired = false;
  private backoffMs = new Map<string, number>();
  private blockedUntil = new Map<string, number>();
  private injectedTransport: ApiTransport | null = null;
  private activeTransport: ApiTransport | null = null;
  private sandboxBackend: SandboxBackend | null = null;
  private nowFn: () => number = () => Date.now();
  private consecutiveClientErrors = new Map<string, number>();
  private sessionDisabled = new Set<string>();
  private health = new ApiHealthStore();

  constructor(customConfig?: ClubhouseClientOptions) {
    const { transport, now, ...configOverrides } = customConfig ?? {};
    this.injectedTransport = transport ?? null;
    if (now) this.nowFn = now;
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
      ...configOverrides,
      // Evidence log stays on across upgrades unless the user explicitly saved false.
      requestLogging: configOverrides.requestLogging
        ?? parsedSaved.requestLogging
        ?? DEFAULT_CONFIG.requestLogging,
      unsupportedRoutes: {
        ...DEFAULT_CONFIG.unsupportedRoutes,
        ...parsedSaved.unsupportedRoutes,
        ...configOverrides.unsupportedRoutes,
      },
      evidenceOverrides: {
        ...DEFAULT_CONFIG.evidenceOverrides,
        ...parsedSaved.evidenceOverrides,
        ...configOverrides.evidenceOverrides,
      },
      confirmedExperimentalRoutes:
        configOverrides.confirmedExperimentalRoutes
        ?? parsedSaved.confirmedExperimentalRoutes
        ?? DEFAULT_CONFIG.confirmedExperimentalRoutes,
    };
    if (STALE_AGORA_APP_IDS.has(this.config.agoraAppId)) {
      this.config.agoraAppId = DEFAULT_CONFIG.agoraAppId;
    }
    if (this.config.language !== 'en' && this.config.language !== 'tr') {
      this.config.language = 'en';
    }
    if ((parsedSaved.appBuild && !clientIsCurrent) || STALE_AGORA_APP_IDS.has(parsedSaved.agoraAppId ?? '')) {
      writeConfig(this.config);
    }

    this.refreshTransport();
  }

  public getSandbox(): SandboxBackend | null {
    return this.config.useSandbox ? this.sandboxBackend : null;
  }

  /** Registry-driven call: buildRequest → request → optional map. */
  public async call<T = unknown>(name: string, params: RequestBody = {}): Promise<T> {
    const entry = getEndpoint(name);
    const body = entry.buildRequest ? entry.buildRequest(params) : params;
    const raw = await this.request<T>(name, body);
    return entry.map ? (entry.map(raw) as T) : raw;
  }

  /** Harness / contract-test seam: send a named endpoint through the normal request path. */
  public async callEndpoint<T = unknown>(endpoint: string, body?: RequestBody): Promise<T> {
    return this.request<T>(endpoint, body);
  }

  private refreshTransport(): void {
    if (this.injectedTransport) {
      this.activeTransport = this.injectedTransport;
      return;
    }
    if (this.config.useSandbox) {
      if (!this.sandboxBackend) {
        this.sandboxBackend = new SandboxBackend({
          onAdoptSandboxSession: (userId) => {
            void this.updateConfig({ userId, webSession: true });
          },
        });
      }
      this.activeTransport = new SandboxTransport(this.sandboxBackend);
    } else {
      this.activeTransport = null;
    }
  }

  public supports(endpoint: string): boolean {
    return canCall(endpoint, this.transport(), {
      experimentalActions: this.config.experimentalActions === true,
      unsupportedRoutes: this.config.unsupportedRoutes,
      appVersion: this.config.appVersion,
      sessionDisabled: this.sessionDisabled,
      evidenceOverrides: this.config.evidenceOverrides,
    });
  }

  public evidence(endpoint: string): Evidence {
    return this.effectiveEvidence(endpoint);
  }

  public effectiveEvidence(endpoint: string): Evidence {
    return evidenceOf(endpoint, this.config.evidenceOverrides);
  }

  public isDisabledForSession(endpoint: string): boolean {
    return this.sessionDisabled.has(endpoint);
  }

  public getApiHealth(): ApiHealthFailure[] {
    return [...this.health.failures];
  }

  public getRequestLog(): RedactedRequestLogEntry[] {
    return [...this.health.requestLog];
  }

  public copyHealthReport(index?: number): string {
    return this.health.copyReport(index);
  }

  /** Non-HTTP notes (missing Agora key, unknown PubNub types) for API Health. */
  public noteApiHealth(endpoint: string, message: string, bodyKeys: string[] = []): void {
    this.health.recordFailure({
      endpoint,
      method: 'NOTE',
      status: 0,
      message,
      bodyKeys,
      time: new Date().toISOString(),
    });
  }

  public resetUnsupportedRoutes(): void {
    const evidenceOverrides = { ...this.config.evidenceOverrides };
    for (const endpoint of Object.keys(this.config.unsupportedRoutes)) {
      if (evidenceOverrides[endpoint] === 'unsupported') delete evidenceOverrides[endpoint];
    }
    void this.updateConfig({ unsupportedRoutes: {}, evidenceOverrides });
  }

  public confirmExperimental(endpoint: string): void {
    if (this.config.confirmedExperimentalRoutes.includes(endpoint)) return;
    void this.updateConfig({
      confirmedExperimentalRoutes: [...this.config.confirmedExperimentalRoutes, endpoint],
    });
  }

  public needsExperimentalConfirmation(endpoint: string): boolean {
    return this.effectiveEvidence(endpoint) === 'community'
      && this.config.experimentalActions
      && !this.config.confirmedExperimentalRoutes.includes(endpoint);
  }

  /** Used by BDD / api:docs-style promotion after a logged 2xx. */
  public promoteFromRequestLog(endpoint: string): boolean {
    const hit = this.health.requestLog.find((entry) => entry.endpoint === endpoint && entry.status >= 200 && entry.status < 300);
    if (!hit) return false;
    void this.updateConfig({
      evidenceOverrides: { ...this.config.evidenceOverrides, [endpoint]: 'observed' },
    });
    return true;
  }

  /** Local promotions from the userData request log (Task 12.2 startup triage). */
  public promoteEndpointsLocally(endpoints: string[]): string[] {
    const overrides = { ...this.config.evidenceOverrides };
    const applied: string[] = [];
    for (const endpoint of endpoints) {
      if (!endpoint || this.effectiveEvidence(endpoint) === 'observed') continue;
      overrides[endpoint] = 'observed';
      applied.push(endpoint);
    }
    if (applied.length) void this.updateConfig({ evidenceOverrides: overrides });
    return applied;
  }

  public importTriageFailures(failures: Array<{
    endpoint: string;
    status: number;
    error?: string;
    bodyKeys?: string[];
  }>): void {
    for (const failure of failures) {
      if (!failure?.endpoint) continue;
      this.health.recordFailure({
        endpoint: failure.endpoint,
        method: 'LOG',
        status: failure.status || 0,
        message: failure.error || `HTTP ${failure.status || 0}`,
        bodyKeys: failure.bodyKeys ?? [],
        time: new Date(this.nowFn()).toISOString(),
      });
    }
  }

  private transport(): Transport {
    if (this.config.useSandbox) return 'sandbox';
    return 'web-session';
  }

  public getConfig(): ClubhouseConfig {
    return { ...this.config };
  }

  public async updateConfig(newConfig: Partial<ClubhouseConfig>): Promise<void> {
    const sandboxChanged = newConfig.useSandbox != null && newConfig.useSandbox !== this.config.useSandbox;
    this.config = { ...this.config, ...newConfig };
    writeConfig(this.config);
    if (sandboxChanged) this.refreshTransport();
  }

  public getCurrentUserId(): number | null {
    if (this.config.userId != null) return this.config.userId;
    if (this.getSandbox()) return MOCK_ME.user_id;
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
    return Math.max(0, until - this.nowFn());
  }

  private noteRateLimit(endpoint: string): void {
    const next = nextBackoffMs(this.backoffMs.get(endpoint) ?? 0);
    this.backoffMs.set(endpoint, next);
    this.blockedUntil.set(endpoint, this.nowFn() + next);
  }

  private clearRateLimit(endpoint: string): void {
    this.backoffMs.delete(endpoint);
    this.blockedUntil.delete(endpoint);
  }

  private assertCallable(endpoint: string): void {
    if (this.sessionDisabled.has(endpoint)) {
      throw new ClubhouseApiError(0, endpoint, 'Temporarily unavailable', 'unknown');
    }
  }

  private noteClientFailure(endpoint: string, status: number, message: string, body?: RequestBody): void {
    const meta = routeMeta(endpoint);
    this.health.recordFailure({
      endpoint,
      method: meta.method,
      status,
      message,
      bodyKeys: Object.keys(body ?? {}),
      time: new Date(this.nowFn()).toISOString(),
    });
    if (status === 404 || status === 405) {
      void this.updateConfig({
        unsupportedRoutes: { ...this.config.unsupportedRoutes, [endpoint]: this.config.appVersion },
        evidenceOverrides: { ...this.config.evidenceOverrides, [endpoint]: 'unsupported' },
      });
    }
    if (status >= 400 && status < 500 && status !== 401 && status !== 429) {
      const count = (this.consecutiveClientErrors.get(endpoint) ?? 0) + 1;
      this.consecutiveClientErrors.set(endpoint, count);
      if (count >= 2) this.sessionDisabled.add(endpoint);
    }
  }

  private noteClientSuccess(endpoint: string, status: number, body?: RequestBody): void {
    this.consecutiveClientErrors.delete(endpoint);
    if (!this.config.requestLogging) return;
    const meta = routeMeta(endpoint);
    this.health.recordSuccess({
      endpoint,
      method: meta.method,
      path: meta.path,
      status,
      bodyKeys: Object.keys(body ?? {}),
      evidence: this.effectiveEvidence(endpoint),
      appVersion: this.config.appVersion,
      timestamp: new Date(this.nowFn()).toISOString(),
    });
  }

  private async request<T>(endpoint: string, body?: RequestBody, forceLive = false): Promise<T> {
    if (this.activeTransport && !forceLive) {
      return this.requestViaTransport<T>(endpoint, body);
    }
    this.assertCallable(endpoint);
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
    const desktopRequest = (typeof window !== 'undefined'
      ? (window as Window & {
        electronAPI?: {
          request?: (
            endpoint: string,
            body: unknown,
            headers: Record<string, string>
          ) => Promise<{ ok: boolean; status: number; body: string }>;
        };
      }).electronAPI?.request
      : undefined);

    try {
      if (desktopRequest) {
        const result = await withTimeout(desktopRequest(endpoint, body ?? null, headers), endpoint);
        return this.parseLiveResponse<T>(endpoint, result.status, result.body, result.ok, body);
      }

      const url = browserRequestUrl(endpoint);
      const response = await fetch(url, {
        method: 'POST',
        headers: headersForBrowser(headers, url),
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const text = await response.text();
      return this.parseLiveResponse<T>(endpoint, response.status, text, response.ok, body);
    } catch (err) {
      if (err instanceof ClubhouseApiError) throw err;
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new ClubhouseApiError(0, endpoint, 'Request timed out', 'timeout');
      }
      const message = err instanceof Error ? err.message : 'Network error';
      throw new ClubhouseApiError(0, endpoint, message, 'network');
    }
  }

  private async requestViaTransport<T>(endpoint: string, body?: RequestBody): Promise<T> {
    this.assertCallable(endpoint);
    if (this.rateLimitRemaining(endpoint) > 0) {
      throw new ClubhouseApiError(429, endpoint, 'Too many requests', 'rate-limit');
    }
    const headers = this.getHeaders();
    const meta = routeMeta(endpoint);
    const route = routeRecord(endpoint);
    const expanded = expandRoutePath(
      { path: meta.path, pathParams: route?.pathParams },
      (body && typeof body === 'object' ? body : {}) as Record<string, unknown>,
    );
    // GET query keys stay in the body for FakeTransport / Electron query string;
    // path-param-only GETs send no JSON body.
    const wireBody = meta.method === 'GET' && Object.keys(expanded.body).length === 0
      ? null
      : expanded.body;
    const result = await withTimeout(
      this.activeTransport!.request({
        endpoint,
        method: meta.method,
        path: expanded.pathName,
        body: wireBody,
        headers,
      }),
      endpoint,
    );
    return this.parseLiveResponse<T>(endpoint, result.status, result.body, result.ok, body);
  }

  private parseLiveResponse<T>(
    endpoint: string,
    status: number,
    text: string,
    ok: boolean,
    requestBody?: RequestBody,
  ): T {
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
      this.noteClientFailure(endpoint, status, failure.message, requestBody);
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
      this.noteClientFailure(endpoint, status, failed, requestBody);
      throw new ClubhouseApiError(status, endpoint, failed, failure.kind === 'rate-limit' ? 'rate-limit' : 'business');
    }
    this.clearRateLimit(endpoint);
    this.noteClientSuccess(endpoint, status, requestBody);
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
    if (import.meta.env?.DEV && !this.config.useSandbox) {
      assertNoSandboxLeak(data, sandboxUserIds());
    }
    return data;
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
    const desktopApi = typeof window !== 'undefined'
      ? (window as Window & { electronAPI?: { isElectron?: boolean; ensureRealtimeConfig?: () => Promise<unknown> } }).electronAPI
      : undefined;
    const desktop = !!desktopApi?.isElectron;
    if (!desktop || this.config.webSession) return false;
    const previous = this.config.webSession;
    this.config.webSession = true;
    this.suppressAuthExpired = true;
    try {
      // forceLive hits the Electron cookie jar; injected transports (unit tests) stay on the harness path.
      const res = await this.request<{ success: boolean; user_profile?: CHUser }>(
        'me',
        {},
        !this.injectedTransport,
      );
      if (!res?.user_profile) {
        this.clearAdoptedWebSession(previous);
        return false;
      }
      this.updateConfig({
        webSession: true,
        useSandbox: false,
        userId: res.user_profile.user_id,
      });
      // Already-signed-in users never open the sign-in window — crawl for PubNub/Agora keys here.
      void desktopApi?.ensureRealtimeConfig?.();
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

  /** One feed page. Pass `nextCursor` to load the next page (infinite scroll). */
  public async getChannelsPage(options: {
    nextCursor?: string | null;
  } = {}): Promise<{
    success: boolean;
    channels: CHChannel[];
    available_topics?: FeedTopic[];
    next_cursor?: string | null;
  }> {
    const body: RequestBody = options.nextCursor ? { next_cursor: options.nextCursor } : {};
    const res = await this.request<FeedPage & { success?: boolean }>('get_channels', body);
    return {
      success: true,
      channels: res.channels ?? [],
      available_topics: Array.isArray(res.available_topics) ? res.available_topics : undefined,
      next_cursor: nextFeedCursor(res, options.nextCursor ?? null),
    };
  }

  /** Load up to FEED_MAX_PAGES (used by refresh / tests). UI prefers getChannelsPage + load more. */
  public async getChannels(): Promise<{
    success: boolean;
    channels: CHChannel[];
    available_topics?: FeedTopic[];
    next_cursor?: string | null;
  }> {
    const pages: CHChannel[][] = [];
    let available_topics: FeedTopic[] | undefined;
    let cursor: string | null = null;
    let lastNext: string | null = null;
    for (let page = 0; page < FEED_MAX_PAGES; page += 1) {
      const res = await this.getChannelsPage({ nextCursor: cursor });
      pages.push(res.channels);
      if (!available_topics && res.available_topics) available_topics = res.available_topics;
      lastNext = res.next_cursor ?? null;
      if (!lastNext) break;
      cursor = lastNext;
    }
    return {
      success: true,
      channels: mergeFeedChannels(pages),
      available_topics,
      next_cursor: lastNext,
    };
  }

  public async getConversations(options: {
    nextCursor?: string | null;
    isPrivateOnly?: boolean;
  } = {}): Promise<{
    success: boolean;
    conversations: CHConversation[];
    new_dm_requests_count?: number;
    next_cursor?: string | null;
  }> {
    const body: RequestBody = { is_private_only: options.isPrivateOnly !== false };
    if (options.nextCursor) body.next_cursor = options.nextCursor;
    return this.call('get_conversations', body);
  }

  public async getEdgeStories(): Promise<{ success: boolean; activities?: unknown[]; stories?: unknown[]; items?: unknown[] }> {
    return this.request('get_edge_stories');
  }

  public async getGroupSuggestedInvites(): Promise<{ success: boolean; suggestions: unknown[] }> {
    return this.request('get_group_suggested_invites', {});
  }

  public async getChannelMessages(channelId: string): Promise<{ messages: CHChatMessage[] }> {
    if (!this.getSandbox() && !this.supports('get_channel_messages')) {
      return { messages: [] };
    }
    return this.call('get_channel_messages', { channel: channelId });
  }

  public async sendChannelMessage(channelId: string, message: string): Promise<unknown> {
    return this.call('send_channel_message', { channel: channelId, message });
  }

  public async getChannel(channelId: string): Promise<CHChannelDetail> {
    return this.request('get_channel', { channel: channelId });
  }

  public async joinChannel(channelId: string): Promise<CHChannelDetail> {
    return this.call('join_channel', { channel: channelId });
  }

  public async leaveChannel(channelId: string): Promise<ApiAck> {
    const result = await this.call<ApiAck>('leave_channel', { channel: channelId });
    if (!this.getSandbox()) this.handRaised = false;
    return result;
  }

  public async createChannel(
    topic: string,
    options: {
      audience?: 'public' | 'social' | 'friends' | 'friends-of-friends' | 'closed' | 'house';
      replayEnabled?: boolean;
      chatEnabled?: boolean;
      socialClubId?: number | string;
      handraisePermission?: number;
      link?: string;
      talkWith?: { userId: number; name: string; username: string };
    } = {}
  ): Promise<CHChannelDetail> {
    const audience = options.audience ?? 'public';
    const replayEnabled = options.replayEnabled !== false;
    const chatEnabled = options.chatEnabled !== false;
    const talkUserIds = options.talkWith ? [options.talkWith.userId] : undefined;
    return this.call('create_channel', {
      _sandbox: this.getSandbox() ? true : undefined,
      topic,
      audience,
      replayEnabled,
      chatEnabled,
      socialClubId: options.socialClubId,
      handraisePermission: options.handraisePermission,
      link: options.link,
      userIds: talkUserIds,
      talk_user_id: options.talkWith?.userId,
      talk_user_name: options.talkWith?.name,
      talk_user_username: options.talkWith?.username,
    });
  }

  public async getCreateChannelTargets(): Promise<import('./createComposer').CreateChannelTargets & { success?: boolean }> {
    return this.request('get_create_channel_targets', {});
  }

  public async endChannel(channelId: string): Promise<ApiAck> {
    return this.call('end_channel', { channel: channelId });
  }

  public async setChannelTitle(channelId: string, title: string): Promise<ApiAck> {
    return this.call('set_channel_title', { channel: channelId, title });
  }

  public async emojiReaction(channelId: string, emoji: string): Promise<ApiAck> {
    return this.call('emoji_reaction', { channel: channelId, emoji });
  }

  public async gifReaction(channelId: string, giphyInput: string): Promise<ApiAck> {
    const giphyId = parseGiphyId(giphyInput);
    if (!giphyId) {
      throw new ClubhouseApiError(0, 'gif_reaction', 'Invalid Giphy link or id', 'business');
    }
    return this.call('gif_reaction', { channel: channelId, giphy_id: giphyId });
  }

  public async becomeSpeaker(channelId: string): Promise<ApiAck> {
    return this.call('become_speaker', { channel: channelId });
  }

  public async rejectSpeakerInvite(channelId: string, userId: number): Promise<ApiAck> {
    return this.call('reject_speaker_invite', { channel: channelId, user_id: userId });
  }

  public async blockFromChannel(channelId: string, userId: number): Promise<ApiAck> {
    return this.call('block_from_channel', { channel: channelId, user_id: userId });
  }

  public async inviteToExistingChannel(channelId: string, userId: number): Promise<ApiAck> {
    return this.call('invite_to_existing_channel', { channel: channelId, user_id: userId });
  }

  public async changeHandraiseSettings(
    channelId: string,
    options: { isEnabled: boolean; handraisePermission: number },
  ): Promise<ApiAck> {
    return this.call('change_handraise_settings', {
      channel: channelId,
      isEnabled: options.isEnabled,
      handraisePermission: options.handraisePermission,
    });
  }

  public async hideChannel(channelId: string, hide: boolean): Promise<ApiAck> {
    return this.call('hide_channel', { channel: channelId, hide });
  }

  public async makeChannelPublic(channelId: string): Promise<ApiAck> {
    return this.call('make_channel_public', { channel: channelId });
  }

  public async makeChannelSocial(channelId: string): Promise<ApiAck> {
    return this.call('make_channel_social', { channel: channelId });
  }

  public async getOnlineFriends(): Promise<ApiAck> {
    return this.call('get_online_friends', {});
  }

  public async getNotifications(page = 1, pageSize = 20): Promise<{ success?: boolean; notifications?: unknown[]; items?: unknown[] }> {
    return this.call('get_notifications', { page, page_size: pageSize });
  }

  public async getEvents(page = 1, pageSize = 20, isFiltered = false): Promise<ApiAck> {
    return this.call('get_events', { page, page_size: pageSize, is_filtered: isFiltered });
  }

  public async getConversation(conversationId: string): Promise<{ success: boolean; conversation?: unknown }> {
    return this.call('get_conversation', { conversation_id: conversationId });
  }

  public async markConversationSegmentListened(conversationId: string, segmentId: string): Promise<ApiAck> {
    return this.call('mark_conversation_segment_listened', { conversation_id: conversationId, segment_id: segmentId });
  }

  public async addConversationSegment(
    conversationId: string,
    kind: 'text' | 'voice',
    text?: string,
  ): Promise<ApiAck> {
    return this.call('add_conversation_segment', {
      conversation_id: conversationId,
      message: kind === 'text' ? (text ?? '') : undefined,
      audio_file: kind === 'voice' ? 'voice-blob' : '',
      duration: kind === 'voice' ? 3 : 0,
    });
  }

  public async createConversation(userIds: number[]): Promise<ApiAck> {
    return this.call('create_conversation', {
      user_ids: userIds,
      privacy_level: 'private',
      is_private: true,
      source: 14,
      social_club_id: 0,
    });
  }

  public async sendConversationEmojiReaction(
    conversationId: string,
    segmentId: string,
    emoji: string,
  ): Promise<ApiAck> {
    return this.call('send_conversation_emoji_reaction', {
      conversation_id: conversationId,
      segment_id: segmentId,
      emoji,
    });
  }

  public async getConversationUnreadSummary(conversationId: string): Promise<{ success: boolean; unread_count?: number }> {
    const id = typeof conversationId === 'string' ? conversationId.trim() : '';
    if (!id) {
      throw new ClubhouseApiError(0, 'get_conversation_unread_summary', 'Conversation id is required', 'business');
    }
    return this.call('get_conversation_unread_summary', { conversation_id: id });
  }

  public async getUserSocialClubs(): Promise<{ success: boolean; social_clubs?: unknown[] }> {
    return this.call('get_user_social_clubs', {});
  }

  public async getSocialClub(slug: string): Promise<{ success: boolean; social_club?: unknown }> {
    return this.call('get_social_club', { social_club_slug: slug });
  }

  public async getSocialClubMembers(socialClubId: number): Promise<{ success: boolean; members?: unknown[] }> {
    return this.call('get_social_club_members', { social_club_id: socialClubId });
  }

  public async getSocialClubMessages(socialClubId: number, slug: string): Promise<{ success: boolean; messages?: unknown[] }> {
    return this.call('get_social_club_messages', { social_club_id: socialClubId, social_club_slug: slug });
  }

  public async sendSocialClubMessage(socialClubId: number, slug: string, message: string): Promise<ApiAck> {
    return this.call('send_social_club_message', { social_club_id: socialClubId, social_club_slug: slug, message });
  }

  public async getSocialClubMessageThread(
    socialClubId: number,
    messageIdStr: string,
  ): Promise<{ success: boolean; messages?: unknown[] }> {
    return this.call('get_social_club_message_thread', {
      social_club_id: socialClubId,
      message_id_str: messageIdStr,
    });
  }

  public async sendSocialClubThreadedMessage(
    socialClubId: number,
    messageIdStr: string,
    message: string,
  ): Promise<ApiAck> {
    return this.call('send_social_club_threaded_message', {
      social_club_id: socialClubId,
      message_id_str: messageIdStr,
      message,
    });
  }

  public async sendSocialClubMessageEmojiReaction(
    socialClubId: number,
    messageId: string,
    emojiId: string,
    addReaction = true,
  ): Promise<ApiAck> {
    return this.call('send_social_club_message_emoji_reaction', {
      social_club_id: socialClubId,
      message_id: messageId,
      add_reaction: addReaction,
      emoji_id: emojiId,
    });
  }

  public async updateLastReadSocialClubMessage(
    socialClubId: number,
    messageId: string,
  ): Promise<ApiAck> {
    return this.call('update_last_read_social_club_message', {
      social_club_id: socialClubId,
      message_id: messageId,
    });
  }

  public async getReplayChannel(channelId: string): Promise<{ success: boolean; replay?: unknown }> {
    return this.call('get_replay_channel', { channel: channelId });
  }

  public async getHighlight(highlightId: string): Promise<{ success: boolean; highlight?: unknown }> {
    return this.call('get_highlight', { highlight_id: highlightId });
  }

  public async activePing(channelId: string): Promise<ApiAck> {
    return this.call('active_ping', { channel: channelId });
  }

  public async raiseHand(channelId: string, raise: boolean = true): Promise<ApiAck> {
    const result = await this.call<ApiAck>('audience_reply', { channel: channelId, raise });
    if (!this.getSandbox()) this.handRaised = raise;
    return result;
  }

  public async acceptSpeakerInvite(channelId: string, userId: number): Promise<ApiAck> {
    return this.call('become_speaker', this.config.webSession
      ? { channel: channelId }
      : { channel: channelId, user_id: userId });
  }

  public async inviteSpeaker(channelId: string, userId: number): Promise<ApiAck> {
    return this.call('invite_speaker', { channel: channelId, user_id: userId });
  }

  // The public web client has no mute request. channel_speaker_mute is an analytics name only.
  public async muteSpeaker(channelId: string, userId: number): Promise<ApiAck> {
    return this.call('mute_speaker', { channel: channelId, user_id: userId });
  }

  public async makeModerator(channelId: string, userId: number): Promise<ApiAck> {
    return this.call('make_moderator', { channel: channelId, user_id: userId });
  }

  public async uninviteSpeaker(channelId: string, userId: number): Promise<ApiAck> {
    return this.call('uninvite_speaker', { channel: channelId, user_id: userId });
  }

  public async getPeopleList(kind: 'followers' | 'following', userId: number, cursor?: string | null): Promise<PeopleListPage> {
    const endpoint = PEOPLE_LIST_ENDPOINTS[kind];
    if (!this.supports(endpoint)) return { users: [], nextCursor: null };
    const body: RequestBody = { user_id: userId };
    if (cursor) body.next_cursor = cursor;
    return readPeopleList(await this.request(endpoint, body));
  }

  public async getProfile(userId: number): Promise<{ success: boolean; user_profile: CHUser }> {
    const res = await this.call<{ success?: boolean; user_profile?: unknown }>('get_profile', { user_id: userId });
    const user = readProfile(res.user_profile);
    if (!user) throw new ClubhouseApiError(200, 'get_profile', 'Profile was missing', 'unknown');
    return { success: res.success !== false, user_profile: user };
  }

  public async getProfileByUsername(username: string): Promise<{ success: boolean; user_profile: CHUser }> {
    const res = await this.call<{ success?: boolean; user_profile?: unknown }>('get_profile', { username });
    const user = readProfile(res.user_profile);
    if (!user) throw new ClubhouseApiError(200, 'get_profile', 'Profile was missing', 'unknown');
    return { success: res.success !== false, user_profile: user };
  }

  public async follow(userId: number): Promise<ApiAck> {
    return this.call('follow', { user_id: userId, source: 4 });
  }

  public async updateConversationTitle(conversationId: string, title: string): Promise<ApiAck> {
    return this.call('update_conversation_title', { conversation_id: conversationId, title });
  }

  public async deleteConversation(conversationId: string): Promise<ApiAck> {
    return this.call('delete_conversation', { conversation_id: conversationId });
  }

  public async getReplayChannelChunk(channelId: string, chunk: string | number): Promise<unknown> {
    return this.call('get_replay_channel_chunk', { channel: channelId, chunk: String(chunk) });
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
    return this.getSandbox()?.getCurrentChannel() ?? null;
  }

  public isHandRaised(): boolean {
    return this.getSandbox()?.isHandRaised() ?? this.handRaised;
  }

  public setHandRaised(raised: boolean): void {
    if (this.getSandbox()) {
      this.getSandbox()!.setHandRaised(raised);
      return;
    }
    this.handRaised = raised;
  }
}

export type { SandboxBackend } from './sandboxTransport';

export const clubhouseClient = new ClubhouseApiClient();
