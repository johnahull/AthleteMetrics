/**
 * Authentication Helper Functions for E2E Tests
 *
 * Provides reusable authentication utilities for Playwright tests
 */

import { Page, expect } from '@playwright/test';
import { getUserByRole } from '../fixtures/test-users';
import { clickWithFallback, clickWithMultipleFallbacks } from './selectors';

const TESTING_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

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
  await page.goto(`${TESTING_URL}/login`);
  await page.waitForLoadState('networkidle');

  // Wait for login form to be visible (React SPA needs time to mount)
  await page.waitForSelector('#username, input[name="username"]', { timeout: 30000 });

  // Fill in login form - use ID selectors (testing env) with name fallback (staging env)
  await page.fill('#username, input[name="username"]', username);
  await page.fill('#password, input[name="password"]', password);

  // Submit login form
  await page.click('button[type="submit"]');

  if (shouldSucceed) {
    // Wait for navigation away from login page (client-side redirect)
    await page.waitForURL(url => !url.pathname.includes('/login'), {
      timeout: 10000
    });

    // Verify we're logged in (should redirect away from /login)
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/login');
  } else {
    // Wait a moment for any error messages to appear
    await page.waitForLoadState('networkidle');

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
  // Check if already authenticated by looking for session cookie (fast, no navigation)
  const sessionCookie = await getSessionCookie(page);
  if (sessionCookie) {
    // Already authenticated via storageState, skip login
    console.log('✓ Already authenticated via storageState, skipping login');
    return;
  }

  // Try testing credentials first, fall back to staging
  const username = process.env.TESTING_USERNAME || process.env.STAGING_USERNAME;
  const password = process.env.TESTING_PASSWORD || process.env.STAGING_PASSWORD;

  if (!username || !password) {
    throw new Error(
      'TESTING_USERNAME/TESTING_PASSWORD or STAGING_USERNAME/STAGING_PASSWORD environment variables must be set. ' +
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
    // Try multiple logout strategies in order
    await clickWithMultipleFallbacks(
      page,
      [
        '[data-testid="logout-button"]',
        'button:has-text("Logout")',
        '[data-testid="user-menu"]' // User menu dropdown, then click logout
      ],
      'Logout button',
      { timeout: 2000 }
    );

    // If user menu was clicked, also click the logout option
    const isOnLoginPage = page.url().includes('/login');
    if (!isOnLoginPage) {
      try {
        await page.click('text=Logout', { timeout: 2000 });
      } catch (error) {
        console.debug('Logout: text=Logout not found, assuming already logged out or using different flow',
          error instanceof Error ? error.message : error
        );
      }
    }
  } catch (error) {
    console.warn('Logout: all button selectors failed, using API endpoint:',
      error instanceof Error ? error.message : error
    );
    // If no logout button found, navigate to logout endpoint directly
    await page.goto(`${TESTING_URL}/api/auth/logout`);
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

  // Fast check: look for session cookie first (instant, no DOM queries)
  const sessionCookie = await getSessionCookie(page);
  if (sessionCookie) {
    return true;
  }

  // Fallback: Check for presence of user menu or logout button with reduced timeout
  const authIndicators = [
    '[data-testid="user-menu"]',
    '[data-testid="logout-button"]',
    'button:has-text("Logout")'
  ];

  for (const selector of authIndicators) {
    try {
      // Reduced timeout from 1000ms to 500ms to speed up checks
      await page.waitForSelector(selector, { timeout: 500 });
      return true;
    } catch (error) {
      // Continue to next selector
      console.debug(`isLoggedIn: selector "${selector}" not found, trying next...`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.debug('isLoggedIn: no auth indicators found, user not logged in');
  return false;
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

  // Verify login form elements are present - use ID selectors with name fallback
  await expect(page.locator('#username, input[name="username"]')).toBeVisible();
  await expect(page.locator('#password, input[name="password"]')).toBeVisible();
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
