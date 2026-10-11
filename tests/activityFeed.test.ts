import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mergeActivityFeed,
  notificationToActivity,
  readEdgeStoriesPayload,
  readNotificationsPayload,
} from '../src/api/activityFeed.ts';

test('readEdgeStoriesPayload maps activities with ping channel', () => {
  const items = readEdgeStoriesPayload({
    success: true,
    activities: [{
      activity_id: 'a1',
      message: 'Ayse pinged you into Morning Show',
      channel: 'room-1',
      time_created: '2026-10-11T12:00:00Z',
      user_profile: { user_id: 10, name: 'Ayse', username: 'ayse', photo_url: null },
    }],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].isPing, true);
  assert.equal(items[0].channel, 'room-1');
});

test('readNotificationsPayload maps community notification rows', () => {
  const items = readNotificationsPayload({
    notifications: [{
      notification_id: 44,
      message: 'Ali pinged you into Late Night',
      channel: 'ln-9',
      time_created: '2026-10-11T13:00:00Z',
      user_profile: { user_id: 11, name: 'Ali', username: 'ali', photo_url: null },
      type: 1,
    }],
  });
  assert.equal(items.length, 1);
  assert.equal(items[0].channel, 'ln-9');
  const activity = notificationToActivity(items[0]);
  assert.equal(activity.isPing, true);
});

test('mergeActivityFeed prefers notifications and drops duplicates', () => {
  const edge = readEdgeStoriesPayload({
    activities: [{ message: 'same', channel: 'c1', time_created: 't' }],
  });
  const notifs = [notificationToActivity({
    notification_id: 1,
    message: 'same',
    channel: 'c1',
    time_created: 't',
    type: 0,
    user_profile: { user_id: 1, name: 'A', username: 'a', photo_url: null },
  })];
  const merged = mergeActivityFeed(edge, notifs);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].source, 'notification');
});
