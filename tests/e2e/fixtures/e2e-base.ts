/**
 * Per-worker authentication base test.
 *
 * The root cause of the CI E2E failures was that every spec shared ONE admin
 * user + org + session. Under parallel workers this produced ~50% session-
 * validation 401s (concurrent session churn on one user), data pollution, and
 * single-user/single-IP rate-limit exhaustion.
 *
 * This base gives each parallel worker its OWN isolated account (created by
 * global-setup as `e2e-worker-<parallelIndex>` in its own org, with its own
 * seeded athletes/team). A worker-scoped fixture logs that user in once and
 * reuses the session, so there is no cross-worker session/data collision.
 *
 * Specs should import { test, expect } from this file instead of
 * '@playwright/test'.
 */
import { test as base, expect, type Page } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirnameLocal = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL =
  process.env.STAGING_URL || process.env.TESTING_URL || 'http://localhost:5000';

export const WORKER_USER_PREFIX = 'e2e-worker-';
export const WORKER_PASSWORD = 'WorkerPass123!';

type WorkerAuthFixtures = { workerStorageState: string };

export const test = base.extend<Record<string, never>, WorkerAuthFixtures>({
  // Override the built-in storageState with the worker-specific one.
  storageState: ({ workerStorageState }, use) => use(workerStorageState),

  workerStorageState: [
    async ({ browser }, use, workerInfo) => {
      const id = workerInfo.parallelIndex;
      const dir = path.resolve(__dirnameLocal, '../../playwright/.auth');
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `worker-${id}.json`);

      // Log in fresh (own browser context, no inherited state) as this worker's
      // dedicated user, then persist the authenticated storage state.
      const page = await browser.newPage({ storageState: undefined });
      try {
        await page.goto(`${BASE_URL}/login`);
        await page.waitForSelector('[data-testid="input-username"], #username', {
          timeout: 30000,
        });
        await page.fill(
          '[data-testid="input-username"], #username',
          `${WORKER_USER_PREFIX}${id}`,
        );
        await page.fill(
          '[data-testid="input-password"], #password',
          WORKER_PASSWORD,
        );
        await page.click('button[type="submit"]');
        await page.waitForURL((u) => !u.pathname.includes('/login'), {
          timeout: 15000,
        });
        await page.context().storageState({ path: file });
      } finally {
        await page.close();
      }

      await use(file);
    },
    { scope: 'worker' },
  ],
});

export { expect };
export type { Page };
