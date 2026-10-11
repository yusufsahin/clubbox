import assert from 'node:assert/strict';
import test from 'node:test';
import webApiRoutes from '../electron/webApiRoutes.json' with { type: 'json' };
import { expectedMutation } from '../src/api/mutationFlags.ts';

test('every route has the mutation flag required by api_health.feature', () => {
  const routes = webApiRoutes as Record<string, { mutation?: boolean }>;
  const wrong: string[] = [];
  for (const [name, route] of Object.entries(routes)) {
    const want = expectedMutation(name);
    if (route.mutation !== want) wrong.push(`${name}: got ${String(route.mutation)}, want ${want}`);
  }
  assert.deepEqual(wrong, []);
});
