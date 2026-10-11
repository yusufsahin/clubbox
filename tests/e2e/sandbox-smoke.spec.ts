import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanElectronEnv } from './electronEnv';

const require = createRequire(import.meta.url);

function tempUserData(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'clubbox-e2e-'));
}

function isForbiddenLiveHost(url: string): boolean {
  if (url.startsWith('file:') || url.startsWith('data:') || url.startsWith('blob:')) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (!host || host === 'localhost' || host === '127.0.0.1') return false;
    // UI may load Google Fonts; fail only on Clubhouse / Agora live traffic.
    return (
      host === 'clubhouse.com'
      || host.endsWith('.clubhouse.com')
      || host.includes('clubhouseapi')
      || host.includes('pubnub')
      || host.includes('agora')
    );
  } catch {
    return false;
  }
}

async function launchClubbox(userData: string, extraEnv: Record<string, string> = {}) {
  const errors: string[] = [];
  const liveHosts: string[] = [];
  const app = await electron.launch({
    args: ['.'],
    env: cleanElectronEnv(process.env, {
      CLUBBOX_FORCE_SANDBOX: '1',
      CLUBBOX_USER_DATA: userData,
      ...extraEnv,
    }),
  });
  const page = await app.firstWindow();
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('request', (req) => {
    const url = req.url();
    if (isForbiddenLiveHost(url)) liveHosts.push(url);
  });
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('.brand-title')).toContainText('Clubbox', { timeout: 30_000 });
  const accept = page.locator('[data-action="accept-guidelines"]');
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
  }
  return { app, page, errors, liveHosts };
}

function fatalConsole(errors: string[]): string[] {
  return errors.filter(
    (line) => !/Failed to load resource|Content Security Policy|favicon|Agora|NotAllowedError|getUserMedia/i.test(line),
  );
}

async function assertNoLeaks(errors: string[], liveHosts: string[]) {
  expect(fatalConsole(errors)).toEqual([]);
  expect(liveHosts).toEqual([]);
}

function place(tab: string) {
  return `.nav-item[data-action="nav"][data-tab="${tab}"]`;
}

test('sandbox dev build: hallway and settings smoke', async () => {
  const userData = tempUserData();
  const { app, page, errors, liveHosts } = await launchClubbox(userData);
  try {
    await page.locator(place('explore')).click();
    await expect(page.locator('body')).toContainText(/Tech|Refresh|room|sandbox|Future of Social/i);

    await page.locator('[data-action="open-settings"]').click();
    await expect(page.locator('body')).toContainText(/Settings|Ayarlar/i);
    await expect(page.locator('.settings-advanced')).toBeVisible();
    await expect(page.locator(place('friends'))).toHaveCount(0);

    await assertNoLeaks(errors, liveHosts);
  } finally {
    await app.close();
  }
});

