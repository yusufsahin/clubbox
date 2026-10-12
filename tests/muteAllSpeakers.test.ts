import assert from 'node:assert/strict';
import test from 'node:test';
import { muteAllSpeakers } from '../src/api/muteAllSpeakers.ts';

test('muteAllSpeakers skips self and already muted; 150ms between calls', async () => {
  const called: number[] = [];
  const delays: number[] = [];
  const result = await muteAllSpeakers(
    [
      { user_id: 1, is_speaker: true },
      { user_id: 2, is_speaker: true, is_muted: true },
      { user_id: 3, is_speaker: true },
      { user_id: 4, is_speaker: false },
    ],
    1,
    {
      muteSpeaker: async (id) => { called.push(id); },
      delayMs: 150,
      sleep: async (ms) => { delays.push(ms); },
    },
  );
  assert.deepEqual(called, [3]);
  assert.deepEqual(delays, []);
  assert.deepEqual(result, { muted: 1, total: 1, stoppedOnForbidden: false });
});

test('muteAllSpeakers spaces multiple mutes and stops on 403', async () => {
  const called: number[] = [];
  const delays: number[] = [];
  const result = await muteAllSpeakers(
    [
      { user_id: 10, is_speaker: true },
      { user_id: 11, is_speaker: true },
      { user_id: 12, is_speaker: true },
    ],
    99,
    {
      muteSpeaker: async (id) => {
        called.push(id);
        if (id === 11) {
          const err = Object.assign(new Error('forbidden'), { status: 403 });
          throw err;
        }
      },
      delayMs: 150,
      sleep: async (ms) => { delays.push(ms); },
    },
  );
  assert.deepEqual(called, [10, 11]);
  assert.deepEqual(delays, [150]);
  assert.deepEqual(result, { muted: 1, total: 3, stoppedOnForbidden: true });
});
