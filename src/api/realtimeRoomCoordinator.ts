import type { ClubhouseApiClient } from './client.ts';
import {
  applyStageEvent,
  mergeChannelUsers,
  parseRealtimeMessage,
  roomPubNubChannels,
  type ParsedRealtimeEvent,
} from './realtimeEvents.ts';
import { overlayMuteStates } from './remoteMute.ts';
import type { RealtimeHub, PubNubSubscribeParams } from './realtimeHub.ts';
import type { CHChannelDetail, CHChatMessage, CHUser } from './types.ts';

export type RealtimeRoomCallbacks = {
  onChannelUpdate?: (detail: CHChannelDetail) => void;
  onChatMessage?: (message: CHChatMessage) => void;
  onReaction?: (emoji: string, targetName: string) => void;
  onInvite?: () => void;
  onRoomEnded?: () => void;
  onUnknown?: (type: string, keys: string[]) => void;
  onStatus?: (reconnecting: boolean) => void;
  onUiMessage?: (message: string) => void;
};

export type RealtimeRoomCoordinatorDeps = {
  client: ClubhouseApiClient;
  hub: RealtimeHub;
  myUserId: number;
  callbacks?: RealtimeRoomCallbacks;
  setInterval?: (fn: () => void, ms: number) => number;
  clearInterval?: (id: number) => void;
};

const CHAT_POLL_MS = 15_000;

export class RealtimeRoomCoordinator {
  channel: CHChannelDetail | null = null;
  chatOpen = false;
  presenceActive = false;
  chatMessages: CHChatMessage[] = [];
  reconnecting = false;
  private readonly client: ClubhouseApiClient;
  private readonly hub: RealtimeHub;
  private readonly myUserId: number;
  private readonly callbacks: RealtimeRoomCallbacks;
  private readonly setIntervalFn: (fn: () => void, ms: number) => number;
  private readonly clearIntervalFn: (id: number) => void;
  private chatTimer: number | null = null;
  private pingTimer: number | null = null;
  private unsubMessage: (() => void) | null = null;
  private unsubStatus: (() => void) | null = null;
  /** Agora-observed mute flags plus our own mic button. Snapshots must not wipe these. */
  private muteStates = new Map<number, boolean>();

  constructor(deps: RealtimeRoomCoordinatorDeps) {
    this.client = deps.client;
    this.hub = deps.hub;
    this.myUserId = deps.myUserId;
    this.callbacks = deps.callbacks ?? {};
    this.setIntervalFn = deps.setInterval ?? ((fn, ms) => {
      if (typeof window === 'undefined') return 0;
      return window.setInterval(fn, ms);
    });
    this.clearIntervalFn = deps.clearInterval ?? ((id) => {
      if (typeof window === 'undefined') return;
      window.clearInterval(id);
    });
    this.unsubMessage = this.hub.onMessage((message) => this.handleRaw(message));
    this.unsubStatus = this.hub.onStatus((status) => {
      this.reconnecting = status.reconnecting;
      this.callbacks.onStatus?.(status.reconnecting);
      if (status.reconnecting) this.callbacks.onUiMessage?.('Reconnecting…');
      this.syncChatPolling();
    });
  }

  dispose(): void {
    this.stop();
    this.unsubMessage?.();
    this.unsubStatus?.();
  }

  async enter(detail: CHChannelDetail): Promise<void> {
    this.channel = detail;
    this.chatMessages = [];
    const channelId = detail.channel || String(detail.channel_id);
    const params: PubNubSubscribeParams = {
      channelId,
      token: detail.pubnub_token ?? '',
      origin: detail.pubnub_origin ?? 'clubhouse.pubnubapi.com',
      uuid: String(this.myUserId),
      heartbeat: detail.pubnub_heartbeat_value,
      heartbeatInterval: detail.pubnub_heartbeat_interval,
      timeToken: detail.pubnub_time_token,
      channels: roomPubNubChannels(channelId, this.myUserId, detail.users.some((user) => user.user_id === this.myUserId && !!user.is_moderator)),
    };
    if (params.token) this.hub.subscribe(params);
    this.startPresence(channelId);
    this.syncChatPolling();
  }

  stop(): void {
    this.stopPresence();
    this.stopChatPolling();
    this.hub.unsubscribe();
    this.channel = null;
    this.chatMessages = [];
    this.muteStates.clear();
  }

  /** Record a mute the next snapshot must keep. uid is the Clubhouse user_id. */
  noteMute(uid: number | string, muted: boolean): void {
    const id = Number(uid);
    if (!Number.isFinite(id)) return;
    this.muteStates.set(id, muted);
  }

  overlayUsers(users: CHUser[]): CHUser[] {
    return overlayMuteStates(users, this.muteStates);
  }

  setChatOpen(open: boolean): void {
    this.chatOpen = open;
    this.syncChatPolling();
  }

  handleRaw(raw: Record<string, unknown>): void {
    const current = this.channel ? this.channel.channel || String(this.channel.channel_id) : null;
    const parsed = parseRealtimeMessage(raw, current);
    this.applyParsed(parsed);
  }

  /** Agora uid = Clubhouse user_id. Mute is not on PubNub (docs/api/realtime.md). */
  applyAgoraMute(uid: number | string, muted: boolean): void {
    this.noteMute(uid, muted);
    if (!this.channel) return;
    const users = this.overlayUsers(this.channel.users);
    if (users === this.channel.users) return;
    this.channel = mergeChannelUsers(this.channel, users);
    this.callbacks.onChannelUpdate?.(this.channel);
  }

