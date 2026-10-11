export type AgoraJoin = {
  role: 'audience' | 'host';
  token: string;
  published: boolean;
};

/** Records Agora join/leave/publish for room scenarios. */
export class FakeAgora {
  joins: AgoraJoin[] = [];
  left = false;
  broadcastHasSoundboard = false;
  broadcastHasMic = true;

  join(role: 'audience' | 'host', token: string): void {
    this.left = false;
    this.joins.push({ role, token, published: role === 'host' });
  }

  switchToHost(token: string): void {
    this.joins.push({ role: 'host', token, published: true });
  }

  leave(): void {
    this.left = true;
  }

  setBroadcastMix(options: { soundboard: boolean; mic: boolean }): void {
    this.broadcastHasSoundboard = options.soundboard;
    this.broadcastHasMic = options.mic;
  }

  lastJoin(): AgoraJoin | undefined {
    return this.joins[this.joins.length - 1];
  }
}
