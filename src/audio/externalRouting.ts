/** Pure routing description for the external audio channel (ST-11). */

export type ExternalRoutePlan = {
  /** Connected to the Agora send bus. */
  toBroadcast: boolean;
  /** Connected to the local recording mix. */
  toRecord: boolean;
  /** Connected to local speakers (only when Monitor external is on). */
  toMonitor: boolean;
  /** Mic mute must never silence this channel. */
  silencedByMicMute: boolean;
  /** Linear gain after mute (0 or openVolume). */
  openGain: number;
};

/**
 * Plan how the external source is wired. Monitor is off by default;
 * mic mute never affects external routing.
 */
export function planExternalRouting(opts: {
  active: boolean;
  muted: boolean;
  monitor: boolean;
  volume: number;
}): ExternalRoutePlan {
  if (!opts.active) {
    return {
      toBroadcast: false,
      toRecord: false,
      toMonitor: false,
      silencedByMicMute: false,
      openGain: 0,
    };
  }
  const openGain = opts.muted ? 0 : Math.max(0, Math.min(1, opts.volume));
  return {
    toBroadcast: true,
    toRecord: true,
    toMonitor: opts.monitor === true,
    silencedByMicMute: false,
    openGain,
  };
}
