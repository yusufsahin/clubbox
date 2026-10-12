const test = require('node:test');
const assert = require('node:assert/strict');
const { createPubNubClient, parseHistoryBody } = require('./pubnubClient.cjs');

// PubNub /v2/subscribe answers { t: { t: timetoken, r: region }, m: [ { c: channel, d: payload } ] }.
function v2(timetoken, region, messages) {
  return JSON.stringify({ t: { t: timetoken, r: region }, m: messages });
}

function immediateTimers() {
  return {
    backoffMs: [0],
    setTimeoutFn: (fn) => {
      queueMicrotask(() => fn());
      return 1;
    },
    clearTimeoutFn: () => {},
  };
}

test('subscribes to every room channel and reads v2 envelopes', async () => {
  const urls = [];
  const received = [];
  const answers = [
    v2('100', 4, []),
    v2('101', 4, [{ c: 'channel_all.room1', d: { action: 'join_channel', channel: 'room1', user_profile: { user_id: 5 } } }]),
  ];
  let client;
  client = createPubNubClient({
    fetchFn: async (url) => {
      urls.push(url);
      const body = answers.shift();
      if (body == null) {
        client.stop();
        return { ok: true, status: 200, text: async () => v2('101', 4, []) };
      }
      return { ok: true, status: 200, text: async () => body };
    },
    onMessage: (payload) => received.push(payload),
    onStatus: () => {},
  });
  client.start({
    channelId: 'room1',
    channels: ['users.42', 'channel_user.room1.42', 'channel_all.room1'],
    token: 'tok',
    origin: 'clubhouse.pubnubapi.com',
    uuid: '42',
    heartbeat: 20,
  }, 'sub-c-test');
  for (let i = 0; i < 50 && urls.length < 3; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));

  const first = new URL(urls[0]);
  assert.equal(
    decodeURIComponent(first.pathname),
    '/v2/subscribe/sub-c-test/users.42,channel_user.room1.42,channel_all.room1/0',
  );
  assert.equal(first.searchParams.get('auth'), 'tok');
  const second = new URL(urls[1]);
  assert.equal(second.searchParams.get('tt'), '100', 'timetoken advances from the v2 handshake');
  assert.equal(second.searchParams.get('tr'), '4', 'region is sent back');
  assert.deepEqual(received, [{
    action: 'join_channel',
    channel: 'room1',
    user_profile: { user_id: 5 },
    _pubnub_tt: '101',
  }]);
  assert.equal(client.getLastAppliedTimeToken(), '101');
});

