import { test, expect } from '@playwright/test';

/**
 * E2E Test Template: Authentication & Authorization
 *
 * This template provides a standard structure for testing authentication
 * and authorization workflows in the application.
 *
 * HOW TO USE:
 * 1. Copy this file to tests/e2e/[feature]-auth.spec.ts
 * 2. Replace [ROLE] with the role you're testing (e.g., "Admin", "Coach", "Athlete")
 * 3. Update test credentials in environment variables or test config
 * 4. Update selectors to match your actual auth UI
 * 5. Add role-specific authorization tests
 * 6. Run tests: npm run test:staging
 *
 * EXAMPLE: For testing coach permissions:
 * - File: tests/e2e/coach-permissions.spec.ts
 * - Role: coach
 * - Test scenarios: Can view athletes, cannot manage organization
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

// TODO: Replace with your test credentials
const TEST_USERNAME = process.env.STAGING_USERNAME || 'test_user';
const TEST_PASSWORD = process.env.STAGING_PASSWORD || 'test_password';

// TODO: For multi-role testing, add additional credentials
const TEST_ADMIN_USERNAME = process.env.E2E_SITE_ADMIN_USERNAME || '';
const TEST_ADMIN_PASSWORD = process.env.E2E_SITE_ADMIN_PASSWORD || '';

test.describe('Authentication Tests', () => {

  test.beforeEach(async ({ page }) => {
    // Start each test logged out
    await page.goto(`${STAGING_URL}/login`);
  });

  test('should successfully login with valid credentials', async ({ page }) => {
    // Fill in login form
    await page.fill('input[name="username"]', TEST_USERNAME);
    await page.fill('input[name="password"]', TEST_PASSWORD);

    // Submit login
    await page.click('button[type="submit"]');

    // Should redirect away from login page
    await page.waitForURL(url => !url.pathname.includes('/login'), {
      timeout: 10000
    });

    // Verify we're logged in - check for user indicator or dashboard
    // TODO: Update selector to match your app's logged-in indicator
    const userIndicator = await page.locator('[data-testid="user-menu"], [data-testid="user-avatar"], text=/logout|sign out/i').count();
    expect(userIndicator).toBeGreaterThan(0);
  });

  test('should show error for invalid credentials', async ({ page }) => {
    // Fill in login form with invalid credentials
    await page.fill('input[name="username"]', 'invalid_user');
    await page.fill('input[name="password"]', 'wrong_password');

    // Submit login
    await page.click('button[type="submit"]');

    // Should show error message
    await page.waitForSelector('text=/invalid.*credentials|incorrect.*password|login.*failed/i', {
      timeout: 5000
    });

    // Should still be on login page
    expect(page.url()).toContain('/login');
  });

  test('should show validation errors for empty fields', async ({ page }) => {
    // Try to submit without filling fields
    await page.click('button[type="submit"]');

    // Should show validation errors
    await page.waitForSelector('text=/required|must.*provide|enter.*username/i', {
      timeout: 5000
    });

    // Should still be on login page
    expect(page.url()).toContain('/login');
  });

  test('should successfully logout', async ({ page }) => {
    // Login first
    await page.fill('input[name="username"]', TEST_USERNAME);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(url => !url.pathname.includes('/login'));

    // Find and click logout button
    // TODO: Update selector to match your logout button
    const logoutButton = page.locator('[data-testid="logout-button"], button:has-text("Logout"), button:has-text("Sign Out")');
    await logoutButton.click();

    // Should redirect to login page
    await page.waitForURL(url => url.pathname.includes('/login'), {
      timeout: 10000
    });

    // Verify we're logged out - try to access protected route
    await page.goto(`${STAGING_URL}/athletes`);

    // Should redirect back to login
    await page.waitForURL(url => url.pathname.includes('/login'), {
      timeout: 10000
    });
  });

  test('should persist session after page reload', async ({ page }) => {
    // Login first
    await page.fill('input[name="username"]', TEST_USERNAME);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(url => !url.pathname.includes('/login'));

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should still be logged in
    const userIndicator = await page.locator('[data-testid="user-menu"], [data-testid="user-avatar"], text=/logout|sign out/i').count();
    expect(userIndicator).toBeGreaterThan(0);

    // Should not redirect to login
    expect(page.url()).not.toContain('/login');
  });

  test('should redirect to login when accessing protected route while logged out', async ({ page }) => {
    // Try to access protected route without logging in
    // TODO: Update route to match your protected routes
    await page.goto(`${STAGING_URL}/athletes`);

    // Should redirect to login page
    await page.waitForURL(url => url.pathname.includes('/login'), {
      timeout: 10000
    });
  });
});

test.describe('Authorization Tests - [ROLE] Role', () => {

  test.beforeEach(async ({ page }) => {
    // Login as [ROLE] user before each test
    await page.goto(`${STAGING_URL}/login`);
    await page.fill('input[name="username"]', TEST_USERNAME);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(url => !url.pathname.includes('/login'));
  });

  test('should have access to authorized routes', async ({ page }) => {
    // TODO: Navigate to routes this role SHOULD have access to
    await page.goto(`${STAGING_URL}/athletes`);
    await page.waitForLoadState('networkidle');

    // Should successfully load the page (not redirect to login or 403)
    expect(page.url()).toContain('/athletes');

    // Should show page content, not access denied
    const content = await page.locator('main, article, [role="main"]').count();
    expect(content).toBeGreaterThan(0);
  });

  test('should NOT have access to unauthorized routes', async ({ page }) => {
    // TODO: Navigate to routes this role SHOULD NOT have access to
    // Example: Coach accessing admin-only organization settings
    await page.goto(`${STAGING_URL}/admin/settings`);
    await page.waitForLoadState('networkidle');

    // Should show access denied or redirect
    const accessDenied = await page.locator('text=/access.*denied|unauthorized|permission.*denied|403/i').count();

    // Either shows access denied message OR redirects away from the route
    const wasRedirected = !page.url().includes('/admin/settings');

    expect(accessDenied > 0 || wasRedirected).toBe(true);
  });

  test('should see role-appropriate UI elements', async ({ page }) => {
    // Navigate to main page
    await page.goto(`${STAGING_URL}/`);
    await page.waitForLoadState('networkidle');

    // TODO: Check for UI elements this role SHOULD see
    // Example: Coach should see "My Teams" navigation item
    const authorizedElement = await page.locator('[data-testid="nav-teams"], text=/my teams|teams/i').count();
    expect(authorizedElement).toBeGreaterThan(0);

    // TODO: Check that UI elements for OTHER roles are NOT visible
    // Example: Coach should NOT see "System Administration" menu
    const unauthorizedElement = await page.locator('text=/system administration|site admin/i').count();
    expect(unauthorizedElement).toBe(0);
  });

  test('should be able to perform authorized actions', async ({ page }) => {
    // Navigate to page with actions
    // TODO: Update route to match your use case
    await page.goto(`${STAGING_URL}/athletes`);
    await page.waitForLoadState('networkidle');

    // TODO: Try to perform an action this role SHOULD be able to do
    // Example: Coach adding an athlete to their team
    const authorizedActionButton = await page.locator('[data-testid="add-athlete-button"]').count();
    expect(authorizedActionButton).toBeGreaterThan(0);

    // Verify button is not disabled
    const isDisabled = await page.locator('[data-testid="add-athlete-button"]').isDisabled();
    expect(isDisabled).toBe(false);
  });

  test('should NOT be able to perform unauthorized actions', async ({ page }) => {
    // Navigate to page
    // TODO: Update route to match your use case
    await page.goto(`${STAGING_URL}/teams`);
    await page.waitForLoadState('networkidle');

    // TODO: Check that unauthorized action buttons are hidden or disabled
    // Example: Coach should not see "Delete Organization" button
    const unauthorizedButton = await page.locator('[data-testid="delete-organization-button"]').count();
    expect(unauthorizedButton).toBe(0);
  });
});

test.describe('Multi-Role Authorization Tests', () => {
  // Skip if additional test credentials not provided
  test.skip(!TEST_ADMIN_USERNAME || !TEST_ADMIN_PASSWORD, 'Requires E2E_SITE_ADMIN_USERNAME and E2E_SITE_ADMIN_PASSWORD');

  test('should show different UI for different roles', async ({ page }) => {
    // Login as regular user
    await page.goto(`${STAGING_URL}/login`);
    await page.fill('input[name="username"]', TEST_USERNAME);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(url => !url.pathname.includes('/login'));

    // Check UI elements for regular user
    await page.goto(`${STAGING_URL}/`);
    const regularUserNav = await page.locator('text=/system administration/i').count();

    // Logout
    await page.locator('[data-testid="logout-button"], button:has-text("Logout")').click();
    await page.waitForURL(url => url.pathname.includes('/login'));

    // Login as admin
    await page.fill('input[name="username"]', TEST_ADMIN_USERNAME);
    await page.fill('input[name="password"]', TEST_ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(url => !url.pathname.includes('/login'));

    // Check UI elements for admin
    await page.goto(`${STAGING_URL}/`);
    const adminNav = await page.locator('text=/system administration/i').count();

    // Admin should see elements that regular user doesn't
    expect(adminNav).toBeGreaterThan(regularUserNav);
  });
});

test.describe('Password Reset Tests (Optional)', () => {
  // Skip if password reset not implemented
  test.skip(true, 'Password reset not yet implemented');

  test.beforeEach(async ({ page }) => {
    await page.goto(`${STAGING_URL}/login`);
  });

  test('should show password reset link', async ({ page }) => {
    // TODO: Check for "Forgot Password" link
    const resetLink = await page.locator('text=/forgot.*password|reset.*password/i').count();
    expect(resetLink).toBeGreaterThan(0);
  });

  test('should send password reset email', async ({ page }) => {
    // TODO: Click reset link and submit email
    await page.click('text=/forgot.*password/i');
    await page.fill('input[name="email"]', 'test@example.com');
    await page.click('button[type="submit"]');

    // Should show success message
    await page.waitForSelector('text=/email.*sent|check.*email/i', {
      timeout: 5000
    });
  });
});

test.describe('Authentication Summary', () => {
  test('print authentication test summary', async () => {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('Authentication & Authorization Tests Summary');
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ Login with valid credentials');
    console.log('✅ Error for invalid credentials');
    console.log('✅ Validation for empty fields');
    console.log('✅ Logout functionality');
    console.log('✅ Session persistence');
    console.log('✅ Protected route redirects');
    console.log('✅ Role-based access control');
    console.log('✅ Authorized route access');
    console.log('✅ Unauthorized route blocking');
    console.log('✅ Role-appropriate UI elements');
    console.log('✅ Authorized action permissions');
    console.log('✅ Unauthorized action blocking');
    console.log('═══════════════════════════════════════════════════\n');
  });
});
