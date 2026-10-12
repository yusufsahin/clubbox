import assert from 'node:assert/strict';
import test from 'node:test';
import { PubNubRoomSource } from '../src/api/pubnubRoomSource.ts';
import { FakePubNub } from '../features/support/fakePubnub.ts';

test('PubNub source connects with join token and stays connected across pause', async () => {
  const hub = new FakePubNub();
  const source = new PubNubRoomSource({ hub, myUserId: 42 });
  source.setChannel({
    channel: 'abc123',
    channel_id: 'abc123',
    topic: 'Test',
    users: [],
    num_speakers: 0,
    num_all: 0,
    pubnub_token: 'pubnub_token_fixture',
    pubnub_origin: 'clubhouse.pubnubapi.com',
  });
  source.setToken('pubnub_token_fixture');
  source.start('abc123');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(source.isConnected(), true);
  source.pause();
  assert.equal(source.isConnected(), false);
  assert.equal(source.resume(), true);
  assert.equal(source.isConnected(), true);
  source.stop();
  assert.equal(source.isConnected(), false);
});

test('unknown PubNub types report type and keys only', () => {
  const seen: Array<{ type: string; keys: string[] }> = [];
  const hub = new FakePubNub();
  const source = new PubNubRoomSource({
    hub,
    myUserId: 42,
    onUnknownMessage: (message) => seen.push(message),
  });
  source.setChannel({
    channel: 'abc123',
    channel_id: 'abc123',
    topic: 'Test',
    users: [],
    num_speakers: 0,
    num_all: 0,
    pubnub_token: 'token',
  });
  source.handleMessage({ type: 'channel_message', channel: 'x', text: 'hi' });
  source.handleMessage({ type: 'weird_event', foo: 1, bar: 2 });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].type, 'weird_event');
  assert.deepEqual(seen[0].keys, ['bar', 'foo', 'type']);
});

test('records last applied PubNub timetoken from _pubnub_tt', () => {
  const hub = new FakePubNub();
  const source = new PubNubRoomSource({ hub, myUserId: 42 });
  source.setChannel({
    channel: 'abc123',
    channel_id: 1,
    topic: 'Test',
    is_private: false,
    users: [],
    num_speakers: 0,
    num_all: 0,
    pubnub_token: 'token',
  });
  source.start('abc123');
  assert.equal(source.getLastPubnubTimetoken(), null);
  source.handleMessage({
    action: 'set_channel_title',
    channel: 'abc123',
    title: 'Hi',
    _pubnub_tt: '999001',
  });
  assert.equal(source.getLastPubnubTimetoken(), '999001');
  source.stop();
});