test('falls back to the room id when no channel list is given', async () => {
  const urls = [];
  let client;
  client = createPubNubClient({
    fetchFn: async (url) => {
      urls.push(url);
      client.stop();
      return { ok: true, status: 200, text: async () => v2('1', 1, []) };
    },
    onMessage: () => {},
    onStatus: () => {},
  });
  client.start({ channelId: 'room1', token: 't', origin: 'clubhouse.pubnubapi.com', uuid: '1' }, 'sub-c-test');
  for (let i = 0; i < 20 && urls.length < 1; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.match(decodeURIComponent(new URL(urls[0]).pathname), /\/channel_all\.room1\/0$/);
});

test('resubscribe does not start a second concurrent long-poll', async () => {
  let inflight = 0;
  let maxInflight = 0;
  let client;
  const gate = [];
  client = createPubNubClient({
    fetchFn: async () => {
      inflight += 1;
      maxInflight = Math.max(maxInflight, inflight);
      await new Promise((resolve) => { gate.push(resolve); });
      inflight -= 1;
      return { ok: true, status: 200, text: async () => v2('1', 1, []) };
    },
    onMessage: () => {},
    onStatus: () => {},
  });
  client.start({ channelId: 'room1', token: 't', origin: 'clubhouse.pubnubapi.com', uuid: '1' }, 'sub-c-test');
  for (let i = 0; i < 40 && gate.length < 1; i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
  client.resubscribe();
  client.resubscribe();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(maxInflight, 1, 'only one PubNub long-poll at a time');
  while (gate.length) gate.shift()();
  client.stop();
});

test('parseHistoryBody reads bare payloads and {message,timetoken} rows', () => {
  const bare = parseHistoryBody([[{ action: 'leave_channel', user_id: 1 }], '10', '20']);
  assert.equal(bare.items.length, 1);
  assert.equal(bare.end, '20');
  const wrapped = parseHistoryBody([[
    { message: { action: 'add_speaker', user_id: 2 }, timetoken: '15' },
  ], '10', '20']);
  assert.equal(wrapped.items[0].timetoken, '15');
  assert.equal(wrapped.items[0].payload.action, 'add_speaker');
});

test('on reconnect fetches history since last timetoken when Storage allows it', async () => {
  const urls = [];
  const received = [];
  let subscribePolls = 0;
  let client;
  client = createPubNubClient({
    ...immediateTimers(),
    fetchFn: async (url) => {
      urls.push(url);
      if (url.includes('/v2/history/')) {
        assert.match(url, /\/v2\/history\/sub-c-test\/channel_all\.room1\/0/);
        assert.match(url, /[?&]start=100(?:&|$)/);
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify([
            [{ action: 'add_speaker', channel: 'room1', user_profile: { user_id: 9 } }],
            '100',
            '150',
          ]),
        };
      }
      subscribePolls += 1;
      if (subscribePolls === 1) {
        return { ok: true, status: 200, text: async () => v2('100', 4, []) };
      }
      if (subscribePolls === 2) {
        return { ok: false, status: 500, text: async () => 'boom' };
      }
      client.stop();
      return { ok: true, status: 200, text: async () => v2('200', 4, []) };
    },
    onMessage: (payload) => received.push(payload),
    onStatus: () => {},
  });
  client.start({
    channelId: 'room1',
    channels: ['channel_all.room1'],
    token: 'tok',
    origin: 'clubhouse.pubnubapi.com',
    uuid: '42',
  }, 'sub-c-test');

  for (let i = 0; i < 80 && !received.some((m) => m.action === 'add_speaker'); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(urls.some((u) => u.includes('/v2/history/')));
  assert.ok(received.some((m) => m.action === 'add_speaker' && m._pubnub_tt === '150'));
  assert.equal(client.getHistorySupported(), true);
  assert.equal(client.getLastAppliedTimeToken(), '150');
  client.stop();
});

test('history 403 disables further history attempts; reconnect still resumes subscribe', async () => {
  const historyUrls = [];
  let subscribePolls = 0;
  let client;
  client = createPubNubClient({
    ...immediateTimers(),
    fetchFn: async (url) => {
      if (url.includes('/v2/history/')) {
        historyUrls.push(url);
        return { ok: false, status: 403, text: async () => 'Forbidden' };
      }
      subscribePolls += 1;
      if (subscribePolls === 1) {
        return { ok: true, status: 200, text: async () => v2('50', 1, []) };
      }
      if (subscribePolls === 2 || subscribePolls === 4) {
        return { ok: false, status: 500, text: async () => 'boom' };
      }
      if (subscribePolls >= 5) {
        client.stop();
      }
      return { ok: true, status: 200, text: async () => v2(String(50 + subscribePolls), 1, []) };
    },
    onMessage: () => {},
    onStatus: () => {},
  });
  client.start({
    channelId: 'room1',
    channels: ['channel_all.room1'],
    token: 't',
    origin: 'clubhouse.pubnubapi.com',
    uuid: '1',
  }, 'sub-c-test');

  for (let i = 0; i < 100 && historyUrls.length < 1; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  for (let i = 0; i < 100 && subscribePolls < 5; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(historyUrls.length, 1, 'history tried once');
  assert.equal(client.getHistorySupported(), false);
  assert.ok(subscribePolls >= 3, 'subscribe resumes without inventing state');
  client.stop();
});
