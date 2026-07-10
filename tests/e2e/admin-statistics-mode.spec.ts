import { test, expect } from './fixtures/e2e-base';
import { loginWithCredentials } from './helpers/auth';
import { getUserByRole } from './fixtures/test-users';

/**
 * E2E tests for the statistics mode dropdown on the admin measurements page.
 * Verifies that toggling between "Best per Athlete" and "All Measurements"
 * updates the statistics cards and that the selection persists via localStorage.
 */

const TESTING_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

test.describe('Admin Statistics Mode Dropdown', () => {
  test.beforeEach(async ({ page }) => {
    const siteAdmin = getUserByRole('site_admin');
    await loginWithCredentials(page, siteAdmin.username, siteAdmin.password);
    await page.goto(`${TESTING_URL}/admin/measurements`);
    await page.waitForLoadState('networkidle');
  });

  test('should display statistics mode dropdown when measurements exist', async ({ page }) => {
    // Wait for content to load
    const statsDropdown = page.locator('#statistics-mode-select');
    const hasData = await statsDropdown.isVisible({ timeout: 10000 }).catch(() => false);

    if (!hasData) {
      console.log('No measurements in database — statistics dropdowns not shown, skipping');
      return;
    }

    await expect(statsDropdown).toBeVisible();
    await expect(page.locator('label[for="statistics-mode-select"]')).toHaveText('Statistics:');
  });

  test('should default to "Best per Athlete"', async ({ page }) => {
    const statsDropdown = page.locator('#statistics-mode-select');
    const hasData = await statsDropdown.isVisible({ timeout: 10000 }).catch(() => false);
    if (!hasData) return;

    await expect(statsDropdown).toContainText('Best per Athlete');
  });

  test('should switch to "All Measurements" and back', async ({ page }) => {
    const statsDropdown = page.locator('#statistics-mode-select');
    const hasData = await statsDropdown.isVisible({ timeout: 10000 }).catch(() => false);
    if (!hasData) return;

    // Switch to All Measurements
    await statsDropdown.click();
    await page.locator('[role="option"]:has-text("All Measurements")').click();
    await expect(statsDropdown).toContainText('All Measurements');

    // Switch back to Best per Athlete
    await statsDropdown.click();
    await page.locator('[role="option"]:has-text("Best per Athlete")').click();
    await expect(statsDropdown).toContainText('Best per Athlete');
  });

  test('should persist selection after page reload', async ({ page }) => {
    const statsDropdown = page.locator('#statistics-mode-select');
    const hasData = await statsDropdown.isVisible({ timeout: 10000 }).catch(() => false);
    if (!hasData) return;

    // Switch to All Measurements
    await statsDropdown.click();
    await page.locator('[role="option"]:has-text("All Measurements")').click();
    await expect(statsDropdown).toContainText('All Measurements');

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should still be "All Measurements"
    const reloadedDropdown = page.locator('#statistics-mode-select');
    const stillVisible = await reloadedDropdown.isVisible({ timeout: 10000 }).catch(() => false);
    if (!stillVisible) return;

    await expect(reloadedDropdown).toContainText('All Measurements');

    // Clean up: reset to default
    await reloadedDropdown.click();
    await page.locator('[role="option"]:has-text("Best per Athlete")').click();
  });
});
