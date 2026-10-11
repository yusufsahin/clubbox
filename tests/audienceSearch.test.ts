import assert from 'node:assert/strict';
import test from 'node:test';
import { audienceMatchesQuery, filterAudience } from '../src/studio/audienceSearch.ts';

test('audienceMatchesQuery matches name or bio case-insensitively', () => {
  assert.equal(audienceMatchesQuery({ name: 'Marketing Lead', bio: 'ops' }, 'marketing'), true);
  assert.equal(audienceMatchesQuery({ name: 'Pat', bio: 'marketing ops' }, 'MARKETING'), true);
  assert.equal(audienceMatchesQuery({ name: 'Pat', bio: 'ops' }, 'sales'), false);
});

test('filterAudience returns only matches', () => {
  const people = [
    { name: 'A', bio: 'x' },
    { name: 'Marketing Lead', bio: 'y' },
  ];
  assert.equal(filterAudience(people, 'marketing').length, 1);
});
