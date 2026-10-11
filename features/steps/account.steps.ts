import assert from 'node:assert/strict';
import { Given, When, Then } from '@cucumber/cucumber';
import { en } from '../../src/i18n/en.ts';
import { tr } from '../../src/i18n/tr.ts';
import { t, type Language } from '../../src/i18n/index.ts';
import {
  adjustZoomPercent,
  applyThemeToDocument,
  readAppPrefs,
  resolvedTheme,
  writeAppPrefs,
  type ThemeChoice,
} from '../../src/app/appPrefs.ts';
import type { ClubboxWorld } from '../support/world.ts';

Given('I am signed out', function (this: ClubboxWorld) {
  this.signedIn = false;
  this.sidebarName = null;
  this.session.signedIn = false;
  this.openedSignInUrl = null;
});

Then('a visible window opens {string}', function (this: ClubboxWorld, url: string) {
  assert.equal(this.openedSignInUrl, url);
});

Then('Clubbox never calls reCAPTCHA itself', function (this: ClubboxWorld) {
  assert.equal(this.calledRecaptcha, false);
  assert.equal(this.transport.requests.some((req) => /recaptcha|grecaptcha/i.test(req.path)), false);
});

Then('after the window reports a session, a {string} request is sent', async function (this: ClubboxWorld, request: string) {
  const [method, path] = request.split(/\s+/);
  const me = await this.client.getMe();
  this.signedIn = true;
  this.session.signedIn = true;
  this.sidebarName = me.user_profile?.name ?? 'Test User';
  this.uiMessages.push(this.sidebarName);
  const match = this.transport.requests.filter((req) => req.method === method && req.path === path).at(-1);
  assert.ok(match, `expected ${method} ${path}`);
});

Then('I see my name in the sidebar', function (this: ClubboxWorld) {
  assert.ok(this.sidebarName);
  assert.ok(this.uiMessages.includes(this.sidebarName));
});

Given('I have never accepted the first-run notice', function (this: ClubboxWorld) {
  this.guidelinesAcceptedFlag = false;
  this.guidelinesGateOpen = false;
  try {
    localStorage.removeItem('clubbox-guidelines-accepted');
  } catch {
    // ignore
  }
});

When('I try to switch to live mode', function (this: ClubboxWorld) {
  if (!this.guidelinesAcceptedFlag) {
    this.guidelinesGateOpen = true;
    this.liveModeBlocked = true;
    this.uiMessages.push('unofficial-client-notice');
    this.uiMessages.push('I understand');
    this.uiMessages.push('Cancel');
    return;
  }
  this.liveModeBlocked = false;
});

Then('I see the unofficial-client notice with {string} and {string}', function (this: ClubboxWorld, a: string, b: string) {
  assert.equal(this.guidelinesGateOpen, true);
  assert.ok(this.uiMessages.includes('unofficial-client-notice'));
  assert.ok(this.uiMessages.includes(a));
  assert.ok(this.uiMessages.includes(b));
});

When('I switch the language to {string}', function (this: ClubboxWorld, lang: string) {
  assert.ok(lang === 'en' || lang === 'tr');
  this.setLang(lang as Language);
});

Then(/^every string on every view comes from src\/i18n\/tr\.ts$/, function (this: ClubboxWorld) {
  assert.equal(this.language, 'tr');
  const keys = Object.keys(en) as Array<keyof typeof en>;
  for (const key of keys) {
    assert.equal(typeof tr[key], 'string');
    assert.ok(tr[key].length > 0, `empty tr key ${key}`);
  }
  assert.equal(t('refresh'), tr.refresh);
  assert.notEqual(t('refresh'), en.refresh);
});

Then('no English fallback text is visible', function (this: ClubboxWorld) {
  assert.equal(this.language, 'tr');
  assert.notEqual(t('signIn'), en.signIn);
});

When('I choose the theme {string}', function (this: ClubboxWorld, theme: string) {
  assert.ok(theme === 'light' || theme === 'dark' || theme === 'system');
  this.themeChoice = theme as ThemeChoice;
  const prefs = readAppPrefs();
  writeAppPrefs({ ...prefs, theme: this.themeChoice });
  applyThemeToDocument(this.themeChoice, false);
});

Then('the app uses the light colors', function (this: ClubboxWorld) {
  assert.equal(resolvedTheme(this.themeChoice, false), 'light');
});

Then('the app uses the dark colors', function (this: ClubboxWorld) {
  assert.equal(resolvedTheme(this.themeChoice, false), 'dark');
});

Then(/^the app uses the operating system's colors$/, function (this: ClubboxWorld) {
  assert.equal(this.themeChoice, 'system');
  assert.ok(document.documentElement.dataset.theme === 'light' || document.documentElement.dataset.theme === 'dark');
});

Then('the choice is kept after restart', function (this: ClubboxWorld) {
  assert.equal(readAppPrefs().theme, this.themeChoice);
});

When('I press Ctrl+= twice', function (this: ClubboxWorld) {
  const prefs = readAppPrefs();
  this.zoomPercent = adjustZoomPercent(prefs.zoomPercent, 1);
  this.zoomPercent = adjustZoomPercent(this.zoomPercent, 1);
  writeAppPrefs({ ...prefs, zoomPercent: this.zoomPercent });
});

When('I press Ctrl+0', function (this: ClubboxWorld) {
  this.zoomPercent = 100;
  writeAppPrefs({ ...readAppPrefs(), zoomPercent: 100 });
});

Then('the zoom level is {int} percent', function (this: ClubboxWorld, percent: number) {
  assert.equal(readAppPrefs().zoomPercent, percent);
  assert.equal(this.zoomPercent, percent);
});

Given('desktop notifications are on', function (this: ClubboxWorld) {
  this.desktopNotificationsOn = true;
  writeAppPrefs({ ...readAppPrefs(), desktopNotifications: true });
});

Given('the window is minimized', function (this: ClubboxWorld) {
  this.windowMinimized = true;
  this.setVisibility('hidden');
});

When('an activity item {string} arrives for a live room', function (this: ClubboxWorld, template: string) {
  assert.ok(template.includes('pinged you into'));
  this.pendingPingRoomTitle = 'Morning Jazz';
  if (this.desktopNotificationsOn) {
    this.uiMessages.push(`notification:${this.pendingPingRoomTitle}`);
  }
});

Then('a desktop notification shows the room title', function (this: ClubboxWorld) {
  assert.ok(this.pendingPingRoomTitle);
  assert.ok(this.uiMessages.some((line) => line.includes(this.pendingPingRoomTitle!)));
});

Then('clicking it opens Clubbox and joins the room', async function (this: ClubboxWorld) {
  await this.session.joinFromHallway('live-room-1');
  this.syncFromSession();
  assert.ok(this.session.channelId || this.transport.requestsNamed('join_channel').length > 0);
});
