import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';
import { goToAthletes, goToTeams } from './helpers/navigation';

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

test.describe('Dashr Export — Athletes page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    await goToAthletes(page);
  });

  test('bulk-export button is hidden when no athletes are selected', async ({ page }) => {
    // The floating bulk-action bar (and its Export button) must not be visible
    // until at least one athlete is selected.
    await expect(page.locator('[data-testid="bulk-export-dashr-button"]')).not.toBeVisible();
  });

  test('selecting an athlete reveals the Export to Dashr button', async ({ page }) => {
    const firstCheckbox = page.locator('[data-testid^="checkbox-athlete-"]').first();

    // Skip gracefully when the page has no athletes (empty org)
    const count = await firstCheckbox.count();
    if (count === 0) {
      test.skip();
      return;
    }

    await firstCheckbox.click();
    await expect(page.locator('[data-testid="bulk-export-dashr-button"]')).toBeVisible();
  });

  test('clicking Export to Dashr downloads an .xlsx file', async ({ page }) => {
    const firstCheckbox = page.locator('[data-testid^="checkbox-athlete-"]').first();

    const count = await firstCheckbox.count();
    if (count === 0) {
      test.skip();
      return;
    }

    await firstCheckbox.click();
    await expect(page.locator('[data-testid="bulk-export-dashr-button"]')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.locator('[data-testid="bulk-export-dashr-button"]').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^dashr-.*\.xlsx$/);
  });
});

test.describe('Dashr Export — Teams page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    await goToTeams(page);
  });

  test('team action menu contains Export to Dashr item', async ({ page }) => {
    const firstMenuTrigger = page.locator('[data-testid^="button-team-menu-"]').first();

    const count = await firstMenuTrigger.count();
    if (count === 0) {
      test.skip();
      return;
    }

    await firstMenuTrigger.click();
    const exportItem = page.locator('[data-testid^="menu-export-dashr-"]').first();
    await expect(exportItem).toBeVisible();
    await expect(exportItem).toContainText('Export to Dashr');
  });

  test('clicking Export to Dashr from team menu downloads an .xlsx file', async ({ page }) => {
    const firstMenuTrigger = page.locator('[data-testid^="button-team-menu-"]').first();

    const count = await firstMenuTrigger.count();
    if (count === 0) {
      test.skip();
      return;
    }

    await firstMenuTrigger.click();
    const exportItem = page.locator('[data-testid^="menu-export-dashr-"]').first();
    await expect(exportItem).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await exportItem.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^dashr-.*\.xlsx$/);
  });
});
