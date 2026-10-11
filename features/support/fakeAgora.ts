export type AgoraJoin = {
  role: 'audience' | 'host';
  token: string;
  published: boolean;
};

export type RemoteMuteReport = { uid: number | string; muted: boolean };

/** Records Agora join/leave/publish for room scenarios. */
export class FakeAgora {
  joins: AgoraJoin[] = [];
  left = false;
  broadcastHasSoundboard = false;
  broadcastHasMic = true;
  republishCount = 0;
  lastEncoder: 'speech_standard' | 'high_quality_stereo' | null = null;
  private muteListeners: ((report: RemoteMuteReport) => void)[] = [];

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

  onRemoteMute(cb: (report: RemoteMuteReport) => void): () => void {
    this.muteListeners.push(cb);
    return () => {
      this.muteListeners = this.muteListeners.filter((listener) => listener !== cb);
    };
  }

  /** Simulate Agora user-info-updated mute-audio / unmute-audio (uid = Clubhouse user_id). */
  reportMute(uid: number | string, muted: boolean): void {
    for (const listener of this.muteListeners) listener({ uid, muted });
  }

  reportUserInfoUpdated(uid: number | string, msg: 'mute-audio' | 'unmute-audio'): void {
    this.reportMute(uid, msg === 'mute-audio');
  }

  reportAudioPublished(uid: number | string): void {
    this.reportMute(uid, false);
  }

  reportAudioUnpublished(uid: number | string): void {
    this.reportMute(uid, true);
  }
}
