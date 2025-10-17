import { test, expect, Page } from '@playwright/test';

/**
 * Comprehensive E2E Test Suite for AthleteMetrics Staging Environment
 *
 * This test suite validates all major pages and features in the staging environment.
 * Tests are idempotent - they only read data, never create/modify/delete.
 *
 * Environment Variables Required:
 * - STAGING_URL: Base URL of staging environment (e.g., https://staging.athletemetrics.app)
 * - STAGING_USERNAME: Username for test account
 * - STAGING_PASSWORD: Password for test account
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';
const STAGING_USERNAME = process.env.STAGING_USERNAME || '';
const STAGING_PASSWORD = process.env.STAGING_PASSWORD || '';

// Helper function to check for console errors
async function checkConsoleErrors(page: Page, context: string) {
  const consoleErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // Give a moment for any async console errors to appear
  await page.waitForTimeout(500);

  if (consoleErrors.length > 0) {
    console.warn(`Console errors on ${context}:`, consoleErrors);
  }

  return consoleErrors;
}

// Helper function to check for network errors
async function checkNetworkErrors(page: Page) {
  const networkErrors: string[] = [];

  page.on('response', (response) => {
    if (response.status() >= 400 && response.status() < 600) {
      networkErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  return networkErrors;
}

// Login helper function
async function login(page: Page) {
  await page.goto(`${STAGING_URL}/login`);

  // Wait for page to load
  await page.waitForLoadState('networkidle');

  // Fill in login form
  await page.fill('input[name="username"]', STAGING_USERNAME);
  await page.fill('input[name="password"]', STAGING_PASSWORD);

  // Click login button
  await page.click('button[type="submit"]');

  // Wait for navigation after login
  await page.waitForLoadState('networkidle');

  // Verify we're logged in (should redirect away from /login)
  const currentUrl = page.url();
  expect(currentUrl).not.toContain('/login');
}

// Logout helper function
async function logout(page: Page) {
  // Look for logout button in navigation or user menu
  // This may vary depending on UI implementation
  try {
    // Try clicking user menu first
    await page.click('[data-testid="user-menu"]', { timeout: 2000 });
    await page.click('text=Logout', { timeout: 2000 });
  } catch {
    // If that fails, try direct logout button
    try {
      await page.click('button:has-text("Logout")', { timeout: 2000 });
    } catch {
      // If no logout button found, navigate to logout endpoint directly
      await page.goto(`${STAGING_URL}/api/auth/logout`);
    }
  }

  await page.waitForLoadState('networkidle');

  // Verify we're on login page
  await expect(page).toHaveURL(/\/login/);
}

test.describe('AthleteMetrics Staging E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Validate required environment variables
    if (!STAGING_USERNAME || !STAGING_PASSWORD) {
      throw new Error('STAGING_USERNAME and STAGING_PASSWORD environment variables are required');
    }
  });

  test('should successfully login and logout', async ({ page }) => {
    await login(page);

    // Verify we're logged in (check for common authenticated elements)
    const hasNavigation = await page.locator('nav').count() > 0;
    expect(hasNavigation).toBeTruthy();

    await logout(page);
  });

  test('should load Dashboard page without errors', async ({ page }) => {
    await login(page);

    // Navigate to dashboard
    await page.goto(`${STAGING_URL}/dashboard`);
    await page.waitForLoadState('networkidle');

    // Verify page loaded
    await expect(page).toHaveURL(/\/dashboard/);

    // Check for critical UI elements (adjust selectors based on actual dashboard structure)
    const hasMainContent = await page.locator('main, [role="main"]').count() > 0;
    expect(hasMainContent).toBeTruthy();

    // Check console for errors
    const errors = await checkConsoleErrors(page, 'Dashboard');
    expect(errors).toHaveLength(0);

    // Take screenshot
    await page.screenshot({ path: 'screenshots/dashboard.png', fullPage: true });
  });

  test('should load Teams page without errors', async ({ page }) => {
    await login(page);

    await page.goto(`${STAGING_URL}/teams`);
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/teams/);

    // Check for teams list or empty state
    const hasContent = await page.locator('main, [role="main"]').count() > 0;
    expect(hasContent).toBeTruthy();

    // Check console for errors
    const errors = await checkConsoleErrors(page, 'Teams');
    expect(errors).toHaveLength(0);

    await page.screenshot({ path: 'screenshots/teams.png', fullPage: true });
  });

  test('should load Athletes page without errors', async ({ page }) => {
    await login(page);

    await page.goto(`${STAGING_URL}/athletes`);
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/athletes/);

    const hasContent = await page.locator('main, [role="main"]').count() > 0;
    expect(hasContent).toBeTruthy();

    // Check console for errors
    const errors = await checkConsoleErrors(page, 'Athletes');
    expect(errors).toHaveLength(0);

    await page.screenshot({ path: 'screenshots/athletes.png', fullPage: true });
  });

  test('should navigate to athlete profile if athletes exist', async ({ page }) => {
    await login(page);

    await page.goto(`${STAGING_URL}/athletes`);
    await page.waitForLoadState('networkidle');

    // Try to find and click on an athlete link
    const athleteLinks = await page.locator('a[href^="/athletes/"]').count();

    if (athleteLinks > 0) {
      // Click first athlete link
      await page.click('a[href^="/athletes/"]:first-of-type');
      await page.waitForLoadState('networkidle');

      // Verify we're on athlete profile page
      expect(page.url()).toContain('/athletes/');

      const hasContent = await page.locator('main, [role="main"]').count() > 0;
      expect(hasContent).toBeTruthy();

      // Check console for errors
      const errors = await checkConsoleErrors(page, 'Athlete Profile');
      expect(errors).toHaveLength(0);

      await page.screenshot({ path: 'screenshots/athlete-profile.png', fullPage: true });
    } else {
      console.log('No athletes found - skipping profile navigation test');
    }
  });

  test('should load Organizations page without errors', async ({ page }) => {
    await login(page);

    await page.goto(`${STAGING_URL}/organizations`);
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/organizations/);

    const hasContent = await page.locator('main, [role="main"]').count() > 0;
    expect(hasContent).toBeTruthy();

    // Check console for errors
    const errors = await checkConsoleErrors(page, 'Organizations');
    expect(errors).toHaveLength(0);

    await page.screenshot({ path: 'screenshots/organizations.png', fullPage: true });
  });

  test('should load User Management page without errors', async ({ page }) => {
    await login(page);

    await page.goto(`${STAGING_URL}/user-management`);
    await page.waitForLoadState('networkidle');

    // Check if we have access (may redirect if not admin)
    const currentUrl = page.url();

    if (currentUrl.includes('/user-management')) {
      const hasContent = await page.locator('main, [role="main"]').count() > 0;
      expect(hasContent).toBeTruthy();

      // Check console for errors
      const errors = await checkConsoleErrors(page, 'User Management');
      expect(errors).toHaveLength(0);

      await page.screenshot({ path: 'screenshots/user-management.png', fullPage: true });
    } else {
      console.log('User does not have access to User Management - test skipped');
    }
  });

  test('should load Data Entry page without errors', async ({ page }) => {
    await login(page);

    await page.goto(`${STAGING_URL}/data-entry`);
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/data-entry/);

    const hasContent = await page.locator('main, [role="main"]').count() > 0;
    expect(hasContent).toBeTruthy();

    // Check console for errors
    const errors = await checkConsoleErrors(page, 'Data Entry');
    expect(errors).toHaveLength(0);

    await page.screenshot({ path: 'screenshots/data-entry.png', fullPage: true });
  });

  test('should load Analytics page without errors', async ({ page }) => {
    await login(page);

    await page.goto(`${STAGING_URL}/analytics`);
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/analytics/);

    const hasContent = await page.locator('main, [role="main"]').count() > 0;
    expect(hasContent).toBeTruthy();

    // Wait for charts to potentially load
    await page.waitForTimeout(2000);

    // Check console for errors
    const errors = await checkConsoleErrors(page, 'Analytics');
    expect(errors).toHaveLength(0);

    await page.screenshot({ path: 'screenshots/analytics.png', fullPage: true });
  });

  test('should load Coach Analytics page without errors', async ({ page }) => {
    await login(page);

    await page.goto(`${STAGING_URL}/coach-analytics`);
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/coach-analytics/);

    const hasContent = await page.locator('main, [role="main"]').count() > 0;
    expect(hasContent).toBeTruthy();

    // Wait for charts to potentially load
    await page.waitForTimeout(2000);

    // Check console for errors
    const errors = await checkConsoleErrors(page, 'Coach Analytics');
    expect(errors).toHaveLength(0);

    await page.screenshot({ path: 'screenshots/coach-analytics.png', fullPage: true });
  });

  test('should load Athlete Analytics page without errors', async ({ page }) => {
    await login(page);

    await page.goto(`${STAGING_URL}/athlete-analytics`);
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/athlete-analytics/);

    const hasContent = await page.locator('main, [role="main"]').count() > 0;
    expect(hasContent).toBeTruthy();

    // Wait for charts to potentially load
    await page.waitForTimeout(2000);

    // Check console for errors
    const errors = await checkConsoleErrors(page, 'Athlete Analytics');
    expect(errors).toHaveLength(0);

    await page.screenshot({ path: 'screenshots/athlete-analytics.png', fullPage: true });
  });

  test('should load Import/Export page without errors', async ({ page }) => {
    await login(page);

    await page.goto(`${STAGING_URL}/import-export`);
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/import-export/);

    const hasContent = await page.locator('main, [role="main"]').count() > 0;
    expect(hasContent).toBeTruthy();

    // Check console for errors
    const errors = await checkConsoleErrors(page, 'Import/Export');
    expect(errors).toHaveLength(0);

    await page.screenshot({ path: 'screenshots/import-export.png', fullPage: true });
  });

  test('should load Profile page without errors', async ({ page }) => {
    await login(page);

    await page.goto(`${STAGING_URL}/profile`);
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(/\/profile/);

    const hasContent = await page.locator('main, [role="main"]').count() > 0;
    expect(hasContent).toBeTruthy();

    // Check console for errors
    const errors = await checkConsoleErrors(page, 'Profile');
    expect(errors).toHaveLength(0);

    await page.screenshot({ path: 'screenshots/profile.png', fullPage: true });
  });

  test('should load Admin page if user is site admin', async ({ page }) => {
    await login(page);

    await page.goto(`${STAGING_URL}/admin`);
    await page.waitForLoadState('networkidle');

    const currentUrl = page.url();

    if (currentUrl.includes('/admin')) {
      const hasContent = await page.locator('main, [role="main"]').count() > 0;
      expect(hasContent).toBeTruthy();

      // Check console for errors
      const errors = await checkConsoleErrors(page, 'Admin');
      expect(errors).toHaveLength(0);

      await page.screenshot({ path: 'screenshots/admin.png', fullPage: true });
    } else {
      console.log('User is not site admin - Admin page test skipped');
    }
  });

  test('should test navigation between pages', async ({ page }) => {
    await login(page);

    // Navigate through multiple pages to test routing
    const pagesToVisit = [
      { url: '/dashboard', name: 'Dashboard' },
      { url: '/teams', name: 'Teams' },
      { url: '/athletes', name: 'Athletes' },
      { url: '/data-entry', name: 'Data Entry' },
      { url: '/analytics', name: 'Analytics' },
    ];

    for (const pageInfo of pagesToVisit) {
      await page.goto(`${STAGING_URL}${pageInfo.url}`);
      await page.waitForLoadState('networkidle');

      // Verify navigation worked
      expect(page.url()).toContain(pageInfo.url);

      // Verify page has content
      const hasContent = await page.locator('main, [role="main"]').count() > 0;
      expect(hasContent).toBeTruthy();

      console.log(`Successfully navigated to ${pageInfo.name}`);
    }
  });

  test('should test organization context switching if available', async ({ page }) => {
    await login(page);

    await page.goto(`${STAGING_URL}/dashboard`);
    await page.waitForLoadState('networkidle');

    // Look for organization selector (adjust selector based on actual implementation)
    const orgSelector = await page.locator('[data-testid="org-selector"], select[name="organization"]').count();

    if (orgSelector > 0) {
      console.log('Organization selector found - testing context switching');

      // Get all available options
      const options = await page.locator('[data-testid="org-selector"] option, select[name="organization"] option').count();

      if (options > 1) {
        // Select second organization
        await page.selectOption('[data-testid="org-selector"], select[name="organization"]', { index: 1 });

        // Wait for page to update
        await page.waitForTimeout(1000);

        // Verify no errors occurred
        const errors = await checkConsoleErrors(page, 'Organization Context Switch');
        expect(errors).toHaveLength(0);

        await page.screenshot({ path: 'screenshots/org-context-switch.png', fullPage: true });
      } else {
        console.log('Only one organization available - skipping context switch test');
      }
    } else {
      console.log('No organization selector found - user may be site admin or have only one org');
    }
  });

  test('should verify no critical network errors across pages', async ({ page }) => {
    await login(page);

    const networkErrors: string[] = [];

    // Track all network errors
    page.on('response', (response) => {
      if (response.status() === 500) {
        networkErrors.push(`500 Error: ${response.url()}`);
      }
      if (response.status() === 404 && !response.url().includes('/api/')) {
        // Only track 404s that aren't API calls (API 404s might be expected)
        networkErrors.push(`404 Error: ${response.url()}`);
      }
    });

    const pages = ['/dashboard', '/teams', '/athletes', '/analytics'];

    for (const pageUrl of pages) {
      await page.goto(`${STAGING_URL}${pageUrl}`);
      await page.waitForLoadState('networkidle');
    }

    // Report network errors if any
    if (networkErrors.length > 0) {
      console.warn('Network errors detected:', networkErrors);
    }

    // We don't fail on network errors, just log them
    expect(networkErrors.length).toBeLessThan(10); // Allow some minor 404s but fail if too many
  });

  test('should test key interactions without modifying data', async ({ page }) => {
    await login(page);

    // Go to Teams page
    await page.goto(`${STAGING_URL}/teams`);
    await page.waitForLoadState('networkidle');

    // Try to click "Add Team" button if it exists (but don't submit)
    const addTeamButton = await page.locator('button:has-text("Add Team")').count();
    if (addTeamButton > 0) {
      await page.click('button:has-text("Add Team")');
      await page.waitForTimeout(500);

      // Verify modal/form opened
      const hasModal = await page.locator('[role="dialog"], .modal').count() > 0;
      console.log(`Add Team modal opened: ${hasModal}`);

      // Close modal if it opened (press Escape)
      if (hasModal) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      }
    }

    // Go to Data Entry page
    await page.goto(`${STAGING_URL}/data-entry`);
    await page.waitForLoadState('networkidle');

    // Test dropdown interactions without submitting
    const dropdowns = await page.locator('select').count();
    if (dropdowns > 0) {
      console.log(`Found ${dropdowns} dropdown(s) on Data Entry page`);
    }

    // Verify no errors from interactions
    const errors = await checkConsoleErrors(page, 'Key Interactions');
    expect(errors).toHaveLength(0);
  });
});
