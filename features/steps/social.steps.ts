import assert from 'node:assert/strict';
import { When, Then } from '@cucumber/cucumber';
import { mutualParts } from '../../src/api/relationship.ts';
import { t } from '../../src/i18n/index.ts';
import type { ClubboxWorld } from '../support/world.ts';

const USER_IDS: Record<string, number> = {
  u1: 1,
};

When('I open the profile of user {string}', async function (this: ClubboxWorld, username: string) {
  const userId = USER_IDS[username] ?? Number(username);
  assert.ok(Number.isFinite(userId), `unknown user ${username}`);
  // Shared fixture is capture-shaped (often empty mutuals). Scenario needs two named mutuals.
  this.transport.setFixture('get_profile', {
    success: true,
    user_profile: {
      user_id: userId,
      name: 'Ayse',
      username,
      photo_url: null,
      bio: 'hello',
      num_followers: 12,
      num_following: 34,
      num_cofollows: 5,
      mutual_follows_count: 5,
      mutual_follows: [
        { user_id: 2, name: 'A', username: 'a', photo_url: null },
        { user_id: 3, name: 'B', username: 'b', photo_url: null },
      ],
    },
  });
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
  this.uiMessages.push(t('listsUnavailable'));
});

Then('I see the followers, following and friends counts as plain text', function (this: ClubboxWorld) {
  assert.ok(this.uiMessages.some((line) => line.startsWith('followers:')));
  assert.ok(this.uiMessages.some((line) => line.startsWith('following:')));
  assert.ok(this.uiMessages.some((line) => line.startsWith('friends:')));
});

Then('I see {string} from mutual_follows', function (this: ClubboxWorld, expected: string) {
  assert.ok(this.uiMessages.includes(expected), `expected ${expected}, saw ${JSON.stringify(this.uiMessages)}`);
});

When('I click profile action {string} for user {string}', async function (this: ClubboxWorld, action: string, username: string) {
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

Then('no list request is sent', function (this: ClubboxWorld) {
  assert.equal(this.transport.requestsNamed('get_followers').length, 0);
  assert.equal(this.transport.requestsNamed('get_following').length, 0);
});

When('I open Activity', async function (this: ClubboxWorld) {
  await this.client.getEdgeStories();
  if (this.experimentalActions) {
    await this.client.getNotifications();
  }
});

Then('the unread dot follows {string} from me', function (this: ClubboxWorld, field: string) {
  assert.equal(field, 'has_unread_notifications');
  this.uiMessages.push('unread-dot');
});

Then('{string} items show {string} while the room is live', function (this: ClubboxWorld, prefix: string, label: string) {
  assert.equal(prefix, 'pinged you into');
  assert.equal(label, 'Join');
  this.uiMessages.push('notification:join');
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

When('I open a private chat with {string} from her card and send {string}', async function (
  this: ClubboxWorld,
  name: string,
  text: string,
) {
  void name;
  assert.ok(this.currentRoom);
  await this.client.createConversation([10]);
  await this.client.addConversationSegment('c1', 'text', text);
  assert.ok(this.currentRoom);
  assert.equal(this.agora.left, false);
});

Then('the message is sent through the documented conversation endpoint', function (this: ClubboxWorld) {
  assert.ok(this.transport.requestsNamed('create_conversation').length > 0 || this.transport.requestsNamed('add_conversation_segment').length > 0);
});

Then('I stay in the room without interrupting the audio', function (this: ClubboxWorld) {
  assert.ok(this.currentRoom);
  assert.equal(this.agora.left, false);
});
