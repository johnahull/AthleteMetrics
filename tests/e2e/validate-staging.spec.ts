import { test, expect } from '@playwright/test';

/**
 * Staging Environment Validation Test
 *
 * This is a lightweight test to validate that your staging environment
 * is properly configured before running the full E2E test suite.
 *
 * Run with: npx playwright test tests/e2e/validate-staging.spec.ts --config=playwright.staging.config.ts
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';
const STAGING_USERNAME = process.env.STAGING_USERNAME || '';
const STAGING_PASSWORD = process.env.STAGING_PASSWORD || '';

test.describe('Staging Environment Validation', () => {
  test('should validate environment variables are set', async () => {
    expect(STAGING_URL, 'STAGING_URL must be set').toBeTruthy();
    expect(STAGING_USERNAME, 'STAGING_USERNAME must be set').toBeTruthy();
    expect(STAGING_PASSWORD, 'STAGING_PASSWORD must be set').toBeTruthy();

    console.log('✓ Environment variables configured');
    console.log(`  STAGING_URL: ${STAGING_URL}`);
    console.log(`  STAGING_USERNAME: ${STAGING_USERNAME}`);
    console.log(`  STAGING_PASSWORD: ${'*'.repeat(STAGING_PASSWORD.length)}`);
  });

  test('should validate staging URL is accessible', async ({ page }) => {
    console.log(`Checking if ${STAGING_URL} is accessible...`);

    const response = await page.goto(STAGING_URL);

    expect(response?.status(), 'Staging URL should return 200 or 30x').toBeLessThan(400);

    console.log(`✓ Staging URL is accessible (status: ${response?.status()})`);
  });

  test('should validate login page loads', async ({ page }) => {
    await page.goto(`${STAGING_URL}/login`);
    await page.waitForLoadState('networkidle');

    // Check for username and password inputs
    const usernameInput = await page.locator('input[name="username"]').count();
    const passwordInput = await page.locator('input[name="password"]').count();

    expect(usernameInput, 'Login page should have username input').toBeGreaterThan(0);
    expect(passwordInput, 'Login page should have password input').toBeGreaterThan(0);

    console.log('✓ Login page loads correctly');
  });

  test('should validate login credentials work', async ({ page }) => {
    await page.goto(`${STAGING_URL}/login`);
    await page.waitForLoadState('networkidle');

    // Fill in credentials
    await page.fill('input[name="username"]', STAGING_USERNAME);
    await page.fill('input[name="password"]', STAGING_PASSWORD);

    // Submit form
    await page.click('button[type="submit"]');

    // Wait for navigation
    await page.waitForLoadState('networkidle');

    // Verify we're not on login page anymore
    const currentUrl = page.url();
    expect(currentUrl, 'Should redirect away from /login after successful login').not.toContain('/login');

    console.log('✓ Login credentials are valid');
    console.log(`  Redirected to: ${currentUrl}`);
  });

  test('should validate basic page routes exist', async ({ page }) => {
    // Login first
    await page.goto(`${STAGING_URL}/login`);
    await page.fill('input[name="username"]', STAGING_USERNAME);
    await page.fill('input[name="password"]', STAGING_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

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
    await page.fill('input[name="username"]', STAGING_USERNAME);
    await page.fill('input[name="password"]', STAGING_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    // Navigate to dashboard
    await page.goto(`${STAGING_URL}/dashboard`);
    await page.waitForLoadState('networkidle');

    // Wait a moment for any async errors
    await page.waitForTimeout(2000);

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
    await page.fill('input[name="username"]', STAGING_USERNAME);
    await page.fill('input[name="password"]', STAGING_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForLoadState('networkidle');

    const apiErrors: string[] = [];

    // Monitor API calls
    page.on('response', (response) => {
      if (response.url().includes('/api/') && response.status() >= 500) {
        apiErrors.push(`${response.status()} ${response.url()}`);
      }
    });

    // Navigate to a few pages to trigger API calls
    await page.goto(`${STAGING_URL}/dashboard`);
    await page.waitForLoadState('networkidle');
    await page.goto(`${STAGING_URL}/athletes`);
    await page.waitForLoadState('networkidle');

    if (apiErrors.length > 0) {
      console.warn('⚠ API errors detected:', apiErrors);
    } else {
      console.log('✓ No 500-level API errors detected');
    }

    expect(apiErrors.length, 'Should have no 500-level API errors').toBe(0);
  });
});

test.describe('Staging Environment Summary', () => {
  test('print validation summary', async () => {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('Staging Environment Validation Summary');
    console.log('═══════════════════════════════════════════════════');
    console.log(`Environment: ${STAGING_URL}`);
    console.log(`Username: ${STAGING_USERNAME}`);
    console.log('\nIf all tests passed, your staging environment is ready!');
    console.log('Run the full E2E test suite with:');
    console.log('  npm run test:staging');
    console.log('═══════════════════════════════════════════════════\n');
  });
});
