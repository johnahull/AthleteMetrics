/**
 * Playwright Authentication Setup
 *
 * This setup file runs before all E2E tests to establish an authenticated session.
 * The session state is saved to `.auth/user.json` and reused across all tests,
 * preventing rate limiting issues from repeated logins.
 *
 * Benefits:
 * - Faster test execution (no login for each test)
 * - Avoids rate limiting from repeated login attempts
 * - Consistent authentication state across all tests
 */

import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const authFile = path.join(__dirname, '.auth', 'user.json');

setup('authenticate', async ({ page }) => {
  const username = process.env.TESTING_USERNAME || process.env.STAGING_USERNAME || 'admin';
  const password = process.env.TESTING_PASSWORD || process.env.STAGING_PASSWORD || 'DevPassword123!';

  console.log(`🔐 Authenticating as: ${username}`);

  // Navigate to login page
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // Wait for login form to be visible (form fields use id, not name)
  await page.waitForSelector('#username, input[name="username"]', { timeout: 30000 });

  // Fill in credentials
  await page.fill('#username, input[name="username"]', username);
  await page.fill('#password, input[name="password"]', password);

  // Submit login form
  await page.click('button[type="submit"]');

  // Wait for redirect after successful login
  await page.waitForURL(url => !url.pathname.includes('/login'), {
    timeout: 10000
  });

  // Verify we're logged in (should redirect to teams page or similar)
  const currentUrl = page.url();
  expect(currentUrl).not.toContain('/login');

  console.log(`✅ Authentication successful, redirected to: ${currentUrl}`);

  // Save authentication state
  await page.context().storageState({ path: authFile });

  console.log(`💾 Saved authentication state to: ${authFile}`);
});
