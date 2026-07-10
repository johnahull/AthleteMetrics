import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for Testing Environment
 *
 * This configuration is optimized for E2E testing against the deployed testing environment.
 * It runs tests sequentially to avoid race conditions and captures screenshots/videos on failure.
 *
 * Environment Variables:
 * - TESTING_URL: Base URL of testing environment (default: https://athletemetrics-testing.up.railway.app)
 * - TESTING_USERNAME: Username for test account
 * - TESTING_PASSWORD: Password for test account
 * - TESTING_DATABASE_URL: PostgreSQL connection string for testing database (optional, for test data setup)
 */

export default defineConfig({
  // Test directory
  testDir: './tests/e2e',
  // Scaffolding templates under tests/e2e/templates/ contain literal [entity]/[ENTITY]
  // placeholders and are meant to be copied, not executed. Exclude them so they
  // don't register as failing specs.
  testIgnore: '**/templates/**',

  // Maximum time one test can run for (120 seconds)
  // Set to 120s (2x staging's 60s) to handle testing environment's slower response times
  // due to cold starts and RBAC tests with multi-org switching
  timeout: 120 * 1000,

  // Test execution configuration
  fullyParallel: true, // Run tests in parallel for faster execution
  workers: process.env.CI ? 2 : 4, // 2 workers in CI (resource-constrained), 4 locally

  // Retry strategy:
  // - CI environments (process.env.CI): 1 retry for network flakiness/server issues
  // - Local development: 0 retries to surface flaky tests early
  // Rationale: Testing environment can have intermittent network issues or slow responses
  // that don't indicate test failures. Retries help distinguish real failures from
  // environmental flakiness while keeping local development strict for test quality.
  retries: process.env.CI ? 1 : 0,

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report-testing' }],
    ['list'],
  ],

  // Shared settings for all projects
  use: {
    // Base URL from environment variable
    baseURL: process.env.TESTING_URL || 'https://athletemetrics-testing.up.railway.app',

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
    userAgent: 'AthleteMetrics-E2E-Tests/1.0 (Testing)',

    // Extra HTTP headers
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  },

  // Configure projects for different browsers
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Reuse authentication state to avoid rate limiting
        // (same pattern as staging config)
        // Note: This file is created by global-setup.ts before tests run
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
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },
  ],

  // Output folder for test artifacts
  outputDir: 'test-results-testing/',

  // Folder for screenshots
  snapshotDir: 'screenshots-testing/',

  // Whether to preserve output directory
  preserveOutput: 'failures-only',

  // Global setup/teardown
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',

  // Web server configuration (not used for testing - testing server should already be running)
  // webServer: undefined,
});
