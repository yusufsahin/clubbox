import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyFollowResponse,
  isFriend,
  mergeProfile,
  mutualParts,
  profileCountsMissing,
  readPeopleList,
  readProfile,
  relationshipFromStatus,
  talkPartners,
} from '../src/api/relationship.ts';
import type { CHUser } from '../src/api/types.ts';

const sample: CHUser = {
  user_id: 7,
  name: 'Ada',
  username: 'ada',
  photo_url: null,
  num_followers: 1452,
  num_following: 845,
  num_cofollows: 786,
  has_protected_profile: true,
};

test('captured counts stay separate and unknown status does not become a friend', () => {
  const profile = readProfile({
    user_id: '7',
    name: 'Ada',
    username: 'ada',
    num_followers: 1452,
    num_following: 845,
    num_cofollows: 786,
    follows_me: false,
    follow_status: 'not-a-captured-value',
    is_following: true,
    displayname: 'A',
    has_protected_profile: false,
  });
  assert.ok(profile);
  assert.equal(profile.user_id, 7);
  assert.equal(profile.num_followers, 1452);
  assert.equal(profile.num_following, 845);
  assert.equal(profile.num_cofollows, 786);
  assert.equal(profile.displayname, 'A');
  assert.equal('is_following' in profile, false);
  assert.equal(relationshipFromStatus(profile.follow_status), 'unknown');
  assert.equal(relationshipFromStatus(undefined), 'unknown');
  assert.equal(relationshipFromStatus(''), 'unknown');
  assert.equal(isFriend(profile), false);
});

test('following id list length is not a following count', () => {
  const thin = readProfile({ user_id: 3, name: 'Me', username: 'me' });
  assert.ok(thin);
  assert.equal(profileCountsMissing(thin), true);
  assert.equal(thin.num_following, undefined);
  const filled = mergeProfile(thin, sample);
  assert.equal(filled.num_following, 845);
  assert.equal(filled.num_cofollows, 786);
  assert.equal(filled.name, 'Ada');
});

test('a protected profile does not gain friends from a follow response that names no status', () => {
  const next = applyFollowResponse(sample, {
    success: true,
    user_profile: { user_id: 7, name: 'Ada', username: 'ada', num_cofollows: 787 },
  });
  assert.equal(next.num_cofollows, 786);
  assert.equal(next.follow_status, undefined);
  assert.equal(relationshipFromStatus(next.follow_status), 'unknown');
});

test('a people list reads sandbox users and a cursor, and ignores an uncaptured array', () => {
  const page = readPeopleList({
    success: true,
    users: [
      { user_id: 301, name: 'Chloe Davis', username: 'chloed', photo_url: null, follow_status: 'not-captured' },
    ],
    next_cursor: '2',
    followers: [{ user_id: 999, name: 'Ignored', username: 'ignored' }],
  });
  assert.equal(page.users.length, 1);
  assert.equal(page.users[0]?.user_id, 301);
  assert.equal(page.users[0]?.username, 'chloed');
  assert.equal(page.nextCursor, '2');
  assert.equal(relationshipFromStatus(page.users[0]?.follow_status), 'unknown');
  assert.deepEqual(readPeopleList({ followers: [] }), { users: [], nextCursor: null });
  assert.deepEqual(readPeopleList({ users: [], next_cursor: null }), { users: [], nextCursor: null });
});

test('mutual names come from the profile arrays and chat people are not a friends list', () => {
  const profile = readProfile({
    user_id: 7,
    name: 'Ada',
    username: 'ada',
    mutual_follows_count: 3,
    mutual_follows: [
      { user_id: 1, name: 'A', username: 'a' },
      { user_id: 2, name: 'B', username: 'b' },
    ],
    mutual_cofollows_count: 0,
    mutual_cofollows: [],
  });
  assert.ok(profile);
  const mutual = mutualParts(profile.mutual_follows, profile.mutual_follows_count);
  assert.equal(mutual?.shown.map((person) => person.name).join(','), 'A,B');
  assert.equal(mutual?.others, 1);
  assert.equal(mutualParts(profile.mutual_cofollows, profile.mutual_cofollows_count), null);
  const people = talkPartners([
    { participants: [profile, { user_id: 1, name: 'A', username: 'a', photo_url: null }] },
    { participants: [{ user_id: 1, name: 'A', username: 'a', photo_url: null }] },
  ], 7);
  assert.equal(people.length, 1);
  assert.equal(people[0]?.user_id, 1);
});
