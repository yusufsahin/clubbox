import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import { followControlLabel, isPrivateLocked, readProfile } from '../../src/api/relationship.ts';
import type { CHUser } from '../../src/api/types.ts';
import { paintPersonSheet, type ProfileDrawerState } from '../../src/ui/components/profileDrawer.ts';
import { markup } from '../../src/ui/html.ts';
import { peopleListView } from '../../src/ui/views/peopleList.ts';
import { t } from '../../src/i18n/index.ts';
import type { ClubboxWorld } from '../support/world.ts';

type ProfileWorld = ClubboxWorld & {
  profileSheet?: HTMLElement;
  profileUser?: CHUser;
  profileConversationOpen?: string | null;
  profileMessagesTab?: boolean;
};

const NAMED: Record<string, Partial<CHUser> & { user_id: number; name: string; username: string }> = {
  Arzu: {
    user_id: 401,
    name: 'Arzu',
    username: 'arzu',
    photo_url: null,
    bio: 'Hello',
    share_url: 'https://www.clubhouse.com/@arzu',
    twitter: 'arzu_ch',
    instagram: 'arzu_ch',
    can_dm: true,
    can_wave: true,
    follow_status: 'not_following',
    follows_me: false,
    has_protected_profile: false,
    num_followers: 120,
    num_following: 80,
    num_cofollows: 40,
    mutual_cofollows_count: 12,
    mutual_cofollows: [
      { user_id: 204, name: 'BeatMaker Kai', username: 'kaibeats', photo_url: null },
      { user_id: 205, name: 'Luna Song', username: 'lunasounds', photo_url: null },
      { user_id: 206, name: 'Victoria Sterling', username: 'vsterling_vc', photo_url: null },
    ],
    social_clubs: [
      { social_club_id: 1, name: 'Sandbox House', slug: 'h1', photo_url: null, num_members: 42 },
    ],
    chatting_with: [
      { user_id: 301, name: 'Chloe Davis', username: 'chloed', photo_url: null },
      { user_id: 302, name: 'David Kim', username: 'dkim_dev', photo_url: null },
    ],
  },
  Cem: {
    user_id: 402,
    name: 'Cem',
    username: 'cem',
    photo_url: null,
    can_dm: false,
    can_wave: false,
    follow_status: 'not_following',
    follows_me: false,
    has_protected_profile: false,
    num_followers: 10,
    num_following: 5,
    num_cofollows: 1,
    share_url: 'https://www.clubhouse.com/@cem',
  },
  Deniz: {
    user_id: 403,
    name: 'Deniz',
    username: 'deniz',
    photo_url: null,
    can_dm: false,
    can_wave: false,
    follow_status: 'not_following',
    follows_me: false,
    has_protected_profile: true,
    num_followers: 4,
    num_following: 1,
    num_cofollows: 0,
    share_url: 'https://www.clubhouse.com/@deniz',
    social_clubs: [
      { social_club_id: 9, name: 'Hidden House', slug: 'hidden', photo_url: null },
    ],
    chatting_with: [
      { user_id: 301, name: 'Chloe Davis', username: 'chloed', photo_url: null },
    ],
  },
};

function ensureSheet(world: ProfileWorld): HTMLElement {
  if (world.profileSheet?.isConnected) return world.profileSheet;
  const existing = world.dom.window.document.getElementById('profile-drawer');
  if (existing) {
    world.profileSheet = existing;
    return existing;
  }
  const el = world.dom.window.document.createElement('div');
  el.id = 'profile-drawer';
  world.dom.window.document.body.appendChild(el);
  world.profileSheet = el;
  return el;
}

function stateFor(profile: CHUser, extras: Partial<ProfileDrawerState> = {}): ProfileDrawerState {
  const isSelf = extras.isSelf === true;
  return {
    profile,
    canChangeRelationship: true,
    canInvite: false,
    loading: false,
    showVolume: false,
    remoteVolume: 1,
    requestedFollowingCount: null,
    placeLabel: 'Hallway',
    canMessage: false,
    canDm: !isSelf && profile.can_dm === true,
    canWave: !isSelf && profile.can_wave === true,
    voiceMode: false,
    privateLines: [],
    listEnabled: { followers: false, following: false },
    inRoomNow: extras.inRoomNow ?? null,
    isSelf,
    isPrivateLocked: !isSelf && isPrivateLocked(profile),
    ...extras,
  };
}

