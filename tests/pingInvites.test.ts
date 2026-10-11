import assert from 'node:assert/strict';
import test from 'node:test';
import { mergePingCandidates, readSearchPingCandidates, readSuggestedInvites } from '../src/api/pingInvites.ts';

test('readSuggestedInvites maps nested user profiles', () => {
  const list = readSuggestedInvites({
    suggestions: [{
      user_profile: { user_id: 10, name: 'Ayse', username: 'ayse', photo_url: null },
    }],
  });
  assert.equal(list.length, 1);
  assert.equal(list[0].userId, 10);
  assert.equal(list[0].name, 'Ayse');
});

test('mergePingCandidates prefers search over suggested for the same id', () => {
  const merged = mergePingCandidates(
    [{ userId: 1, name: 'Old', username: 'old', photoUrl: '', source: 'suggested' }],
    [{ userId: 1, name: 'New', username: 'new', photoUrl: '', source: 'search' }],
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].name, 'New');
  assert.equal(merged[0].source, 'search');
});

test('readSearchPingCandidates accepts CHUser arrays', () => {
  const list = readSearchPingCandidates([
    { user_id: 11, name: 'Ali', username: 'ali', photo_url: null, is_speaker: false, is_moderator: false },
  ]);
  assert.equal(list[0].source, 'search');
  assert.equal(list[0].userId, 11);
});
