import assert from 'node:assert/strict';
import test from 'node:test';
import { ClubhouseApiClient } from '../src/api/client.ts';
import { FakeTransport } from '../features/support/fakeTransport.ts';
import { nextBackoffMs } from '../src/api/guards.ts';

function clientWith(transport: FakeTransport, now: { t: number }) {
  return new ClubhouseApiClient({
    useSandbox: false,
    webSession: true,
    userId: 42,
    experimentalActions: true,
    requestLogging: true,
    transport,
    now: () => now.t,
  });
}

test('404 marks the route unsupported for this app version and lists it in API Health', async () => {
  const transport = new FakeTransport();
  transport.willAnswer('set_channel_title', 404, 1);
  const now = { t: Date.parse('2026-10-11T12:00:00Z') };
  const client = clientWith(transport, now);
  await assert.rejects(() => client.setChannelTitle('abc', 'x'));
  assert.equal(client.effectiveEvidence('set_channel_title'), 'unsupported');
  assert.equal(client.supports('set_channel_title'), false);
  const health = client.getApiHealth();
  assert.ok(health.some((entry) => entry.endpoint === 'set_channel_title' && entry.status === 404));
});

test('two consecutive 400 errors disable the route for the session', async () => {
  const transport = new FakeTransport();
  transport.willAnswer('emoji_reaction', 400, 2);
  const now = { t: Date.now() };
  const client = clientWith(transport, now);
  await assert.rejects(() => client.emojiReaction('abc', '🔥'));
  await assert.rejects(() => client.emojiReaction('abc', '🔥'));
  assert.equal(client.isDisabledForSession('emoji_reaction'), true);
  assert.equal(client.supports('emoji_reaction'), false);
});

test('429 backs off 1 then 2 minutes up to 30', async () => {
  assert.equal(nextBackoffMs(0), 60_000);
  assert.equal(nextBackoffMs(60_000), 120_000);
  assert.equal(nextBackoffMs(15 * 60_000), 30 * 60_000);
  assert.equal(nextBackoffMs(30 * 60_000), 30 * 60_000);

  const transport = new FakeTransport();
  transport.willAnswer('get_feed_v3', 429, 1);
  const now = { t: 1_000_000 };
  const client = clientWith(transport, now);
  await assert.rejects(() => client.callEndpoint('get_feed_v3', {}));
  const afterFirst = transport.requests.length;
  await assert.rejects(() => client.callEndpoint('get_feed_v3', {}));
  assert.equal(transport.requests.length, afterFirst);
  now.t += 60_000;
  transport.willAnswer('get_feed_v3', 429, 1);
  await assert.rejects(() => client.callEndpoint('get_feed_v3', {}));
  assert.equal(transport.requests.length, afterFirst + 1);
});

test('401 expires the session; 403 does not', async () => {
  const transport = new FakeTransport();
  const now = { t: Date.now() };
  const client = clientWith(transport, now);
  let expired = false;
  client.onAuthExpired(() => { expired = true; });
  transport.willAnswer('me', 401, 1);
  await assert.rejects(() => client.callEndpoint('me', {}));
  assert.equal(expired, true);

  expired = false;
  transport.willAnswer('me', 403, 1);
  await assert.rejects(() => client.callEndpoint('me', {}));
  assert.equal(expired, false);
});

test('successful logged call can promote community evidence to observed', async () => {
  const transport = new FakeTransport();
  const now = { t: Date.now() };
  const client = clientWith(transport, now);
  await client.endChannel('abc123');
  assert.ok(client.getRequestLog().some((entry) => entry.endpoint === 'end_channel' && entry.status === 200));
  assert.equal(client.promoteFromRequestLog('end_channel'), true);
  assert.equal(client.effectiveEvidence('end_channel'), 'observed');
});
