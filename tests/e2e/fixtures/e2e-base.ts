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
// Number of per-worker environments global-setup pre-seeds. Must be >= the
// Playwright worker count. Single source of truth for both global-setup and this
// fixture; override with E2E_WORKER_COUNT if a machine runs more workers.
export const WORKER_COUNT = parseInt(process.env.E2E_WORKER_COUNT ?? '10', 10);

const USERNAME_INPUT = '[data-testid="input-username"], #username';
const PASSWORD_INPUT = '[data-testid="input-password"], #password';

async function loginWorker(browser: Browser, username: string, file: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const page = await browser.newPage({ storageState: undefined });
    try {
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
      // `.first()` makes precedence explicit for the union selector (avoids
      // Playwright strict-mode ambiguity if both the testid and #id resolve).
      await page.locator(USERNAME_INPUT).first().waitFor({ state: 'visible', timeout: 30000 });
      await page.locator(USERNAME_INPUT).first().fill(username);
      await page.locator(PASSWORD_INPUT).first().fill(WORKER_PASSWORD);

      // The submit button is disabled while loading; wait until it is enabled,
      // then submit via Enter (more robust than clicking a re-rendering button).
      const submit = page.locator('[data-testid="button-login"], button[type="submit"]').first();
      await submit.waitFor({ state: 'visible', timeout: 15000 });
      await page.locator(PASSWORD_INPUT).first().press('Enter');

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
      if (id >= WORKER_COUNT) {
        throw new Error(
          `Playwright worker parallelIndex=${id} has no pre-seeded environment ` +
          `(global-setup created ${WORKER_COUNT}). Raise E2E_WORKER_COUNT (and the ` +
          `matching count in global-setup) or cap Playwright 'workers' <= ${WORKER_COUNT}.`,
        );
      }
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
