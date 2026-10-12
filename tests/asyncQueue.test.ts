import assert from 'node:assert/strict';
import test from 'node:test';
import { createExclusiveQueue } from '../src/audio/asyncQueue.ts';

test('createExclusiveQueue runs tasks one after another', async () => {
  const enqueue = createExclusiveQueue();
  const order: number[] = [];
  const a = enqueue(async () => {
    order.push(1);
    await new Promise((r) => setTimeout(r, 20));
    order.push(2);
    return 'a';
  });
  const b = enqueue(async () => {
    order.push(3);
    return 'b';
  });
  assert.deepEqual(await Promise.all([a, b]), ['a', 'b']);
  assert.deepEqual(order, [1, 2, 3]);
});
