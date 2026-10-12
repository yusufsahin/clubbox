import assert from 'node:assert/strict';
import { Then } from '@cucumber/cucumber';
import { documentedBodyKeys, documentedQueryKeys } from '../../src/api/documentedBodies.ts';
import type { ClubboxWorld } from '../support/world.ts';

function lastMatching(world: ClubboxWorld, method: string, path: string) {
  const matches = world.transport.requests.filter((req) => req.method === method && req.path.startsWith(path));
  return matches[matches.length - 1];
}

Then(
  'a {string} request is sent with the documented body keys',
  function (this: ClubboxWorld, request: string) {
    const [method, path] = request.split(/\s+/);
    const endpoint = path.replace(/^\/(?:web_api|api)\//, '');
    const match = lastMatching(this, method, path);
    const expected = documentedBodyKeys(endpoint);
    if (expected.length === 0) {
      assert.deepEqual(Object.keys(match.body ?? {}).sort(), []);
      return;
    }
    assert.ok(match, `expected ${method} ${path}`);
    assert.deepEqual(Object.keys(match.body ?? {}).sort(), expected.sort());
  },
);

Then(
  'a {string} request is sent with query keys {string}',
  function (this: ClubboxWorld, request: string, keys: string) {
    const [method, path] = request.split(/\s+/);
    const expected = keys.split(',').map((key) => key.trim()).filter(Boolean).sort();
    const match = lastMatching(this, method, path);
    assert.ok(match, `expected ${method} ${path}`);
    const actual = Object.keys(match.body ?? {}).sort();
    assert.deepEqual(actual, expected);
    const queryKeys = documentedQueryKeys(path.replace(/^\/(?:web_api|api)\//, ''));
    if (queryKeys.length > 0) {
      assert.deepEqual(actual, queryKeys.sort());
    }
  },
);
