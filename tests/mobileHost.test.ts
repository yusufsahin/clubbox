import assert from 'node:assert/strict';
import test from 'node:test';
import { ClubhouseApiClient } from '../src/api/client.ts';
import { FakeTransport } from '../features/support/fakeTransport.ts';

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

test('live web-session routes moderation through mobileCall IPC', async () => {
  const calls: MobileCall[] = [];
  const restore = installFakeMobile(calls);
  try {
    const client = new ClubhouseApiClient({
      useSandbox: false,
      webSession: true,
      userId: 42,
    });
    assert.equal(client.isMobileLinked(), true);
    assert.equal(client.supports('mute_speaker'), true);
    await client.muteSpeaker('abc123', 7);
    await client.inviteSpeaker('abc123', 9);
    await client.endChannel('abc123', 55);
    assert.deepEqual(calls.map((c) => c.endpoint), ['mute_speaker', 'invite_speaker', 'end_channel']);
    assert.deepEqual(calls[0]?.body, { channel: 'abc123', user_id: 7 });
    assert.deepEqual(calls[2]?.body, { channel: 'abc123', channel_id: 55 });
  } finally {
    restore();
  }
});

test('moveToAudience sends mute_speaker then uninvite_speaker', async () => {
  const transport = new FakeTransport();
  const client = new ClubhouseApiClient({
    useSandbox: false,
    webSession: true,
    userId: 42,
    transport,
  });
  await client.moveToAudience('abc123', 7);
  assert.deepEqual(
    transport.requests.map((r) => r.endpoint),
    ['mute_speaker', 'uninvite_speaker'],
  );
  assert.deepEqual(transport.requests[0]?.body, { channel: 'abc123', user_id: 7 });
  assert.deepEqual(transport.requests[1]?.body, { channel: 'abc123', user_id: 7 });
});

test('host tools stay hidden when web session (mobile link) is absent', () => {
  const client = new ClubhouseApiClient({
    useSandbox: false,
    webSession: false,
    userId: null,
  });
  assert.equal(client.isMobileLinked(), false);
  assert.equal(client.supports('mute_speaker'), false);
  assert.equal(client.supports('end_channel'), false);
  assert.equal(client.supports('make_moderator'), false);
});

test('sandbox still supports moderation without a mobile link flag', () => {
  const client = new ClubhouseApiClient({ useSandbox: true });
  assert.equal(client.supports('mute_speaker'), true);
  assert.equal(client.supports('end_channel'), true);
  assert.equal(client.supports('make_moderator'), true);
});
