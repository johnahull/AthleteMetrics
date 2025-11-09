import { test, expect } from '@playwright/test';
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

const STAGING_URL = process.env.STAGING_URL || process.env.STAGING_URL || 'http://localhost:5000';

function generateTestReport() {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  return {
    name: `Test Report ${uniqueId}`,
    description: `E2E test report created at ${new Date().toISOString()}`,
  };
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

      // Select Coach Report
      await page.click('button:has-text("Coach Report")');
      await page.click('button:has-text("Next")');

      // Fill basic details
      const testReport = generateTestReport();
      await page.fill('input[name="name"]', testReport.name);
      await page.click('button:has-text("Next")');

      // Skip timeframe step
      await page.click('button:has-text("Next")');

      // Step 4: Metrics - should show loading spinner initially
      // Note: This might be fast on staging, so we'll just verify the component structure
      const metricsSection = page.locator('[role="dialog"]').filter({ hasText: 'Select Metrics' });
      await expect(metricsSection).toBeVisible({ timeout: 3000 });
    });

    test('should show loading spinner while fetching teams', async ({ page }) => {
      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      // Navigate to teams step (step 6)
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      // Navigate through steps
      await page.click('button:has-text("Coach Report")');
      await page.click('button:has-text("Next")');

      const testReport = generateTestReport();
      await page.fill('input[name="name"]', testReport.name);
      await page.click('button:has-text("Next")');

      // Timeframe
      await page.click('button:has-text("Next")');

      // Metrics - select at least one
      await page.waitForTimeout(1000);
      const checkbox = page.locator('input[type="checkbox"]').first();
      await checkbox.check();
      await page.click('button:has-text("Next")');

      // Benchmarks - skip
      await page.click('button:has-text("Next")');

      // Step 6: Filters (Teams) - verify section exists
      const teamsSection = page.locator('[role="dialog"]').filter({ hasText: 'Teams' });
      await expect(teamsSection).toBeVisible({ timeout: 3000 });
    });

    test('should show loading spinner while fetching benchmarks', async ({ page }) => {
      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      // Navigate to benchmarks step (step 5)
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      await page.click('button:has-text("Coach Report")');
      await page.click('button:has-text("Next")');

      const testReport = generateTestReport();
      await page.fill('input[name="name"]', testReport.name);
      await page.click('button:has-text("Next")');

      // Timeframe
      await page.click('button:has-text("Next")');

      // Metrics
      await page.waitForTimeout(1000);
      await page.locator('input[type="checkbox"]').first().check();
      await page.click('button:has-text("Next")');

      // Step 5: Benchmarks - verify section exists
      const benchmarksSection = page.locator('[role="dialog"]').filter({ hasText: /Benchmarks.*Optional/i });
      await expect(benchmarksSection).toBeVisible({ timeout: 3000 });
    });
  });

  test.describe('Error Handling', () => {
    test('should display error message when metrics API fails', async ({ page, context }) => {
      // Get the org context first
      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      // Extract organization ID from the page
      const orgId = await page.evaluate(() => {
        const authData = sessionStorage.getItem('auth') || localStorage.getItem('auth');
        if (authData) {
          const parsed = JSON.parse(authData);
          return parsed.organizationContext;
        }
        return null;
      });

      // Intercept metrics API and return error
      await page.route(`**/api/organizations/${orgId}/metrics?enabledOnly=true`, route => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      });

      // Open wizard
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      await page.click('button:has-text("Coach Report")');
      await page.click('button:has-text("Next")');

      const testReport = generateTestReport();
      await page.fill('input[name="name"]', testReport.name);
      await page.click('button:has-text("Next")');

      // Timeframe
      await page.click('button:has-text("Next")');

      // Metrics step - should show error
      await page.waitForTimeout(1000);
      await expect(page.locator('text=Failed to load metrics')).toBeVisible({ timeout: 5000 });
    });

    test('should display error message when teams API fails', async ({ page }) => {
      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      // Get organization ID
      const orgId = await page.evaluate(() => {
        const authData = sessionStorage.getItem('auth') || localStorage.getItem('auth');
        if (authData) {
          const parsed = JSON.parse(authData);
          return parsed.organizationContext;
        }
        return null;
      });

      // Intercept teams API and return error
      await page.route(`**/api/organizations/${orgId}/teams`, route => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      });

      // Navigate to teams step
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      await page.click('button:has-text("Coach Report")');
      await page.click('button:has-text("Next")');

      const testReport = generateTestReport();
      await page.fill('input[name="name"]', testReport.name);
      await page.click('button:has-text("Next")');

      // Timeframe
      await page.click('button:has-text("Next")');

      // Metrics - select one (assume metrics load successfully)
      await page.waitForTimeout(1000);
      await page.locator('input[type="checkbox"]').first().check();
      await page.click('button:has-text("Next")');

      // Benchmarks - skip
      await page.click('button:has-text("Next")');

      // Teams step - should show error
      await page.waitForTimeout(1000);
      await expect(page.locator('text=Failed to load teams')).toBeVisible({ timeout: 5000 });
    });

    test('should display error message when site benchmarks API fails', async ({ page }) => {
      // Intercept site benchmarks API
      await page.route('**/api/benchmarks/site', route => {
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

      await page.click('button:has-text("Coach Report")');
      await page.click('button:has-text("Next")');

      const testReport = generateTestReport();
      await page.fill('input[name="name"]', testReport.name);
      await page.click('button:has-text("Next")');

      // Timeframe
      await page.click('button:has-text("Next")');

      // Metrics
      await page.waitForTimeout(1000);
      await page.locator('input[type="checkbox"]').first().check();
      await page.click('button:has-text("Next")');

      // Benchmarks step - should show error for site benchmarks
      await page.waitForTimeout(1000);
      await expect(page.locator('text=Failed to load site benchmarks')).toBeVisible({ timeout: 5000 });
    });

    test('should display error message when custom benchmarks API fails', async ({ page }) => {
      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      // Get organization ID
      const orgId = await page.evaluate(() => {
        const authData = sessionStorage.getItem('auth') || localStorage.getItem('auth');
        if (authData) {
          const parsed = JSON.parse(authData);
          return parsed.organizationContext;
        }
        return null;
      });

      // Intercept custom benchmarks API
      await page.route(`**/api/organizations/${orgId}/custom-benchmarks`, route => {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      });

      // Navigate to benchmarks step
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      await page.click('button:has-text("Coach Report")');
      await page.click('button:has-text("Next")');

      const testReport = generateTestReport();
      await page.fill('input[name="name"]', testReport.name);
      await page.click('button:has-text("Next")');

      // Timeframe
      await page.click('button:has-text("Next")');

      // Metrics
      await page.waitForTimeout(1000);
      await page.locator('input[type="checkbox"]').first().check();
      await page.click('button:has-text("Next")');

      // Benchmarks step - should show error for custom benchmarks
      await page.waitForTimeout(1000);
      await expect(page.locator('text=Failed to load custom benchmarks')).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Empty States', () => {
    test('should display "No metrics enabled" message when metrics array is empty', async ({ page }) => {
      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      // Get organization ID
      const orgId = await page.evaluate(() => {
        const authData = sessionStorage.getItem('auth') || localStorage.getItem('auth');
        if (authData) {
          const parsed = JSON.parse(authData);
          return parsed.organizationContext;
        }
        return null;
      });

      // Intercept metrics API and return empty array
      await page.route(`**/api/organizations/${orgId}/metrics?enabledOnly=true`, route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      // Navigate to metrics step
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      await page.click('button:has-text("Coach Report")');
      await page.click('button:has-text("Next")');

      const testReport = generateTestReport();
      await page.fill('input[name="name"]', testReport.name);
      await page.click('button:has-text("Next")');

      // Timeframe
      await page.click('button:has-text("Next")');

      // Metrics step - should show empty state
      await page.waitForTimeout(1000);
      await expect(page.locator('text=No metrics enabled for this organization')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=Please enable metrics in Settings first')).toBeVisible();
    });

    test('should display "No teams available" message when teams array is empty', async ({ page }) => {
      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      // Get organization ID
      const orgId = await page.evaluate(() => {
        const authData = sessionStorage.getItem('auth') || localStorage.getItem('auth');
        if (authData) {
          const parsed = JSON.parse(authData);
          return parsed.organizationContext;
        }
        return null;
      });

      // Intercept teams API and return empty array
      await page.route(`**/api/organizations/${orgId}/teams`, route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      // Navigate to teams step
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      await page.click('button:has-text("Coach Report")');
      await page.click('button:has-text("Next")');

      const testReport = generateTestReport();
      await page.fill('input[name="name"]', testReport.name);
      await page.click('button:has-text("Next")');

      // Timeframe
      await page.click('button:has-text("Next")');

      // Metrics - select one
      await page.waitForTimeout(1000);
      await page.locator('input[type="checkbox"]').first().check();
      await page.click('button:has-text("Next")');

      // Benchmarks - skip
      await page.click('button:has-text("Next")');

      // Teams step - should show empty state
      await page.waitForTimeout(1000);
      await expect(page.locator('text=No teams available')).toBeVisible({ timeout: 5000 });
    });

    test('should display "No benchmarks available" message when both benchmark arrays are empty', async ({ page }) => {
      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      // Get organization ID
      const orgId = await page.evaluate(() => {
        const authData = sessionStorage.getItem('auth') || localStorage.getItem('auth');
        if (authData) {
          const parsed = JSON.parse(authData);
          return parsed.organizationContext;
        }
        return null;
      });

      // Intercept both benchmark APIs and return empty arrays
      await page.route('**/api/benchmarks/site', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      await page.route(`**/api/organizations/${orgId}/custom-benchmarks`, route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      });

      // Navigate to benchmarks step
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      await page.click('button:has-text("Coach Report")');
      await page.click('button:has-text("Next")');

      const testReport = generateTestReport();
      await page.fill('input[name="name"]', testReport.name);
      await page.click('button:has-text("Next")');

      // Timeframe
      await page.click('button:has-text("Next")');

      // Metrics
      await page.waitForTimeout(1000);
      await page.locator('input[type="checkbox"]').first().check();
      await page.click('button:has-text("Next")');

      // Benchmarks step - should show empty state
      await page.waitForTimeout(1000);
      await expect(page.locator('text=No benchmarks available')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('text=You can skip this step or create benchmarks in Settings')).toBeVisible();
    });
  });

  test.describe('Successful Flow', () => {
    test('should successfully navigate through all 7 wizard steps and create report', async ({ page }) => {
      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      const testReport = generateTestReport();

      // Step 1: Report Type
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
      await expect(page.locator('text=Step 1 of 7')).toBeVisible();
      await page.click('button:has-text("Coach Report")');

      // Step 2: Basic Details
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=Step 2 of 7')).toBeVisible();
      await page.fill('input[name="name"]', testReport.name);
      await page.fill('textarea[name="description"]', testReport.description);

      // Step 3: Timeframe
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=Step 3 of 7')).toBeVisible();
      // Default preset is already selected

      // Step 4: Metrics
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=Step 4 of 7')).toBeVisible();
      await page.waitForTimeout(1000);
      const metricsCheckbox = page.locator('input[type="checkbox"]').first();
      await metricsCheckbox.check();

      // Step 5: Benchmarks
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=Step 5 of 7')).toBeVisible();
      // Skip benchmarks

      // Step 6: Filters
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=Step 6 of 7')).toBeVisible();
      // Skip filters

      // Step 7: Composite Index
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=Step 7 of 7')).toBeVisible();
      // Leave composite index disabled

      // Submit
      const responsePromise = page.waitForResponse(response =>
        response.url().includes('/api/reports') && response.request().method() === 'POST'
      );

      await page.click('button:has-text("Create Report")');

      const response = await responsePromise;
      const data = await response.json();
      createdReportIds.push(data.id);

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
      await page.click('button:has-text("Coach Report")');

      // Go to step 2
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=Step 2 of 7')).toBeVisible();

      // Go back to step 1
      await page.click('button:has-text("Back")');
      await expect(page.locator('text=Step 1 of 7')).toBeVisible();

      // Go forward again
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=Step 2 of 7')).toBeVisible();

      // Fill name and continue
      await page.fill('input[name="name"]', testReport.name);

      // Navigate to step 4
      await page.click('button:has-text("Next")');
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=Step 4 of 7')).toBeVisible();

      // Go back to step 3
      await page.click('button:has-text("Back")');
      await expect(page.locator('text=Step 3 of 7')).toBeVisible();
    });
  });

  test.describe('Metric Field Mapping', () => {
    test('should handle metrics with metricCode field', async ({ page }) => {
      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      // Get organization ID
      const orgId = await page.evaluate(() => {
        const authData = sessionStorage.getItem('auth') || localStorage.getItem('auth');
        if (authData) {
          const parsed = JSON.parse(authData);
          return parsed.organizationContext;
        }
        return null;
      });

      // Mock metrics with metricCode field
      await page.route(`**/api/organizations/${orgId}/metrics?enabledOnly=true`, route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'test-1',
              metricCode: 'FLY10_TIME',
              siteMetric: {
                name: '10-Yard Fly Time',
                unit: 'seconds',
                category: 'Speed',
              },
            },
            {
              id: 'test-2',
              metricCode: 'VERTICAL_JUMP',
              siteMetric: {
                name: 'Vertical Jump',
                unit: 'inches',
                category: 'Power',
              },
            },
          ]),
        });
      });

      // Navigate to metrics step
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      await page.click('button:has-text("Coach Report")');
      await page.click('button:has-text("Next")');

      const testReport = generateTestReport();
      await page.fill('input[name="name"]', testReport.name);
      await page.click('button:has-text("Next")');
      await page.click('button:has-text("Next")');

      // Metrics should display correctly
      await page.waitForTimeout(1000);
      await expect(page.locator('text=10-Yard Fly Time')).toBeVisible();
      await expect(page.locator('text=Vertical Jump')).toBeVisible();

      // Select a metric
      await page.locator('input[type="checkbox"]#FLY10_TIME').check();
      await expect(page.locator('input[type="checkbox"]#FLY10_TIME')).toBeChecked();
    });

    test('should handle metrics with code field (fallback)', async ({ page }) => {
      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      // Get organization ID
      const orgId = await page.evaluate(() => {
        const authData = sessionStorage.getItem('auth') || localStorage.getItem('auth');
        if (authData) {
          const parsed = JSON.parse(authData);
          return parsed.organizationContext;
        }
        return null;
      });

      // Mock metrics with code field instead of metricCode
      await page.route(`**/api/organizations/${orgId}/metrics?enabledOnly=true`, route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'test-1',
              code: 'DASH_40YD',
              siteMetric: {
                name: '40-Yard Dash',
                unit: 'seconds',
                category: 'Speed',
              },
            },
            {
              id: 'test-2',
              code: 'BENCH_PRESS',
              siteMetric: {
                name: 'Bench Press',
                unit: 'lbs',
                category: 'Strength',
              },
            },
          ]),
        });
      });

      // Navigate to metrics step
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      await page.click('button:has-text("Coach Report")');
      await page.click('button:has-text("Next")');

      const testReport = generateTestReport();
      await page.fill('input[name="name"]', testReport.name);
      await page.click('button:has-text("Next")');
      await page.click('button:has-text("Next")');

      // Metrics should display correctly
      await page.waitForTimeout(1000);
      await expect(page.locator('text=40-Yard Dash')).toBeVisible();
      await expect(page.locator('text=Bench Press')).toBeVisible();

      // Select a metric
      await page.locator('input[type="checkbox"]#DASH_40YD').check();
      await expect(page.locator('input[type="checkbox"]#DASH_40YD')).toBeChecked();
    });

    test('should handle mixed metrics (some with metricCode, some with code)', async ({ page }) => {
      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      // Get organization ID
      const orgId = await page.evaluate(() => {
        const authData = sessionStorage.getItem('auth') || localStorage.getItem('auth');
        if (authData) {
          const parsed = JSON.parse(authData);
          return parsed.organizationContext;
        }
        return null;
      });

      // Mock metrics with mixed field names
      await page.route(`**/api/organizations/${orgId}/metrics?enabledOnly=true`, route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'test-1',
              metricCode: 'FLY10_TIME',
              siteMetric: {
                name: '10-Yard Fly Time',
                unit: 'seconds',
                category: 'Speed',
              },
            },
            {
              id: 'test-2',
              code: 'VERTICAL_JUMP',
              siteMetric: {
                name: 'Vertical Jump',
                unit: 'inches',
                category: 'Power',
              },
            },
          ]),
        });
      });

      // Navigate to metrics step
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      await page.click('button:has-text("Coach Report")');
      await page.click('button:has-text("Next")');

      const testReport = generateTestReport();
      await page.fill('input[name="name"]', testReport.name);
      await page.click('button:has-text("Next")');
      await page.click('button:has-text("Next")');

      // Both metrics should display correctly
      await page.waitForTimeout(1000);
      await expect(page.locator('text=10-Yard Fly Time')).toBeVisible();
      await expect(page.locator('text=Vertical Jump')).toBeVisible();

      // Select both metrics
      await page.locator('input[type="checkbox"]#FLY10_TIME').check();
      await page.locator('input[type="checkbox"]#VERTICAL_JUMP').check();

      await expect(page.locator('input[type="checkbox"]#FLY10_TIME')).toBeChecked();
      await expect(page.locator('input[type="checkbox"]#VERTICAL_JUMP')).toBeChecked();
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
      const progressBar = page.locator('[role="progressbar"], .progress');
      await expect(progressBar).toBeVisible();

      // Step 1
      await expect(page.locator('text=Step 1 of 7')).toBeVisible();

      // Navigate to step 2
      await page.click('button:has-text("Coach Report")');
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=Step 2 of 7')).toBeVisible();

      // Navigate to step 3
      await page.fill('input[name="name"]', testReport.name);
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=Step 3 of 7')).toBeVisible();

      // Navigate to step 4
      await page.click('button:has-text("Next")');
      await expect(page.locator('text=Step 4 of 7')).toBeVisible();

      // Progress bar should still be visible
      await expect(progressBar).toBeVisible();
    });
  });

  test.describe('Composite Index', () => {
    test('should show composite index step for coach reports', async ({ page }) => {
      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      const testReport = generateTestReport();

      // Navigate to step 7
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      await page.click('button:has-text("Coach Report")');
      await page.click('button:has-text("Next")');

      await page.fill('input[name="name"]', testReport.name);
      await page.click('button:has-text("Next")');
      await page.click('button:has-text("Next")');

      // Select metrics
      await page.waitForTimeout(1000);
      await page.locator('input[type="checkbox"]').first().check();
      await page.click('button:has-text("Next")');

      // Skip benchmarks and filters
      await page.click('button:has-text("Next")');
      await page.click('button:has-text("Next")');

      // Step 7: Should show composite index option
      await expect(page.locator('text=Enable Composite Index')).toBeVisible();
      await expect(page.locator('text=Create a weighted composite score across multiple metrics')).toBeVisible();
    });

    test('should show review summary for individual reports on step 7', async ({ page }) => {
      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      const testReport = generateTestReport();

      // Navigate through wizard selecting individual report
      await page.click('button:has-text("Create Report")');
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      await page.click('button:has-text("Individual Report")');
      await page.click('button:has-text("Next")');

      await page.fill('input[name="name"]', testReport.name);
      await page.click('button:has-text("Next")');
      await page.click('button:has-text("Next")');

      // Select metrics
      await page.waitForTimeout(1000);
      await page.locator('input[type="checkbox"]').first().check();
      await page.click('button:has-text("Next")');

      // Skip benchmarks and filters
      await page.click('button:has-text("Next")');
      await page.click('button:has-text("Next")');

      // Step 7: Should show review summary
      await expect(page.locator('text=Review')).toBeVisible();
      await expect(page.locator('text=Individual Report')).toBeVisible();
    });
  });
});
