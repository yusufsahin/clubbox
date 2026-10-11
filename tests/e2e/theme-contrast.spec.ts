import { test, expect, _electron as electron, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { cleanElectronEnv } from './electronEnv';

const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

function tempUserData(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'clubbox-theme-'));
}

async function dismissGuidelines(page: Page) {
  const accept = page.locator('[data-action="accept-guidelines"]');
  if (await accept.isVisible().catch(() => false)) await accept.click();
}

async function launchSandbox() {
  const userData = tempUserData();
  const app = await electron.launch({
    args: ['.'],
    env: cleanElectronEnv(process.env, {
      CLUBBOX_FORCE_SANDBOX: '1',
      CLUBBOX_USER_DATA: userData,
    }),
  });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('.brand-title')).toContainText('Clubbox', { timeout: 30_000 });
  await dismissGuidelines(page);
  return { app, page };
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((next) => {
    const key = 'clubbox_app_prefs';
    let prefs: Record<string, unknown> = {};
    try {
      prefs = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, unknown>;
    } catch {
      prefs = {};
    }
    prefs.theme = next;
    localStorage.setItem(key, JSON.stringify(prefs));
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
  }, theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

async function assertNoContrastViolations(page: Page, label: string) {
  const results = await page.evaluate(async (source) => {
    // eslint-disable-next-line no-new-func
    new Function(source)();
    // @ts-expect-error axe global
    return window.axe.run(document, { runOnly: { type: 'rule', values: ['color-contrast'] } });
  }, axeSource);
  expect(results.violations, `${label}: ${JSON.stringify(results.violations, null, 2)}`).toEqual([]);
}

function place(tab: string) {
  return `.nav-item[data-action="nav"][data-tab="${tab}"]`;
}

const shotDir = path.join(process.cwd(), 'reports', 'theme');

test.describe('theme contrast (sandbox)', () => {
  test.beforeAll(() => {
    fs.mkdirSync(shotDir, { recursive: true });
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`${theme}: hallway, discover, house, messages, activity, room, composer, settings, toast`, async () => {
      const { app, page } = await launchSandbox();
      try {
        await setTheme(page, theme);

        await page.locator(place('explore')).click({ force: true });
        await page.screenshot({ path: path.join(shotDir, `${theme}-hallway.png`), fullPage: true });
        await assertNoContrastViolations(page, `${theme} hallway`);

        const topBefore = await page.locator('.top-bar').evaluate((el) => getComputedStyle(el).backgroundColor);
        const sideBefore = await page.locator('.sidebar').evaluate((el) => getComputedStyle(el).backgroundColor);
        const other = theme === 'light' ? 'dark' : 'light';
        await setTheme(page, other);
        const topAfter = await page.locator('.top-bar').evaluate((el) => getComputedStyle(el).backgroundColor);
        const sideAfter = await page.locator('.sidebar').evaluate((el) => getComputedStyle(el).backgroundColor);
        expect(topAfter).not.toEqual(topBefore);
        expect(sideAfter).not.toEqual(sideBefore);
        await setTheme(page, theme);

        await page.locator(place('discover')).click({ force: true });
        await expect(page.locator('[data-nav-contains="friends"], [data-nav-contains="houses"]').first()).toBeVisible({ timeout: 10_000 });
        await page.screenshot({ path: path.join(shotDir, `${theme}-discover.png`), fullPage: true });
        await assertNoContrastViolations(page, `${theme} discover`);

        const houseBtn = page.locator('[data-action="open-house"]').first();
        if (await houseBtn.isVisible().catch(() => false)) {
          await houseBtn.click({ force: true });
          await page.waitForTimeout(400);
          await page.screenshot({ path: path.join(shotDir, `${theme}-house.png`), fullPage: true });
          await assertNoContrastViolations(page, `${theme} house`);
          const back = page.locator('[data-action="nav-back"]');
          if (await back.isVisible().catch(() => false)) await back.click({ force: true });
        }

        await page.locator(place('messages')).click({ force: true });
        await page.screenshot({ path: path.join(shotDir, `${theme}-messages.png`), fullPage: true });
        await assertNoContrastViolations(page, `${theme} messages`);
        const openThread = page.locator('[data-action="open-conversation"]').first();
        if (await openThread.isVisible().catch(() => false)) {
          await openThread.click({ force: true });
          await page.waitForTimeout(300);
          await page.screenshot({ path: path.join(shotDir, `${theme}-conversation.png`), fullPage: true });
          await assertNoContrastViolations(page, `${theme} conversation`);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(200);
        }

        await page.locator(place('activity')).click({ force: true });
        await page.screenshot({ path: path.join(shotDir, `${theme}-activity.png`), fullPage: true });
        await assertNoContrastViolations(page, `${theme} activity`);

        await page.locator(place('explore')).click({ force: true });
        const room = page.locator('[data-action="join-room"]').first();
        if (await room.count()) {
          await room.click({ force: true });
          await page.waitForTimeout(500);
        }
        await page.locator(place('stage')).click({ force: true }).catch(() => undefined);
        await expect(page.locator('#cockpit-root, [data-room-title], [data-action="leave-room"]').first()).toBeVisible({ timeout: 15_000 });
        await page.screenshot({ path: path.join(shotDir, `${theme}-stage.png`), fullPage: true });
        await assertNoContrastViolations(page, `${theme} stage`);

        const detailsBtn = page.locator('[data-action="open-room-details"]');
        if (await detailsBtn.isVisible().catch(() => false)) {
          await detailsBtn.click({ force: true });
          await expect(page.locator('[data-room-details]')).toBeVisible({ timeout: 5_000 });
          await page.screenshot({ path: path.join(shotDir, `${theme}-room-details.png`), fullPage: true });
          await assertNoContrastViolations(page, `${theme} room details`);
          await page.locator('[data-action="close-room-details"]').click({ force: true });
        }

        await page.locator('[data-action="leave-room"]').first().click({ force: true }).catch(() => undefined);

        const createBtn = page.locator('[data-action="create-room"]').first();
        if (await createBtn.isVisible().catch(() => false)) {
          await createBtn.click({ force: true });
          await page.waitForTimeout(300);
          await expect(page.locator('[data-create-composer] .room-type-list')).toBeVisible();
          await page.screenshot({ path: path.join(shotDir, `${theme}-modal.png`), fullPage: true });
          await assertNoContrastViolations(page, `${theme} modal`);
          await page.keyboard.press('Escape');
        }

        await page.locator('[data-action="open-settings"]').click({ force: true });
        const advanced = page.locator('.settings-advanced');
        await expect(advanced).toBeVisible();
        await advanced.evaluate((el) => { (el as HTMLDetailsElement).open = true; });
        await page.screenshot({ path: path.join(shotDir, `${theme}-settings.png`), fullPage: true });
        await assertNoContrastViolations(page, `${theme} settings`);

        await page.evaluate(() => {
          const container = document.getElementById('toast-container') || (() => {
            const el = document.createElement('div');
            el.id = 'toast-container';
            el.className = 'toast-container';
            document.body.appendChild(el);
            return el;
          })();
          const toast = document.createElement('div');
          toast.className = 'toast';
          const icon = document.createElement('span');
          icon.textContent = '✨';
          const text = document.createElement('span');
          text.textContent = 'Theme check';
          toast.append(icon, document.createTextNode(' '), text);
          container.appendChild(toast);
        });
        await page.screenshot({ path: path.join(shotDir, `${theme}-toast.png`), fullPage: true });
        await assertNoContrastViolations(page, `${theme} toast`);
      } finally {
        await app.close();
      }
    });
  }
});
