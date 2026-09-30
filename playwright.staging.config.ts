import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for Staging Environment Testing
 *
 * This configuration is optimized for E2E testing against a deployed staging environment.
 * It runs tests sequentially to avoid race conditions and captures screenshots/videos on failure.
 *
 * Environment Variables:
 * - STAGING_URL: Base URL of staging environment (default: http://localhost:5000)
 * - STAGING_USERNAME: Username for test account
 * - STAGING_PASSWORD: Password for test account
 */

export default defineConfig({
  // Test directory
  testDir: './tests/e2e',
  // Scaffolding templates under tests/e2e/templates/ contain literal [entity]/[ENTITY]
  // placeholders and are meant to be copied, not executed. Exclude them so they
  // don't register as failing specs.
  testIgnore: '**/templates/**',

  // Maximum time one test can run for (60 seconds)
  timeout: 60 * 1000,

  // Test execution configuration
  fullyParallel: true, // Run tests in parallel for faster execution
  workers: process.env.CI ? 4 : 4, // 4 workers in CI (optimized for speed with chromium-only), 4 locally

  // Retry strategy:
  // - CI environments (process.env.CI): 1 retry for network flakiness/staging server issues
  // - Local development: 0 retries to surface flaky tests early
  // Rationale: Staging environment can have intermittent network issues or slow responses
  // that don't indicate test failures. Retries help distinguish real failures from
  // environmental flakiness while keeping local development strict for test quality.
  retries: process.env.CI ? 1 : 0,

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['list'],
  ],

  // Shared settings for all projects
  use: {
    // Base URL from environment variable
    baseURL: process.env.STAGING_URL || 'http://localhost:5000',

    // Browser options
    trace: 'retain-on-failure', // Collect trace on failure
    screenshot: 'only-on-failure', // Take screenshot on failure
    video: 'retain-on-failure', // Record video on failure

    // Navigation timeout
    navigationTimeout: 30 * 1000,

    // Action timeout
    actionTimeout: 15 * 1000,

    // Viewport size
    viewport: { width: 1280, height: 720 },

    // User agent
    userAgent: 'AthleteMetrics-E2E-Tests/1.0',

    // Extra HTTP headers
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  },

  // Configure projects for different browsers
  // CI: Only test chromium for speed (8-10 min vs 45 min with all browsers)
  // Local: Test full browser matrix including mobile viewports
  // Projects configuration
  // IMPORTANT: storageState must be set unconditionally here.
  // The existsSync check was causing auth failures because:
  // 1. Config loads BEFORE globalSetup runs
  // 2. File doesn't exist yet at config load time
  // 3. existsSync returns false, so storageState was never set
  // 4. globalSetup creates the file, but config was already evaluated
  // 5. Tests ran without auth state
  //
  // Playwright only reads storageState when creating browser contexts (AFTER globalSetup),
  // so it's safe to reference the file path even before it exists.
  projects: process.env.CI ? [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Reuse authentication state created by global-setup.ts
        storageState: './playwright/.auth/user.json',
      },
    },
  ] : [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: './playwright/.auth/user.json',
      },
    },

    // Uncomment to test on additional browsers:
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },

    // Mobile viewports
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
        storageState: './playwright/.auth/user.json',
      },
    },
    {
      name: 'Mobile Safari',
      use: {
        ...devices['iPhone 12'],
        storageState: './playwright/.auth/user.json',
      },
    },
  ],

  // Output folder for test artifacts
  outputDir: 'test-results/',

  // Folder for screenshots
  snapshotDir: 'screenshots/',

  // Whether to preserve output directory
  preserveOutput: 'failures-only',

  // Global setup/teardown
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',

  // Web server configuration (not used for staging - staging server should already be running)
  // webServer: undefined,
});
