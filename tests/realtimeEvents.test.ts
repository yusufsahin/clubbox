import assert from 'node:assert/strict';
import test from 'node:test';
import { applyStageEvent, parseRealtimeMessage } from '../src/api/realtimeEvents.ts';
import type { CHUser } from '../src/api/types.ts';

test('parseRealtimeMessage maps channel_message and stage events', () => {
  const chat = parseRealtimeMessage({
    type: 'channel_message',
    message_id: '1',
    from_user_id: 2,
    from_name: 'Ayse',
    message: 'hi',
  });
  assert.equal(chat.kind, 'channel_message');

  const stage = parseRealtimeMessage({ type: 'hand_raised', name: 'Ayse' });
  assert.equal(stage.kind, 'stage');
});

test('applyStageEvent adds Ayse to the audience on user_joined', () => {
  const users: CHUser[] = [];
  const next = applyStageEvent(users, { kind: 'stage', type: 'user_joined', userName: 'Ayse' });
  assert.equal(next.some((user) => user.name === 'Ayse' && !user.is_speaker), true);
});
