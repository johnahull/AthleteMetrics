import { test, expect } from '@playwright/test';
import { loginWithCredentials } from './helpers/auth';
import { getUserByRole } from './fixtures/test-users';

/**
 * TIER 1 CRITICAL: Admin Bulk Verify/Unverify Tests
 *
 * These tests verify the bulk verification functionality for site admins:
 * - Bulk verifying multiple measurements
 * - Bulk unverifying multiple measurements
 * - Selection clearing after success
 * - Access control (org_admin cannot access site-wide admin page)
 *
 * Tests follow TDD methodology: written first, implementation built to make them pass.
 */

const TESTING_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

test.describe('Admin Bulk Verify/Unverify Tests', () => {

  test.describe('Site Admin Access', () => {
    test.beforeEach(async ({ page }) => {
      const siteAdmin = getUserByRole('site_admin');
      await loginWithCredentials(page, siteAdmin.username, siteAdmin.password);
    });

    test('should bulk verify unverified measurements', async ({ page }) => {
      // Navigate to admin measurements page
      await page.goto(`${TESTING_URL}/admin/measurements`);
      await page.waitForLoadState('networkidle');

      // Wait for page to load
      await expect(page.locator('h1, h2')).toContainText(/measurements/i, { timeout: 10000 });

      // Open filters if collapsed
      const filtersButton = page.locator('button:has-text("Filters"), button:has([data-icon="filter"])');
      if (await filtersButton.isVisible()) {
        await filtersButton.click();
        await page.waitForTimeout(500); // Wait for collapsible animation
      }

      // Set filter to "Unverified Only"
      const verificationFilter = page.locator('select[name="verificationStatus"], [name="verificationStatus"]');
      await verificationFilter.selectOption('unverified');

      // Submit filters
      const applyButton = page.locator('button:has-text("Apply"), button[type="submit"]').first();
      await applyButton.click();
      await page.waitForLoadState('networkidle');

      // Wait for table to load
      await page.waitForSelector('table tbody tr', { timeout: 10000 });

      // Get initial count of measurements
      const initialRows = await page.locator('table tbody tr').count();

      if (initialRows === 0) {
        console.log('No unverified measurements found - skipping test');
        test.skip();
      }

      // Select 2-3 measurements (or fewer if not enough exist)
      const checkboxCount = Math.min(3, initialRows);
      const selectedIds: string[] = [];

      for (let i = 0; i < checkboxCount; i++) {
        const checkbox = page.locator('table tbody tr').nth(i).locator('input[type="checkbox"]');
        await checkbox.check();

        // Store the measurement ID or row identifier for later verification
        const row = page.locator('table tbody tr').nth(i);
        const athleteName = await row.locator('td').nth(1).textContent(); // Assuming athlete name is 2nd column
        selectedIds.push(athleteName || `row-${i}`);
      }

      // Verify bulk action bar appears
      await expect(page.locator('text=/\\d+ selected/i')).toBeVisible();

      // Click "Verify Selected" button
      const verifyButton = page.locator('button:has-text("Verify Selected")');
      await expect(verifyButton).toBeVisible();
      await verifyButton.click();

      // Wait for and confirm the AlertDialog
      const confirmButton = page.locator('button:has-text("Verify")').last();
      await expect(confirmButton).toBeVisible({ timeout: 5000 });
      await confirmButton.click();

      // Wait for success toast
      await expect(page.locator('.toast, [role="status"], [role="alert"]')).toContainText(/verified|success/i, { timeout: 10000 });

      // Wait for table to update
      await page.waitForTimeout(1000);

      // Verify measurements disappeared from unverified list (since filter is still "unverified only")
      const newRowCount = await page.locator('table tbody tr').count();
      expect(newRowCount).toBeLessThan(initialRows);

      // Verify selection is cleared
      await expect(page.locator('text=/\\d+ selected/i')).not.toBeVisible();

      // Switch to "Verified Only" filter
      await verificationFilter.selectOption('verified');
      await applyButton.click();
      await page.waitForLoadState('networkidle');

      // Verify previously selected measurements now appear in verified list
      // Check that at least some of the selected athlete names appear
      for (const id of selectedIds.slice(0, 2)) { // Check at least first 2
        if (id.startsWith('row-')) continue; // Skip placeholder IDs
        await expect(page.locator('table tbody')).toContainText(id, { timeout: 5000 });
      }
    });

    test('should bulk unverify verified measurements', async ({ page }) => {
      // Navigate to admin measurements page
      await page.goto(`${TESTING_URL}/admin/measurements`);
      await page.waitForLoadState('networkidle');

      // Wait for page to load
      await expect(page.locator('h1, h2')).toContainText(/measurements/i, { timeout: 10000 });

      // Open filters if collapsed
      const filtersButton = page.locator('button:has-text("Filters"), button:has([data-icon="filter"])');
      if (await filtersButton.isVisible()) {
        await filtersButton.click();
        await page.waitForTimeout(500);
      }

      // Set filter to "Verified Only"
      const verificationFilter = page.locator('select[name="verificationStatus"], [name="verificationStatus"]');
      await verificationFilter.selectOption('verified');

      // Submit filters
      const applyButton = page.locator('button:has-text("Apply"), button[type="submit"]').first();
      await applyButton.click();
      await page.waitForLoadState('networkidle');

      // Wait for table to load
      await page.waitForSelector('table tbody tr', { timeout: 10000 });

      // Get initial count of measurements
      const initialRows = await page.locator('table tbody tr').count();

      if (initialRows === 0) {
        console.log('No verified measurements found - skipping test');
        test.skip();
      }

      // Select 2-3 measurements
      const checkboxCount = Math.min(3, initialRows);
      const selectedIds: string[] = [];

      for (let i = 0; i < checkboxCount; i++) {
        const checkbox = page.locator('table tbody tr').nth(i).locator('input[type="checkbox"]');
        await checkbox.check();

        const row = page.locator('table tbody tr').nth(i);
        const athleteName = await row.locator('td').nth(1).textContent();
        selectedIds.push(athleteName || `row-${i}`);
      }

      // Verify bulk action bar appears
      await expect(page.locator('text=/\\d+ selected/i')).toBeVisible();

      // Click "Unverify Selected" button
      const unverifyButton = page.locator('button:has-text("Unverify Selected")');
      await expect(unverifyButton).toBeVisible();
      await unverifyButton.click();

      // Wait for and confirm the AlertDialog
      const confirmButton = page.locator('button:has-text("Unverify")').last();
      await expect(confirmButton).toBeVisible({ timeout: 5000 });
      await confirmButton.click();

      // Wait for success toast
      await expect(page.locator('.toast, [role="status"], [role="alert"]')).toContainText(/unverified|success/i, { timeout: 10000 });

      // Wait for table to update
      await page.waitForTimeout(1000);

      // Verify measurements disappeared from verified list
      const newRowCount = await page.locator('table tbody tr').count();
      expect(newRowCount).toBeLessThan(initialRows);

      // Verify selection is cleared
      await expect(page.locator('text=/\\d+ selected/i')).not.toBeVisible();

      // Switch to "Unverified Only" filter
      await verificationFilter.selectOption('unverified');
      await applyButton.click();
      await page.waitForLoadState('networkidle');

      // Verify previously selected measurements now appear in unverified list
      for (const id of selectedIds.slice(0, 2)) {
        if (id.startsWith('row-')) continue;
        await expect(page.locator('table tbody')).toContainText(id, { timeout: 5000 });
      }
    });

    test('should clear selection after successful bulk operation', async ({ page }) => {
      // Navigate to admin measurements page
      await page.goto(`${TESTING_URL}/admin/measurements`);
      await page.waitForLoadState('networkidle');

      // Open filters
      const filtersButton = page.locator('button:has-text("Filters"), button:has([data-icon="filter"])');
      if (await filtersButton.isVisible()) {
        await filtersButton.click();
        await page.waitForTimeout(500);
      }

      // Set filter to show unverified
      const verificationFilter = page.locator('select[name="verificationStatus"], [name="verificationStatus"]');
      await verificationFilter.selectOption('unverified');

      const applyButton = page.locator('button:has-text("Apply"), button[type="submit"]').first();
      await applyButton.click();
      await page.waitForLoadState('networkidle');

      // Wait for table
      await page.waitForSelector('table tbody tr', { timeout: 10000 });

      // Select one measurement
      const firstCheckbox = page.locator('table tbody tr').first().locator('input[type="checkbox"]');
      await firstCheckbox.check();

      // Verify bulk action bar is visible
      await expect(page.locator('text=/1 selected/i')).toBeVisible();

      // Click verify button
      const verifyButton = page.locator('button:has-text("Verify Selected")');
      await verifyButton.click();

      // Confirm the AlertDialog
      const confirmButton = page.locator('button:has-text("Verify")').last();
      await expect(confirmButton).toBeVisible({ timeout: 5000 });
      await confirmButton.click();

      // Wait for success
      await expect(page.locator('.toast, [role="status"], [role="alert"]')).toContainText(/verified|success/i, { timeout: 10000 });

      // Wait a moment for state to update
      await page.waitForTimeout(500);

      // Verify bulk action bar is hidden (selection cleared)
      await expect(page.locator('text=/\\d+ selected/i')).not.toBeVisible();

      // Verify no checkboxes are checked (check the "select all" checkbox is unchecked)
      const selectAllCheckbox = page.locator('table thead input[type="checkbox"]');
      await expect(selectAllCheckbox).not.toBeChecked();
    });
  });

  test.describe('Access Control', () => {
    test('should prevent org_admin from accessing site-wide admin page', async ({ page }) => {
      // Login as org_admin
      const orgAdmin = getUserByRole('org_admin');
      await loginWithCredentials(page, orgAdmin.username, orgAdmin.password);

      // Try to navigate to admin measurements page
      await page.goto(`${TESTING_URL}/admin/measurements`);
      await page.waitForLoadState('networkidle');

      // Should be redirected away or see access denied message
      // Check we're NOT on the admin measurements page
      const currentUrl = page.url();
      const isOnAdminPage = currentUrl.includes('/admin/measurements');

      if (isOnAdminPage) {
        // If still on page, should see access denied message
        await expect(page.locator('body')).toContainText(/access denied|not authorized|permission/i, { timeout: 5000 });
      } else {
        // Successfully redirected away from admin page
        expect(isOnAdminPage).toBe(false);
      }
    });
  });
});
