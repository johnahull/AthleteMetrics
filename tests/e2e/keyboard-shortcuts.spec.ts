import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * E2E Tests: Global Keyboard Shortcuts
 *
 * These tests verify the keyboard shortcut functionality:
 * - Ctrl+M / Cmd+M opens measurement modal (for users with CREATE_MEASUREMENTS permission)
 * - ? key opens keyboard shortcuts help dialog
 * - Escape key closes modals
 * - Shortcuts don't trigger when typing in input fields
 * - Permission-based access control
 *
 * Tests follow TDD methodology: written to validate the feature works end-to-end.
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

test.describe('Keyboard Shortcuts - Global', () => {

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    // Navigate to dashboard
    await page.waitForURL('**/dashboard');
  });

  test('Ctrl+M should open measurement modal for authorized users', async ({ page }) => {
    // Verify modal is not visible initially
    const modalBefore = page.getByRole('dialog', { name: /Quick Add Measurement/i });
    await expect(modalBefore).not.toBeVisible();

    // Press Ctrl+M (Windows/Linux)
    await page.keyboard.press('Control+m');

    // Verify modal is now visible
    const modal = page.getByRole('dialog', { name: /Quick Add Measurement/i });
    await expect(modal).toBeVisible();

    // Verify measurement form is displayed
    const athleteSelect = page.getByTestId('athlete-select');
    await expect(athleteSelect).toBeVisible();

    // Verify metric select is visible
    const metricSelect = page.getByTestId('metric-select');
    await expect(metricSelect).toBeVisible();
  });

  test('Cmd+M should open measurement modal on Mac', async ({ page }) => {
    // Verify modal is not visible initially
    const modalBefore = page.getByRole('dialog', { name: /Quick Add Measurement/i });
    await expect(modalBefore).not.toBeVisible();

    // Press Cmd+M (Mac)
    await page.keyboard.press('Meta+m');

    // Verify modal is now visible
    const modal = page.getByRole('dialog', { name: /Quick Add Measurement/i });
    await expect(modal).toBeVisible();

    // Verify measurement form is displayed
    const athleteSelect = page.getByTestId('athlete-select');
    await expect(athleteSelect).toBeVisible();
  });

  test('? key should open keyboard shortcuts help dialog', async ({ page }) => {
    // Verify help dialog is not visible initially
    const helpDialogBefore = page.getByRole('dialog', { name: /Keyboard Shortcuts/i });
    await expect(helpDialogBefore).not.toBeVisible();

    // Press Shift+? (which produces ?)
    await page.keyboard.press('Shift+?');

    // Verify help dialog is now visible
    const helpDialog = page.getByRole('dialog', { name: /Keyboard Shortcuts/i });
    await expect(helpDialog).toBeVisible();

    // Verify help content is displayed
    await expect(helpDialog).toContainText('Quick add measurement');
    await expect(helpDialog).toContainText('Ctrl+M');
  });

  test('Escape key should close measurement modal', async ({ page }) => {
    // Open measurement modal with Ctrl+M
    await page.keyboard.press('Control+m');
    const modal = page.getByRole('dialog', { name: /Quick Add Measurement/i });
    await expect(modal).toBeVisible();

    // Press Escape to close
    await page.keyboard.press('Escape');

    // Verify modal is closed
    await expect(modal).not.toBeVisible();
  });

  test('Escape key should close help dialog', async ({ page }) => {
    // Open help dialog with ?
    await page.keyboard.press('Shift+?');
    const helpDialog = page.getByRole('dialog', { name: /Keyboard Shortcuts/i });
    await expect(helpDialog).toBeVisible();

    // Press Escape to close
    await page.keyboard.press('Escape');

    // Verify help dialog is closed
    await expect(helpDialog).not.toBeVisible();
  });

  test('Ctrl+M should NOT trigger when typing in input field', async ({ page }) => {
    // Navigate to a page with an input field (e.g., athletes page with search)
    await page.goto(`${STAGING_URL}/athletes`);
    await page.waitForLoadState('networkidle');

    // Find and focus on search input (if available) or any input field
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();

    // If search input exists, use it; otherwise skip this test
    const searchInputCount = await searchInput.count();
    if (searchInputCount > 0) {
      await searchInput.focus();

      // Press Ctrl+M while focused on input
      await page.keyboard.press('Control+m');

      // Verify modal did NOT appear using state assertion with timeout
      const modal = page.getByRole('dialog', { name: /Quick Add Measurement/i });
      await expect(modal).not.toBeVisible({ timeout: 2000 });
    } else {
      // If no search input, test with any input on the page
      const anyInput = page.locator('input, textarea').first();
      const anyInputCount = await anyInput.count();

      if (anyInputCount > 0) {
        await anyInput.focus();
        await page.keyboard.press('Control+m');
        const modal = page.getByRole('dialog', { name: /Quick Add Measurement/i });
        await expect(modal).not.toBeVisible({ timeout: 2000 });
      }
    }
  });

  test('? should NOT trigger when typing in input field', async ({ page }) => {
    // Navigate to athletes page
    await page.goto(`${STAGING_URL}/athletes`);
    await page.waitForLoadState('networkidle');

    // Find an input field
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();

    const searchInputCount = await searchInput.count();
    if (searchInputCount > 0) {
      await searchInput.focus();

      // Press Shift+? while focused on input
      await page.keyboard.press('Shift+?');

      // Verify help dialog did NOT appear using state assertion with timeout
      const helpDialog = page.getByRole('dialog', { name: /Keyboard Shortcuts/i });
      await expect(helpDialog).not.toBeVisible({ timeout: 2000 });
    }
  });

  test('Multiple keyboard shortcuts work in sequence', async ({ page }) => {
    // Open help dialog with ?
    await page.keyboard.press('Shift+?');
    const helpDialog = page.getByRole('dialog', { name: /Keyboard Shortcuts/i });
    await expect(helpDialog).toBeVisible();

    // Close help dialog with Escape
    await page.keyboard.press('Escape');
    await expect(helpDialog).not.toBeVisible();

    // Open measurement modal with Ctrl+M
    await page.keyboard.press('Control+m');
    const measurementModal = page.getByRole('dialog', { name: /Quick Add Measurement/i });
    await expect(measurementModal).toBeVisible();

    // Close measurement modal with Escape
    await page.keyboard.press('Escape');
    await expect(measurementModal).not.toBeVisible();

    // Open help dialog again
    await page.keyboard.press('Shift+?');
    await expect(helpDialog).toBeVisible();

    // Close with Escape
    await page.keyboard.press('Escape');
    await expect(helpDialog).not.toBeVisible();
  });

  test('Help dialog shows correct shortcuts for user role', async ({ page }) => {
    // Open help dialog
    await page.keyboard.press('Shift+?');
    const helpDialog = page.getByRole('dialog', { name: /Keyboard Shortcuts/i });
    await expect(helpDialog).toBeVisible();

    // Verify "Quick add measurement" shortcut is shown (user has CREATE_MEASUREMENTS permission)
    await expect(helpDialog).toContainText('Quick add measurement');
    await expect(helpDialog).toContainText(/Ctrl\+M|Cmd\+M/);

    // Verify "Close modals" shortcut is shown
    await expect(helpDialog).toContainText('Close modals');
    await expect(helpDialog).toContainText('Esc');

    // Verify help text at bottom
    await expect(helpDialog).toContainText('anytime to see this help');
  });

  test('Case insensitive: Both m and M should work with Ctrl', async ({ page }) => {
    // Test lowercase m
    await page.keyboard.press('Control+m');
    const modal1 = page.getByRole('dialog', { name: /Quick Add Measurement/i });
    await expect(modal1).toBeVisible();
    await page.keyboard.press('Escape');

    // Test uppercase M (Shift+M with Ctrl)
    await page.keyboard.down('Control');
    await page.keyboard.down('Shift');
    await page.keyboard.press('M');
    await page.keyboard.up('Shift');
    await page.keyboard.up('Control');

    const modal2 = page.getByRole('dialog', { name: /Quick Add Measurement/i });
    await expect(modal2).toBeVisible();
  });
});

test.describe('Keyboard Shortcuts - Permission-Based Access', () => {
  // Note: This test would require logging in as different user roles
  // For now, we're testing with the default user who has CREATE_MEASUREMENTS permission
  // In a full test suite, you would add tests for athlete role (who should NOT see Ctrl+M)

  test('Authorized user can use Ctrl+M shortcut', async ({ page }) => {
    await loginAsDefaultUser(page); // Assuming this user has CREATE_MEASUREMENTS permission
    await page.waitForURL('**/dashboard');

    // Press Ctrl+M
    await page.keyboard.press('Control+m');

    // Verify modal opens
    const modal = page.getByRole('dialog', { name: /Quick Add Measurement/i });
    await expect(modal).toBeVisible();
  });

  // TODO: Add test for athlete role (should NOT be able to use Ctrl+M)
  // This requires a test helper to login as an athlete user
  // test('Athlete user cannot use Ctrl+M shortcut', async ({ page }) => { ... });
});
