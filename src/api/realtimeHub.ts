export type PubNubSubscribeParams = {
  channelId: string;
  token: string;
  origin: string;
  uuid: string;
  heartbeat?: number;
  heartbeatInterval?: number;
  timeToken?: string;
};

export type RealtimeHubStatus = {
  connected: boolean;
  reconnecting: boolean;
  reconnectDelayMs?: number;
};

export type RealtimeHub = {
  subscribe(params: PubNubSubscribeParams): void;
  resubscribe(): void;
  unsubscribe(): void;
  isConnected(): boolean;
  getStatus(): RealtimeHubStatus;
  getLastSubscribe(): PubNubSubscribeParams | null;
  onMessage(handler: (message: Record<string, unknown>) => void): () => void;
  onStatus(handler: (status: RealtimeHubStatus) => void): () => void;
};

type ElectronPubNubApi = {
  pubnubSubscribe?: (params: PubNubSubscribeParams) => Promise<{ ok: boolean }>;
  pubnubResubscribe?: () => Promise<{ ok: boolean }>;
  pubnubUnsubscribe?: () => Promise<{ ok: boolean }>;
  onPubNubMessage?: (handler: (message: Record<string, unknown>) => void) => () => void;
  onPubNubStatus?: (handler: (status: RealtimeHubStatus) => void) => () => void;
};

export function createElectronRealtimeHub(electronAPI: ElectronPubNubApi | null | undefined): RealtimeHub {
  let last: PubNubSubscribeParams | null = null;
  let connected = false;
  let reconnecting = false;
  let reconnectDelayMs: number | undefined;
  const messageHandlers = new Set<(message: Record<string, unknown>) => void>();
  const statusHandlers = new Set<(status: RealtimeHubStatus) => void>();

  const emitStatus = () => {
    const status = { connected, reconnecting, reconnectDelayMs };
    statusHandlers.forEach((handler) => handler(status));
  };

  electronAPI?.onPubNubMessage?.((message) => {
    messageHandlers.forEach((handler) => handler(message));
  });
  electronAPI?.onPubNubStatus?.((status) => {
    connected = status.connected;
    reconnecting = status.reconnecting;
    reconnectDelayMs = status.reconnectDelayMs;
    statusHandlers.forEach((handler) => handler(status));
  });

  return {
    subscribe(params) {
      last = params;
      connected = true;
      reconnecting = false;
      emitStatus();
      void electronAPI?.pubnubSubscribe?.(params);
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
      emitStatus();
      void electronAPI?.pubnubUnsubscribe?.();
    },
    isConnected: () => connected,
    getStatus: () => ({ connected, reconnecting, reconnectDelayMs }),
    getLastSubscribe: () => last,
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
