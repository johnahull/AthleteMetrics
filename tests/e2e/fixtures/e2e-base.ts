/**
 * Per-worker authentication base test.
 *
 * The root cause of the CI E2E failures was that every spec shared ONE admin
 * user + org + session. Under parallel workers this produced ~50% session-
 * validation 401s and single-user rate-limit exhaustion. Per-worker isolation
 * fixes it: run #471 confirmed search 401s dropped from 100% to 0% and auth/me
 * 401s from ~50% to ~31%.
 *
 * That first attempt regressed the count only because the worker LOGIN was
 * flaky — a worker-scoped fixture failure fails every spec on that worker. This
 * version hardens the login (retries + explicit enabled-button wait) so all
 * workers authenticate reliably.
 *
 * Specs import { test, expect } from this file instead of '@playwright/test'.
 */
import { test as base, expect, type Page, type Browser } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirnameLocal = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL =
  process.env.STAGING_URL || process.env.TESTING_URL || 'http://localhost:5000';

export const WORKER_USER_PREFIX = 'e2e-worker-';
export const WORKER_PASSWORD = 'WorkerPass123!';

async function loginWorker(browser: Browser, username: string, file: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const page = await browser.newPage({ storageState: undefined });
    try {
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid="input-username"], #username', { timeout: 30000 });
      await page.fill('[data-testid="input-username"], #username', username);
      await page.fill('[data-testid="input-password"], #password', WORKER_PASSWORD);

      // The submit button is disabled while loading; wait until it is enabled,
      // then submit via Enter (more robust than clicking a re-rendering button).
      const submit = page.locator('[data-testid="button-login"], button[type="submit"]').first();
      await submit.waitFor({ state: 'visible', timeout: 15000 });
      await page.locator('[data-testid="input-password"], #password').press('Enter');

      await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 20000 });
      await page.context().storageState({ path: file });
      await page.close();
      return;
    } catch (err) {
      lastError = err;
      await page.close().catch(() => {});
      // Brief backoff before retrying (also lets any transient lock clear).
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw new Error(`Worker login failed for ${username} after retries: ${String(lastError)}`);
}

type WorkerAuthFixtures = { workerStorageState: string };

export const test = base.extend<Record<string, never>, WorkerAuthFixtures>({
  storageState: ({ workerStorageState }, use) => use(workerStorageState),

  workerStorageState: [
    async ({ browser }, use, workerInfo) => {
      const id = workerInfo.parallelIndex;
      const dir = path.resolve(__dirnameLocal, '../../playwright/.auth');
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `worker-${id}.json`);
      await loginWorker(browser, `${WORKER_USER_PREFIX}${id}`, file);
      await use(file);
    },
    { scope: 'worker' },
  ],
});

export { expect };
export type { Page };
