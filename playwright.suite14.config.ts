import { defineConfig, devices } from '@playwright/test';

/**
 * Minimal Playwright config for running Suite 14 (Parent Registration Dead-End Gate)
 * in isolation during RED/GREEN TDD phases, without requiring the auth setup step.
 *
 * This file should be deleted after TDD is complete and the tests are merged
 * into the main playwright.config.ts run.
 */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/coppa-consent-flow.spec.ts',
  timeout: 30 * 1000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5000',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
