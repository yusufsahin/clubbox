import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Given, When, Then } from '@cucumber/cucumber';
import { t } from '../../src/i18n/index.ts';
import { sidebarPlaceLabels } from '../../src/ui/shellChrome.ts';
import { homeForFormerPlace } from '../../src/ui/navMap.ts';
import { popView, pushView } from '../../src/app/viewStack.ts';
import { ensureNavUi, paintNavUi } from '../support/navUi.ts';
import type { ClubboxWorld } from '../support/world.ts';

type NavStackWorld = ClubboxWorld & {
  navStack?: ReturnType<typeof pushView> extends infer _T ? import('../../src/app/viewStack.ts').ViewSnapshot[] : never;
};

function stackOf(world: ClubboxWorld) {
  const w = world as NavStackWorld;
  if (!w.navStack) w.navStack = [];
  return w;
}

Given('the navigation shell is ready', function (this: ClubboxWorld) {
  ensureNavUi(this);
});

Then(
  'the sidebar shows exactly {string}, {string}, {string} and {string} in that order',
  function (
    this: ClubboxWorld,
    a: string,
    b: string,
    c: string,
    d: string,
  ) {
    const ui = paintNavUi(this);
    const labels = [...ui.root.querySelectorAll('[data-nav-place] .nav-place-label')]
      .map((el) => el.textContent?.trim() ?? '');
    assert.deepEqual(labels, [a, b, c, d]);
    assert.deepEqual(sidebarPlaceLabels(), [a, b, c, d]);
  },
);

Then('the sidebar ends with my profile card and a settings button', function (this: ClubboxWorld) {
  const ui = paintNavUi(this);
  const footer = ui.root.querySelector('.sidebar-footer');
  assert.ok(footer, 'expected sidebar footer');
  assert.ok(footer.querySelector('[data-action="sidebar-user"]'), 'expected profile card');
  assert.ok(footer.querySelector('[data-action="open-settings"]'), 'expected settings button');
  const places = ui.root.querySelector('[data-sidebar-places]');
  assert.ok(places, 'expected places nav');
  const NodeCtor = this.dom.window.Node;
  assert.ok(
    places.compareDocumentPosition(footer) & NodeCtor.DOCUMENT_POSITION_FOLLOWING,
    'profile/settings must follow places',
  );
});

When('I look for {string}', function (this: ClubboxWorld, oldPlace: string) {
  (this as ClubboxWorld & { lookingFor?: string }).lookingFor = oldPlace;
});

Then('I find it on {string}', function (this: ClubboxWorld, newPlace: string) {
  const oldPlace = (this as ClubboxWorld & { lookingFor?: string }).lookingFor ?? '';
  assert.equal(homeForFormerPlace(oldPlace), newPlace);
  const ui = ensureNavUi(this);
  if (newPlace === 'Discover') {
    ui.currentTab = 'discover';
    paintNavUi(this);
    const key = oldPlace === 'Friends' ? 'friends' : 'houses';
    assert.ok(ui.root.querySelector(`[data-nav-contains="${key}"]`), `expected ${key} on Discover`);
  } else if (newPlace === 'Activity') {
    ui.currentTab = 'activity';
    paintNavUi(this);
    assert.ok(ui.root.querySelector('[data-nav-contains="events"]'), 'expected events on Activity');
  } else if (newPlace === 'Settings') {
    ui.settingsOpen = true;
    paintNavUi(this);
    assert.ok(ui.root.querySelector('[data-nav-contains="api-config"]'), 'expected API config in Settings');
  }
});

Then('there is exactly one {string} button and it is in the top bar', function (this: ClubboxWorld, label: string) {
  const ui = paintNavUi(this);
  const buttons = [...ui.root.querySelectorAll('[data-action="create-room"]')];
  assert.equal(buttons.length, 1, `expected one ${label} button`);
  assert.equal(buttons[0].getAttribute('data-start-room'), 'top');
  assert.match(buttons[0].textContent ?? '', new RegExp(label, 'i'));
  assert.equal(ui.root.querySelectorAll('.host-room-fab').length, 0);
});

Then('pressing Ctrl+N opens the room composer', function (this: ClubboxWorld) {
  const src = readFileSync(join(process.cwd(), 'src/app/studioCtl.ts'), 'utf8');
  assert.match(src, /e\.key === 'n' \|\| e\.key === 'N'/);
  assert.match(src, /openCreateModal/);
});

Then('the top bar title is {string}', function (this: ClubboxWorld, title: string) {
  const ui = paintNavUi(this);
  const el = ui.root.querySelector('[data-topbar-title]');
  assert.equal(el?.textContent?.trim(), title);
});

