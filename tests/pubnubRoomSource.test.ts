import assert from 'node:assert/strict';
import test from 'node:test';
import { PubNubRoomSource } from '../src/api/pubnubRoomSource.ts';

test('PubNub source connects with join token and stays connected across pause', () => {
  let disconnected = false;
  const source = new PubNubRoomSource({
    connect: () => ({
      disconnect: () => {
        disconnected = true;
      },
    }),
  });
  source.setToken('pubnub_token_fixture');
  source.start('abc123');
  assert.equal(source.isConnected(), true);
  source.pause();
  assert.equal(source.isConnected(), false);
  assert.equal(source.resume(), true);
  assert.equal(source.isConnected(), true);
  source.stop();
  assert.equal(disconnected, true);
  assert.equal(source.isConnected(), false);
});

test('unknown PubNub types report type and keys only', () => {
  const seen: Array<{ type: string; keys: string[] }> = [];
  const source = new PubNubRoomSource({
    onUnknownMessage: (message) => seen.push(message),
  });
  source.handleMessage({ type: 'channel_message', channel: 'x', text: 'hi' });
  source.handleMessage({ type: 'weird_event', foo: 1, bar: 2 });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].type, 'weird_event');
  assert.deepEqual(seen[0].keys, ['bar', 'foo', 'type']);
});
