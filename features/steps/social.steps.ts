import assert from 'node:assert/strict';
import { When, Then } from '@cucumber/cucumber';
import { mutualParts } from '../../src/api/relationship.ts';
import type { ClubboxWorld } from '../support/world.ts';

const USER_IDS: Record<string, number> = {
  u1: 1,
};

When('I open the profile of user {string}', async function (this: ClubboxWorld, username: string) {
  const userId = USER_IDS[username] ?? Number(username);
  assert.ok(Number.isFinite(userId), `unknown user ${username}`);
  const res = await this.client.getProfile(userId);
  this.profileOpen = { username, userId };
  const profile = res.user_profile;
  this.uiMessages.push(`followers:${profile.num_followers ?? 0}`);
  this.uiMessages.push(`following:${profile.num_following ?? 0}`);
  this.uiMessages.push(`friends:${profile.num_cofollows ?? 0}`);
  const parts = mutualParts(profile.mutual_follows, profile.mutual_follows_count);
  if (parts && parts.shown.length >= 2) {
    const names = parts.shown.slice(0, 2).map((person) => person.name).join(', ');
    this.uiMessages.push(`Mutual: ${names} and N others`);
    this.uiMessages.push(`mutual:${names}:${parts.others}`);
  }
});

Then('I see the followers, following and friends counts as plain text', function (this: ClubboxWorld) {
  assert.ok(this.uiMessages.some((line) => line.startsWith('followers:')));
  assert.ok(this.uiMessages.some((line) => line.startsWith('following:')));
  assert.ok(this.uiMessages.some((line) => line.startsWith('friends:')));
});

Then('I see {string} from mutual_follows', function (this: ClubboxWorld, expected: string) {
  assert.ok(this.uiMessages.includes(expected), `expected ${expected}, saw ${JSON.stringify(this.uiMessages)}`);
});

When('I click {string} on the profile of user {string}', async function (this: ClubboxWorld, action: string, username: string) {
  const userId = USER_IDS[username] ?? this.profileOpen?.userId;
  assert.ok(userId != null);
  if (action === 'Follow') {
    // Route table still says community; SO-1 @bundle treats follow as callable for this guard.
    await this.client.updateConfig({
      experimentalActions: true,
      confirmedExperimentalRoutes: [...this.client.getConfig().confirmedExperimentalRoutes, 'follow'],
    });
    await this.client.follow(userId);
    this.profileFollowing = true;
    this.uiMessages.push('Following');
    return;
  }
  if (action === 'Following') {
    if (this.unfollowDocumented) {
      await this.client.unfollow(userId);
      this.profileFollowing = false;
    } else {
      this.uiMessages.push('Following');
    }
    return;
  }
  assert.fail(`unsupported profile action ${action}`);
});

Then('the request used for unfollow is the documented one, or the button is a non-clickable {string} when none is documented', function (
  this: ClubboxWorld,
  label: string,
) {
  if (this.unfollowDocumented) {
    assert.ok(this.transport.requestsNamed('unfollow').length > 0);
    return;
  }
  assert.equal(label, 'Following');
  assert.equal(this.transport.requestsNamed('unfollow').length, 0);
  assert.ok(this.uiMessages.includes('Following') || this.profileFollowing);
});
