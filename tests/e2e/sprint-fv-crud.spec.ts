import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * Sprint F-V Profile E2E Tests
 *
 * Tests the full user workflow:
 * - Navigating to Sprint F-V page
 * - Discovering eligible sessions
 * - Generating a profile
 * - Viewing profile detail with charts and analysis
 * - Viewing longitudinal trends
 * - Deleting a profile
 * - Feature toggle behavior
 *
 * Prerequisites:
 * - Test athlete must have DASH_5YD, DASH_10YD, DASH_20YD, DASH_30YD measurements
 * - Test athlete must have a WEIGHT measurement
 * - Sprint F-V must be enabled at site and org level
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

test.describe('Sprint F-V Profile Tests', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
  });

  test('should navigate to Sprint F-V page from sidebar', async ({ page }) => {
    // Look for Sprint F-V link in sidebar
    const sprintFvLink = page.locator('a[href="/sprint-fv"]');

    // If feature is disabled, link won't exist — skip test
    if (await sprintFvLink.count() === 0) {
      test.skip(true, 'Sprint F-V is not enabled for this environment');
      return;
    }

    await sprintFvLink.click();
    await page.waitForURL('**/sprint-fv');
    await expect(page.locator('h1')).toContainText('Sprint Force-Velocity Profile');
  });

  test('should show Generate, Profiles, and Trends tabs', async ({ page }) => {
    await page.goto(`${STAGING_URL}/sprint-fv`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('tab', { name: /Generate/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Profiles/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Trends/i })).toBeVisible();
  });

  test('should display eligible sessions in Generate tab', async ({ page }) => {
    await page.goto(`${STAGING_URL}/sprint-fv`);
    await page.waitForLoadState('networkidle');

    // The Generate tab should be active by default
    // Should show either session cards or "No sprint sessions found" message
    const hasSessionCards = await page.locator('[class*="Card"]').count() > 0;
    const hasEmptyState = await page.getByText(/No sprint sessions found/i).count() > 0;

    expect(hasSessionCards || hasEmptyState).toBe(true);
  });

  test('should generate a profile from eligible session', async ({ page }) => {
    await page.goto(`${STAGING_URL}/sprint-fv`);
    await page.waitForLoadState('networkidle');

    // Find a "Generate Profile" button
    const generateBtn = page.getByRole('button', { name: /Generate Profile/i });

    if (await generateBtn.count() === 0) {
      test.skip(true, 'No eligible sessions available for profile generation');
      return;
    }

    // Click generate — this expands the session card
    await generateBtn.first().click();

    // Click the confirm generate button inside the expanded card
    const confirmBtn = page.getByRole('button', { name: /Generate Profile/i }).last();
    await confirmBtn.click();

    // Should navigate to the profile detail page
    await page.waitForURL('**/sprint-fv/**', { timeout: 15000 });

    // Verify profile detail page loaded with key sections
    await expect(page.getByText(/N\/kg/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/m\/s/i)).toBeVisible();
    await expect(page.getByText(/W\/kg/i)).toBeVisible();
  });

  test('should display analysis card with classification', async ({ page }) => {
    await page.goto(`${STAGING_URL}/sprint-fv`);
    await page.waitForLoadState('networkidle');

    // Navigate to Profiles tab
    await page.getByRole('tab', { name: /Profiles/i }).click();

    // Click first profile row (if any exist)
    const profileRow = page.locator('table tbody tr').first();
    if (await profileRow.count() === 0) {
      test.skip(true, 'No profiles exist to view');
      return;
    }

    await profileRow.click();
    await page.waitForURL('**/sprint-fv/**');

    // Check analysis card exists with classification badge
    const analysisSection = page.getByText('Analysis');
    await expect(analysisSection).toBeVisible({ timeout: 10000 });

    // Should show one of the classification badges
    const hasBadge = await page.getByText(/Force Deficit|Velocity Deficit|Well Balanced/i).count() > 0;
    expect(hasBadge).toBe(true);

    // Should show training recommendations
    await expect(page.getByText(/Training Focus/i)).toBeVisible();
  });

  test('should display Force-Velocity chart', async ({ page }) => {
    await page.goto(`${STAGING_URL}/sprint-fv`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('tab', { name: /Profiles/i }).click();

    const profileRow = page.locator('table tbody tr').first();
    if (await profileRow.count() === 0) {
      test.skip(true, 'No profiles exist');
      return;
    }

    await profileRow.click();
    await page.waitForURL('**/sprint-fv/**');

    // Check for Force-Velocity chart heading
    await expect(page.getByText('Force-Velocity Profile')).toBeVisible({ timeout: 10000 });

    // Canvas element should be present (Chart.js renders to canvas)
    const canvasElements = page.locator('canvas');
    await expect(canvasElements.first()).toBeVisible();
  });

  test('should show split times table with residuals', async ({ page }) => {
    await page.goto(`${STAGING_URL}/sprint-fv`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('tab', { name: /Profiles/i }).click();

    const profileRow = page.locator('table tbody tr').first();
    if (await profileRow.count() === 0) {
      test.skip(true, 'No profiles exist');
      return;
    }

    await profileRow.click();
    await page.waitForURL('**/sprint-fv/**');

    // Split times table should show distance, observed, predicted, residual columns
    await expect(page.getByText('Split Times')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Observed')).toBeVisible();
    await expect(page.getByText('Predicted')).toBeVisible();
    await expect(page.getByText('Residual')).toBeVisible();
  });

  test('should show Profiles tab with list of generated profiles', async ({ page }) => {
    await page.goto(`${STAGING_URL}/sprint-fv`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('tab', { name: /Profiles/i }).click();

    // Should show either a table or empty state
    const hasTable = await page.locator('table').count() > 0;
    const hasEmptyState = await page.getByText(/No profiles generated/i).count() > 0;

    expect(hasTable || hasEmptyState).toBe(true);
  });

  test('should show Trends tab with longitudinal chart', async ({ page }) => {
    await page.goto(`${STAGING_URL}/sprint-fv`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('tab', { name: /Trends/i }).click();

    // Should show either chart or "at least 2 profiles needed" message
    const hasChart = await page.locator('canvas').count() > 0;
    const hasMinMessage = await page.getByText(/at least 2 profiles/i).count() > 0;

    expect(hasChart || hasMinMessage).toBe(true);
  });

  test('should navigate back from profile detail', async ({ page }) => {
    await page.goto(`${STAGING_URL}/sprint-fv`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('tab', { name: /Profiles/i }).click();

    const profileRow = page.locator('table tbody tr').first();
    if (await profileRow.count() === 0) {
      test.skip(true, 'No profiles exist');
      return;
    }

    await profileRow.click();
    await page.waitForURL('**/sprint-fv/**');

    // Click back button
    await page.getByRole('button', { name: /Back to Sprint F-V/i }).click();
    await page.waitForURL('**/sprint-fv');
  });

  test('should show disabled state when feature is off', async ({ page }) => {
    // This test navigates directly to the URL without the feature being enabled
    // The page should show a disabled message if feature is off
    await page.goto(`${STAGING_URL}/sprint-fv`);
    await page.waitForLoadState('networkidle');

    // Either the feature works (tabs visible) or it's disabled (message visible)
    const hasTabs = await page.getByRole('tab', { name: /Generate/i }).count() > 0;
    const hasDisabledMessage = await page.getByText(/not enabled for your organization/i).count() > 0;

    // One of these must be true
    expect(hasTabs || hasDisabledMessage).toBe(true);
  });
});