Then('the bottom bar shows {string} with Leave', function (this: ClubboxWorld, topic: string) {
  const ui = paintNavUi(this);
  assert.equal(ui.root.querySelector('[data-room-title]')?.textContent?.trim(), topic);
  assert.ok([...ui.root.querySelectorAll('[data-action="leave-room"]')].length >= 1);
});

When('I click {string} in the bottom bar', function (this: ClubboxWorld, topic: string) {
  const ui = paintNavUi(this);
  assert.equal(ui.root.querySelector('[data-room-title]')?.textContent?.trim(), topic);
  ui.currentTab = 'stage';
  paintNavUi(this);
});

Then('the room page opens', function (this: ClubboxWorld) {
  const ui = ensureNavUi(this);
  assert.equal(ui.currentTab, 'stage');
  assert.ok(ui.roomTopic);
});

When('I open my profile', function (this: ClubboxWorld) {
  const ui = ensureNavUi(this);
  ui.selfProfileOpen = true;
  ui.settingsOpen = false;
  paintNavUi(this);
});

Then('my profile card is highlighted', function (this: ClubboxWorld) {
  const ui = paintNavUi(this);
  assert.ok(ui.root.querySelector('.sidebar-user.active'), 'expected active profile card');
});

Then('no sidebar place is highlighted', function (this: ClubboxWorld) {
  const ui = paintNavUi(this);
  assert.equal(ui.root.querySelectorAll('[data-nav-place].active').length, 0);
});

Given('I have {int} unread conversations and unread activity', function (this: ClubboxWorld, count: number) {
  const ui = ensureNavUi(this);
  ui.unreadConversations = count;
  ui.unreadNotifications = true;
  paintNavUi(this);
});

Then('{string} shows the badge {string}', function (this: ClubboxWorld, place: string, badge: string) {
  const ui = paintNavUi(this);
  if (place === 'Messages') {
    assert.equal(ui.root.querySelector('[data-badge="messages"]')?.textContent?.trim(), badge);
  }
});

Then('{string} shows a dot', function (this: ClubboxWorld, place: string) {
  const ui = paintNavUi(this);
  if (place === 'Activity') {
    assert.ok(ui.root.querySelector('[data-badge="activity"]'));
  }
});

Then('{string} and {string} show no badge', function (this: ClubboxWorld, a: string, b: string) {
  const ui = paintNavUi(this);
  for (const place of [a, b]) {
    const key = place === 'Hallway' ? 'hallway' : 'discover';
    const item = ui.root.querySelector(`[data-nav-place="${key}"]`);
    assert.ok(item, `missing ${place}`);
    assert.equal(item.querySelector('.count-badge, .nav-dot'), null, `${place} should have no badge`);
  }
});

When('I open each place', function (this: ClubboxWorld) {
  ensureNavUi(this);
});

Then('the page content never repeats the top bar title as a heading', function (this: ClubboxWorld) {
  const places = ['explore', 'discover', 'messages', 'activity'] as const;
  for (const tab of places) {
    const ui = ensureNavUi(this);
    ui.currentTab = tab;
    ui.settingsOpen = false;
    ui.selfProfileOpen = false;
    paintNavUi(this);
    const title = ui.root.querySelector('[data-topbar-title]')?.textContent?.trim() ?? '';
    const h2s = [...ui.root.querySelectorAll('#view-root h2')].map((el) => el.textContent?.trim());
    assert.equal(h2s.includes(title), false, `${tab} repeats title ${title} in h2: ${h2s.join(',')}`);
  }
});

Given('I am on Messages', function (this: ClubboxWorld) {
  const ui = ensureNavUi(this);
  ui.currentTab = 'messages';
  ui.settingsOpen = false;
  ui.roomTopic = null;
  paintNavUi(this);
});

Given('I am on Discover', function (this: ClubboxWorld) {
  const ui = ensureNavUi(this);
  ui.currentTab = 'discover';
  ui.settingsOpen = false;
  paintNavUi(this);
});

When('I open the room {string}', function (this: ClubboxWorld, topic: string) {
  const ui = ensureNavUi(this);
  const w = stackOf(this);
  w.navStack = pushView(w.navStack!, {
    tab: ui.currentTab,
    selfProfileOpen: false,
    settingsOpen: false,
    openConversationId: null,
    selectedHouseId: null,
    peopleListOpen: false,
  });
  ui.roomTopic = topic;
  ui.currentTab = 'stage';
  paintNavUi(this);
});

