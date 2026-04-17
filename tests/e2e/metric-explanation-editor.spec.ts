import { test, expect } from '@playwright/test';
import { loginWithCredentials } from './helpers/auth';
import { getUserByRole } from './fixtures/test-users';

/**
 * E2E Tests for Issue #367 Phase 2 — Site-admin metric explanation editor
 *
 * Verifies:
 *  1. Site admin can navigate to /metric-explanations and see all 8 built-in metric cards
 *  2. Clicking a card opens the editor dialog with editable fields
 *  3. Saving an override shows the "Edited" badge on the card
 *  4. Resetting to default removes the override and the badge
 *  5. Preview pane renders the overridden text
 */

const TESTING_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

test.describe('Metric Explanation Editor — Site Admin', () => {
  // Track overrides we create so we can clean up
  const overriddenCodes: string[] = [];

  test.beforeEach(async ({ page }) => {
    const siteAdmin = getUserByRole('site_admin');
    await loginWithCredentials(page, siteAdmin.username, siteAdmin.password);
  });

  test.afterEach(async ({ page }) => {
    // Clean up any overrides created during the test
    for (const code of overriddenCodes) {
      try {
        await page.request.delete(`${TESTING_URL}/api/admin/metric-explanations/${code}`);
      } catch {
        // best-effort cleanup
      }
    }
    overriddenCodes.length = 0;
  });

  test('displays all 8 built-in metric cards', async ({ page }) => {
    await page.goto(`${TESTING_URL}/metric-explanations`);
    await page.waitForLoadState('networkidle');

    // Page title
    await expect(page.locator('h1')).toContainText('Metric Explanations');

    // Should show 8 metric cards (one per built-in metric)
    const cards = page.locator('.grid .cursor-pointer');
    await expect(cards).toHaveCount(8);
  });

  test('opens editor dialog when clicking a metric card', async ({ page }) => {
    await page.goto(`${TESTING_URL}/metric-explanations`);
    await page.waitForLoadState('networkidle');

    // Click the first metric card
    const firstCard = page.locator('.grid .cursor-pointer').first();
    const cardTitle = await firstCard.locator('div.text-base').textContent();
    await firstCard.click();

    // Dialog should open with the metric title
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('h2, [class*="DialogTitle"]')).toContainText(`Edit: ${cardTitle}`);

    // Should have 4 form fields
    await expect(dialog.locator('#title')).toBeVisible();
    await expect(dialog.locator('#shortDescription')).toBeVisible();
    await expect(dialog.locator('#whatItMeasures')).toBeVisible();
    await expect(dialog.locator('#whyItMatters')).toBeVisible();

    // Should have Save and Cancel buttons
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
  });

  test('saves override and shows Edited badge', async ({ page }) => {
    await page.goto(`${TESTING_URL}/metric-explanations`);
    await page.waitForLoadState('networkidle');

    // Find the FLY10_TIME card by its known title "10-Yard Fly Time"
    const flyCard = page.locator('.grid .cursor-pointer', { hasText: '10-Yard Fly Time' });
    await expect(flyCard).toBeVisible();

    // Verify no "Edited" badge initially (clean state from afterEach cleanup)
    const badgeBefore = flyCard.locator('text=Edited');
    const hadBadgeBefore = await badgeBefore.isVisible().catch(() => false);

    // Click to open editor
    await flyCard.click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Type a custom "Why It Matters" value
    const customText = `E2E test override ${Date.now()}`;
    await dialog.locator('#whyItMatters').fill(customText);

    // Save
    await dialog.getByRole('button', { name: 'Save' }).click();
    overriddenCodes.push('FLY10_TIME');

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    // The card should now show "Edited" badge
    await expect(flyCard.locator('text=Edited')).toBeVisible({ timeout: 5000 });
  });

  test('reset to default removes override and badge', async ({ page }) => {
    // First create an override via API
    const code = 'VERTICAL_JUMP';
    await page.request.put(`${TESTING_URL}/api/admin/metric-explanations/${code}`, {
      data: { whyItMatters: 'Temporary E2E override for reset test' },
    });
    overriddenCodes.push(code);

    await page.goto(`${TESTING_URL}/metric-explanations`);
    await page.waitForLoadState('networkidle');

    // Find the Vertical Jump card
    const vjCard = page.locator('.grid .cursor-pointer', { hasText: 'Vertical Jump' });
    await expect(vjCard.locator('text=Edited')).toBeVisible();

    // Click to open editor
    await vjCard.click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Should show "Has overrides" badge in dialog title
    await expect(dialog.locator('text=Has overrides')).toBeVisible();

    // Click "Reset All to Default"
    await dialog.getByRole('button', { name: 'Reset All to Default' }).click();

    // Confirm in the alert dialog
    const alertDialog = page.locator('[role="alertdialog"]');
    await expect(alertDialog).toBeVisible();
    await alertDialog.getByRole('button', { name: 'Reset to Default' }).click();

    // Remove from cleanup list since we just deleted it
    const idx = overriddenCodes.indexOf(code);
    if (idx !== -1) overriddenCodes.splice(idx, 1);

    // Dialog should close and badge should be gone
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
    await expect(vjCard.locator('text=Edited')).not.toBeVisible({ timeout: 5000 });
  });

  test('preview pane shows resolved override text', async ({ page }) => {
    // Create an override via API
    const code = 'AGILITY_505';
    const customWhy = 'Custom preview test text for agility 505';
    await page.request.put(`${TESTING_URL}/api/admin/metric-explanations/${code}`, {
      data: { whyItMatters: customWhy },
    });
    overriddenCodes.push(code);

    await page.goto(`${TESTING_URL}/metric-explanations`);
    await page.waitForLoadState('networkidle');

    // Open the 5-0-5 Agility card
    const agilityCard = page.locator('.grid .cursor-pointer', { hasText: '5-0-5 Agility' });
    await agilityCard.click();
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();

    // Switch to Preview
    await dialog.getByRole('button', { name: 'Preview' }).click();

    // Preview should show the overridden text
    await expect(dialog.locator('text=Why It Matters')).toBeVisible();
    await expect(dialog).toContainText(customWhy);
  });

  test('sidebar has Metric Explanations link for site admin', async ({ page }) => {
    await page.goto(`${TESTING_URL}/`);
    await page.waitForLoadState('networkidle');

    // Look for the nav link
    const navLink = page.locator('[data-testid="metric-explanations-menu-item"]');
    // Fall back to text-based selector if testId not rendered
    const link = navLink.or(page.locator('nav >> text=Metric Explanations').first());
    await expect(link.first()).toBeVisible({ timeout: 10000 });
  });
});
