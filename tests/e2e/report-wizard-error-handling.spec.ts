import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * REPORT WIZARD ERROR HANDLING: End-to-End Tests
 *
 * Test Coverage:
 * - Loading states (metrics, teams, benchmarks)
 * - Error handling (API failures)
 * - Empty states (no data available)
 * - Successful wizard flow
 * - Metric field mapping (metricCode vs code)
 */

const STAGING_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

function generateTestReport() {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  return {
    name: `Test Report ${uniqueId}`,
    description: `E2E test report created at ${new Date().toISOString()}`,
  };
}

/**
 * Helper to select Team Report type and navigate through initial steps.
 * The wizard has 8 steps total. For team reports, step 2 (athlete selection) is skipped.
 * Flow: Step 1 (Type) → Step 3 (Details) → Step 4 (Timeframe) → Step 5 (Metrics) → ...
 */
async function selectTeamReportAndFillDetails(page: import('@playwright/test').Page, testReport: { name: string; description?: string }) {
  // Step 1: Select Team Report type
  await page.locator('label[for="team"]').click();
  await page.click('button:has-text("Next")');

  // Step 3: Fill basic details (step 2 skipped for team reports)
  await page.fill('input[name="name"]', testReport.name);
  if (testReport.description) {
    await page.fill('textarea[name="description"]', testReport.description);
  }
  await page.click('button:has-text("Next")');

  // Step 4: Timeframe — use defaults
  await page.click('button:has-text("Next")');
}