  handleChat(fromName: string, text: string): void {
    this.applyParsed({
      kind: 'channel_message',
      message: {
        id: `msg-${Date.now()}`,
        user_id: 0,
        name: fromName,
        username: fromName.toLowerCase(),
        photo_url: null,
        message: text,
        timestamp: 'now',
      },
    });
  }

  handleReaction(emoji: string, fromName: string, targetName: string): void {
    this.applyParsed({ kind: 'channel_reaction', emoji, fromName, targetName });
  }

  handleUnknown(type: string, keys: string[]): void {
    this.applyParsed({ kind: 'unknown', type, keys });
  }

  async refresh(): Promise<void> {
    this.hub.resubscribe();
    await this.refreshChat();
  }

  shouldPollChat(): boolean {
    return this.chatOpen && !!this.channel && !this.hub.isConnected();
  }

  async refreshChat(): Promise<void> {
    if (!this.channel) return;
    if (!this.client.supports('get_channel_messages')) return;
    const channelId = this.channel.channel || String(this.channel.channel_id);
    const chat = await this.client.getChannelMessages(channelId);
    this.chatMessages = chat.messages ?? [];
  }

  syncChatPolling(): void {
    const open = this.shouldPollChat();
    if (!open) {
      this.stopChatPolling();
      return;
    }
    if (this.chatTimer != null) return;
    void this.refreshChat();
    this.chatTimer = this.setIntervalFn(() => {
      void this.refreshChat();
    }, CHAT_POLL_MS);
  }

  private applyParsed(parsed: ParsedRealtimeEvent): void {
    if (!this.channel) return;

    if (parsed.kind === 'ignored') return;

    if (parsed.kind === 'unknown') {
      this.callbacks.onUnknown?.(parsed.type, parsed.keys);
      return;
    }

    if (parsed.kind === 'room_ended') {
      this.callbacks.onUiMessage?.('The room has ended');
      this.stop();
      this.callbacks.onRoomEnded?.();
      return;
    }

    if (parsed.kind === 'channel_patch') {
      const nextCaps = parsed.patch.user_capabilities
        ? { ...(this.channel.user_capabilities ?? {}), ...parsed.patch.user_capabilities }
        : this.channel.user_capabilities;
      this.channel = {
        ...this.channel,
        ...parsed.patch,
        user_capabilities: nextCaps,
        users: this.channel.users,
      };
      this.callbacks.onChannelUpdate?.(this.channel);
      return;
    }

    if (parsed.kind === 'channel_message') {
      this.chatMessages.push(parsed.message);
      this.callbacks.onChatMessage?.(parsed.message);
      return;
    }

    if (parsed.kind === 'channel_reaction') {
      this.callbacks.onReaction?.(parsed.emoji, parsed.targetName);
      this.callbacks.onUiMessage?.(`reaction:${parsed.emoji}:${parsed.targetName}`);
      return;
    }

    if (parsed.kind === 'stage') {
      if (parsed.type === 'invite_to_speak') {
        // The invite arrives on my channel_user.* channel; from_name is the inviter, the target is me.
        const users = applyStageEvent(this.channel.users, { ...parsed, userId: this.myUserId, profile: null });
        this.channel = mergeChannelUsers(this.channel, this.overlayUsers(users));
        this.callbacks.onInvite?.();
        this.callbacks.onChannelUpdate?.(this.channel);
        return;
      }
      const users = applyStageEvent(this.channel.users, parsed);
      this.channel = mergeChannelUsers(this.channel, this.overlayUsers(users));
      this.callbacks.onChannelUpdate?.(this.channel);
      return;
    }

    const _exhaustive: never = parsed;
    void _exhaustive;
  }

  private startPresence(channelId: string): void {
    this.stopPresence();
    const evidence = this.client.evidence('active_ping');
    if (evidence !== 'observed' && evidence !== 'bundle') return;
    this.presenceActive = true;
    this.pingTimer = this.setIntervalFn(() => {
      void this.client.activePing(channelId).catch(() => undefined);
    }, 30_000);
  }

  private stopPresence(): void {
    if (this.pingTimer != null) {
      this.clearIntervalFn(this.pingTimer);
      this.pingTimer = null;
    }
    this.presenceActive = false;
  }

  private stopChatPolling(): void {
    if (this.chatTimer != null) {
      this.clearIntervalFn(this.chatTimer);
      this.chatTimer = null;
    }
  }

  usersInAudience(name: string): boolean {
    if (!this.channel) return false;
    const user = this.channel.users.find((entry) => entry.name === name);
    return !!user && !user.is_speaker;
  }

  userOnStage(name: string): boolean {
    return !!this.channel?.users.some((user) => user.name === name && user.is_speaker);
  }

  userRaisedHand(name: string): boolean {
    return !!this.channel?.users.some((user) => user.name === name && user.is_hand_raised);
  }

  userIsModerator(name: string): boolean {
    return !!this.channel?.users.some((user) => user.name === name && user.is_moderator);
  }

  userIsMuted(name: string): boolean {
    return !!this.channel?.users.some((user) => user.name === name && user.is_muted);
  }

  inviteVisible(): boolean {
    const me = this.channel?.users.find((user) => user.user_id === this.myUserId);
    return !!me?.is_invited_to_speak && !me.is_speaker;
  }
}
