import { test, expect, _electron as electron, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

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
    env: { ...process.env, CLUBBOX_FORCE_SANDBOX: '1', CLUBBOX_USER_DATA: userData },
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

const shotDir = path.join(process.cwd(), 'reports', 'theme');

test.describe('theme contrast (sandbox)', () => {
  test.beforeAll(() => {
    fs.mkdirSync(shotDir, { recursive: true });
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`${theme}: hallway, stage, messages, settings, modal, toast`, async () => {
      const { app, page } = await launchSandbox();
      try {
        await setTheme(page, theme);

        await page.locator('.nav-item[data-action="nav"][data-tab="explore"]').click({ force: true });
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

        const room = page.locator('.room-card, [data-action="join-room"]').first();
        if (await room.count()) {
          await room.click({ force: true });
          await page.waitForTimeout(500);
        }
        await page.locator('.nav-item[data-action="nav"][data-tab="stage"]').click({ force: true });
        await page.screenshot({ path: path.join(shotDir, `${theme}-stage.png`), fullPage: true });
        await assertNoContrastViolations(page, `${theme} stage`);

        await page.locator('.nav-item[data-action="nav"][data-tab="messages"]').click({ force: true });
        await page.screenshot({ path: path.join(shotDir, `${theme}-messages.png`), fullPage: true });
        await assertNoContrastViolations(page, `${theme} messages`);

        await page.locator('.nav-item[data-action="nav"][data-tab="settings"]').click({ force: true });
        await page.screenshot({ path: path.join(shotDir, `${theme}-settings.png`), fullPage: true });
        await assertNoContrastViolations(page, `${theme} settings`);

        const createBtn = page.locator('[data-action="create-room"]').first();
        if (await createBtn.isVisible().catch(() => false)) {
          await createBtn.click({ force: true });
          await page.waitForTimeout(300);
          await page.screenshot({ path: path.join(shotDir, `${theme}-modal.png`), fullPage: true });
          await assertNoContrastViolations(page, `${theme} modal`);
          await page.keyboard.press('Escape');
        }

        await page.evaluate(() => {
          const toast = document.createElement('div');
          toast.className = 'toast';
          toast.textContent = 'Theme check';
          document.body.appendChild(toast);
        });
        await page.screenshot({ path: path.join(shotDir, `${theme}-toast.png`), fullPage: true });
        await assertNoContrastViolations(page, `${theme} toast`);
      } finally {
        await app.close();
      }
    });
  }
});
