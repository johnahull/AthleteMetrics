import { test, expect } from './fixtures/e2e-base';

/**
 * Environment Validation Test
 *
 * This is a lightweight test to validate that your staging or testing environment
 * is properly configured before running the full E2E test suite.
 *
 * Run with:
 *   - Staging: npx playwright test tests/e2e/validate-staging.spec.ts --config=playwright.staging.config.ts
 *   - Testing: npx playwright test tests/e2e/validate-staging.spec.ts --config=playwright.testing.config.ts
 *
 * Auto-detects environment based on which environment variables are set:
 *   - If TESTING_URL or TESTING_USERNAME is set → uses Testing environment
 *   - Otherwise → uses Staging environment
 */

// Auto-detect environment based on which environment variables are set
const isTesting = !!process.env.TESTING_URL || !!process.env.TESTING_USERNAME;
const ENV_NAME = isTesting ? 'TESTING' : 'STAGING';

const STAGING_URL = isTesting
  ? (process.env.TESTING_URL || 'https://athletemetrics-testing-testing.up.railway.app')
  : (process.env.STAGING_URL || 'http://localhost:5000');

const STAGING_USERNAME = isTesting
  ? (process.env.TESTING_USERNAME || '')
  : (process.env.STAGING_USERNAME || '');

const STAGING_PASSWORD = isTesting
  ? (process.env.TESTING_PASSWORD || '')
  : (process.env.STAGING_PASSWORD || '');

