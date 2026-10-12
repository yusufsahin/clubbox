import assert from 'node:assert/strict';
import test from 'node:test';
import { ClubhouseApiClient } from '../src/api/client.ts';
import { roomListenerActionFlags } from '../src/api/roomControls.ts';
import { roomActionsFor } from '../src/api/roomCardActions.ts';

type MobileCall = { endpoint: string; body: Record<string, unknown> | undefined };

function installFakeMobile(calls: MobileCall[]): () => void {
  const previous = (globalThis as { window?: unknown }).window;
  const mobileCall = async (endpoint: string, body?: Record<string, unknown>) => {
    calls.push({ endpoint, body });
    return { ok: true, status: 200, body: JSON.stringify({ success: true }) };
  };
  (globalThis as { window: { electronAPI: { mobileCall: typeof mobileCall } } }).window = {
    electronAPI: { mobileCall },
  };
  return () => {
    if (previous === undefined) delete (globalThis as { window?: unknown }).window;
    else (globalThis as { window: unknown }).window = previous;
  };
}

test('reject / ping / hide / save_replay stay blocked on live (app-only host tools)', async () => {
  const calls: MobileCall[] = [];
  const restore = installFakeMobile(calls);
  try {
    const client = new ClubhouseApiClient({
      useSandbox: false,
      webSession: true,
      userId: 42,
    });
    await assert.rejects(() => client.rejectSpeakerInvite('abc123', 42));
    await assert.rejects(() => client.inviteToExistingChannel('abc123', 7));
    await assert.rejects(() => client.hideChannel('abc123', true));
    await assert.rejects(() => client.saveReplay('abc123'));
    assert.deepEqual(calls, []);
  } finally {
    restore();
  }
});

test('save replay is hidden when replay is off or can_save is false', () => {
  const supports = (endpoint: string) => endpoint === 'save_replay' || endpoint === 'hide_channel';
  assert.equal(
    roomListenerActionFlags({ is_replay_enabled: true }, supports).canSaveReplay,
    true,
  );
  assert.equal(
    roomListenerActionFlags({ is_replay_enabled: false }, supports).canSaveReplay,
    false,
  );
  assert.equal(
    roomListenerActionFlags(
      { is_replay_enabled: true, user_capabilities: { can_save: false } },
      supports,
    ).canSaveReplay,
    false,
  );
});

test('leave stage stays hidden until self-uninvite is verified', () => {
  assert.deepEqual(
    roomActionsFor('speaker', {
      canMute: false,
      canMakeModerator: false,
      canMoveToAudience: false,
      canInvite: false,
      canBlock: false,
      canLeaveStage: false,
    }, { isSelf: true, isSpeaker: true, isModerator: false }),
    ['leave_room'],
  );
});
