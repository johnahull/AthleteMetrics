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

  // Maximum time one test can run for (60 seconds)
  timeout: 60 * 1000,

  // Test execution configuration
  fullyParallel: false, // Run tests sequentially to avoid race conditions
  workers: 1, // Single worker for staging tests

  // Retry failed tests once (helps with flaky network issues)
  retries: 1,

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
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
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
  outputDir: 'test-results/',

  // Folder for screenshots
  snapshotDir: 'screenshots/',

  // Whether to preserve output directory
  preserveOutput: 'failures-only',

  // Global setup/teardown (if needed)
  // globalSetup: require.resolve('./tests/e2e/global-setup.ts'),
  // globalTeardown: require.resolve('./tests/e2e/global-teardown.ts'),

  // Web server configuration (not used for staging - staging server should already be running)
  // webServer: undefined,
});
