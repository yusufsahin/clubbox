/**
 * ModerationProvider — sole gate between room UI and host-tool client calls.
 * See docs/investigations/moderation-api-investigation.md §4.
 *
 * Today only AppOnlyModerationProvider is active. No mobile provider.
 */

import type { UserCapabilities } from './roomControls.ts';

export type ModerationAction =
  | 'invite_speaker'
  | 'uninvite_speaker'
  | 'mute_speaker'
  | 'make_moderator'
  | 'block_from_channel'
  | 'end_channel'
  | 'mute_all'
  | 'set_handraise';

export type ModerationErrorKind =
  | 'app_only'
  | 'not_authenticated'
  | 'not_permitted'
  | 'not_found'
  | 'bad_request'
  | 'rate_limited'
  | 'network';

export type ModerationCapability = {
  action: ModerationAction;
  available: boolean;
  reason?: ModerationErrorKind;
  evidence?: 'observed' | 'bundle';
};

export type ModerationError = {
  kind: ModerationErrorKind;
  message?: string;
};

export type ModerationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ModerationError };

export type RoomContext = {
  channel: string;
  userCapabilities?: UserCapabilities;
  isModerator: boolean;
};

export interface ModerationProvider {
  readonly id: 'web' | 'app-only';
  capabilities(room: RoomContext): ModerationCapability[];
  perform(
    action: ModerationAction,
    room: RoomContext,
    target?: number,
  ): Promise<ModerationResult<void>>;
}

export const MODERATION_ACTIONS: readonly ModerationAction[] = [
  'invite_speaker',
  'uninvite_speaker',
  'mute_speaker',
  'make_moderator',
  'block_from_channel',
  'end_channel',
  'mute_all',
  'set_handraise',
] as const;

/** Default today: every host action is app-only; perform never sends a request. */
export class AppOnlyModerationProvider implements ModerationProvider {
  readonly id = 'app-only' as const;

  capabilities(_room: RoomContext): ModerationCapability[] {
    return MODERATION_ACTIONS.map((action) => ({
      action,
      available: false,
      reason: 'app_only' as const,
    }));
  }

  async perform(
    _action: ModerationAction,
    _room: RoomContext,
    _target?: number,
  ): Promise<ModerationResult<void>> {
    return { ok: false, error: { kind: 'app_only' } };
  }
}

const appOnlyProvider = new AppOnlyModerationProvider();

/** Active provider. Always app-only until WebModerationProvider is wired (Phase 30.2). */
export function getModerationProvider(): ModerationProvider {
  return appOnlyProvider;
}

/** True when any moderation action is live-callable for this room. */
export function anyModerationAvailable(provider: ModerationProvider, room: RoomContext): boolean {
  return provider.capabilities(room).some((cap) => cap.available);
}

/** Map UI / endpoint names onto ModerationAction. */
export function moderationActionFromEndpoint(endpoint: string): ModerationAction | null {
  switch (endpoint) {
    case 'invite_speaker':
    case 'uninvite_speaker':
    case 'mute_speaker':
    case 'make_moderator':
    case 'block_from_channel':
    case 'end_channel':
      return endpoint;
    case 'change_handraise_settings':
    case 'update_handraise_queue_setting':
      return 'set_handraise';
    default:
      return null;
  }
}
