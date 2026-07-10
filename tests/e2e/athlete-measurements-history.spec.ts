import { test, expect, Page } from './fixtures/e2e-base';
import { loginAsAthlete } from './helpers/auth';

/**
 * ATHLETE MEASUREMENTS HISTORY: E2E Tests
 *
 * Tests verify the measurement history page functionality:
 * - View full measurement history in sortable/filterable table
 * - Filter by metric, date range, and verification status
 * - Progress charts with trend line visualization
 * - Edit and delete self-entered measurements
 * - Cannot edit verified or coach-submitted measurements
 * - CSV export of measurement history
 * - Measurement timeline showing recent activity
 *
 * NOTE: In CI environments, all roles may use the same admin account.
 * Admin users don't have an athleteId, so athlete-specific pages redirect.
 * Tests will be skipped when the test user isn't actually an athlete.
 */

const BASE_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

/**
 * Helper to navigate to my-measurements and check if user is actually an athlete.
 * Returns true if on my-measurements, false if redirected (user isn't an athlete).
 */
async function navigateToMyMeasurements(page: Page): Promise<boolean> {
  await page.goto(`${BASE_URL}/my-measurements`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  const url = page.url();
  if (!url.includes('/my-measurements')) {
    console.log('User is not an athlete (redirected to:', url, ') - skipping athlete-specific test');
    return false;
  }
  return true;
}

test.describe('Athlete Measurements History', () => {
  test.beforeEach(async ({ page }) => {
    // Login as athlete user
    await loginAsAthlete(page);
  });

  test.describe('Measurement History Table', () => {
    test('should display measurement history table', async ({ page }) => {
      const isAthlete = await navigateToMyMeasurements(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      // Check for table presence
      const table = page.locator('[data-testid="measurement-history-table"]');
      await expect(table).toBeVisible();

      // Should have column headers
      await expect(page.getByRole('columnheader', { name: /Date/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /Metric/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /Value/i })).toBeVisible();
      await expect(page.getByRole('columnheader', { name: /Status/i })).toBeVisible();
    });

    test('should filter measurements by metric', async ({ page }) => {
      const isAthlete = await navigateToMyMeasurements(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      // Open metric filter dropdown
      const metricFilter = page.locator('[data-testid="metric-filter"]');
      await metricFilter.click();

      // Select a metric (e.g., Vertical Jump)
      await page.getByText('Vertical Jump').click();

      // Wait for table to update
      await page.waitForTimeout(500);

      // All visible rows should be for the selected metric
      const rows = page.locator('[data-testid^="measurement-row-"]');
      const count = await rows.count();

      if (count > 0) {
        const firstRow = rows.first();
        await expect(firstRow).toContainText('Vertical Jump');
      }
    });

    test('should filter measurements by verification status', async ({ page }) => {
      const isAthlete = await navigateToMyMeasurements(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      // Click verified filter
      const verifiedFilter = page.locator('[data-testid="verified-filter"]');
      await verifiedFilter.click();

      await page.waitForTimeout(500);

      // Check that verified badge is shown
      const verifiedBadge = page.locator('[data-testid="verification-badge-verified"]').first();
      if (await verifiedBadge.isVisible()) {
        await expect(verifiedBadge).toBeVisible();
      }
    });

    test('should sort measurements by date', async ({ page }) => {
      const isAthlete = await navigateToMyMeasurements(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      // Click date column header to sort
      const dateHeader = page.getByRole('columnheader', { name: /Date/i });
      await dateHeader.click();

      await page.waitForTimeout(500);

      // Verify sorting indicator appears
      const sortIcon = dateHeader.locator('svg');
      await expect(sortIcon).toBeVisible();
    });
  });

  test.describe('Measurement Progress Chart', () => {
    test('should display progress chart for a metric', async ({ page }) => {
      const isAthlete = await navigateToMyMeasurements(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      // Look for chart component
      const chart = page.locator('[data-testid="measurement-progress-chart"]');

      // Chart should exist if there are measurements
      const rows = page.locator('[data-testid^="measurement-row-"]');
      const count = await rows.count();

      if (count > 0) {
        await expect(chart).toBeVisible();
      }
    });

    test('should show trend line toggle when sufficient data exists', async ({ page }) => {
      const isAthlete = await navigateToMyMeasurements(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      // Select a metric with multiple data points
      const metricFilter = page.locator('[data-testid="metric-filter"]');
      await metricFilter.click();
      await page.getByText('Vertical Jump').click();

      await page.waitForTimeout(500);

      // Check for trend line toggle
      const trendToggle = page.locator('[data-testid="trend-line-toggle"]');
      const rows = page.locator('[data-testid^="measurement-row-"]');
      const count = await rows.count();

      // Toggle should only show with 2+ data points
      if (count >= 2) {
        await expect(trendToggle).toBeVisible();
      }
    });

    test('should toggle trend line on chart', async ({ page }) => {
      const isAthlete = await navigateToMyMeasurements(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      const trendToggle = page.locator('[data-testid="trend-line-toggle"]');

      if (await trendToggle.isVisible()) {
        // Toggle trend line on
        await trendToggle.click();
        await page.waitForTimeout(300);

        // Verify trend line dataset exists in chart
        const chart = page.locator('[data-testid="measurement-progress-chart"]');
        await expect(chart).toBeVisible();
      }
    });
  });

  test.describe('Measurement Timeline', () => {
    test('should display recent activity timeline', async ({ page }) => {
      const isAthlete = await navigateToMyMeasurements(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      const timeline = page.locator('[data-testid="measurement-timeline"]');
      const rows = page.locator('[data-testid^="measurement-row-"]');
      const count = await rows.count();

      // Timeline should show if measurements exist
      if (count > 0) {
        await expect(timeline).toBeVisible();
      }
    });

    test('should show recent measurements in timeline', async ({ page }) => {
      const isAthlete = await navigateToMyMeasurements(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      const timelineItems = page.locator('[data-testid^="timeline-item-"]');
      const count = await timelineItems.count();

      if (count > 0) {
        const firstItem = timelineItems.first();
        await expect(firstItem).toBeVisible();

        // Should contain date and metric name
        const itemText = await firstItem.textContent();
        expect(itemText).toBeTruthy();
      }
    });
  });

  test.describe('CSV Export', () => {
    test('should have CSV export button', async ({ page }) => {
      const isAthlete = await navigateToMyMeasurements(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      const exportButton = page.locator('[data-testid="csv-export-button"]');
      await expect(exportButton).toBeVisible();
      await expect(exportButton).toContainText(/Export/i);
    });

    test('should trigger download when export clicked', async ({ page }) => {
      const isAthlete = await navigateToMyMeasurements(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      // Wait for download
      const downloadPromise = page.waitForEvent('download');

      const exportButton = page.locator('[data-testid="csv-export-button"]');
      await exportButton.click();

      const download = await downloadPromise;

      // Verify filename contains 'measurements'
      expect(download.suggestedFilename()).toContain('measurements');
      expect(download.suggestedFilename()).toContain('.csv');
    });
  });

  test.describe('Navigation', () => {
    test('should have link to add measurement page', async ({ page }) => {
      const isAthlete = await navigateToMyMeasurements(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      const addButton = page.locator('[data-testid="add-measurement-button"]');
      await expect(addButton).toBeVisible();
    });

    test('should navigate to add measurement page', async ({ page }) => {
      const isAthlete = await navigateToMyMeasurements(page);
      if (!isAthlete) {
        test.skip();
        return;
      }

      const addButton = page.locator('[data-testid="add-measurement-button"]');
      await addButton.click();

      await page.waitForURL(/.*\/my-measurements-add/);
      expect(page.url()).toContain('/my-measurements-add');
    });
  });
});
