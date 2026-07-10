import { test, expect } from './fixtures/e2e-base';
import { loginWithCredentials } from './helpers/auth';
import { getUserByRole } from './fixtures/test-users';

/**
 * Org Admin Settings E2E Tests
 *
 * Tests for organization admin settings page functionality.
 * This covers features accessible to org admins (not site admins).
 */

const TESTING_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

const TEST_USERS = {
  orgAdmin: getUserByRole('org_admin'),
};

test.describe('Org Admin Settings', () => {
  let testOrgId: string;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Login as org admin to get their organization
    await loginWithCredentials(page, TEST_USERS.orgAdmin.username, TEST_USERS.orgAdmin.password);

    // Get org admin's organizations
    const meResponse = await page.request.get(`${TESTING_URL}/api/auth/me/organizations`);
    expect(meResponse.ok()).toBeTruthy();

    const orgs = await meResponse.json();
    expect(Array.isArray(orgs)).toBeTruthy();
    expect(orgs.length).toBeGreaterThan(0);

    testOrgId = orgs[0].organizationId;

    await context.close();
  });

  test('org admin can recalculate derived metrics', async ({ page }) => {
    // Login as org admin
    await loginWithCredentials(page, TEST_USERS.orgAdmin.username, TEST_USERS.orgAdmin.password);

    // Navigate to org settings
    await page.goto(`${TESTING_URL}/organizations/${testOrgId}/admin`);
    await page.waitForLoadState('networkidle');

    // Verify the recalculation card is visible
    await expect(page.locator('text=Derived Metrics Recalculation')).toBeVisible();

    // Click recalculate button
    await page.click('button:has-text("Recalculate")');

    // Verify confirmation dialog
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=Recalculate Derived Metrics')).toBeVisible();

    // Confirm recalculation
    await page.click('[role="dialog"] button:has-text("Recalculate")');

    // Verify success toast
    await expect(page.locator('text=Recalculation complete')).toBeVisible({ timeout: 15000 });
  });
});
