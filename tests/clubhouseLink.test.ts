import assert from 'node:assert/strict';
import test from 'node:test';
import { isClubhouseWebUrl, parseClubhouseLink } from '../src/studio/clubhouseLink.ts';

test('parseClubhouseLink accepts room and profile URLs', () => {
  assert.deepEqual(parseClubhouseLink('https://www.clubhouse.com/room/PG2LoOww'), {
    kind: 'room',
    channelId: 'PG2LoOww',
  });
  assert.deepEqual(parseClubhouseLink('https://www.clubhouse.com/@someone'), {
    kind: 'profile',
    username: 'someone',
  });
});

test('parseClubhouseLink accepts event and replay paths', () => {
  assert.deepEqual(parseClubhouseLink('https://www.clubhouse.com/event/ev1'), {
    kind: 'event',
    eventId: 'ev1',
  });
  assert.deepEqual(parseClubhouseLink('https://www.clubhouse.com/replay/rp1'), {
    kind: 'replay',
    replayId: 'rp1',
  });
});

test('parseClubhouseLink rejects non-clubhouse hosts', () => {
  assert.equal(parseClubhouseLink('https://evil.example.com/room/PG2LoOww'), null);
  assert.equal(isClubhouseWebUrl('https://evil.example.com/room/x'), false);
});
