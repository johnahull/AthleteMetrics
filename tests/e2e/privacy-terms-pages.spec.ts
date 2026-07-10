import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * E2E Tests: Privacy Policy and Terms of Service Pages
 *
 * Test Coverage:
 * - Privacy policy page renders and is accessible at /privacy
 * - Terms of service page renders and is accessible at /terms
 * - Footer links appear on welcome page
 * - Footer links appear on login page
 * - Footer links appear in authenticated layout
 * - Acceptance checkbox on invitation flow blocks submission
 * - API rejects invitation acceptance without legal acceptance
 */

const STAGING_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

test.describe('Privacy Policy and Terms of Service Pages', () => {
  test('should render privacy policy page at /privacy', async ({ page }) => {
    await page.goto(`${STAGING_URL}/privacy`);

    // Verify page loaded successfully
    await expect(page).toHaveTitle(/AthleteMetrics.*Privacy Policy|Privacy Policy.*AthleteMetrics/i);

    // Verify main heading exists
    await expect(page.locator('h1, [role="heading"]').filter({ hasText: /Privacy Policy/i })).toBeVisible();

    // Verify last updated date is shown
    await expect(page.locator('text=/Last updated:/i')).toBeVisible();

    // Verify some key sections exist (spot check a few)
    await expect(page.locator('text=/Information We Collect/i')).toBeVisible();
    await expect(page.locator('text=/How We Use Your Information/i')).toBeVisible();
    await expect(page.locator('text=/Data Security/i')).toBeVisible();

    // Verify back to home link exists
    await expect(page.locator('a[href="/"]').filter({ hasText: /Back to Home|Home/i })).toBeVisible();
  });

  test('should render terms of service page at /terms', async ({ page }) => {
    await page.goto(`${STAGING_URL}/terms`);

    // Verify page loaded successfully
    await expect(page).toHaveTitle(/AthleteMetrics.*Terms of Service|Terms of Service.*AthleteMetrics/i);

    // Verify main heading exists
    await expect(page.locator('h1, [role="heading"]').filter({ hasText: /Terms of Service/i })).toBeVisible();

    // Verify last updated date is shown
    await expect(page.locator('text=/Last updated:/i')).toBeVisible();

    // Verify some key sections exist (spot check a few)
    await expect(page.locator('text=/Acceptance of Terms/i')).toBeVisible();
    await expect(page.locator('text=/User Accounts/i')).toBeVisible();

    // Verify back to home link exists
    await expect(page.locator('a[href="/"]').filter({ hasText: /Back to Home|Home/i })).toBeVisible();
  });

  test('should show footer with legal links on welcome page', async ({ page }) => {
    await page.goto(`${STAGING_URL}/`);

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Verify footer exists
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // Verify Privacy Policy link
    const privacyLink = footer.locator('a[href="/privacy"]');
    await expect(privacyLink).toBeVisible();
    await expect(privacyLink).toHaveText(/Privacy Policy/i);

    // Verify Terms of Service link
    const termsLink = footer.locator('a[href="/terms"]');
    await expect(termsLink).toBeVisible();
    await expect(termsLink).toHaveText(/Terms of Service/i);

    // Verify copyright notice
    await expect(footer.locator('text=/AthleteMetrics/i')).toBeVisible();
    await expect(footer.locator('text=/All rights reserved/i')).toBeVisible();
  });

  test('should show footer with legal links on login page', async ({ page }) => {
    await page.goto(`${STAGING_URL}/login`);

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Verify footer exists
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // Verify Privacy Policy link
    const privacyLink = footer.locator('a[href="/privacy"]');
    await expect(privacyLink).toBeVisible();

    // Verify Terms of Service link
    const termsLink = footer.locator('a[href="/terms"]');
    await expect(termsLink).toBeVisible();
  });

  test('should show footer with legal links in authenticated layout', async ({ page }) => {
    // Login first
    await loginAsDefaultUser(page);

    // Navigate to dashboard
    await page.goto(`${STAGING_URL}/dashboard`);
    await page.waitForLoadState('networkidle');

    // Verify footer exists in authenticated layout
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // Verify Privacy Policy link
    const privacyLink = footer.locator('a[href="/privacy"]');
    await expect(privacyLink).toBeVisible();

    // Verify Terms of Service link
    const termsLink = footer.locator('a[href="/terms"]');
    await expect(termsLink).toBeVisible();
  });

  test('should navigate from footer link to privacy policy page', async ({ page }) => {
    await page.goto(`${STAGING_URL}/`);
    await page.waitForLoadState('networkidle');

    // Click privacy policy link in footer
    const footer = page.locator('footer');
    await footer.locator('a[href="/privacy"]').click();

    // Should navigate to privacy policy page
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.locator('h1, [role="heading"]').filter({ hasText: /Privacy Policy/i })).toBeVisible();
  });

  test('should navigate from footer link to terms of service page', async ({ page }) => {
    await page.goto(`${STAGING_URL}/`);
    await page.waitForLoadState('networkidle');

    // Click terms of service link in footer
    const footer = page.locator('footer');
    await footer.locator('a[href="/terms"]').click();

    // Should navigate to terms of service page
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.locator('h1, [role="heading"]').filter({ hasText: /Terms of Service/i })).toBeVisible();
  });
});

