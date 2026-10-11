import type { PubNubSubscribeParams, RealtimeHub, RealtimeHubStatus } from '../../src/api/realtimeHub.ts';

export class FakePubNub implements RealtimeHub {
  subscriptions: PubNubSubscribeParams[] = [];
  disconnected = false;
  reconnectDelays: number[] = [];
  resubscribeCount = 0;
  private last: PubNubSubscribeParams | null = null;
  private connected = false;
  private reconnecting = false;
  private reconnectDelayMs: number | undefined;
  private messageHandlers = new Set<(message: Record<string, unknown>) => void>();
  private statusHandlers = new Set<(status: RealtimeHubStatus) => void>();

  subscribe(params: PubNubSubscribeParams): void {
    this.last = params;
    this.disconnected = false;
    this.connected = true;
    this.reconnecting = false;
    this.subscriptions.push(params);
    this.emitStatus();
  }

  resubscribe(): void {
    this.resubscribeCount += 1;
    if (this.last) this.subscriptions.push({ ...this.last });
    this.connected = true;
    this.reconnecting = false;
    this.emitStatus();
  }

  unsubscribe(): void {
    this.last = null;
    this.connected = false;
    this.reconnecting = false;
    this.emitStatus();
  }

  isConnected(): boolean {
    return this.connected && !this.disconnected;
  }

  getStatus(): RealtimeHubStatus {
    return { connected: this.isConnected(), reconnecting: this.reconnecting, reconnectDelayMs: this.reconnectDelayMs };
  }

  getLastSubscribe(): PubNubSubscribeParams | null {
    return this.last;
  }

  onMessage(handler: (message: Record<string, unknown>) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStatus(handler: (status: RealtimeHubStatus) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  emit(message: Record<string, unknown>): void {
    this.messageHandlers.forEach((handler) => handler(message));
  }

  simulateDisconnect(): void {
    this.disconnected = true;
    this.connected = false;
    this.emitStatus();
  }

  simulateReconnect(delayMs: number): void {
    this.reconnecting = true;
    this.reconnectDelayMs = delayMs;
    this.reconnectDelays.push(delayMs);
    this.emitStatus();
    this.reconnecting = false;
    this.disconnected = false;
    this.connected = true;
    this.emitStatus();
  }

  private emitStatus(): void {
    const status = this.getStatus();
    this.statusHandlers.forEach((handler) => handler(status));
  }
}
