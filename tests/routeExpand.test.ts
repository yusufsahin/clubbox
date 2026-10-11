import assert from 'node:assert/strict';
import { test } from 'node:test';
import { expandRoutePath } from '../src/api/routeExpand.ts';

test('expandRoutePath fills path params and strips them from the body', () => {
  const { pathName, body } = expandRoutePath(
    { path: '/web_api/get_replay_channel_chunk/{channel}/{chunk}', pathParams: ['channel', 'chunk'] },
    { channel: 'r1', chunk: '0', extra: 1 },
  );
  assert.equal(pathName, '/web_api/get_replay_channel_chunk/r1/0');
  assert.deepEqual(body, { extra: 1 });
});

test('expandRoutePath maps highlight_id onto {id}', () => {
  const { pathName, body } = expandRoutePath(
    { path: '/web_api/get_highlight/{id}/', pathParams: ['id'] },
    { highlight_id: 'hl-1' },
  );
  assert.equal(pathName, '/web_api/get_highlight/hl-1/');
  assert.deepEqual(body, {});
});