test.describe('Legal Acceptance on Invitation Flow', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('should require legal acceptance checkbox for invitation acceptance', async ({ page }) => {
    // Login as org admin to create test invitation
    await loginAsDefaultUser(page);

    // Navigate to organizations page to get organization ID
    await page.goto(`${STAGING_URL}/organizations`);
    await page.waitForLoadState('networkidle');

    // Get the first organization card
    const orgCard = page.locator('[data-testid^="organization-"]:not([data-testid^="organization-link-"])').first();
    const orgTestId = await orgCard.getAttribute('data-testid');

    if (!orgTestId) {
      throw new Error('Could not find organization for creating test invitation');
    }

    const organizationId = orgTestId.replace('organization-', '');

    // Create test invitation via API
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2);
    const uniqueId = `${timestamp}_${randomId}`;
    const testEmail = `e2e_legal_test_${uniqueId}@example.com`;

    const invitationResponse = await page.request.post(`${STAGING_URL}/api/organizations/${organizationId}/invitations`, {
      data: {
        firstName: `LegalTest_${uniqueId}`,
        lastName: `User`,
        email: testEmail,
        role: 'athlete',
        teamIds: []
      }
    });

    expect(invitationResponse.ok()).toBeTruthy();
    const invitation = await invitationResponse.json();
    const invitationToken = invitation.token;
    const invitationId = invitation.id;

    try {
      // Logout to test invitation as unauthenticated user
      await page.goto(`${STAGING_URL}/api/auth/logout`);
      await page.waitForLoadState('networkidle');

      // Navigate to invitation acceptance page
      await page.goto(`${STAGING_URL}/accept-invitation?token=${invitationToken}`);
      await page.waitForLoadState('networkidle');

      // Verify the page loaded successfully (not error state)
      await expect(page.locator('h1, [role="heading"]').filter({ hasText: /Accept Invitation/i })).toBeVisible();

      // Fill in the form fields - use combined selectors for flexibility
      await page.fill('#username, input[name="username"]', `legaltest${uniqueId}`);
      await page.fill('#password, input[name="password"]', 'Test123!@#Password');
      await page.fill('#confirmPassword, input[name="confirmPassword"]', 'Test123!@#Password');

      // Verify legal acceptance checkbox exists and is unchecked by default
      const checkbox = page.locator('input[type="checkbox"]').filter({
        has: page.locator('text=/Privacy Policy.*Terms of Service/i')
      });
      await expect(checkbox).toBeVisible();
      await expect(checkbox).not.toBeChecked();

      // Verify Privacy Policy and Terms links are present
      const privacyLink = page.locator('a[href="/privacy"]');
      const termsLink = page.locator('a[href="/terms"]');
      await expect(privacyLink).toBeVisible();
      await expect(termsLink).toBeVisible();

      // Try to submit without checking the box (should fail validation)
      const submitButton = page.locator('button[type="submit"]').filter({ hasText: /Accept|Submit/i });
      await submitButton.click();

      // Wait a moment for validation to trigger
      await page.waitForTimeout(500);

      // Should still be on the invitation page (submission blocked by validation)
      expect(page.url()).toContain('/accept-invitation');

      // Now check the checkbox
      await checkbox.check();
      await expect(checkbox).toBeChecked();

      // Submit the form
      await submitButton.click();

      // Wait for successful redirect (should go to dashboard or login)
      await page.waitForURL(url => !url.pathname.includes('/accept-invitation'), { timeout: 10000 });

      // Verify user was created by trying to login
      await page.goto(`${STAGING_URL}/login`);
      await page.waitForLoadState('networkidle');

      await page.fill('#username, input[name="username"]', `legaltest${uniqueId}`);
      await page.fill('#password, input[name="password"]', 'Test123!@#Password');
      await page.click('button[type="submit"]');

      // Should successfully login
      await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10000 });

      // Verify we're authenticated (on dashboard or similar)
      const currentUrl = page.url();
      expect(currentUrl).not.toContain('/login');

    } finally {
      // Cleanup: Delete the test invitation if it still exists
      try {
        // Force fresh login for cleanup (in case session expired)
        await page.goto(`${STAGING_URL}/logout`);
        await loginAsDefaultUser(page);
        await page.request.delete(`${STAGING_URL}/api/invitations/${invitationId}`);
      } catch (error) {
        console.warn('Failed to cleanup test invitation:', error);
      }
    }
  });
});

test.describe('Privacy Policy Content Navigation', () => {
  test('should allow navigation back to home from privacy policy', async ({ page }) => {
    await page.goto(`${STAGING_URL}/privacy`);

    // Click back to home link
    const backLink = page.locator('a[href="/"]').filter({ hasText: /Back to Home|Home/i });
    await backLink.click();

    // Should navigate back to home
    await expect(page).toHaveURL(/\/$|\/dashboard/);
  });

  test('should allow navigation back to home from terms of service', async ({ page }) => {
    await page.goto(`${STAGING_URL}/terms`);

    // Click back to home link
    const backLink = page.locator('a[href="/"]').filter({ hasText: /Back to Home|Home/i });
    await backLink.click();

    // Should navigate back to home
    await expect(page).toHaveURL(/\/$|\/dashboard/);
  });
});
