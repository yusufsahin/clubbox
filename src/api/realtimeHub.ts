export type PubNubSubscribeParams = {
  channelId: string;
  token: string;
  origin: string;
  uuid: string;
  heartbeat?: number;
  heartbeatInterval?: number;
  timeToken?: string;
  /** PubNub channels to subscribe to (see roomPubNubChannels). */
  channels?: string[];
};

export type RealtimeHubStatus = {
  connected: boolean;
  reconnecting: boolean;
  reconnectDelayMs?: number;
  reason?: string;
};

export type RealtimeHub = {
  subscribe(params: PubNubSubscribeParams): void;
  resubscribe(): void;
  unsubscribe(): void;
  isConnected(): boolean;
  getStatus(): RealtimeHubStatus;
  getLastSubscribe(): PubNubSubscribeParams | null;
  getLastFailureReason(): string | null;
  onMessage(handler: (message: Record<string, unknown>) => void): () => void;
  onStatus(handler: (status: RealtimeHubStatus) => void): () => void;
};

type ElectronPubNubApi = {
  pubnubSubscribe?: (params: PubNubSubscribeParams) => Promise<{ ok: boolean; reason?: string }>;
  pubnubResubscribe?: () => Promise<{ ok: boolean }>;
  pubnubUnsubscribe?: () => Promise<{ ok: boolean }>;
  ensureRealtimeConfig?: () => Promise<{ ok: boolean; reason?: string; hasKeys?: boolean }>;
  onPubNubMessage?: (handler: (message: Record<string, unknown>) => void) => () => void;
  onPubNubStatus?: (handler: (status: RealtimeHubStatus) => void) => () => void;
  onRealtimeConfig?: (handler: (payload: { hasKeys?: boolean; reason?: string | null }) => void) => () => void;
  appendApiLog?: (record: {
    endpoint: string;
    status: number;
    ok?: boolean;
    error?: string;
    kind?: string;
  }) => Promise<{ ok: boolean }>;
};

export function createElectronRealtimeHub(electronAPI: ElectronPubNubApi | null | undefined): RealtimeHub {
  let last: PubNubSubscribeParams | null = null;
  let connected = false;
  let reconnecting = false;
  let reconnectDelayMs: number | undefined;
  let lastFailureReason: string | null = null;
  const messageHandlers = new Set<(message: Record<string, unknown>) => void>();
  const statusHandlers = new Set<(status: RealtimeHubStatus) => void>();

  const emitStatus = () => {
    const status: RealtimeHubStatus = {
      connected,
      reconnecting,
      reconnectDelayMs,
      reason: lastFailureReason ?? undefined,
    };
    statusHandlers.forEach((handler) => handler(status));
  };

  const trySubscribe = (params: PubNubSubscribeParams) => {
    const applyFailure = (reason: string) => {
      connected = false;
      reconnecting = true;
      lastFailureReason = reason;
      emitStatus();
      void electronAPI?.appendApiLog?.({
        endpoint: 'pubnub_subscribe',
        status: 0,
        ok: false,
        error: lastFailureReason,
        kind: 'realtime',
      });
      if (lastFailureReason === 'missing_subscribe_key') {
        void electronAPI?.ensureRealtimeConfig?.();
      }
    };
    if (!electronAPI?.pubnubSubscribe) {
      applyFailure('no_electron_api');
      return;
    }
    void electronAPI.pubnubSubscribe(params).then((result) => {
      if (result?.ok) {
        connected = true;
        reconnecting = false;
        lastFailureReason = null;
        emitStatus();
        return;
      }
      applyFailure(result?.reason || 'subscribe_failed');
    }).catch((err: unknown) => {
      applyFailure(err instanceof Error ? err.message : 'subscribe_rejected');
    });
  };

  electronAPI?.onPubNubMessage?.((message) => {
    messageHandlers.forEach((handler) => handler(message));
  });
  electronAPI?.onPubNubStatus?.((status) => {
    connected = status.connected;
    reconnecting = status.reconnecting;
    reconnectDelayMs = status.reconnectDelayMs;
    if (status.connected) lastFailureReason = null;
    else if (status.reason) lastFailureReason = status.reason;
    statusHandlers.forEach((handler) => handler({
      ...status,
      reason: lastFailureReason ?? status.reason,
    }));
  });
  electronAPI?.onRealtimeConfig?.((payload) => {
    if (payload.hasKeys && last) {
      trySubscribe(last);
    }
  });

  return {
    subscribe(params) {
      last = params;
      // Stay disconnected until IPC confirms — optimistic true blocks chat poll fallback.
      connected = false;
      reconnecting = true;
      lastFailureReason = null;
      emitStatus();
      trySubscribe(params);
    },
    resubscribe() {
      if (!last) return;
      reconnecting = false;
      emitStatus();
      void electronAPI?.pubnubResubscribe?.();
    },
    unsubscribe() {
      last = null;
      connected = false;
      reconnecting = false;
      lastFailureReason = null;
      emitStatus();
      void electronAPI?.pubnubUnsubscribe?.();
    },
    isConnected: () => connected,
    getStatus: () => ({ connected, reconnecting, reconnectDelayMs, reason: lastFailureReason ?? undefined }),
    getLastSubscribe: () => last,
    getLastFailureReason: () => lastFailureReason,
    onMessage(handler) {
      messageHandlers.add(handler);
      return () => messageHandlers.delete(handler);
    },
    onStatus(handler) {
      statusHandlers.add(handler);
      return () => statusHandlers.delete(handler);
    },
  };
}
