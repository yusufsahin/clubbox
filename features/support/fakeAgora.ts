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
  republishCount = 0;
  lastEncoder: 'speech_standard' | 'high_quality_stereo' | null = null;

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

  republish(isMusicMode: boolean): void {
    this.republishCount += 1;
    this.lastEncoder = isMusicMode ? 'high_quality_stereo' : 'speech_standard';
  }

  setBroadcastMix(options: { soundboard: boolean; mic: boolean }): void {
    this.broadcastHasSoundboard = options.soundboard;
    this.broadcastHasMic = options.mic;
  }

  lastJoin(): AgoraJoin | undefined {
    return this.joins[this.joins.length - 1];
  }
}