function paintNamed(world: ProfileWorld, name: string, extras: Partial<ProfileDrawerState> = {}): CHUser {
  const base = NAMED[name];
  assert.ok(base, `unknown profile ${name}`);
  const profile = readProfile(base);
  assert.ok(profile);
  world.profileUser = profile;
  world.profileOpen = { username: profile.username, userId: profile.user_id };
  world.transport.setFixture('get_profile', { success: true, user_profile: base });
  paintPersonSheet(ensureSheet(world), stateFor(profile, extras));
  return profile;
}

function sheetText(world: ProfileWorld): string {
  return ensureSheet(world).textContent ?? '';
}

When('I open the profile of {string} who can receive DMs and waves', function (this: ClubboxWorld, name: string) {
  paintNamed(this as ProfileWorld, name);
});

When('I open the profile of {string} who cannot receive DMs or waves', function (this: ClubboxWorld, name: string) {
  paintNamed(this as ProfileWorld, name);
});

When('I open the profile of {string}', function (this: ClubboxWorld, name: string) {
  const w = this as ProfileWorld;
  if (name === 'Arzu') {
    paintNamed(w, name, {
      inRoomNow: { title: 'Morning Show', channel: 'morning-show' },
    });
    return;
  }
  paintNamed(w, name);
});

When(
  'I open the profile of {string} who has a protected profile and is not my friend',
  function (this: ClubboxWorld, name: string) {
    paintNamed(this as ProfileWorld, name);
  },
);

When(
  /^I open the profile of someone whose follow status is "([^"]+)" and who (follows|does not follow) me$/,
  function (this: ClubboxWorld, status: string, followsPhrase: string) {
    const follows = followsPhrase === 'follows';
    const profile = readProfile({
      user_id: 500,
      name: 'Pat',
      username: 'pat',
      photo_url: null,
      follow_status: status,
      follows_me: follows,
      has_protected_profile: false,
      share_url: 'https://www.clubhouse.com/@pat',
    });
    assert.ok(profile);
    const w = this as ProfileWorld;
    w.profileUser = profile;
    paintPersonSheet(ensureSheet(w), stateFor(profile));
  },
);

Then(
  'I see the actions {string}, {string}, the follow control and {string}',
  function (this: ClubboxWorld, a: string, b: string, c: string) {
    const text = sheetText(this as ProfileWorld);
    assert.ok(text.includes(a), `expected ${a}`);
    assert.ok(text.includes(b), `expected ${b}`);
    assert.ok(text.includes(c), `expected ${c}`);
    const sheet = ensureSheet(this as ProfileWorld);
    assert.ok(sheet.querySelector('[data-follow-label], [data-action="toggle-follow"]'));
  },
);

Then(
  '{string} is available whether or not I am in a room',
  function (this: ClubboxWorld, label: string) {
    const sheet = ensureSheet(this as ProfileWorld);
    assert.ok(sheet.querySelector(`[data-action="profile-message"]`), `expected ${label} outside a room`);
    assert.equal(sheet.querySelector('[data-action="private-send"]'), null);
  },
);

Then('the follow control shows {string}', function (this: ClubboxWorld, label: string) {
  const w = this as ProfileWorld;
  assert.ok(w.profileUser);
  assert.equal(followControlLabel(w.profileUser), label);
  const sheet = ensureSheet(w);
  const el = sheet.querySelector('[data-follow-label], [data-action="toggle-follow"]');
  assert.ok(el, 'expected follow control');
  assert.ok((el.textContent ?? '').includes(label));
});