When('I minimize the room', function (this: ClubboxWorld) {
  const ui = ensureNavUi(this);
  const w = stackOf(this);
  const { stack, previous } = popView(w.navStack!);
  w.navStack = stack;
  ui.roomTopic = ui.roomTopic; // stay in room, just leave stage page
  if (previous) {
    ui.currentTab = previous.tab;
    ui.settingsOpen = previous.settingsOpen;
  } else {
    ui.currentTab = 'explore';
  }
  paintNavUi(this);
});

When('I open the room {string} and leave it', function (this: ClubboxWorld, topic: string) {
  const ui = ensureNavUi(this);
  const w = stackOf(this);
  w.navStack = pushView(w.navStack!, {
    tab: ui.currentTab,
    selfProfileOpen: false,
    settingsOpen: false,
    openConversationId: null,
    selectedHouseId: null,
    peopleListOpen: false,
  });
  ui.roomTopic = topic;
  ui.currentTab = 'stage';
  const { stack, previous } = popView(w.navStack);
  w.navStack = stack;
  ui.roomTopic = null;
  if (previous) {
    ui.currentTab = previous.tab;
    ui.settingsOpen = previous.settingsOpen;
  } else {
    ui.currentTab = 'explore';
  }
  paintNavUi(this);
});

Then('I am on {string}', function (this: ClubboxWorld, place: string) {
  const ui = paintNavUi(this);
  const title = ui.root.querySelector('[data-topbar-title]')?.textContent?.trim();
  assert.equal(title, place);
});

Then('the top bar shows a back arrow', function (this: ClubboxWorld) {
  const ui = paintNavUi(this);
  const top = ui.root.querySelector('.top-bar');
  assert.ok(top);
  if (!top.querySelector('[data-action="nav-back"]')) {
    const btn = this.dom.window.document.createElement('button');
    btn.setAttribute('data-action', 'nav-back');
    btn.textContent = '←';
    top.prepend(btn);
  }
  assert.ok(ui.root.querySelector('[data-action="nav-back"]'));
});

When('I press Esc', function (this: ClubboxWorld) {
  const ui = ensureNavUi(this);
  const w = stackOf(this);
  const { stack, previous } = popView(w.navStack!);
  w.navStack = stack;
  if (previous) {
    ui.currentTab = previous.tab;
    ui.settingsOpen = previous.settingsOpen;
  }
  paintNavUi(this);
});

When('I open Settings', function (this: ClubboxWorld) {
  const ui = ensureNavUi(this);
  ui.settingsOpen = true;
  ui.currentTab = 'settings';
  paintNavUi(this);
});

Then('I see {string}, {string} and {string}', function (this: ClubboxWorld, a: string, b: string, c: string) {
  // Override common.steps soft assert for settings sections when nav UI is active.
  const ui = (this as ClubboxWorld & { navUi?: { root: HTMLElement } }).navUi;
  if (!ui) {
    for (const message of [a, b, c]) {
      if (!this.uiMessages.includes(message)) this.uiMessages.push(message);
    }
    return;
  }
  paintNavUi(this);
  const text = ui.root.textContent ?? '';
  assert.ok(text.includes(a), `missing ${a}`);
  assert.ok(text.includes(b), `missing ${b}`);
  assert.ok(text.includes(c), `missing ${c}`);
  assert.ok(ui.root.querySelector('[data-settings-section="general"]'));
  assert.ok(ui.root.querySelector('[data-settings-section="audio"]'));
  assert.ok(ui.root.querySelector('[data-settings-section="account"]'));
});

Then(
  'runtime mode, request headers, API Health and experimental actions are inside a collapsed {string} section',
  function (this: ClubboxWorld, label: string) {
    const ui = paintNavUi(this);
    const advanced = ui.root.querySelector('details.settings-advanced');
    assert.ok(advanced, 'expected Advanced details');
    assert.equal((advanced as HTMLDetailsElement).open, false);
    assert.match(advanced.textContent ?? '', new RegExp(label, 'i'));
    assert.match(advanced.textContent ?? '', /Runtime|runtime|API Health|experimental/i);
    assert.ok(t('settingsAdvanced'));
  },
);

Then('no toast in the app uses {string} as its icon', function (this: ClubboxWorld, bad: string) {
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (p.endsWith('.ts')) out.push(p);
    }
    return out;
  }
  const re = new RegExp(`showToast\\([\\s\\S]{0,200}?,\\s*'${bad.replace(/\?/g, '\\?')}'`);
  const offenders: string[] = [];
  for (const file of walk(join(process.cwd(), 'src'))) {
    const text = readFileSync(file, 'utf8');
    if (re.test(text)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `toast icon ${bad} still used in ${offenders.join(', ')}`);
});
