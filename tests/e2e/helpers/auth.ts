/**
 * Authentication Helper Functions for E2E Tests
 *
 * Provides reusable authentication utilities for Playwright tests
 */

import { Page, expect } from '@playwright/test';
import { getUserByRole } from '../fixtures/test-users';

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

/**
 * Login with specific credentials
 *
 * @param page - Playwright Page object
 * @param username - Username to login with
 * @param password - Password to login with
 * @param shouldSucceed - Whether login should succeed (default: true)
 * @returns Promise<void>
 */
export async function loginWithCredentials(
  page: Page,
  username: string,
  password: string,
  shouldSucceed: boolean = true
): Promise<void> {
  // Navigate to login page
  await page.goto(`${STAGING_URL}/login`);
  await page.waitForLoadState('networkidle');

  // Fill in login form
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);

  // Submit login form
  await page.click('button[type="submit"]');

  // Wait for response
  await page.waitForLoadState('networkidle');

  if (shouldSucceed) {
    // Verify we're logged in (should redirect away from /login)
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/login');
  } else {
    // Verify we're still on login page (login failed)
    await expect(page).toHaveURL(/\/login/);
  }
}

/**
 * Login with test user by role
 *
 * @param page - Playwright Page object
 * @param role - User role ('site_admin' | 'org_admin' | 'coach' | 'athlete')
 * @returns Promise<void>
 */
export async function loginAs(
  page: Page,
  role: 'site_admin' | 'org_admin' | 'coach' | 'athlete'
): Promise<void> {
  const user = getUserByRole(role);
  await loginWithCredentials(page, user.username, user.password, true);
}

/**
 * Login with default staging credentials
 * Convenience function for tests that don't need specific roles
 *
 * @param page - Playwright Page object
 * @returns Promise<void>
 * @throws Error if STAGING_USERNAME or STAGING_PASSWORD not set
 */
export async function loginAsDefaultUser(page: Page): Promise<void> {
  const username = process.env.STAGING_USERNAME;
  const password = process.env.STAGING_PASSWORD;

  if (!username || !password) {
    throw new Error(
      'STAGING_USERNAME and STAGING_PASSWORD environment variables must be set. ' +
      'These credentials are used for E2E test authentication.'
    );
  }

  await loginWithCredentials(page, username, password, true);
}

/**
 * Logout current user
 *
 * @param page - Playwright Page object
 * @returns Promise<void>
 */
export async function logout(page: Page): Promise<void> {
  try {
    // Try clicking user menu first (if exists)
    await page.click('[data-testid="user-menu"]', { timeout: 2000 });
    await page.click('text=Logout', { timeout: 2000 });
  } catch (error) {
    console.debug('Logout: user menu not found, trying direct logout button', error);
    // If that fails, try direct logout button
    try {
      await page.click('button:has-text("Logout")', { timeout: 2000 });
    } catch (error2) {
      console.debug('Logout: logout button not found, using API endpoint', error2);
      // If no logout button found, navigate to logout endpoint directly
      await page.goto(`${STAGING_URL}/api/auth/logout`);
    }
  }

  await page.waitForLoadState('networkidle');

  // Verify we're on login page
  await expect(page).toHaveURL(/\/login/);
}

/**
 * Check if user is currently logged in
 *
 * @param page - Playwright Page object
 * @returns Promise<boolean> - True if logged in, false otherwise
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  const currentUrl = page.url();

  // If we're on the login page, we're not logged in
  if (currentUrl.includes('/login')) {
    return false;
  }

  // Check for presence of user menu or logout button
  try {
    await page.waitForSelector('[data-testid="user-menu"]', { timeout: 1000 });
    return true;
  } catch (error) {
    console.debug('isLoggedIn: user-menu not found, trying logout button', error);
    try {
      await page.waitForSelector('button:has-text("Logout")', { timeout: 1000 });
      return true;
    } catch (error2) {
      console.debug('isLoggedIn: no auth indicators found, user not logged in', error2);
      return false;
    }
  }
}

/**
 * Get session cookie for API calls
 *
 * @param page - Playwright Page object
 * @returns Promise<string | null> - Session cookie value or null if not found
 */
export async function getSessionCookie(page: Page): Promise<string | null> {
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find(cookie =>
    cookie.name === 'connect.sid' || cookie.name === 'session'
  );

  return sessionCookie?.value || null;
}

/**
 * Wait for user to be logged in
 * Useful after login redirect or session restoration
 *
 * @param page - Playwright Page object
 * @param timeout - Timeout in milliseconds (default: 5000)
 * @returns Promise<void>
 */
export async function waitForLogin(page: Page, timeout: number = 5000): Promise<void> {
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout });
}

/**
 * Verify user is on login page
 *
 * @param page - Playwright Page object
 * @returns Promise<void>
 */
export async function expectLoginPage(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/login/);

  // Verify login form elements are present
  await expect(page.locator('input[name="username"]')).toBeVisible();
  await expect(page.locator('input[name="password"]')).toBeVisible();
  await expect(page.locator('button[type="submit"]')).toBeVisible();
}

/**
 * Get login error message from page
 *
 * @param page - Playwright Page object
 * @returns Promise<string | null> - Error message text or null if not found
 */
export async function getLoginError(page: Page): Promise<string | null> {
  try {
    // Look for common error message selectors
    const errorSelectors = [
      '[data-testid="login-error"]',
      '.error-message',
      '[role="alert"]',
      '.alert-error',
      'text=/Invalid credentials/i',
      'text=/Login failed/i',
    ];

    for (const selector of errorSelectors) {
      try {
        const element = await page.waitForSelector(selector, { timeout: 1000 });
        if (element) {
          return await element.textContent();
        }
      } catch {
        // Continue to next selector
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Clear all cookies and storage
 * Useful for ensuring clean state between tests
 *
 * @param page - Playwright Page object
 * @returns Promise<void>
 */
export async function clearAuthState(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}
