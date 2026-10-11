import assert from 'node:assert/strict';
import test from 'node:test';
import { ClubhouseApiClient } from '../src/api/client.ts';
import { FEED_MAX_PAGES, mergeFeedChannels, nextFeedCursor } from '../src/api/feedPagination.ts';
import type { ApiTransport, RequestBody } from '../src/api/client.ts';
import type { CHChannel } from '../src/api/types.ts';

function room(channel: string): CHChannel {
  return {
    channel_id: channel,
    channel,
    topic: channel,
    is_private: false,
    num_speakers: 1,
    num_all: 1,
    users: [],
  };
}

test('mergeFeedChannels keeps order and drops duplicate hashes', () => {
  const merged = mergeFeedChannels([
    [room('a'), room('b')],
    [room('b'), room('c')],
  ]);
  assert.deepEqual(merged.map((entry) => entry.channel), ['a', 'b', 'c']);
});

test('nextFeedCursor stops on empty or repeat', () => {
  assert.equal(nextFeedCursor({ next_cursor: 'page2' }), 'page2');
  assert.equal(nextFeedCursor({ next_cursor: '' }), null);
  assert.equal(nextFeedCursor({ next_cursor: null }), null);
  assert.equal(nextFeedCursor({ next_cursor: 'page2' }, 'page2'), null);
});

test('getChannels follows next_cursor across pages up to the cap', async () => {
  const calls: Array<RequestBody | null | undefined> = [];
  const transport: ApiTransport = {
    async request(input) {
      calls.push(input.body);
      const cursor = input.body && typeof input.body === 'object' && !Array.isArray(input.body)
        ? (input.body as { next_cursor?: string }).next_cursor
        : undefined;
      if (!cursor) {
        return {
          ok: true,
          status: 200,
          body: JSON.stringify({
            success: true,
            items: [{ channel: { channel: 'p1', channel_id: '1', topic: 'One', users: [], num_all: 1, num_speakers: 1 } }],
            available_topics: [{ key: 'tech', display_name: 'Tech' }],
            next_cursor: 'cursor-2',
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        body: JSON.stringify({
          success: true,
          items: [{ channel: { channel: 'p2', channel_id: '2', topic: 'Two', users: [], num_all: 2, num_speakers: 1 } }],
          next_cursor: null,
        }),
      };
    },
  };

  const client = new ClubhouseApiClient({
    useSandbox: false,
    webSession: true,
    userId: 1,
    experimentalActions: true,
    transport,
  });
  const res = await client.getChannels();
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], {});
  assert.deepEqual(calls[1], { next_cursor: 'cursor-2' });
  assert.equal(res.channels.length, 2);
  assert.deepEqual(res.channels.map((c) => c.channel), ['p1', 'p2']);
  assert.equal(res.available_topics?.[0]?.key, 'tech');
  assert.ok(FEED_MAX_PAGES >= 2);
});