When('I click {string} on the profile of {string}', async function (
  this: ClubboxWorld,
  action: string,
  name: string,
) {
  const w = this as ProfileWorld;
  const profile = w.profileUser ?? paintNamed(w, name);
  if (action === 'Message') {
    const existing = (this.conversations ?? []).find((item) =>
      item.participants?.some((p) => p.user_id === profile.user_id));
    if (existing) {
      w.profileConversationOpen = existing.conversation_id;
      w.profileMessagesTab = true;
      this.openConversationId = existing.conversation_id;
      this.uiMessages.push('messages-open');
      return;
    }
    await this.client.createConversation([profile.user_id]);
    w.profileConversationOpen = `dm-${profile.user_id}`;
    w.profileMessagesTab = true;
    this.openConversationId = w.profileConversationOpen;
    this.uiMessages.push('messages-open');
    return;
  }
  if (action === 'Talk live') {
    await this.client.createChannel(`Talk Live - ${profile.name}`, {
      audience: 'friends',
      replayEnabled: false,
      chatEnabled: false,
      talkWith: { userId: profile.user_id, name: profile.name, username: profile.username },
    });
    return;
  }
  assert.fail(`unsupported click ${action}`);
});

Then(
  'the existing DM with {string} opens, or a {string} request is sent with body keys {string}',
  function (this: ClubboxWorld, name: string, request: string, keys: string) {
    const w = this as ProfileWorld;
    if (w.profileConversationOpen && this.transport.requestsNamed('create_conversation').length === 0) {
      assert.ok(true);
      return;
    }
    const [method, path] = request.split(/\s+/);
    const match = this.transport.requests.filter((req) => req.method === method && req.path === path).at(-1);
    assert.ok(match, `expected ${request}`);
    const expected = keys.split(',').map((k) => k.trim()).filter(Boolean).sort();
    assert.deepEqual(Object.keys(match.body ?? {}).sort(), expected);
    void name;
  },
);

Then('I am on Messages with that conversation open', function (this: ClubboxWorld) {
  const w = this as ProfileWorld;
  assert.ok(w.profileMessagesTab || this.openConversationId);
  assert.ok(this.openConversationId || w.profileConversationOpen);
});

Then('the body field {string} contains the id of {string}', function (
  this: ClubboxWorld,
  field: string,
  name: string,
) {
  const last = this.transport.requests.at(-1);
  assert.ok(last, 'expected a request');
  const base = NAMED[name];
  assert.ok(base);
  const value = (last.body ?? {})[field];
  assert.ok(Array.isArray(value), `${field} should be an array`);
  assert.ok(value.includes(base.user_id), `expected ${base.user_id} in ${field}`);
});

Then('I see her houses as cards that open the house page', function (this: ClubboxWorld) {
  const sheet = ensureSheet(this as ProfileWorld);
  assert.ok(sheet.querySelector('[data-profile-section="houses"]'));
  assert.ok(sheet.querySelector('[data-action="open-house"]'));
});

Then(
  'I see {string} with up to {int} people that open their profiles',
  function (this: ClubboxWorld, heading: string, max: number) {
    const sheet = ensureSheet(this as ProfileWorld);
    assert.ok(sheetText(this as ProfileWorld).includes(heading));
    const people = sheet.querySelectorAll('[data-profile-section="chatting"] [data-action="open-profile"]');
    assert.ok(people.length > 0 && people.length <= max);
  },
);

Then(
  'I see her X and Instagram links when present, opened in the browser',
  function (this: ClubboxWorld) {
    const sheet = ensureSheet(this as ProfileWorld);
    const links = [...sheet.querySelectorAll('a[href]')].map((a) => (a as HTMLAnchorElement).href);
    assert.ok(links.some((href) => href.includes('x.com') || href.includes('twitter.com')));
    assert.ok(links.some((href) => href.includes('instagram.com')));
  },
);

Then(
  'I see {string} when she is speaking or listening in a room I can see in the hallway',
  function (this: ClubboxWorld, pattern: string) {
    void pattern;
    const sheet = ensureSheet(this as ProfileWorld);
    assert.ok(sheet.querySelector('[data-profile-section="in-room"]'));
    assert.ok(sheet.querySelector('[data-action="join-room"]'));
    assert.ok(sheetText(this as ProfileWorld).includes('Morning Show'));
  },
);