test.describe(`${ENV_NAME} Environment Validation`, () => {
  test('should validate environment variables are set', async () => {
    expect(STAGING_URL, `${ENV_NAME}_URL must be set`).toBeTruthy();
    expect(STAGING_USERNAME, `${ENV_NAME}_USERNAME must be set`).toBeTruthy();
    expect(STAGING_PASSWORD, `${ENV_NAME}_PASSWORD must be set`).toBeTruthy();

    console.log('✓ Environment variables configured');
    console.log(`  ${ENV_NAME}_URL: ${STAGING_URL}`);
    console.log(`  ${ENV_NAME}_USERNAME: ${STAGING_USERNAME}`);
    console.log(`  ${ENV_NAME}_PASSWORD: ${'*'.repeat(STAGING_PASSWORD.length)}`);
  });

  test('should validate staging URL is accessible', async ({ page }) => {
    console.log(`Checking if ${STAGING_URL} is accessible...`);

    const response = await page.goto(STAGING_URL);

    expect(response?.status(), 'Staging URL should return 200 or 30x').toBeLessThan(400);

    console.log(`✓ Staging URL is accessible (status: ${response?.status()})`);
  });

  test('should validate login page loads', async ({ page }) => {
    await page.goto(`${STAGING_URL}/login`);

    // Wait for React SPA to mount
    await page.waitForSelector('#username, input[name="username"]', { timeout: 30000 });

    // Check for username and password inputs (use dual selectors for both environments)
    const usernameInput = await page.locator('#username, input[name="username"]').count();
    const passwordInput = await page.locator('#password, input[name="password"]').count();

    expect(usernameInput, 'Login page should have username input').toBeGreaterThan(0);
    expect(passwordInput, 'Login page should have password input').toBeGreaterThan(0);

    console.log('✓ Login page loads correctly');
  });

  test('should validate login credentials work', async ({ page }) => {
    await page.goto(`${STAGING_URL}/login`);

    // Wait for React SPA to mount
    await page.waitForSelector('#username, input[name="username"]', { timeout: 30000 });

    // Fill in credentials (use dual selectors for both environments)
    await page.fill('#username, input[name="username"]', STAGING_USERNAME);
    await page.fill('#password, input[name="password"]', STAGING_PASSWORD);

    // Submit form
    await page.click('button[type="submit"]');

    // Wait for client-side navigation away from login page (React SPA redirect)
    await page.waitForURL(url => !url.pathname.includes('/login'), {
      timeout: 10000
    });

    // Verify we're not on login page anymore
    const currentUrl = page.url();
    expect(currentUrl, 'Should redirect away from /login after successful login').not.toContain('/login');

    console.log('✓ Login credentials are valid');
    console.log(`  Redirected to: ${currentUrl}`);
  });

  test('should validate basic page routes exist', async ({ page }) => {
    // Login first
    await page.goto(`${STAGING_URL}/login`);

    // Wait for React SPA to mount
    await page.waitForSelector('#username, input[name="username"]', { timeout: 30000 });

    await page.fill('#username, input[name="username"]', STAGING_USERNAME);
    await page.fill('#password, input[name="password"]', STAGING_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for successful login redirect
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10000 });

    // Test basic routes
    const routesToTest = [
      '/dashboard',
      '/teams',
      '/athletes',
      '/organizations',
      '/data-entry',
      '/analytics',
      '/profile',
    ];

    console.log('Checking if basic routes exist...');

    for (const route of routesToTest) {
      const response = await page.goto(`${STAGING_URL}${route}`);
      const status = response?.status();

      expect(status, `Route ${route} should be accessible`).toBeLessThan(400);
      console.log(`  ✓ ${route} (${status})`);
    }

    console.log('✓ All basic routes are accessible');
  });

  test('should check for common JavaScript errors', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Login
    await page.goto(`${STAGING_URL}/login`);

    // Wait for React SPA to mount
    await page.waitForSelector('#username, input[name="username"]', { timeout: 30000 });

    await page.fill('#username, input[name="username"]', STAGING_USERNAME);
    await page.fill('#password, input[name="password"]', STAGING_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for successful login redirect
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10000 });

    // Navigate to dashboard
    await page.goto(`${STAGING_URL}/dashboard`);

    // Wait for dashboard to load
    await page.waitForSelector('main, [role="main"]', { state: 'visible' });

    // Brief wait to catch any delayed console errors
    await page.waitForTimeout(500);

    if (consoleErrors.length > 0) {
      console.warn('⚠ Console errors detected:', consoleErrors);
    } else {
      console.log('✓ No JavaScript errors detected');
    }

    // Don't fail on console errors, just warn
    expect(consoleErrors.length, 'Should have minimal console errors').toBeLessThan(10);
  });

  test('should validate API endpoints respond', async ({ page }) => {
    // Login first
    await page.goto(`${STAGING_URL}/login`);

    // Wait for React SPA to mount
    await page.waitForSelector('#username, input[name="username"]', { timeout: 30000 });

    await page.fill('#username, input[name="username"]', STAGING_USERNAME);
    await page.fill('#password, input[name="password"]', STAGING_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for successful login redirect
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10000 });

    const apiErrors: string[] = [];

    // Monitor API calls
    page.on('response', (response) => {
      if (response.url().includes('/api/') && response.status() >= 500) {
        apiErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    // Navigate to a few pages to trigger API calls
    await page.goto(`${STAGING_URL}/dashboard`);
    await page.waitForSelector('main, [role="main"]', { state: 'visible' });

    await page.goto(`${STAGING_URL}/athletes`);
    await page.waitForSelector('main, [role="main"]', { state: 'visible' });

    if (apiErrors.length > 0) {
      console.warn('⚠ API errors detected:', apiErrors);
    } else {
      console.log('✓ No 500-level API errors detected');
    }

    expect(apiErrors.length, 'Should have no 500-level API errors').toBe(0);
  });
});

test.describe(`${ENV_NAME} Environment Summary`, () => {
  test('print validation summary', async () => {
    console.log('\n═══════════════════════════════════════════════════');
    console.log(`${ENV_NAME} Environment Validation Summary`);
    console.log('═══════════════════════════════════════════════════');
    console.log(`Environment: ${STAGING_URL}`);
    console.log(`Username: ${STAGING_USERNAME}`);
    console.log(`\nIf all tests passed, your ${ENV_NAME.toLowerCase()} environment is ready!`);
    console.log('Run the full E2E test suite with:');
    console.log(isTesting ? '  npm run test:testing' : '  npm run test:staging');
    console.log('═══════════════════════════════════════════════════\n');
  });
});
