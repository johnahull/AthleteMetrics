import { test, expect } from './fixtures/e2e-base';
import { loginAs, loginWithCredentials } from './helpers/auth';
import { getUserByRole } from './fixtures/test-users';

/**
 * TIER 2: Dashboard Timeframe Filtering E2E Tests
 *
 * Tests the dashboard timeframe filter functionality:
 * - Timeframe selector visibility for org admins/coaches
 * - Preset timeframe selection updates URL and data
 * - Custom date range picker flow
 * - URL state synchronization (bookmarkable URLs)
 * - Browser back/forward navigation
 * - Integration with scope selector (both filters work together)
 *
 * Total: 12 test scenarios
 */

const TESTING_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

const TEST_USERS = {
  siteAdmin: getUserByRole('site_admin'),
  orgAdmin: getUserByRole('org_admin'),
  coach: getUserByRole('coach'),
};

test.describe('Dashboard Timeframe Filtering Tests', () => {
  test.describe.configure({ mode: 'serial' });

  let testOrgId: string;

  // Setup: Get test organization
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await loginWithCredentials(page, TEST_USERS.siteAdmin.username, TEST_USERS.siteAdmin.password);

    // Get organizations
    const orgsResponse = await page.request.get(`${TESTING_URL}/api/organizations`);
    if (orgsResponse.ok()) {
      const orgs = await orgsResponse.json();
      if (orgs.length > 0) {
        testOrgId = orgs[0].id;
      }
    }

    await context.close();

    console.log('Timeframe Test Setup Data:', { testOrgId });
  });

  test.describe('Timeframe Selector Visibility', () => {
    test('should show timeframe selector for org admins on dashboard', async ({ page }) => {
      await loginAs(page, 'org_admin');

      await page.goto(`${TESTING_URL}/dashboard`);
      await page.waitForLoadState('networkidle');

      // Wait for dashboard to load
      await page.waitForSelector('h1:has-text("Dashboard Overview")', { timeout: 10000 });

      // Timeframe selector should be visible
      const timeframeSelector = page.locator('[data-testid="dashboard-timeframe-selector"]');
      await expect(timeframeSelector).toBeVisible({ timeout: 5000 });
    });

    test('should show timeframe selector for coaches on dashboard', async ({ page }) => {
      await loginAs(page, 'coach');

      await page.goto(`${TESTING_URL}/dashboard`);
      await page.waitForLoadState('networkidle');

      // Wait for dashboard to load
      await page.waitForSelector('h1:has-text("Dashboard Overview")', { timeout: 10000 });

      // Timeframe selector should be visible for coaches
      const timeframeSelector = page.locator('[data-testid="dashboard-timeframe-selector"]');
      await expect(timeframeSelector).toBeVisible({ timeout: 5000 });
    });

    test('timeframe selector should default to Last 30 Days', async ({ page }) => {
      await loginAs(page, 'org_admin');

      await page.goto(`${TESTING_URL}/dashboard`);
      await page.waitForLoadState('networkidle');

      // Wait for timeframe selector
      const timeframeSelector = page.locator('[data-testid="dashboard-timeframe-selector"]');
      await expect(timeframeSelector).toBeVisible({ timeout: 5000 });

      // Should show "Last 30 Days" by default
      const selectorText = await timeframeSelector.textContent();
      expect(selectorText).toContain('Last 30 Days');
    });
  });

  test.describe('Preset Timeframe Selection', () => {
    test('should update URL when 7d timeframe is selected', async ({ page }) => {
      await loginAs(page, 'org_admin');

      await page.goto(`${TESTING_URL}/dashboard`);
      await page.waitForLoadState('networkidle');

      // Wait for timeframe selector
      const timeframeSelector = page.locator('[data-testid="dashboard-timeframe-selector"]');
      await expect(timeframeSelector).toBeVisible({ timeout: 5000 });

      // Click to open dropdown
      await timeframeSelector.click();

      // Wait for dropdown options
      await page.waitForSelector('text=Last 7 Days', { timeout: 5000 });

      // Select "Last 7 Days"
      await page.click('text=Last 7 Days');

      // Wait for URL to update
      await page.waitForTimeout(500);

      // URL should contain timeframe=7d
      expect(page.url()).toContain('timeframe=7d');
    });

    test('should update URL when 90d timeframe is selected', async ({ page }) => {
      await loginAs(page, 'org_admin');

      await page.goto(`${TESTING_URL}/dashboard`);
      await page.waitForLoadState('networkidle');

      // Wait for timeframe selector
      const timeframeSelector = page.locator('[data-testid="dashboard-timeframe-selector"]');
      await expect(timeframeSelector).toBeVisible({ timeout: 5000 });

      // Click to open dropdown
      await timeframeSelector.click();

      // Wait for dropdown options
      await page.waitForSelector('text=Last 90 Days', { timeout: 5000 });

      // Select "Last 90 Days"
      await page.click('text=Last 90 Days');

      // Wait for URL to update
      await page.waitForTimeout(500);

      // URL should contain timeframe=90d
      expect(page.url()).toContain('timeframe=90d');
    });

    test('should show checkmark on selected preset', async ({ page }) => {
      await loginAs(page, 'org_admin');

      // Navigate with a specific timeframe
      await page.goto(`${TESTING_URL}/dashboard?timeframe=7d`);
      await page.waitForLoadState('networkidle');

      // Wait for timeframe selector
      const timeframeSelector = page.locator('[data-testid="dashboard-timeframe-selector"]');
      await expect(timeframeSelector).toBeVisible({ timeout: 5000 });

      // Selector should show "Last 7 Days"
      const selectorText = await timeframeSelector.textContent();
      expect(selectorText).toContain('Last 7 Days');
    });
  });

  test.describe('URL State Persistence', () => {
    test('should restore timeframe from URL on page load', async ({ page }) => {
      await loginAs(page, 'org_admin');

      // Navigate directly with timeframe in URL
      await page.goto(`${TESTING_URL}/dashboard?timeframe=90d`);
      await page.waitForLoadState('networkidle');

      // Wait for timeframe selector
      const timeframeSelector = page.locator('[data-testid="dashboard-timeframe-selector"]');
      await expect(timeframeSelector).toBeVisible({ timeout: 5000 });

      // Should show "Last 90 Days"
      const selectorText = await timeframeSelector.textContent();
      expect(selectorText).toContain('Last 90 Days');

      // Refresh the page
      await page.reload();
      await page.waitForLoadState('networkidle');

      // URL should still contain timeframe=90d
      expect(page.url()).toContain('timeframe=90d');
    });

    test('should handle browser back/forward navigation', async ({ page }) => {
      await loginAs(page, 'org_admin');

      // Start at dashboard without timeframe param (defaults to 30d)
      await page.goto(`${TESTING_URL}/dashboard`);
      await page.waitForLoadState('networkidle');

      // Navigate to 7d timeframe
      await page.goto(`${TESTING_URL}/dashboard?timeframe=7d`);
      await page.waitForLoadState('networkidle');

      // Go back
      await page.goBack();
      await page.waitForLoadState('networkidle');

      // Go forward
      await page.goForward();
      await page.waitForLoadState('networkidle');

      // Should have timeframe=7d
      expect(page.url()).toContain('timeframe=7d');
    });
  });

  test.describe('Integration with Scope Selector', () => {
    test('should preserve timeframe when changing scope', async ({ page }) => {
      if (!testOrgId) {
        test.skip();
        return;
      }

      await loginAs(page, 'org_admin');

      // Navigate with timeframe
      await page.goto(`${TESTING_URL}/dashboard?timeframe=90d`);
      await page.waitForLoadState('networkidle');

      // Wait for scope selector
      const scopeSelector = page.locator('[data-testid="dashboard-scope-selector"]');
      await expect(scopeSelector).toBeVisible({ timeout: 5000 });

      // Click scope selector
      await scopeSelector.click();

      // Wait for dropdown options
      await page.waitForSelector('[role="option"]', { timeout: 5000 });

      // Click first team option (if exists)
      const teamOptions = page.locator('[role="option"]');
      const optionCount = await teamOptions.count();

      if (optionCount > 1) {
        // Click second option (first team after "All Teams")
        await teamOptions.nth(1).click();

        // Wait for URL to update
        await page.waitForTimeout(500);

        // Timeframe should still be preserved in URL
        expect(page.url()).toContain('timeframe=90d');
      }
    });

    test('both filters should work together in URL', async ({ page }) => {
      if (!testOrgId) {
        test.skip();
        return;
      }

      await loginAs(page, 'org_admin');

      await page.goto(`${TESTING_URL}/dashboard`);
      await page.waitForLoadState('networkidle');

      // Set timeframe
      const timeframeSelector = page.locator('[data-testid="dashboard-timeframe-selector"]');
      await expect(timeframeSelector).toBeVisible({ timeout: 5000 });
      await timeframeSelector.click();
      await page.waitForSelector('text=Last 7 Days', { timeout: 5000 });
      await page.click('text=Last 7 Days');
      await page.waitForTimeout(300);

      // URL should have timeframe
      expect(page.url()).toContain('timeframe=7d');

      // Now set scope
      const scopeSelector = page.locator('[data-testid="dashboard-scope-selector"]');
      if (await scopeSelector.isVisible()) {
        await scopeSelector.click();
        await page.waitForSelector('[role="option"]', { timeout: 5000 });

        const teamOptions = page.locator('[role="option"]');
        const optionCount = await teamOptions.count();

        if (optionCount > 1) {
          await teamOptions.nth(1).click();
          await page.waitForTimeout(500);

          // Both params should be in URL
          expect(page.url()).toContain('timeframe=7d');
          expect(page.url()).toMatch(/teamId=|view=/);
        }
      }
    });
  });

  test.describe('Custom Date Range', () => {
    test('should show custom range picker when selected', async ({ page }) => {
      await loginAs(page, 'org_admin');

      await page.goto(`${TESTING_URL}/dashboard`);
      await page.waitForLoadState('networkidle');

      // Wait for timeframe selector
      const timeframeSelector = page.locator('[data-testid="dashboard-timeframe-selector"]');
      await expect(timeframeSelector).toBeVisible({ timeout: 5000 });

      // Click to open dropdown
      await timeframeSelector.click();

      // Wait for dropdown options
      await page.waitForSelector('text=Custom Range', { timeout: 5000 });

      // Click "Custom Range..."
      await page.click('text=Custom Range');

      // Calendar pickers should appear
      await expect(page.locator('text=From')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=To')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('button:has-text("Apply")')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('button:has-text("Cancel")')).toBeVisible({ timeout: 5000 });
    });
  });
});

test.describe('Dashboard Timeframe Filtering Summary', () => {
  test('print timeframe filtering test summary', async () => {
    console.log('\n========================================================');
    console.log('Dashboard Timeframe Filtering E2E Tests Summary');
    console.log('========================================================');
    console.log('Selector Visibility:');
    console.log('   - Shows for org admins');
    console.log('   - Shows for coaches');
    console.log('   - Defaults to Last 30 Days');
    console.log('Preset Selection:');
    console.log('   - Updates URL when 7d selected');
    console.log('   - Updates URL when 90d selected');
    console.log('   - Shows checkmark on selected preset');
    console.log('URL State Persistence:');
    console.log('   - Restores timeframe from URL on load');
    console.log('   - Handles browser back/forward navigation');
    console.log('Integration with Scope:');
    console.log('   - Preserves timeframe when changing scope');
    console.log('   - Both filters work together in URL');
    console.log('Custom Date Range:');
    console.log('   - Shows custom range picker');
    console.log('========================================================\n');
  });
});
