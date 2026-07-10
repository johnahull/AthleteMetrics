import { defineConfig, devices } from '@playwright/test';

/**
 * Local Development Playwright Configuration
 *
 * For testing against local dev server at http://localhost:5000
 * Uses admin/DevPassword123! for authentication
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Scaffolding templates under tests/e2e/templates/ contain literal [entity]/[ENTITY]
  // placeholders and are meant to be copied, not executed. Exclude them so they
  // don't register as failing specs.
  testIgnore: '**/templates/**',

  // Maximum time one test can run
  timeout: 30 * 1000,

  // Timeout for assertions
  expect: {
    timeout: 5000
  },

  // Run tests in files in parallel
  fullyParallel: true,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Reporter to use
  reporter: [
    ['list'],
    ['html', { open: 'never' }]
  ],

  // Shared settings for all the projects below
  use: {
    // Base URL for all page.goto() calls
    baseURL: 'http://localhost:5000',

    // Collect trace on failure
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure',
  },

  // Configure projects for different browsers
  projects: [
    // Setup project - runs first to establish authentication
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },

    // Test project - depends on setup
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Reuse authentication state for all tests
        storageState: 'tests/e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  // Run local dev server before starting tests
  webServer: {
    command: 'NODE_ENV=development SESSION_SECRET=ecb1f2ea4760ff61f4a4742fc3249063b38f114781860af9526031da8377a06d ADMIN_USER=admin ADMIN_PASSWORD=DevPassword123! npm run dev',
    url: 'http://localhost:5000',
    reuseExistingServer: true,
    timeout: 120 * 1000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
