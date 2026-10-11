const test = require('node:test');
const assert = require('node:assert/strict');
const { createPubNubClient } = require('./pubnubClient.cjs');

// PubNub /v2/subscribe answers { t: { t: timetoken, r: region }, m: [ { c: channel, d: payload } ] }.
function v2(timetoken, region, messages) {
  return JSON.stringify({ t: { t: timetoken, r: region }, m: messages });
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
  assert.deepEqual(received, [{ action: 'join_channel', channel: 'room1', user_profile: { user_id: 5 } }]);
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