Given(
  '{string} has {int} mutual friends and I receive {int} of them',
  function (this: ClubboxWorld, name: string, total: number, shown: number) {
    const base = { ...NAMED[name] };
    assert.ok(base);
    const people = Array.from({ length: shown }, (_, i) => ({
      user_id: 700 + i,
      name: `Friend ${i + 1}`,
      username: `friend${i + 1}`,
      photo_url: null,
    }));
    base.mutual_cofollows = people;
    base.mutual_cofollows_count = total;
    NAMED[name] = base as typeof NAMED[typeof name];
  },
);

When('I click {string} on her profile', function (this: ClubboxWorld, label: string) {
  const w = this as ProfileWorld;
  const profile = w.profileUser ?? paintNamed(w, 'Arzu');
  assert.equal(label, 'Mutual friends');
  const users = profile.mutual_cofollows ?? [];
  const more = Math.max(0, (profile.mutual_cofollows_count ?? users.length) - users.length);
  ensureSheet(w).innerHTML = markup(peopleListView({
    kind: 'mutual_friends',
    users,
    nextCursor: null,
    loadingMore: false,
    moreNotShown: more,
  }));
});

Then(
  'a list shows the {int} people with avatars, each opening their profile',
  function (this: ClubboxWorld, count: number) {
    const sheet = ensureSheet(this as ProfileWorld);
    const rows = sheet.querySelectorAll('[data-action="open-profile"]');
    assert.equal(rows.length, count);
  },
);

Then('the list says {string}', function (this: ClubboxWorld, note: string) {
  assert.ok(sheetText(this as ProfileWorld).includes(note));
});

Then('the followers, following and friends counts are shown', function (this: ClubboxWorld) {
  const sheet = ensureSheet(this as ProfileWorld);
  assert.equal(sheet.querySelectorAll('.profile-stat-box').length, 3);
});

Then(
  'clicking them shows {string} instead of an empty page',
  function (this: ClubboxWorld, message: string) {
    const w = this as ProfileWorld;
    const profile = w.profileUser;
    assert.ok(profile);
    ensureSheet(w).innerHTML = markup(peopleListView({
      kind: 'followers',
      users: [],
      nextCursor: null,
      loadingMore: false,
      unavailable: true,
    }));
    assert.ok(sheetText(w).includes(message));
    assert.ok(ensureSheet(w).querySelector('[data-list-unavailable]'));
  },
);

Then(
  'I see {string} and a {string} follow control',
  function (this: ClubboxWorld, privateLabel: string, requestLabel: string) {
    const w = this as ProfileWorld;
    assert.ok(sheetText(w).includes(privateLabel));
    assert.ok(w.profileUser);
    assert.equal(followControlLabel(w.profileUser), requestLabel);
  },
);

Then('houses and recently chatting are not shown', function (this: ClubboxWorld) {
  const sheet = ensureSheet(this as ProfileWorld);
  assert.equal(sheet.querySelector('[data-profile-section="houses"]'), null);
  assert.equal(sheet.querySelector('[data-profile-section="chatting"]'), null);
});

Then(
  'I see my counts, bio, my houses \\(from get_user_social_clubs\\), recently chatting, share profile and account settings',
  function (this: ClubboxWorld) {
    const text = sheetText(this as ProfileWorld);
    assert.ok(text.includes('Sandbox House') || text.includes(t('houses')));
    assert.ok(text.includes('My bio') || text.includes('bio'));
    assert.ok(text.includes(t('shareProfile')) || /share/i.test(text));
    assert.ok(text.includes(t('accountSettings')));
    assert.ok(ensureSheet(this as ProfileWorld).querySelectorAll('[data-action="open-people-list"]').length >= 3);
  },
);

Then(
  'polls, clips, replays and karma are not shown because Clubhouse web does not provide them',
  function (this: ClubboxWorld) {
    const text = sheetText(this as ProfileWorld);
    assert.ok(text.includes(t('profileWebOnlyNote')));
    assert.equal(/karma|polls|clips|replays/i.test(text.replace(t('profileWebOnlyNote'), '')), false);
  },
);
