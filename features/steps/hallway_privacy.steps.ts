import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import { FEED_MAX_PAGES } from '../../src/api/feedPagination.ts';
import {
  hallwayPrivacyCounts,
  hallwayRoomPrivacy,
  prepareHallwayChannels,
  shouldAutoLoadMorePrivacy,
  visiblePrivacyChips,
  type HallwayPrivacy,
} from '../../src/hallway/hallwayDisplay.ts';
import { defaultHallwayPrefs, type HallwayPrefs } from '../../src/hallway/hallwayPrefs.ts';
import { t } from '../../src/i18n/index.ts';

type PrivacyRoom = {
  topic: string;
  channel: string;
  users: [];
  privacy_settings?: { type?: string };
};

type PrivacyWorld = {
  liveRooms: PrivacyRoom[];
  livePrefs: HallwayPrefs;
  selectedPrivacy: HallwayPrivacy | null;
  feedNextCursor: string | null;
  feedPagesLoaded: number;
  privacyChipLabels: string[];
  pagesCheckedNote: string | null;
  cardBadges: Record<string, string>;
  uiMessages: string[];
};

function room(topic: string, type: string, channel = topic): PrivacyRoom {
  return {
    topic,
    channel,
    users: [],
    privacy_settings: { type },
  };
}

function chipLabel(privacy: HallwayPrivacy | null, count: number): string {
  if (privacy == null) return `${t('roomTypeAll')} ${count}`;
  if (privacy === 'public') return `${t('roomTypePublic')} ${count}`;
  if (privacy === 'friend_of_friend') return `${t('roomTypeFriendOfFriend')} ${count}`;
  if (privacy === 'friend') return `${t('roomTypeFriend')} ${count}`;
  if (privacy === 'house') return `${t('roomTypeHouse')} ${count}`;
  return `${privacy} ${count}`;
}

function badgeLabel(privacy: HallwayPrivacy): string {
  if (privacy === 'public') return t('roomTypePublic');
  if (privacy === 'friend_of_friend') return t('roomTypeFriendOfFriend');
  if (privacy === 'friend') return t('roomTypeFriend');
  if (privacy === 'house') return t('roomTypeHouse');
  return privacy;
}

function ensurePrefs(world: PrivacyWorld): void {
  if (!world.livePrefs) world.livePrefs = defaultHallwayPrefs();
  if (world.selectedPrivacy === undefined) world.selectedPrivacy = null;
  if (!world.uiMessages) world.uiMessages = [];
}

function listed(world: PrivacyWorld): PrivacyRoom[] {
  return prepareHallwayChannels(world.liveRooms, world.livePrefs, null, world.selectedPrivacy);
}

function refreshChips(world: PrivacyWorld): void {
  const counts = hallwayPrivacyCounts(world.liveRooms);
  world.privacyChipLabels = visiblePrivacyChips(counts, world.selectedPrivacy).map((chip) => chipLabel(chip.privacy, chip.count));
}

function autoLoadSparse(world: PrivacyWorld): void {
  while (shouldAutoLoadMorePrivacy({
    privacy: world.selectedPrivacy,
    countOfType: world.selectedPrivacy ? hallwayPrivacyCounts(world.liveRooms)[world.selectedPrivacy] : 0,
    hasNextCursor: !!world.feedNextCursor,
    pagesLoaded: world.feedPagesLoaded,
    maxPages: FEED_MAX_PAGES,
  })) {
    // Simulate the next feed page: mostly houses, one more public when sparse-loading Public.
    const page = world.feedPagesLoaded + 1;
    world.liveRooms.push(room(`Public page ${page}`, 'public', `pub-${page}`));
    world.liveRooms.push(room(`House page ${page}`, 'house', `house-${page}`));
    world.feedPagesLoaded = page;
    world.feedNextCursor = page < FEED_MAX_PAGES ? `cursor-${page}` : null;
  }
  if (world.selectedPrivacy) {
    world.pagesCheckedNote = t('roomTypeCheckedPages', { count: world.feedPagesLoaded });
  }
}

Given(
  'the live hallway has {int} house rooms, {int} public rooms and {int} friends-of-friends room',
  function (this: PrivacyWorld, houses: number, publics: number, fof: number) {
    ensurePrefs(this);
    this.liveRooms = [];
    for (let i = 0; i < houses; i += 1) this.liveRooms.push(room(`House ${i + 1}`, 'house', `h-${i}`));
    for (let i = 0; i < publics; i += 1) this.liveRooms.push(room(`Public ${i + 1}`, 'public', `p-${i}`));
    for (let i = 0; i < fof; i += 1) this.liveRooms.push(room(`FoF ${i + 1}`, 'friend_of_friend', `f-${i}`));
    this.selectedPrivacy = null;
    this.feedPagesLoaded = 1;
    this.feedNextCursor = null;
    refreshChips(this);
  },
);