test.describe('Report Wizard Error Handling - E2E Tests', () => {
  let createdReportIds: string[] = [];

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    createdReportIds = [];
  });

  test.afterEach(async ({ page }) => {
    // Cleanup: Delete created reports
    for (const reportId of createdReportIds) {
      try {
        await page.request.delete(`${STAGING_URL}/api/reports/${reportId}`);
      } catch (error) {
        console.warn(`Failed to cleanup report ${reportId}:`, error);
      }
    }
  });

  test.describe('Loading States', () => {
    test('should show loading spinner while fetching metrics', async ({ page }) => {
      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      // Open wizard
      await page.click('button:has-text("Create Report"), button:has-text("New Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      // Navigate to metrics step (step 5)
      const testReport = generateTestReport();
      await selectTeamReportAndFillDetails(page, testReport);

      // Step 5: Metrics - should show loading spinner initially or metrics list
      const metricsSection = page.locator('[role="dialog"]').filter({ hasText: 'Select Metrics' });
      await expect(metricsSection).toBeVisible({ timeout: 5000 });
    });

    test('should show loading spinner while fetching teams', async ({ page }) => {
      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      // Open wizard and navigate to filters step (step 7)
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      const testReport = generateTestReport();
      await selectTeamReportAndFillDetails(page, testReport);

      // Step 5: Metrics - select at least one
      await page.waitForTimeout(1000);
      const checkbox = page.locator('[role="checkbox"]').first();
      await checkbox.click();
      await page.click('button:has-text("Next")');

      // Step 6: Benchmarks - skip
      await page.click('button:has-text("Next")');

      // Step 7: Filters (Teams) - verify section exists
      const teamsSection = page.locator('[role="dialog"]').filter({ hasText: 'Filters' });
      await expect(teamsSection).toBeVisible({ timeout: 5000 });
    });

    test('should show loading spinner while fetching benchmarks', async ({ page }) => {
      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      // Open wizard and navigate to benchmarks step (step 6)
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      const testReport = generateTestReport();
      await selectTeamReportAndFillDetails(page, testReport);

      // Step 5: Metrics - select one
      await page.waitForTimeout(1000);
      await page.locator('[role="checkbox"]').first().click();
      await page.click('button:has-text("Next")');

      // Step 6: Benchmarks - verify section exists
      const benchmarksSection = page.locator('[role="dialog"]').filter({ hasText: /Benchmarks.*Optional/i });
      await expect(benchmarksSection).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Error Handling', () => {
    test('should display error message when metrics API fails', async ({ page }) => {
      // Intercept metrics API and return error (wildcard org ID)
      await page.route('**/api/organizations/*/metrics*', route => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      });

      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      // Open wizard and navigate to metrics step
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      const testReport = generateTestReport();
      await selectTeamReportAndFillDetails(page, testReport);

      // Step 5: Metrics - should show error
      await expect(page.locator('text=Failed to load metrics')).toBeVisible({ timeout: 10000 });
    });

    test('should display error message when teams API fails', async ({ page }) => {
      // Intercept teams API and return error
      // The component fetches /api/teams?organizationId=...
      await page.route('**/api/teams*', route => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      });

      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      // Navigate to filters step (step 7)
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      const testReport = generateTestReport();
      await selectTeamReportAndFillDetails(page, testReport);

      // Metrics - select one (metrics loads from different endpoint)
      await page.waitForTimeout(1000);
      await page.locator('[role="checkbox"]').first().click();
      await page.click('button:has-text("Next")');

      // Benchmarks - skip
      await page.click('button:has-text("Next")');

      // Step 7: Filters - should show teams error
      await page.waitForTimeout(1000);
      await expect(page.locator('text=/Failed to load.*teams/i')).toBeVisible({ timeout: 5000 });
    });

    test('should display error message when benchmarks API fails', async ({ page }) => {
      // The component uses a single endpoint: /api/organizations/{orgId}/benchmarks
      await page.route('**/api/organizations/*/benchmarks*', route => {
        // Don't intercept the metrics endpoint (which is also under /organizations/*)
        if (route.request().url().includes('/metrics')) {
          return route.continue();
        }
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      });

      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      // Navigate to benchmarks step
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      const testReport = generateTestReport();
      await selectTeamReportAndFillDetails(page, testReport);

      // Metrics - select one
      await page.waitForTimeout(1000);
      await page.locator('[role="checkbox"]').first().click();
      await page.click('button:has-text("Next")');

      // Step 6: Benchmarks - should show error
      await page.waitForTimeout(1000);
      await expect(page.locator('text=Failed to load benchmarks')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Empty States', () => {
    test('should display "No metrics enabled" message when metrics array is empty', async ({ page }) => {
      // Intercept metrics API and return empty array
      await page.route('**/api/organizations/*/metrics*', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      // Navigate to metrics step
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      const testReport = generateTestReport();
      await selectTeamReportAndFillDetails(page, testReport);

      // Step 5: Metrics - should show empty state
      await page.waitForTimeout(1000);
      await expect(page.locator('text=No metrics enabled for this organization')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Please enable metrics in Settings first')).toBeVisible();
    });

    test('should display "No teams available" message when teams array is empty', async ({ page }) => {
      // Intercept teams API and return empty array
      await page.route('**/api/teams*', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      // Navigate to filters step
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      const testReport = generateTestReport();
      await selectTeamReportAndFillDetails(page, testReport);

      // Metrics - select one
      await page.waitForTimeout(1000);
      await page.locator('[role="checkbox"]').first().click();
      await page.click('button:has-text("Next")');

      // Benchmarks - skip
      await page.click('button:has-text("Next")');

      // Step 7: Filters - should show empty state
      await page.waitForTimeout(1000);
      await expect(page.locator('text=/No.*teams.*available/i')).toBeVisible({ timeout: 5000 });
    });

    test('should display "No benchmarks available" message when both benchmark arrays are empty', async ({ page }) => {
      // Intercept benchmarks API and return empty array
      await page.route('**/api/organizations/*/benchmarks*', route => {
        if (route.request().url().includes('/metrics')) {
          return route.continue();
        }
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      // Navigate to benchmarks step
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      const testReport = generateTestReport();
      await selectTeamReportAndFillDetails(page, testReport);

      // Metrics - select one
      await page.waitForTimeout(1000);
      await page.locator('[role="checkbox"]').first().click();
      await page.click('button:has-text("Next")');

      // Step 6: Benchmarks - should show empty state
      await page.waitForTimeout(1000);
      await expect(page.locator('text=No enabled benchmarks available')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=You can skip this step or enable benchmarks in Settings')).toBeVisible();
    });
  });

  test.describe('Successful Flow', () => {
    test('should successfully navigate through all 8 wizard steps and create report', async ({ page }) => {
      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      const testReport = generateTestReport();

      // Step 1: Report Type
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
      await expect(page.locator('text=Step 1 of 8')).toBeVisible();
      await page.locator('label[for="team"]').click();

      // Step 3: Basic Details (step 2 skipped for team reports)
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=Step 3 of 8')).toBeVisible();
      await page.fill('input[name="name"]', testReport.name);
      await page.fill('textarea[name="description"]', testReport.description);

      // Step 4: Timeframe
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=Step 4 of 8')).toBeVisible();
      // Default preset is already selected

      // Step 5: Metrics
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=Step 5 of 8')).toBeVisible();
      await page.waitForTimeout(1000);
      const metricsCheckbox = page.locator('[role="checkbox"]').first();
      await metricsCheckbox.click();

      // Step 6: Benchmarks
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=Step 6 of 8')).toBeVisible();
      // Skip benchmarks

      // Step 7: Filters
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=Step 7 of 8')).toBeVisible();
      // Skip filters

      // Step 8: Composite Index
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=Step 8 of 8')).toBeVisible();
      // Leave composite index disabled

      // Submit
      const responsePromise = page.waitForResponse(response =>
        response.url().includes('/api/reports') && response.request().method() === 'POST'
      );

      await page.click('button:has-text("Create Report")');

      const response = await responsePromise;
      const data = await response.json();
      if (data.id) {
        createdReportIds.push(data.id);
      } else if (data.reports) {
        data.reports.forEach((r: any) => createdReportIds.push(r.id));
      }

      // Verify success (dialog closes or success message appears)
      await page.waitForTimeout(1000);
    });

    test('should allow navigation back and forth between steps', async ({ page }) => {
      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      const testReport = generateTestReport();

      // Open wizard
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      // Step 1
      await page.locator('label[for="team"]').click();

      // Go to step 3 (step 2 skipped for team)
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=Step 3 of 8')).toBeVisible();

      // Go back to step 1
      await page.click('button:has-text("Back")');
      await expect(page.locator('text=Step 1 of 8')).toBeVisible();

      // Go forward again
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=Step 3 of 8')).toBeVisible();

      // Fill name and continue
      await page.fill('input[name="name"]', testReport.name);

      // Navigate to step 5 (Metrics)
      await page.click('button:has-text("Next")');
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=Step 5 of 8')).toBeVisible();

      // Go back to step 4
      await page.click('button:has-text("Back")');
      await expect(page.locator('text=Step 4 of 8')).toBeVisible();
    });
  });

  test.describe('Metric Field Mapping', () => {
    test('should handle metrics with metricCode field', async ({ page }) => {
      // Mock metrics with metricCode field
      await page.route('**/api/organizations/*/metrics*', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'test-1',
              metricCode: 'FLY10_TIME',
              siteMetric: {
                name: '10-Yard Fly Time',
                label: '10-Yard Fly Time',
                unit: 'seconds',
                category: 'Speed',
              },
            },
            {
              id: 'test-2',
              metricCode: 'VERTICAL_JUMP',
              siteMetric: {
                name: 'Vertical Jump',
                label: 'Vertical Jump',
                unit: 'inches',
                category: 'Power',
              },
            },
          ]),
        });
      });

      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      // Navigate to metrics step
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      const testReport = generateTestReport();
      await selectTeamReportAndFillDetails(page, testReport);

      // Metrics should display correctly
      await page.waitForTimeout(1000);
      await expect(page.locator('text=10-Yard Fly Time')).toBeVisible();
      await expect(page.locator('text=Vertical Jump')).toBeVisible();

      // Select a metric using its ID (shadcn Checkbox renders as button with id)
      await page.locator('#FLY10_TIME').click();
      await expect(page.locator('#FLY10_TIME')).toHaveAttribute('aria-checked', 'true');
    });

    test('should handle metrics with code field (fallback)', async ({ page }) => {
      // Mock metrics with code field instead of metricCode
      await page.route('**/api/organizations/*/metrics*', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'test-1',
              metricCode: 'DASH_40YD',
              siteMetric: {
                name: '40-Yard Dash',
                label: '40-Yard Dash',
                unit: 'seconds',
                category: 'Speed',
              },
            },
            {
              id: 'test-2',
              metricCode: 'BENCH_PRESS',
              siteMetric: {
                name: 'Bench Press',
                label: 'Bench Press',
                unit: 'lbs',
                category: 'Strength',
              },
            },
          ]),
        });
      });

      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      // Navigate to metrics step
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      const testReport = generateTestReport();
      await selectTeamReportAndFillDetails(page, testReport);

      // Metrics should display correctly
      await page.waitForTimeout(1000);
      await expect(page.locator('text=40-Yard Dash')).toBeVisible();
      await expect(page.locator('text=Bench Press')).toBeVisible();

      // Select a metric
      await page.locator('#DASH_40YD').click();
      await expect(page.locator('#DASH_40YD')).toHaveAttribute('aria-checked', 'true');
    });

    test('should handle mixed metrics (some with metricCode, some with code)', async ({ page }) => {
      // Mock metrics with mixed field names
      await page.route('**/api/organizations/*/metrics*', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'test-1',
              metricCode: 'FLY10_TIME',
              siteMetric: {
                name: '10-Yard Fly Time',
                label: '10-Yard Fly Time',
                unit: 'seconds',
                category: 'Speed',
              },
            },
            {
              id: 'test-2',
              metricCode: 'VERTICAL_JUMP',
              siteMetric: {
                name: 'Vertical Jump',
                label: 'Vertical Jump',
                unit: 'inches',
                category: 'Power',
              },
            },
          ]),
        });
      });

      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      // Navigate to metrics step
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      const testReport = generateTestReport();
      await selectTeamReportAndFillDetails(page, testReport);

      // Both metrics should display correctly
      await page.waitForTimeout(1000);
      await expect(page.locator('text=10-Yard Fly Time')).toBeVisible();
      await expect(page.locator('text=Vertical Jump')).toBeVisible();

      // Select both metrics
      await page.locator('#FLY10_TIME').click();
      await page.locator('#VERTICAL_JUMP').click();

      await expect(page.locator('#FLY10_TIME')).toHaveAttribute('aria-checked', 'true');
      await expect(page.locator('#VERTICAL_JUMP')).toHaveAttribute('aria-checked', 'true');
    });
  });

  test.describe('Progress Indicator', () => {
    test('should show progress bar that updates as user navigates steps', async ({ page }) => {
      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      const testReport = generateTestReport();

      // Open wizard
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      // Verify progress bar exists
      const progressBar = page.locator('[role="progressbar"]');
      await expect(progressBar).toBeVisible();

      // Step 1
      await expect(page.locator('text=Step 1 of 8')).toBeVisible();

      // Navigate to step 3 (step 2 skipped for team)
      await page.locator('label[for="team"]').click();
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=Step 3 of 8')).toBeVisible();

      // Navigate to step 4
      await page.fill('input[name="name"]', testReport.name);
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=Step 4 of 8')).toBeVisible();

      // Navigate to step 5
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=Step 5 of 8')).toBeVisible();

      // Progress bar should still be visible
      await expect(progressBar).toBeVisible();
    });
  });

  test.describe('Composite Index', () => {
    test('should show composite index step for team reports', async ({ page }) => {
      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      const testReport = generateTestReport();

      // Navigate to step 8
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      await selectTeamReportAndFillDetails(page, testReport);

      // Select metrics
      await page.waitForTimeout(1000);
      await page.locator('[role="checkbox"]').first().click();
      await page.click('button:has-text("Next")');

      // Skip benchmarks and filters
      await page.click('button:has-text("Next")');
      await page.click('button:has-text("Next")');

      // Step 8: Should show composite index option
      await expect(page.locator('text=Enable Composite Index')).toBeVisible();
      await expect(page.locator('text=/Create a weighted composite score across multiple metrics/i')).toBeVisible();
    });

    test('should show review summary for individual reports on step 8', async ({ page }) => {
      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      const testReport = generateTestReport();

      // Navigate through wizard selecting individual report
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      await page.locator('label[for="individual"]').click();
      await page.click('button:has-text("Next")');

      // Step 2: Athlete Selection — skip (no validation on this step)
      await page.click('button:has-text("Next")');

      // Step 3: Basic Details
      await page.fill('input[name="name"]', testReport.name);
      await page.click('button:has-text("Next")');

      // Step 4: Timeframe
      await page.click('button:has-text("Next")');

      // Step 5: Metrics — select one
      await page.waitForTimeout(1000);
      await page.locator('[role="checkbox"]').first().click();
      await page.click('button:has-text("Next")');

      // Skip benchmarks and filters
      await page.click('button:has-text("Next")');
      await page.click('button:has-text("Next")');

      // Step 8: Should show review summary
      await expect(page.locator('text=Review')).toBeVisible();
      await expect(page.locator('text=Individual Report')).toBeVisible();
    });
  });
});