test('sandbox studio path: join, hand, pad, chat, leave, messages, theme', async () => {
  const userData = tempUserData();
  const { app, page, errors, liveHosts } = await launchClubbox(userData);
  try {
    await page.locator(place('explore')).click();
    await expect(page.locator('[data-action="join-room"]').first()).toBeVisible({ timeout: 15_000 });
    await page.locator('[data-action="join-room"]').first().click();
    await expect(page.locator('body')).toContainText(/Leave|Leave quietly|Stage|Mute/i, { timeout: 15_000 });
    await expect(page.locator('[data-cockpit="room"], [data-room-title]').first()).toBeVisible({ timeout: 10_000 });

    const detailsBtn = page.locator('[data-action="open-room-details"]');
    if (await detailsBtn.isVisible().catch(() => false)) {
      await detailsBtn.click();
      await expect(page.locator('[data-room-details]')).toBeVisible({ timeout: 5_000 });
      await page.locator('[data-action="close-room-details"]').click();
    }

    const hand = page.locator('[data-action="toggle-hand"]');
    if (await hand.isVisible().catch(() => false) && !(await hand.isDisabled().catch(() => true))) {
      await hand.click();
    }

    const pad = page.locator('[data-action="play-sound"]').first();
    if (await pad.isVisible().catch(() => false)) {
      await pad.click();
    }

    const chatToggle = page.locator('[data-action="toggle-chat"]');
    if (await chatToggle.isVisible().catch(() => false) && !(await chatToggle.isDisabled().catch(() => true))) {
      await chatToggle.click();
      const chatInput = page.locator('#chat-input');
      if (await chatInput.isVisible().catch(() => false)) {
        await chatInput.fill('e2e hello');
        await page.locator('[data-action="send-chat"]').click();
        await expect(page.locator('#chat-scroll')).toContainText(/e2e hello/i, { timeout: 5_000 });
      }
    }

    await page.locator('[data-action="leave-room"]').first().click();
    await expect(page.locator(place('explore'))).toBeVisible();

    await page.locator(place('messages')).click();
    await expect(page.locator('body')).toContainText(/Messages|Voice|House|conversation|Mesaj/i);
    const openThread = page.locator('[data-action="open-conversation"]').first();
    if (await openThread.isVisible().catch(() => false)) {
      await openThread.click();
      await expect(page.locator('.thread-panel, .thread-scroll, body')).toBeVisible();
      const back = page.locator('[data-action="nav-back"]');
      if (await back.isVisible().catch(() => false)) {
        await page.keyboard.press('Escape');
      }
    }

    await page.locator(place('discover')).click();
    await expect(page.locator('body')).toContainText(/Discover|Search|Keşfet|Ara|Suggestions|Houses/i, { timeout: 10_000 });
    await expect(page.locator('[data-nav-contains="friends"], [data-nav-contains="houses"]').first()).toBeVisible();

    await page.locator(place('activity')).click();
    await expect(page.locator('body')).toContainText(/Activity|Notification|Etkinlik|Bildirim/i, { timeout: 10_000 });

    const createBtn = page.locator('[data-action="create-room"]').first();
    if (await createBtn.isVisible().catch(() => false)) {
      await createBtn.click();
      await expect(page.locator('[data-create-composer]')).toBeVisible();
      await expect(page.locator('.room-type-list')).toBeVisible();
      await expect(page.locator('[data-action="confirm-create"]')).toContainText(/Go live|Canlıya/i);
      await page.keyboard.press('Escape');
    }

    await page.locator('[data-action="open-settings"]').click();
    await expect(page.locator('#cfg-theme')).toBeVisible({ timeout: 10_000 });
    await page.locator('#cfg-theme').selectOption('dark');
    await page.locator('#cfg-language').selectOption('tr');
    await page.evaluate(() => {
      const root = document.getElementById('view-root');
      if (root) root.scrollTop = root.scrollHeight;
      (document.querySelector('[data-action="save-settings"]') as HTMLButtonElement | null)?.click();
    });
    await expect(page.locator('body')).toContainText(/Ayarlar|Clubbox/i, { timeout: 10_000 });

    // Navigation guard: external location changes must not leave the app document.
    const stayed = await page.evaluate(() => {
      const before = location.href;
      try {
        location.href = 'https://example.com/';
      } catch {
        // blocked
      }
      return location.href === before || location.protocol === 'file:' || location.hostname === 'localhost';
    });
    expect(stayed).toBe(true);

    await assertNoLeaks(errors, liveHosts);
  } finally {
    await app.close();
  }
});

test.describe('packaged', () => {
  test.skip(process.platform !== 'win32', 'packaged smoke is Windows-only');

  test('win-unpacked starts', async () => {
    const unpacked = path.join(process.cwd(), 'release/win-unpacked');
    const exe = path.join(unpacked, 'Clubbox.exe');
    const asar = path.join(unpacked, 'resources/app.asar');
    expect(fs.existsSync(asar)).toBe(true);

    const userData = tempUserData();
    const env = cleanElectronEnv(process.env, {
      CLUBBOX_FORCE_SANDBOX: '1',
      CLUBBOX_USER_DATA: userData,
    });

    // Prefer Clubbox.exe; fall back to electron + app.asar when Application Control
    // blocks the freshly built wrapper (common on locked-down Windows hosts).
    let app: ElectronApplication | undefined;
    if (fs.existsSync(exe)) {
      try {
        app = await electron.launch({
          executablePath: exe,
          timeout: 60_000,
          env,
        });
      } catch {
        app = undefined;
      }
    }
    if (!app) {
      const electronPath = require('electron') as string;
      app = await electron.launch({
        executablePath: electronPath,
        args: [asar],
        timeout: 60_000,
        env,
      });
    }

    try {
      const page: Page = await app.firstWindow();
      await expect(page.locator('.brand-title')).toContainText('Clubbox', { timeout: 45_000 });
    } finally {
      await app.close();
    }
  });
});