Then(
  'I see the room type chips {string}, {string}, {string} and {string}',
  function (this: PrivacyWorld, a: string, b: string, c: string, d: string) {
    refreshChips(this);
    assert.deepEqual(this.privacyChipLabels, [a, b, c, d]);
  },
);

Then('there is no {string} chip because no friends room is listed', function (this: PrivacyWorld, label: string) {
  assert.equal(label, 'Friends');
  refreshChips(this);
  const friendChip = new RegExp(`^${t('roomTypeFriend')} \\d+$`);
  assert.ok(!this.privacyChipLabels.some((chip) => friendChip.test(chip)), this.privacyChipLabels.join(', '));
});

When('I select the room type {string}', function (this: PrivacyWorld, label: string) {
  ensurePrefs(this);
  const map: Record<string, HallwayPrivacy | null> = {
    All: null,
    Public: 'public',
    'Friends of friends': 'friend_of_friend',
    Friends: 'friend',
    Houses: 'house',
  };
  assert.ok(label in map, `unknown room type ${label}`);
  this.selectedPrivacy = map[label];
  this.livePrefs = { ...this.livePrefs, selectedPrivacy: this.selectedPrivacy };
  if (this.selectedPrivacy) autoLoadSparse(this);
  refreshChips(this);
  if (this.selectedPrivacy === 'friend' && listed(this).length === 0) {
    this.uiMessages.push(t('roomTypeEmptyFriend'));
  }
});

Then('the hallway lists only the {int} public rooms', function (this: PrivacyWorld, count: number) {
  const rooms = listed(this);
  assert.equal(rooms.length, count);
  assert.ok(rooms.every((entry) => hallwayRoomPrivacy(entry) === 'public'));
});

Given(
  'the live hallway first page has {int} public room and more pages are available',
  function (this: PrivacyWorld, publics: number) {
    ensurePrefs(this);
    this.liveRooms = [room('House first', 'house', 'h0')];
    for (let i = 0; i < publics; i += 1) this.liveRooms.push(room(`Public first ${i}`, 'public', `p0-${i}`));
    this.feedPagesLoaded = 1;
    this.feedNextCursor = 'page-2';
    this.selectedPrivacy = null;
    refreshChips(this);
  },
);

Then(
  'Clubbox loads further feed pages until at least {int} public rooms are listed or {int} pages are loaded',
  function (this: PrivacyWorld, minPublic: number, maxPages: number) {
    assert.equal(maxPages, FEED_MAX_PAGES);
    const publicCount = hallwayPrivacyCounts(this.liveRooms).public;
    assert.ok(publicCount >= minPublic || this.feedPagesLoaded >= maxPages, `public=${publicCount} pages=${this.feedPagesLoaded}`);
  },
);

Then('the hallway says how many pages were checked', function (this: PrivacyWorld) {
  assert.ok(this.pagesCheckedNote);
  assert.equal(this.pagesCheckedNote, t('roomTypeCheckedPages', { count: this.feedPagesLoaded }));
});

Given(
  'the live hallway has a public room {string} and a friends-of-friends room {string}',
  function (this: PrivacyWorld, publicTitle: string, fofTitle: string) {
    ensurePrefs(this);
    this.liveRooms = [
      room(publicTitle, 'public', 'open'),
      room(fofTitle, 'friend_of_friend', 'late'),
    ];
    this.selectedPrivacy = null;
    this.cardBadges = {};
    for (const entry of this.liveRooms) {
      this.cardBadges[entry.topic] = badgeLabel(hallwayRoomPrivacy(entry));
    }
  },
);

Then('the card {string} shows the badge {string}', function (this: PrivacyWorld, title: string, badge: string) {
  assert.equal(this.cardBadges[title], badge);
});

Given('the live hallway has no friends rooms after {int} pages', function (this: PrivacyWorld, pages: number) {
  ensurePrefs(this);
  this.liveRooms = [room('House only', 'house', 'h-only')];
  this.feedPagesLoaded = pages;
  this.feedNextCursor = null;
  this.selectedPrivacy = null;
});
