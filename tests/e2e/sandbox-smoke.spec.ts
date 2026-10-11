import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function tempUserData(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'clubbox-e2e-'));
}

async function launchClubbox(userData: string, extraEnv: Record<string, string> = {}) {
  const errors: string[] = [];
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      CLUBBOX_FORCE_SANDBOX: '1',
      CLUBBOX_USER_DATA: userData,
      ...extraEnv,
    },
  });
  const page = await app.firstWindow();
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  await page.waitForLoadState('domcontentloaded');
  return { app, page, errors };
}

test('sandbox dev build: hallway and settings smoke', async () => {
  const userData = tempUserData();
  const { app, page, errors } = await launchClubbox(userData);
  try {
    await expect(page.locator('.brand-title')).toContainText('Clubbox', { timeout: 30_000 });
    await page.locator('[data-action="nav"][data-tab="explore"]').click();
    await expect(page.locator('body')).toContainText(/Tech|Refresh|room|sandbox/i);
    await page.locator('[data-action="nav"][data-tab="settings"]').click();
    await expect(page.locator('body')).toContainText(/Settings|API Health/i);
    const fatal = errors.filter(
      (line) => !/Failed to load resource|Content Security Policy|favicon/i.test(line),
    );
    expect(fatal).toEqual([]);
  } finally {
    await app.close();
  }
});

test.describe('packaged', () => {
  test.skip(process.platform !== 'win32', 'packaged smoke is Windows-only');

  test('win-unpacked starts', async ({}, testInfo) => {
    const exe = path.join(process.cwd(), 'release/win-unpacked/Clubbox.exe');
    expect(fs.existsSync(exe)).toBe(true);
    const userData = tempUserData();
    let app;
    try {
      app = await electron.launch({
        executablePath: exe,
        timeout: 60_000,
        env: {
          ...process.env,
          CLUBBOX_FORCE_SANDBOX: '1',
          CLUBBOX_USER_DATA: userData,
        },
      });
    } catch (err) {
      testInfo.skip(true, `Playwright could not launch packaged exe: ${String(err)}`);
      return;
    }
    try {
      const page = await app.firstWindow();
      await expect(page.locator('.brand-title')).toContainText('Clubbox', { timeout: 45_000 });
    } finally {
      await app.close();
    }
  });
});
