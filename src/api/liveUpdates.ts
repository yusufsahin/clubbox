/** Whether the stage should show the “live updates unavailable” note (web session). */
export function isLiveUpdatesUnavailable(input: {
  webSession: boolean;
  inRoom: boolean;
  hasPubnubToken: boolean;
  supportsGetChannel: boolean;
}): boolean {
  if (!input.webSession || !input.inRoom) return false;
  // PubNub is the web realtime path (DESIGN G-03). get_channel is not in the web bundle.
  if (input.hasPubnubToken || input.supportsGetChannel) return false;
  return true;
}
