import assert from 'node:assert/strict';
import test from 'node:test';
import { ClubhouseApiClient } from '../src/api/client.ts';

test('sandbox get_channels pages with next_cursor so Load more can continue', async () => {
  const client = new ClubhouseApiClient({ useSandbox: true });
  const first = await client.getChannelsPage();
  assert.ok(first.channels.length >= 1);
  assert.ok(first.next_cursor, 'first page must expose a cursor when more rooms exist');
  assert.ok(Array.isArray(first.available_topics));

  const second = await client.getChannelsPage({ nextCursor: first.next_cursor });
  assert.ok(second.channels.length >= 1);
  const overlap = first.channels.some((a) => second.channels.some((b) => a.channel === b.channel));
  assert.equal(overlap, false, 'pages must not repeat the same channel hash');

  // Exhaust remaining pages; cursor becomes null.
  let cursor = second.next_cursor;
  let guard = 0;
  while (cursor && guard < 8) {
    const page = await client.getChannelsPage({ nextCursor: cursor });
    cursor = page.next_cursor ?? null;
    guard += 1;
  }
  assert.equal(cursor, null);
});

test('next page body sends next_cursor only', async () => {
  const bodies: unknown[] = [];
  const client = new ClubhouseApiClient({
    useSandbox: false,
    webSession: true,
    userId: 1,
    transport: {
      async request(input) {
        bodies.push(input.body);
        const cursor = input.body && typeof input.body === 'object' && !Array.isArray(input.body)
          ? (input.body as { next_cursor?: string }).next_cursor
          : undefined;
        if (!cursor) {
          return {
            ok: true,
            status: 200,
            body: JSON.stringify({
              success: true,
              items: [{ channel: { channel: 'a', channel_id: '1', topic: 'A', users: [], num_all: 1, num_speakers: 1 } }],
              next_cursor: 'c2',
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          body: JSON.stringify({
            success: true,
            items: [{ channel: { channel: 'b', channel_id: '2', topic: 'B', users: [], num_all: 1, num_speakers: 1 } }],
            next_cursor: null,
          }),
        };
      },
    },
  });
  const first = await client.getChannelsPage();
  await client.getChannelsPage({ nextCursor: first.next_cursor });
  assert.deepEqual(bodies[0], {});
  assert.deepEqual(bodies[1], { next_cursor: 'c2' });
});
