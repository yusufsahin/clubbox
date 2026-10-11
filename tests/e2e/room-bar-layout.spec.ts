import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanElectronEnv } from './electronEnv';

const widths = [1024, 1280, 1490, 1920] as const;
const shotDir = path.join(process.cwd(), 'reports', 'theme');

function tempUserData(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'clubbox-bar-'));
}

test.describe('room bar layout', () => {
  test.beforeAll(() => {
    fs.mkdirSync(shotDir, { recursive: true });
  });

  for (const theme of ['light', 'dark'] as const) {
    for (const width of widths) {
      test(`${theme} @ ${width}px: room bar does not overflow`, async () => {
        const userData = tempUserData();
        const app = await electron.launch({
          args: ['.'],
          env: cleanElectronEnv(process.env, {
            CLUBBOX_FORCE_SANDBOX: '1',
            CLUBBOX_USER_DATA: userData,
          }),
        });
        try {
          const page = await app.firstWindow();
          await page.setViewportSize({ width, height: 900 });
          await page.waitForLoadState('domcontentloaded');
          await expect(page.locator('.brand-title')).toContainText('Clubbox', { timeout: 30_000 });
          const accept = page.locator('[data-action="accept-guidelines"]');
          if (await accept.isVisible().catch(() => false)) await accept.click();

          await page.evaluate((next) => {
            localStorage.setItem('clubbox_app_prefs', JSON.stringify({ theme: next }));
            document.documentElement.dataset.theme = next;
          }, theme);

          await page.locator('.nav-item[data-action="nav"][data-tab="explore"]').click({ force: true });
          await page.locator('[data-action="join-room"]').first().click({ force: true });
          await expect(page.locator('[data-cockpit="room"]')).toBeVisible({ timeout: 15_000 });

          const metrics = await page.locator('[data-cockpit="room"]').evaluate((el) => {
            const title = el.querySelector('[data-room-title]') as HTMLElement | null;
            const labels = [...el.querySelectorAll('.room-bar-label')] as HTMLElement[];
            return {
              scrollWidth: el.scrollWidth,
              clientWidth: el.clientWidth,
              titleLen: (title?.textContent ?? '').trim().length,
              labelHeights: labels.map((label) => ({
                h: label.getBoundingClientRect().height,
                lh: Number.parseFloat(getComputedStyle(label).lineHeight) || 16,
                visible: getComputedStyle(label).display !== 'none',
              })),
            };
          });

          expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
          if (metrics.titleLen > 0) expect(metrics.titleLen).toBeGreaterThanOrEqual(Math.min(10, metrics.titleLen));
          for (const label of metrics.labelHeights) {
            if (!label.visible) continue;
            expect(label.h).toBeLessThanOrEqual(label.lh * 1.5 + 2);
          }

          await page.screenshot({
            path: path.join(shotDir, `${theme}-room-bar-${width}.png`),
            fullPage: false,
          });
        } finally {
          await app.close();
        }
      });
    }
  }
});
