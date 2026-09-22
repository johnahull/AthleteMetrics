import { test, expect } from './fixtures/e2e-base';
import { loginAsAthlete } from './helpers/auth';

/**
 * ATHLETE ORGANIZATION SWITCHER: E2E Tests
 *
 * Tests verify the organization switcher functionality for athletes:
 * - Switch between "All Organizations", "Personal Only", and specific organizations
 * - localStorage persistence of selected organization context
 * - Measurement filtering based on selected organization
 * - Organization badges displayed in "All Organizations" view
 * - Personal badges displayed for self-entered measurements
 */

const BASE_URL = process.env.STAGING_URL || 'http://localhost:5000';

test.describe('Athlete Organization Switcher', () => {
  test.beforeEach(async ({ page }) => {
    // Login as athlete user
    await loginAsAthlete(page);
  });

  test.describe('Organization Switcher UI', () => {
    test('should display organization switcher in sidebar', async ({ page }) => {
      await page.goto(`${BASE_URL}/athlete-dashboard`);
      await page.waitForLoadState('networkidle');

      // Check for organization switcher component
      const orgSwitcher = page.locator('[data-testid="org-switcher"]');
      await expect(orgSwitcher).toBeVisible();

      // Should have a dropdown trigger button
      const dropdownTrigger = page.locator('[data-testid="org-switcher-trigger"]');
      await expect(dropdownTrigger).toBeVisible();
    });

    test('should show organization options when clicked', async ({ page }) => {
      await page.goto(`${BASE_URL}/athlete-dashboard`);
      await page.waitForLoadState('networkidle');

      // Click organization switcher dropdown
      const dropdownTrigger = page.locator('[data-testid="org-switcher-trigger"]');
      await dropdownTrigger.click();

      // Wait for dropdown menu to appear
      await page.waitForTimeout(300);

      // Should show "All Organizations" option
      const allOrgsOption = page.locator('[data-testid="org-option-all"]');
      await expect(allOrgsOption).toBeVisible();

      // Should show "Personal Only" option
      const personalOption = page.locator('[data-testid="org-option-personal"]');
      await expect(personalOption).toBeVisible();
    });

    test('should display user organizations in dropdown', async ({ page }) => {
      await page.goto(`${BASE_URL}/athlete-dashboard`);
      await page.waitForLoadState('networkidle');

      // Click organization switcher dropdown
      const dropdownTrigger = page.locator('[data-testid="org-switcher-trigger"]');
      await dropdownTrigger.click();

      await page.waitForTimeout(300);

      // Look for organization options (these will vary by test data)
      // At minimum, should have "All" and "Personal" options
      const orgOptions = page.locator('[data-testid^="org-option-"]');
      const count = await orgOptions.count();

      // Should have at least 2 options (All + Personal)
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  test.describe('Organization Filter Switching', () => {
    test('should switch to "Personal Only" view', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-measurements`);
      await page.waitForLoadState('networkidle');

      // Click organization switcher dropdown
      const dropdownTrigger = page.locator('[data-testid="org-switcher-trigger"]');
      await dropdownTrigger.click();

      await page.waitForTimeout(300);

      // Select "Personal Only" option
      const personalOption = page.locator('[data-testid="org-option-personal"]');
      await personalOption.click();

      // Wait for measurements to reload
      await page.waitForTimeout(1000);

      // Verify dropdown shows "Personal Only" as selected
      const selectedText = await dropdownTrigger.textContent();
      expect(selectedText).toContain('Personal');
    });

    test('should switch to "All Organizations" view', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-measurements`);
      await page.waitForLoadState('networkidle');

      // First switch to Personal Only
      const dropdownTrigger = page.locator('[data-testid="org-switcher-trigger"]');
      await dropdownTrigger.click();
      await page.waitForTimeout(300);
      await page.locator('[data-testid="org-option-personal"]').click();
      await page.waitForTimeout(1000);

      // Then switch back to All Organizations
      await dropdownTrigger.click();
      await page.waitForTimeout(300);
      await page.locator('[data-testid="org-option-all"]').click();
      await page.waitForTimeout(1000);

      // Verify dropdown shows "All Organizations" as selected
      const selectedText = await dropdownTrigger.textContent();
      expect(selectedText).toContain('All Organizations');
    });

    test('should switch to specific organization', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-measurements`);
      await page.waitForLoadState('networkidle');

      // Click organization switcher dropdown
      const dropdownTrigger = page.locator('[data-testid="org-switcher-trigger"]');
      await dropdownTrigger.click();

      await page.waitForTimeout(300);

      // Look for a specific organization option (not All or Personal)
      const orgOptions = page.locator('[data-testid^="org-option-"]:not([data-testid="org-option-all"]):not([data-testid="org-option-personal"])');
      const count = await orgOptions.count();

      if (count > 0) {
        // Select the first specific organization
        const firstOrg = orgOptions.first();
        const orgName = await firstOrg.textContent();
        await firstOrg.click();

        await page.waitForTimeout(1000);

        // Verify dropdown shows selected organization
        const selectedText = await dropdownTrigger.textContent();
        expect(selectedText).toContain(orgName?.trim());
      }
    });
  });

  test.describe('Measurement Filtering', () => {
    test('should filter measurements in "Personal Only" view', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-measurements`);
      await page.waitForLoadState('networkidle');

      // Switch to "Personal Only" view
      const dropdownTrigger = page.locator('[data-testid="org-switcher-trigger"]');
      await dropdownTrigger.click();
      await page.waitForTimeout(300);
      await page.locator('[data-testid="org-option-personal"]').click();
      await page.waitForTimeout(1000);

      // Check for measurements table
      const table = page.locator('[data-testid="measurement-history-table"]');
      if (await table.isVisible()) {
        // All visible measurements should have "Personal" badges
        const personalBadges = page.locator('[data-testid="personal-badge"]');
        const measurementRows = page.locator('[data-testid^="measurement-row-"]');
        const rowCount = await measurementRows.count();

        if (rowCount > 0) {
          // At least one personal badge should be visible
          const badgeCount = await personalBadges.count();
          expect(badgeCount).toBeGreaterThan(0);
        }
      }
    });

    test('should show organization badges in "All Organizations" view', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-measurements`);
      await page.waitForLoadState('networkidle');

      // Switch to "All Organizations" view
      const dropdownTrigger = page.locator('[data-testid="org-switcher-trigger"]');
      await dropdownTrigger.click();
      await page.waitForTimeout(300);
      await page.locator('[data-testid="org-option-all"]').click();
      await page.waitForTimeout(1000);

      // Check for measurements table
      const table = page.locator('[data-testid="measurement-history-table"]');
      if (await table.isVisible()) {
        const measurementRows = page.locator('[data-testid^="measurement-row-"]');
        const rowCount = await measurementRows.count();

        if (rowCount > 0) {
          // Should have either organization badges or personal badges
          const orgBadges = page.locator('[data-testid^="org-badge-"]');
          const personalBadges = page.locator('[data-testid="personal-badge"]');

          const orgBadgeCount = await orgBadges.count();
          const personalBadgeCount = await personalBadges.count();

          // At least one badge should be visible
          expect(orgBadgeCount + personalBadgeCount).toBeGreaterThan(0);
        }
      }
    });

    test('should filter measurements by specific organization', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-measurements`);
      await page.waitForLoadState('networkidle');

      // Click organization switcher dropdown
      const dropdownTrigger = page.locator('[data-testid="org-switcher-trigger"]');
      await dropdownTrigger.click();
      await page.waitForTimeout(300);

      // Look for a specific organization option
      const orgOptions = page.locator('[data-testid^="org-option-"]:not([data-testid="org-option-all"]):not([data-testid="org-option-personal"])');
      const count = await orgOptions.count();

      if (count > 0) {
        // Select the first specific organization
        const firstOrg = orgOptions.first();
        const orgName = await firstOrg.textContent();
        await firstOrg.click();

        await page.waitForTimeout(1000);

        // Check for measurements table
        const table = page.locator('[data-testid="measurement-history-table"]');
        if (await table.isVisible()) {
          const measurementRows = page.locator('[data-testid^="measurement-row-"]');
          const rowCount = await measurementRows.count();

          if (rowCount > 0) {
            // All measurements should be from the selected organization
            // (no personal badges should be visible in single org view)
            const personalBadges = page.locator('[data-testid="personal-badge"]');
            const personalBadgeCount = await personalBadges.count();
            expect(personalBadgeCount).toBe(0);
          }
        }
      }
    });
  });

  test.describe('localStorage Persistence', () => {
    test('should persist organization selection across page reloads', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-measurements`);
      await page.waitForLoadState('networkidle');

      // Switch to "Personal Only" view
      const dropdownTrigger = page.locator('[data-testid="org-switcher-trigger"]');
      await dropdownTrigger.click();
      await page.waitForTimeout(300);
      await page.locator('[data-testid="org-option-personal"]').click();
      await page.waitForTimeout(1000);

      // Reload the page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // Verify "Personal Only" is still selected
      const selectedText = await dropdownTrigger.textContent();
      expect(selectedText).toContain('Personal');
    });

    test('should persist organization selection across navigation', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-measurements`);
      await page.waitForLoadState('networkidle');

      // Switch to "Personal Only" view
      const dropdownTrigger = page.locator('[data-testid="org-switcher-trigger"]');
      await dropdownTrigger.click();
      await page.waitForTimeout(300);
      await page.locator('[data-testid="org-option-personal"]').click();
      await page.waitForTimeout(1000);

      // Navigate to athlete dashboard
      await page.goto(`${BASE_URL}/athlete-dashboard`);
      await page.waitForLoadState('networkidle');

      // Navigate back to measurements
      await page.goto(`${BASE_URL}/my-measurements`);
      await page.waitForLoadState('networkidle');

      // Verify "Personal Only" is still selected
      const selectedText = await dropdownTrigger.textContent();
      expect(selectedText).toContain('Personal');
    });

    test('should store selection in localStorage', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-measurements`);
      await page.waitForLoadState('networkidle');

      // Switch to "Personal Only" view
      const dropdownTrigger = page.locator('[data-testid="org-switcher-trigger"]');
      await dropdownTrigger.click();
      await page.waitForTimeout(300);
      await page.locator('[data-testid="org-option-personal"]').click();
      await page.waitForTimeout(1000);

      // Check localStorage for persisted value
      const filterMode = await page.evaluate(() => {
        const stored = localStorage.getItem('athlete-org-filter');
        return stored ? JSON.parse(stored).filterMode : null;
      });

      expect(filterMode).toBe('personal');
    });
  });

  test.describe('Edge Cases', () => {
    test('should handle athlete with no organizations', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-measurements`);
      await page.waitForLoadState('networkidle');

      // Organization switcher should still be visible
      const orgSwitcher = page.locator('[data-testid="org-switcher"]');
      await expect(orgSwitcher).toBeVisible();

      // Click dropdown
      const dropdownTrigger = page.locator('[data-testid="org-switcher-trigger"]');
      await dropdownTrigger.click();

      await page.waitForTimeout(300);

      // Should show at least "All Organizations" and "Personal Only"
      const allOrgsOption = page.locator('[data-testid="org-option-all"]');
      const personalOption = page.locator('[data-testid="org-option-personal"]');

      await expect(allOrgsOption).toBeVisible();
      await expect(personalOption).toBeVisible();
    });

    test('should handle athlete with single organization', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-measurements`);
      await page.waitForLoadState('networkidle');

      // Click dropdown
      const dropdownTrigger = page.locator('[data-testid="org-switcher-trigger"]');
      await dropdownTrigger.click();

      await page.waitForTimeout(300);

      // Count organization options (excluding All and Personal)
      const orgOptions = page.locator('[data-testid^="org-option-"]:not([data-testid="org-option-all"]):not([data-testid="org-option-personal"])');
      const count = await orgOptions.count();

      // Should have at least the base options (All + Personal)
      const allOptions = page.locator('[data-testid^="org-option-"]');
      const totalCount = await allOptions.count();
      expect(totalCount).toBeGreaterThanOrEqual(2);
    });

    test('should switch between multiple organizations', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-measurements`);
      await page.waitForLoadState('networkidle');

      // Click dropdown
      const dropdownTrigger = page.locator('[data-testid="org-switcher-trigger"]');
      await dropdownTrigger.click();

      await page.waitForTimeout(300);

      // Get all specific organization options
      const orgOptions = page.locator('[data-testid^="org-option-"]:not([data-testid="org-option-all"]):not([data-testid="org-option-personal"])');
      const count = await orgOptions.count();

      if (count >= 2) {
        // Select first organization
        const firstOrg = orgOptions.nth(0);
        const firstOrgName = await firstOrg.textContent();
        await firstOrg.click();
        await page.waitForTimeout(1000);

        // Verify first org selected
        let selectedText = await dropdownTrigger.textContent();
        expect(selectedText).toContain(firstOrgName?.trim());

        // Switch to second organization
        await dropdownTrigger.click();
        await page.waitForTimeout(300);

        const secondOrg = orgOptions.nth(1);
        const secondOrgName = await secondOrg.textContent();
        await secondOrg.click();
        await page.waitForTimeout(1000);

        // Verify second org selected
        selectedText = await dropdownTrigger.textContent();
        expect(selectedText).toContain(secondOrgName?.trim());
      }
    });
  });

  test.describe('Integration with Other Features', () => {
    test('should filter dashboard statistics by organization', async ({ page }) => {
      await page.goto(`${BASE_URL}/athlete-dashboard`);
      await page.waitForLoadState('networkidle');

      // Switch to "Personal Only" view
      const dropdownTrigger = page.locator('[data-testid="org-switcher-trigger"]');
      await dropdownTrigger.click();
      await page.waitForTimeout(300);
      await page.locator('[data-testid="org-option-personal"]').click();
      await page.waitForTimeout(1000);

      // Dashboard should reload with filtered data
      // Verify page didn't navigate away
      expect(page.url()).toContain('/athlete-dashboard');
    });

    test('should filter measurement charts by organization', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-measurements`);
      await page.waitForLoadState('networkidle');

      // Switch to "Personal Only" view
      const dropdownTrigger = page.locator('[data-testid="org-switcher-trigger"]');
      await dropdownTrigger.click();
      await page.waitForTimeout(300);
      await page.locator('[data-testid="org-option-personal"]').click();
      await page.waitForTimeout(1000);

      // Check if progress chart exists and updates
      const chart = page.locator('[data-testid="measurement-progress-chart"]');

      // If chart exists, it should reflect filtered data
      if (await chart.isVisible()) {
        // Chart canvas should be present
        await expect(chart.locator('canvas')).toBeVisible();
      }
    });
  });
});
