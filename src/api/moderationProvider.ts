/**
 * ModerationProvider — sole gate between room UI and host-tool client calls.
 * See docs/investigations/moderation-api-investigation.md §4.
 *
 * Default today: AppOnly. WebModerationProvider activates an action only when
 * evidence is `observed` (bundle discovery + live 2xx) and can_* allows it.
 * No mobile provider.
 */

import type { Evidence } from './capabilities.ts';
import { permissionOn } from './roomActions.ts';
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

/** Endpoint name used for evidence / canCall for each action. */
export function endpointForModerationAction(action: ModerationAction): string {
  switch (action) {
    case 'mute_all':
      return 'mute_speaker';
    case 'set_handraise':
      return 'change_handraise_settings';
    case 'invite_speaker':
    case 'uninvite_speaker':
    case 'mute_speaker':
    case 'make_moderator':
    case 'block_from_channel':
    case 'end_channel':
      return action;
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

function capabilityKeyFor(action: ModerationAction): string | null {
  switch (action) {
    case 'mute_speaker':
    case 'mute_all':
      return 'can_mute_speakers';
    case 'make_moderator':
    case 'uninvite_speaker':
    case 'block_from_channel':
      return 'can_remove_speakers';
    case 'invite_speaker':
      return 'can_invite';
    case 'end_channel':
      return 'can_end_room';
    case 'set_handraise':
      return 'can_edit_handraise_queue';
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function capabilityAllowsAction(
  action: ModerationAction,
  caps: UserCapabilities | undefined,
): boolean {
  const key = capabilityKeyFor(action);
  if (!key) return true;
  if (!caps || !(key in caps)) return true;
  return permissionOn(caps[key]);
}

/** Map HTTP / transport failures to ModerationErrorKind (section 5 row 4). */
export function mapHttpStatusToModerationKind(
  status: number,
  opts?: { network?: boolean },
): ModerationErrorKind {
  if (opts?.network || status === 0) return 'network';
  switch (status) {
    case 400:
      return 'bad_request';
    case 401:
      return 'not_authenticated';
    case 403:
      return 'not_permitted';
    case 404:
    case 405:
      return 'not_found';
    case 429:
      return 'rate_limited';
    default:
      return 'network';
  }
}

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

export type WebModerationDeps = {
  evidenceOf: (endpoint: string) => Evidence;
  /** Invoked only when capabilities() says available. Must throw on HTTP failure. */
  performCall?: (
    action: ModerationAction,
    room: RoomContext,
    target?: number,
  ) => Promise<void>;
  statusOfError?: (err: unknown) => number;
};

/**
 * Web path: available only when evidence is `observed` AND can_* / moderator allow it.
 * `bundle` alone keeps the control disabled (Verified by use).
 */
export class WebModerationProvider implements ModerationProvider {
  readonly id = 'web' as const;
  private readonly deps: WebModerationDeps;

  constructor(deps: WebModerationDeps) {
    this.deps = deps;
  }

  capabilities(room: RoomContext): ModerationCapability[] {
    return MODERATION_ACTIONS.map((action) => this.capabilityFor(action, room));
  }

  private capabilityFor(action: ModerationAction, room: RoomContext): ModerationCapability {
    const endpoint = endpointForModerationAction(action);
    const evidence = this.deps.evidenceOf(endpoint);
    const evidenceTag = evidence === 'observed' || evidence === 'bundle' ? evidence : undefined;

    if (!room.isModerator || !capabilityAllowsAction(action, room.userCapabilities)) {
      return {
        action,
        available: false,
        reason: 'not_permitted',
        evidence: evidenceTag,
      };
    }
    if (evidence === 'observed') {
      return { action, available: true, evidence: 'observed' };
    }
    if (evidence === 'bundle') {
      return { action, available: false, reason: 'app_only', evidence: 'bundle' };
    }
    return { action, available: false, reason: 'app_only' };
  }

  async perform(
    action: ModerationAction,
    room: RoomContext,
    target?: number,
  ): Promise<ModerationResult<void>> {
    const cap = this.capabilityFor(action, room);
    if (!cap.available) {
      return { ok: false, error: { kind: cap.reason ?? 'app_only' } };
    }
    if (!this.deps.performCall) {
      return { ok: false, error: { kind: 'app_only' } };
    }
    try {
      await this.deps.performCall(action, room, target);
      return { ok: true, value: undefined };
    } catch (err) {
      const status = this.deps.statusOfError?.(err)
        ?? (err && typeof err === 'object' && 'status' in err
          ? Number((err as { status: unknown }).status)
          : 0);
      const network = status === 0
        || (err instanceof Error && /network|timeout|fetch/i.test(err.message));
      return {
        ok: false,
        error: {
          kind: mapHttpStatusToModerationKind(status, { network }),
          message: err instanceof Error ? err.message : undefined,
        },
      };
    }
  }
}

const appOnlyProvider = new AppOnlyModerationProvider();
let activeProvider: ModerationProvider = appOnlyProvider;

/** Active provider (AppOnly until setModerationProvider wires Web). */
export function getModerationProvider(): ModerationProvider {
  return activeProvider;
}

export function setModerationProvider(provider: ModerationProvider): void {
  activeProvider = provider;
}

/** Test / shutdown helper. */
export function resetModerationProvider(): void {
  activeProvider = appOnlyProvider;
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
