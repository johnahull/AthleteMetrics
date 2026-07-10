import { test, expect } from './fixtures/e2e-base';
import { loginWithCredentials } from './helpers/auth';
import { getUserByRole, canTestRoleAuthorization } from './fixtures/test-users';

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

/**
 * Helper function to wait for the measurements table or empty state.
 * The table only renders when data exists - otherwise shows "No measurements found" message.
 * @returns true if table is visible, false if empty state is shown (test should skip)
 */
async function waitForTableOrEmptyState(page: any): Promise<boolean> {
  const tableLocator = page.locator('table');
  // Use .first() to avoid strict mode violation - there may be sr-only duplicates
  const emptyStateLocator = page.locator('p:has-text("No measurements found"), .text-muted-foreground:has-text("No measurements")').first();

  // Wait for either to appear
  await Promise.race([
    tableLocator.waitFor({ state: 'visible', timeout: 10000 }),
    emptyStateLocator.waitFor({ state: 'visible', timeout: 10000 }),
  ]).catch(() => {/* one will timeout, that's expected */});

  // Return false if empty state is showing (caller should skip test)
  if (await emptyStateLocator.isVisible()) {
    console.log('No measurements exist in database');
    return false;
  }

  return true;
}

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
      await expect(page.locator('main h1').first()).toContainText(/measurements/i, { timeout: 10000 });

      // Open filters if collapsed
      const filtersButton = page.locator('button:has-text("Filters"), button:has([data-icon="filter"])');
      if (await filtersButton.isVisible()) {
        await filtersButton.click();
        // Wait for filter form to be visible
        await page.waitForSelector('select[name="verificationStatus"], [name="verificationStatus"]', { state: 'visible', timeout: 5000 });
      }

      // Set filter to "Unverified Only"
      const verificationFilter = page.locator('select[name="verificationStatus"], [name="verificationStatus"]');
      await verificationFilter.selectOption('unverified');

      // Submit filters
      const applyButton = page.locator('button:has-text("Apply"), button[type="submit"]').first();
      await applyButton.click();
      await page.waitForLoadState('networkidle');

      // Wait for table or empty state (table only renders when data exists)
      const hasTable = await waitForTableOrEmptyState(page);
      if (!hasTable) {
        test.skip();
        return;
      }

      // Give the table time to populate after filters are applied
      await page.waitForTimeout(1000);

      // Get initial count of measurements
      const initialRows = await page.locator('table tbody tr').count();

      if (initialRows === 0) {
        console.log('No unverified measurements found - skipping test');
        test.skip();
        return;
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

      // Wait for table to update (toast should disappear or table should refresh)
      await page.waitForLoadState('networkidle');

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
      await expect(page.locator('main h1').first()).toContainText(/measurements/i, { timeout: 10000 });

      // Open filters if collapsed
      const filtersButton = page.locator('button:has-text("Filters"), button:has([data-icon="filter"])');
      if (await filtersButton.isVisible()) {
        await filtersButton.click();
        // Wait for filter form to be visible
        await page.waitForSelector('select[name="verificationStatus"], [name="verificationStatus"]', { state: 'visible', timeout: 5000 });
      }

      // Set filter to "Verified Only"
      const verificationFilter = page.locator('select[name="verificationStatus"], [name="verificationStatus"]');
      await verificationFilter.selectOption('verified');

      // Submit filters
      const applyButton = page.locator('button:has-text("Apply"), button[type="submit"]').first();
      await applyButton.click();
      await page.waitForLoadState('networkidle');

      // Wait for table or empty state (table only renders when data exists)
      const hasTable = await waitForTableOrEmptyState(page);
      if (!hasTable) {
        test.skip();
        return;
      }

      // Give the table time to populate after filters are applied
      await page.waitForTimeout(1000);

      // Get initial count of measurements
      const initialRows = await page.locator('table tbody tr').count();

      if (initialRows === 0) {
        console.log('No verified measurements found - skipping test');
        test.skip();
        return;
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

      // Wait for table to update (toast should disappear or table should refresh)
      await page.waitForLoadState('networkidle');

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
        // Wait for filter form to be visible
        await page.waitForSelector('select[name="verificationStatus"], [name="verificationStatus"]', { state: 'visible', timeout: 5000 });
      }

      // Set filter to show unverified
      const verificationFilter = page.locator('select[name="verificationStatus"], [name="verificationStatus"]');
      await verificationFilter.selectOption('unverified');

      const applyButton = page.locator('button:has-text("Apply"), button[type="submit"]').first();
      await applyButton.click();
      await page.waitForLoadState('networkidle');

      // Wait for table or empty state (table only renders when data exists)
      const hasTable = await waitForTableOrEmptyState(page);
      if (!hasTable) {
        test.skip();
        return;
      }

      // Give the table time to populate after filters are applied
      await page.waitForTimeout(1000);

      // Check if there are any measurements
      const rowCount = await page.locator('table tbody tr').count();
      if (rowCount === 0) {
        console.log('No unverified measurements found - skipping test');
        test.skip();
        return;
      }

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

      // Wait for selection state to update (selection bar should disappear)
      await expect(page.locator('text=/\\d+ selected/i')).not.toBeVisible();

      // Verify bulk action bar is hidden (selection cleared)
      await expect(page.locator('text=/\\d+ selected/i')).not.toBeVisible();

      // Verify no checkboxes are checked (check the "select all" checkbox is unchecked)
      const selectAllCheckbox = page.locator('table thead input[type="checkbox"]');
      await expect(selectAllCheckbox).not.toBeChecked();
    });
  });

  test.describe('Access Control', () => {
    test('should prevent org_admin from accessing site-wide admin page', async ({ page }) => {
      // Skip if org_admin and site_admin share same credentials (org_admin IS site_admin)
      test.skip(!canTestRoleAuthorization('org_admin', 'site_admin'),
        'Skipping: org_admin and site_admin share same credentials in this environment');

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

  test.describe('Large Dataset Handling', () => {
    test.beforeEach(async ({ page }) => {
      const siteAdmin = getUserByRole('site_admin');
      await loginWithCredentials(page, siteAdmin.username, siteAdmin.password);
    });

    test('should handle pagination with >100 records', async ({ page }) => {
      // Navigate to admin measurements page
      await page.goto(`${TESTING_URL}/admin/measurements`);
      await page.waitForLoadState('networkidle');

      // Wait for page to load
      await expect(page.locator('main h1').first()).toContainText(/measurements/i, { timeout: 10000 });

      // Open filters if collapsed
      const filtersButton = page.locator('button:has-text("Filters"), button:has([data-icon="filter"])');
      if (await filtersButton.isVisible()) {
        await filtersButton.click();
        await page.waitForSelector('select[name="verificationStatus"], [name="verificationStatus"]', { state: 'visible', timeout: 5000 });
      }

      // Set filter to "All Measurements" to maximize dataset
      const verificationFilter = page.locator('select[name="verificationStatus"], [name="verificationStatus"]');
      await verificationFilter.selectOption('all');

      // Submit filters
      const applyButton = page.locator('button:has-text("Apply"), button[type="submit"]').first();
      await applyButton.click();
      await page.waitForLoadState('networkidle');

      // Wait for table or empty state (table only renders when data exists)
      const hasTable = await waitForTableOrEmptyState(page);
      if (!hasTable) {
        test.skip();
        return;
      }

      // Give the table time to populate after filters are applied
      await page.waitForTimeout(1000);

      // Check if there are any measurements
      const rowCount = await page.locator('table tbody tr').count();
      if (rowCount === 0) {
        console.log('No measurements found - skipping test');
        test.skip();
        return;
      }

      // Check total count in description
      const description = page.locator('p:has-text("Showing")');
      const descriptionText = await description.textContent();
      const totalMatch = descriptionText?.match(/of (\d+) measurement/);
      const totalRecords = totalMatch ? parseInt(totalMatch[1]) : 0;

      console.log(`Total records: ${totalRecords}`);

      // If dataset has >100 records, test pagination
      if (totalRecords > 100) {
        // Set page size to 100
        const pageSizeSelect = page.locator('select').filter({ hasText: /^(10|25|50|100|All)$/ });
        await pageSizeSelect.selectOption('100');
        await page.waitForLoadState('networkidle');

        // Verify we're on page 1
        await expect(page.locator('text=/Page 1 of/i')).toBeVisible();

        // Verify 100 rows are displayed
        const rowCount = await page.locator('table tbody tr').count();
        expect(rowCount).toBe(100);

        // Navigate to page 2
        const nextButton = page.locator('button:has-text("Next")');
        await nextButton.click();
        await page.waitForLoadState('networkidle');

        // Verify we're on page 2
        await expect(page.locator('text=/Page 2 of/i')).toBeVisible();

        // Verify rows are still displayed
        const page2RowCount = await page.locator('table tbody tr').count();
        expect(page2RowCount).toBeGreaterThan(0);

        // Navigate back to page 1
        const previousButton = page.locator('button:has-text("Previous")');
        await previousButton.click();
        await page.waitForLoadState('networkidle');

        // Verify we're back on page 1
        await expect(page.locator('text=/Page 1 of/i')).toBeVisible();
      } else {
        console.log('Dataset has ≤100 records, skipping pagination test');
        test.skip();
      }
    });

    test('should cap "Show All" at 500 records', async ({ page }) => {
      // Navigate to admin measurements page
      await page.goto(`${TESTING_URL}/admin/measurements`);
      await page.waitForLoadState('networkidle');

      // Wait for page to load
      await expect(page.locator('main h1').first()).toContainText(/measurements/i, { timeout: 10000 });

      // Open filters if collapsed
      const filtersButton = page.locator('button:has-text("Filters"), button:has([data-icon="filter"])');
      if (await filtersButton.isVisible()) {
        await filtersButton.click();
        await page.waitForSelector('select[name="verificationStatus"], [name="verificationStatus"]', { state: 'visible', timeout: 5000 });
      }

      // Set filter to "All Measurements" to maximize dataset
      const verificationFilter = page.locator('select[name="verificationStatus"], [name="verificationStatus"]');
      await verificationFilter.selectOption('all');

      // Submit filters
      const applyButton = page.locator('button:has-text("Apply"), button[type="submit"]').first();
      await applyButton.click();
      await page.waitForLoadState('networkidle');

      // Wait for table or empty state (table only renders when data exists)
      const hasTable = await waitForTableOrEmptyState(page);
      if (!hasTable) {
        test.skip();
        return;
      }

      // Give the table time to populate after filters are applied
      await page.waitForTimeout(1000);

      // Check if there are any measurements
      const initialRowCount = await page.locator('table tbody tr').count();
      if (initialRowCount === 0) {
        console.log('No measurements found - skipping test');
        test.skip();
        return;
      }

      // Check total count
      const description = page.locator('p:has-text("Showing")');
      const descriptionText = await description.textContent();
      const totalMatch = descriptionText?.match(/of (\d+) measurement/);
      const totalRecords = totalMatch ? parseInt(totalMatch[1]) : 0;

      console.log(`Total records: ${totalRecords}`);

      // Select "Show All"
      const pageSizeSelect = page.locator('select').filter({ hasText: /^(10|25|50|100|All)$/ });
      await pageSizeSelect.selectOption('0'); // 0 = All
      await page.waitForLoadState('networkidle');

      // Wait for table to re-render after pagination change
      const hasTableAfterPagination = await waitForTableOrEmptyState(page);
      if (!hasTableAfterPagination) {
        // This shouldn't happen since we confirmed data exists earlier
        test.skip();
        return;
      }
      await page.waitForTimeout(1000);

      // Count displayed rows
      const displayedRows = await page.locator('table tbody tr').count();

      // Verify that if total > 500, only 500 are displayed
      if (totalRecords > 500) {
        expect(displayedRows).toBe(500);

        // Verify description shows the cap
        const updatedDescription = await page.locator('p:has-text("Showing")').textContent();
        expect(updatedDescription).toContain('Showing 1-500');
      } else {
        // If total ≤ 500, all records should be displayed
        expect(displayedRows).toBe(totalRecords);
      }

      // Verify pagination controls are hidden when "All" is selected
      await expect(page.locator('button:has-text("Previous")')).not.toBeVisible();
      await expect(page.locator('button:has-text("Next")')).not.toBeVisible();
    });

    test('should show confirmation dialog for CSV export with >500 records', async ({ page }) => {
      // Navigate to admin measurements page
      await page.goto(`${TESTING_URL}/admin/measurements`);
      await page.waitForLoadState('networkidle');

      // Wait for page to load
      await expect(page.locator('main h1').first()).toContainText(/measurements/i, { timeout: 10000 });

      // Open filters if collapsed
      const filtersButton = page.locator('button:has-text("Filters"), button:has([data-icon="filter"])');
      if (await filtersButton.isVisible()) {
        await filtersButton.click();
        await page.waitForSelector('select[name="verificationStatus"], [name="verificationStatus"]', { state: 'visible', timeout: 5000 });
      }

      // Set filter to "All Measurements" to maximize dataset
      const verificationFilter = page.locator('select[name="verificationStatus"], [name="verificationStatus"]');
      await verificationFilter.selectOption('all');

      // Submit filters
      const applyButton = page.locator('button:has-text("Apply"), button[type="submit"]').first();
      await applyButton.click();
      await page.waitForLoadState('networkidle');

      // Wait for table or empty state (table only renders when data exists)
      const hasTable = await waitForTableOrEmptyState(page);
      if (!hasTable) {
        test.skip();
        return;
      }

      // Give the table time to populate after filters are applied
      await page.waitForTimeout(1000);

      // Check if there are any measurements
      const rowCount = await page.locator('table tbody tr').count();
      if (rowCount === 0) {
        console.log('No measurements found - skipping test');
        test.skip();
        return;
      }

      // Check total count
      const description = page.locator('p:has-text("Showing")');
      const descriptionText = await description.textContent();
      const totalMatch = descriptionText?.match(/of (\d+) measurement/);
      const totalRecords = totalMatch ? parseInt(totalMatch[1]) : 0;

      console.log(`Total records: ${totalRecords}`);

      if (totalRecords > 500) {
        // Click export button
        const exportButton = page.locator('button[data-testid="export-csv-button"]');
        await exportButton.click();

        // Wait for confirmation dialog to appear
        await expect(page.locator('[role="dialog"], [role="alertdialog"]')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('text=/Large CSV Export/i')).toBeVisible();
        await expect(page.locator(`text=/export ${totalRecords} measurements/i`)).toBeVisible();

        // Verify Cancel and Confirm buttons exist
        await expect(page.locator('button:has-text("Cancel")')).toBeVisible();
        await expect(page.locator('button:has-text("Export")')).toBeVisible();

        // Cancel the export
        await page.locator('button:has-text("Cancel")').click();

        // Verify dialog closes
        await expect(page.locator('[role="dialog"], [role="alertdialog"]')).not.toBeVisible();
      } else {
        console.log('Dataset has ≤500 records, skipping confirmation dialog test');
        test.skip();
      }
    });

    test('should handle column sorting with large datasets', async ({ page }) => {
      // Navigate to admin measurements page
      await page.goto(`${TESTING_URL}/admin/measurements`);
      await page.waitForLoadState('networkidle');

      // Wait for page to load
      await expect(page.locator('main h1').first()).toContainText(/measurements/i, { timeout: 10000 });

      // Open filters if collapsed
      const filtersButton = page.locator('button:has-text("Filters"), button:has([data-icon="filter"])');
      if (await filtersButton.isVisible()) {
        await filtersButton.click();
        await page.waitForSelector('select[name="verificationStatus"], [name="verificationStatus"]', { state: 'visible', timeout: 5000 });
      }

      // Set filter to "All Measurements" to maximize dataset
      const verificationFilter = page.locator('select[name="verificationStatus"], [name="verificationStatus"]');
      await verificationFilter.selectOption('all');

      // Submit filters
      const applyButton = page.locator('button:has-text("Apply"), button[type="submit"]').first();
      await applyButton.click();
      await page.waitForLoadState('networkidle');

      // Wait for table or empty state (table only renders when data exists)
      const hasTable = await waitForTableOrEmptyState(page);
      if (!hasTable) {
        test.skip();
        return;
      }

      // Give the table time to populate after filters are applied
      await page.waitForTimeout(1000);

      // Check if there are any measurements
      const rowCountBeforeSort = await page.locator('table tbody tr').count();
      if (rowCountBeforeSort === 0) {
        console.log('No measurements found - skipping test');
        test.skip();
        return;
      }

      // Get initial first row data
      const firstRowBefore = page.locator('table tbody tr').first();
      const firstAthleteBefore = await firstRowBefore.locator('td').nth(2).textContent();

      // Click on "Athlete" column header to sort
      const athleteHeader = page.locator('thead th', { hasText: 'Athlete' }).first();
      await athleteHeader.click();

      // Wait for sort to complete
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500); // Brief wait for UI to update

      // Get first row data after sort
      const firstRowAfter = page.locator('table tbody tr').first();
      const firstAthleteAfter = await firstRowAfter.locator('td').nth(2).textContent();

      // Verify sort indicator appears
      await expect(athleteHeader.locator('[data-icon="arrow-up-down"]')).toBeVisible();

      // Click again to sort descending
      await athleteHeader.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);

      // Get first row data after reverse sort
      const firstRowReversed = page.locator('table tbody tr').first();
      const firstAthleteReversed = await firstRowReversed.locator('td').nth(2).textContent();

      // Athletes should be different after sorting (unless there's only 1 athlete)
      const rowCount = await page.locator('table tbody tr').count();
      if (rowCount > 1) {
        expect(firstAthleteBefore).not.toBe(firstAthleteAfter);
      }

      console.log(`Sorting test completed with ${rowCount} rows`);
    });

    test('should handle statistics card edge cases', async ({ page }) => {
      // Navigate to admin measurements page
      await page.goto(`${TESTING_URL}/admin/measurements`);
      await page.waitForLoadState('networkidle');

      // Wait for page to load
      await expect(page.locator('main h1').first()).toContainText(/measurements/i, { timeout: 10000 });

      // Open filters if collapsed
      const filtersButton = page.locator('button:has-text("Filters"), button:has([data-icon="filter"])');
      if (await filtersButton.isVisible()) {
        await filtersButton.click();
        await page.waitForSelector('select[name="verificationStatus"], [name="verificationStatus"]', { state: 'visible', timeout: 5000 });
      }

      // Set filter to "All Measurements"
      const verificationFilter = page.locator('select[name="verificationStatus"], [name="verificationStatus"]');
      await verificationFilter.selectOption('all');

      // Submit filters
      const applyButton = page.locator('button:has-text("Apply"), button[type="submit"]').first();
      await applyButton.click();
      await page.waitForLoadState('networkidle');

      // Wait for table or empty state (table only renders when data exists)
      const hasTable = await waitForTableOrEmptyState(page);
      if (!hasTable) {
        test.skip();
        return;
      }

      // Give the table time to populate after filters are applied
      await page.waitForTimeout(1000);

      // Check if there are any measurements
      const measurementCount = await page.locator('table tbody tr').count();
      if (measurementCount === 0) {
        console.log('No measurements found - skipping test');
        test.skip();
        return;
      }

      // Check if statistics cards are displayed
      const statsCards = page.locator('[class*="StatisticsSummary"], div:has(> h3:has-text("Statistics"))');
      const hasStatsCards = await statsCards.count() > 0;

      if (hasStatsCards) {
        console.log('Statistics cards found, verifying they display correctly');

        // Verify stats cards render without errors
        await expect(statsCards.first()).toBeVisible();

        // Check for key statistics (mean, median, etc.)
        const statsText = await statsCards.first().textContent();
        expect(statsText).toBeTruthy();

        // Test edge case: Filter to a single athlete (if possible)
        const athleteNameInput = page.locator('input[name="athleteName"]');
        await athleteNameInput.fill('Test'); // Search for any athlete with "Test" in name

        // Wait for debounce
        await page.waitForTimeout(400);
        await page.waitForLoadState('networkidle');

        // Check if results exist
        const hasResults = await page.locator('table tbody tr').count() > 0;

        if (hasResults) {
          // Stats should still display for filtered results
          const filteredStatsCards = page.locator('[class*="StatisticsSummary"], div:has(> h3:has-text("Statistics"))');
          const hasFilteredStats = await filteredStatsCards.count() > 0;

          if (hasFilteredStats) {
            await expect(filteredStatsCards.first()).toBeVisible();
            console.log('Statistics cards display correctly with filtered data');
          }
        }
      } else {
        console.log('No statistics cards found - may not be visible for current dataset');
      }
    });

    test('should handle multiple filter combinations', async ({ page }) => {
      // Navigate to admin measurements page
      await page.goto(`${TESTING_URL}/admin/measurements`);
      await page.waitForLoadState('networkidle');

      // Wait for page to load
      await expect(page.locator('main h1').first()).toContainText(/measurements/i, { timeout: 10000 });

      // Wait for table or empty state - filters only work when data exists
      const hasTable = await waitForTableOrEmptyState(page);
      if (!hasTable) {
        test.skip();
        return;
      }

      // Open filters if collapsed
      const filtersButton = page.locator('button:has-text("Filters"), button:has([data-icon="filter"])');
      if (await filtersButton.isVisible()) {
        await filtersButton.click();
        await page.waitForSelector('select[name="verificationStatus"], [name="verificationStatus"]', { state: 'visible', timeout: 5000 });
      }

      // Test 1: Age range filter
      const ageFromInput = page.locator('input[name="ageFrom"]');
      const ageToInput = page.locator('input[name="ageTo"]');
      await ageFromInput.fill('15');
      await ageToInput.fill('18');

      // Apply filters
      const applyButton = page.locator('button:has-text("Apply"), button[type="submit"]').first();
      await applyButton.click();
      await page.waitForLoadState('networkidle');

      // Verify results are filtered
      const firstResultCount = await page.locator('table tbody tr').count();
      console.log(`Age filter 15-18: ${firstResultCount} results`);

      // Test 2: Add verification status filter
      const verificationFilter = page.locator('select[name="verificationStatus"], [name="verificationStatus"]');
      await verificationFilter.selectOption('verified');
      await applyButton.click();
      await page.waitForLoadState('networkidle');

      const secondResultCount = await page.locator('table tbody tr').count();
      console.log(`Age 15-18 + verified: ${secondResultCount} results`);

      // Verify second filter reduced or maintained count
      expect(secondResultCount).toBeLessThanOrEqual(firstResultCount);

      // Test 3: Clear filters (use exact match to avoid matching "Clear filters to see all" button)
      const clearButton = page.getByRole('button', { name: 'Clear Filters', exact: true });
      await clearButton.click();
      await page.waitForLoadState('networkidle');

      // Verify all results are shown again
      const clearedResultCount = await page.locator('table tbody tr').count();
      console.log(`After clearing filters: ${clearedResultCount} results`);
      expect(clearedResultCount).toBeGreaterThanOrEqual(secondResultCount);

      // Test 4: Team filter (if teams exist)
      const teamSelect = page.locator('select[name="teamIds"], [multiple][name="teamIds"]');
      if (await teamSelect.isVisible()) {
        const teamOptions = await teamSelect.locator('option').count();
        if (teamOptions > 1) {
          // Select first team
          await teamSelect.selectOption({ index: 1 });
          await applyButton.click();
          await page.waitForLoadState('networkidle');

          const teamFilteredCount = await page.locator('table tbody tr').count();
          console.log(`Team filter: ${teamFilteredCount} results`);
        }
      }

      // Test 5: Athlete name search (client-side filter)
      const athleteNameInput = page.locator('input[name="athleteName"], input[placeholder*="athlete" i]');
      if (await athleteNameInput.isVisible()) {
        await athleteNameInput.fill('Test');
        await page.waitForTimeout(400); // Wait for debounce
        await page.waitForLoadState('networkidle');

        const nameSearchCount = await page.locator('table tbody tr').count();
        console.log(`Athlete name search "Test": ${nameSearchCount} results`);
      }
    });
  });

  test.describe('Edge Cases', () => {
    test.beforeEach(async ({ page }) => {
      const siteAdmin = getUserByRole('site_admin');
      await loginWithCredentials(page, siteAdmin.username, siteAdmin.password);
    });

    test('should show empty state when no measurements match filters', async ({ page }) => {
      // Navigate to admin measurements page
      await page.goto(`${TESTING_URL}/admin/measurements`);
      await page.waitForLoadState('networkidle');

      // Wait for page to load
      await expect(page.locator('main h1').first()).toContainText(/measurements/i, { timeout: 10000 });

      // This test requires data to filter - skip if database is already empty
      // (filtering empty data to get empty results is redundant)
      const hasTable = await waitForTableOrEmptyState(page);
      if (!hasTable) {
        console.log('Skipping empty state filter test - database already empty');
        test.skip();
        return;
      }

      // Open filters if collapsed
      const filtersButton = page.locator('button:has-text("Filters"), button:has([data-icon="filter"])');
      if (await filtersButton.isVisible()) {
        await filtersButton.click();
        await page.waitForSelector('select[name="verificationStatus"], [name="verificationStatus"]', { state: 'visible', timeout: 5000 });
      }

      // Set impossible filter combination (e.g., very recent date that likely has no data)
      const startDateInput = page.locator('input[name="startDate"]');
      const endDateInput = page.locator('input[name="endDate"]');

      // Set date range to tomorrow (should have no measurements)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      await startDateInput.fill(tomorrowStr);
      await endDateInput.fill(tomorrowStr);

      // Submit filters
      const applyButton = page.locator('button:has-text("Apply"), button[type="submit"]').first();
      await applyButton.click();
      await page.waitForLoadState('networkidle');

      // Should show empty state message or empty table
      // Use first() to avoid strict mode if multiple elements contain the text
      const emptyMessage = page.locator('text=/no measurements found|no results/i').first();
      await expect(emptyMessage).toBeVisible({ timeout: 5000 });

      // Verify no table rows are visible
      const rowCount = await page.locator('table tbody tr').count();
      expect(rowCount).toBe(0);
    });

    test('should handle network errors gracefully', async ({ page }) => {
      // Navigate to admin measurements page
      await page.goto(`${TESTING_URL}/admin/measurements`);
      await page.waitForLoadState('networkidle');

      // Wait for page to load
      await expect(page.locator('main h1').first()).toContainText(/measurements/i, { timeout: 10000 });

      // Open filters if collapsed
      const filtersButton = page.locator('button:has-text("Filters"), button:has([data-icon="filter"])');
      if (await filtersButton.isVisible()) {
        await filtersButton.click();
        await page.waitForSelector('select[name="verificationStatus"], [name="verificationStatus"]', { state: 'visible', timeout: 5000 });
      }

      // Set filter to "Unverified Only"
      const verificationFilter = page.locator('select[name="verificationStatus"], [name="verificationStatus"]');
      await verificationFilter.selectOption('unverified');

      // Submit filters
      const applyButton = page.locator('button:has-text("Apply"), button[type="submit"]').first();
      await applyButton.click();
      await page.waitForLoadState('networkidle');

      // Wait for table or empty state (table only renders when data exists)
      const hasTable = await waitForTableOrEmptyState(page);
      if (!hasTable) {
        test.skip();
        return;
      }

      // Give the table time to populate after filters are applied
      await page.waitForTimeout(1000);

      const initialRows = await page.locator('table tbody tr').count();

      if (initialRows === 0) {
        console.log('No unverified measurements found - skipping network error test');
        test.skip();
        return;
      }

      // Select one measurement
      const firstCheckbox = page.locator('table tbody tr').first().locator('input[type="checkbox"]');
      await firstCheckbox.check();

      // Intercept the bulk verify API call and force it to fail
      await page.route('**/api/measurements/bulk-verify', route => {
        route.abort('failed');
      });

      // Click verify button
      const verifyButton = page.locator('button:has-text("Verify Selected")');
      await verifyButton.click();

      // Confirm the AlertDialog
      const confirmButton = page.locator('button:has-text("Verify")').last();
      await expect(confirmButton).toBeVisible({ timeout: 5000 });
      await confirmButton.click();

      // Should show error toast
      await expect(page.locator('.toast, [role="status"], [role="alert"]')).toContainText(/error|failed/i, { timeout: 10000 });

      // Verify selection is NOT cleared (allows retry)
      await expect(page.locator('text=/1 selected/i')).toBeVisible();

      // Clean up route intercept
      await page.unroute('**/api/measurements/bulk-verify');
    });
  });

  test.describe('API-Level Authorization', () => {
    // These tests require distinct users for each role to properly test authorization
    // In CI with same-user mode (all roles share one account), these tests are skipped

    test('should reject bulk verify API calls from org_admin', async ({ page }) => {
      // Skip if org_admin and site_admin share the same user (can't test RBAC)
      test.skip(!canTestRoleAuthorization('org_admin', 'site_admin'),
        'RBAC test skipped: org_admin and site_admin share same credentials in CI');

      // Login as org_admin
      const orgAdmin = getUserByRole('org_admin');
      await loginWithCredentials(page, orgAdmin.username, orgAdmin.password);

      // Try to call bulk verify API directly
      const response = await page.request.post(`${TESTING_URL}/api/measurements/bulk-verify`, {
        data: {
          measurementIds: ['00000000-0000-0000-0000-000000000001'] // Dummy ID
        }
      });

      // Should be rejected with 403 Forbidden (site admin only)
      expect(response.status()).toBe(403);
    });

    test('should reject bulk verify API calls from coach', async ({ page }) => {
      // Skip if coach and site_admin share the same user (can't test RBAC)
      test.skip(!canTestRoleAuthorization('coach', 'site_admin'),
        'RBAC test skipped: coach and site_admin share same credentials in CI');

      // Login as coach
      const coach = getUserByRole('coach');
      await loginWithCredentials(page, coach.username, coach.password);

      // Try to call bulk verify API directly
      const response = await page.request.post(`${TESTING_URL}/api/measurements/bulk-verify`, {
        data: {
          measurementIds: ['00000000-0000-0000-0000-000000000001'] // Dummy ID
        }
      });

      // Should be rejected with 403 Forbidden (site admin only)
      expect(response.status()).toBe(403);
    });

    test('should reject bulk unverify API calls from org_admin', async ({ page }) => {
      // Skip if org_admin and site_admin share the same user (can't test RBAC)
      test.skip(!canTestRoleAuthorization('org_admin', 'site_admin'),
        'RBAC test skipped: org_admin and site_admin share same credentials in CI');

      // Login as org_admin
      const orgAdmin = getUserByRole('org_admin');
      await loginWithCredentials(page, orgAdmin.username, orgAdmin.password);

      // Try to call bulk unverify API directly
      const response = await page.request.post(`${TESTING_URL}/api/measurements/bulk-unverify`, {
        data: {
          measurementIds: ['00000000-0000-0000-0000-000000000001'] // Dummy ID
        }
      });

      // Should be rejected with 403 Forbidden (site admin only)
      expect(response.status()).toBe(403);
    });

    test('should reject bulk unverify API calls from coach', async ({ page }) => {
      // Skip if coach and site_admin share the same user (can't test RBAC)
      test.skip(!canTestRoleAuthorization('coach', 'site_admin'),
        'RBAC test skipped: coach and site_admin share same credentials in CI');

      // Login as coach
      const coach = getUserByRole('coach');
      await loginWithCredentials(page, coach.username, coach.password);

      // Try to call bulk unverify API directly
      const response = await page.request.post(`${TESTING_URL}/api/measurements/bulk-unverify`, {
        data: {
          measurementIds: ['00000000-0000-0000-0000-000000000001'] // Dummy ID
        }
      });

      // Should be rejected with 403 Forbidden (site admin only)
      expect(response.status()).toBe(403);
    });

    test('should reject unauthenticated bulk verify API calls', async ({ playwright }) => {
      // Create a fresh API context with EXPLICITLY empty storage state
      // This ensures no cookies or auth data is sent with the request
      const apiContext = await playwright.request.newContext({
        baseURL: TESTING_URL,
        storageState: { cookies: [], origins: [] },
      });

      const response = await apiContext.post(`/api/measurements/bulk-verify`, {
        data: {
          measurementIds: ['00000000-0000-0000-0000-000000000001'] // Dummy ID
        }
      });

      // Should be rejected with 401 Unauthorized or 403 Forbidden
      const status = response.status();
      console.log(`Unauthenticated bulk-verify response: ${status}`);
      if (status !== 401 && status !== 403) {
        const body = await response.text();
        console.log(`Response body: ${body}`);
      }
      expect([401, 403]).toContain(status);
      await apiContext.dispose();
    });

    test('should reject unauthenticated bulk unverify API calls', async ({ playwright }) => {
      // Create a fresh API context with EXPLICITLY empty storage state
      const apiContext = await playwright.request.newContext({
        baseURL: TESTING_URL,
        storageState: { cookies: [], origins: [] },
      });

      const response = await apiContext.post(`/api/measurements/bulk-unverify`, {
        data: {
          measurementIds: ['00000000-0000-0000-0000-000000000001'] // Dummy ID
        }
      });

      // Should be rejected with 401 Unauthorized or 403 Forbidden
      const status = response.status();
      console.log(`Unauthenticated bulk-unverify response: ${status}`);
      if (status !== 401 && status !== 403) {
        const body = await response.text();
        console.log(`Response body: ${body}`);
      }
      expect([401, 403]).toContain(status);
      await apiContext.dispose();
    });
  });
});
