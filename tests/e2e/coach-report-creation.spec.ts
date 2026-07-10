import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * COACH REPORTS FEATURE: End-to-End Tests
 *
 * TDD Approach: These tests are written BEFORE implementation
 * Expected: ALL TESTS WILL FAIL until backend and frontend are implemented
 *
 * Test Coverage:
 * - Navigate to reports page
 * - Create new coach report with wizard
 * - Configure timeframe (preset and custom)
 * - Select metrics
 * - Configure benchmarks (site + custom + user-defined)
 * - Set composite index weights
 * - Generate report and verify display
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

// Helper to generate unique test data
function generateTestReport() {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  return {
    name: `Coach Report ${uniqueId}`,
    description: `E2E test coach report created at ${new Date().toISOString()}`,
  };
}

test.describe('Coach Report Creation - TDD Tests', () => {
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

  test('should navigate to reports page', async ({ page }) => {
    // Navigate to reports page
    await page.goto(`${STAGING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    // Verify page loaded
    await expect(page).toHaveURL(/\/reports/);

    // Verify page title/heading
    await expect(page.locator('h1, h2').filter({ hasText: /Reports/i })).toBeVisible({ timeout: 5000 });
  });

  test('should show "Create Report" button', async ({ page }) => {
    await page.goto(`${STAGING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    // Verify "Create Report" or "New Report" button exists
    const createButton = page.locator('button').filter({ hasText: /Create Report|New Report/i });
    await expect(createButton).toBeVisible({ timeout: 5000 });
  });

  test('should open report wizard when clicking create button', async ({ page }) => {
    await page.goto(`${STAGING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    // Click "Create Report" button
    await page.click('button:has-text("Create Report"), button:has-text("New Report")');

    // Wait for wizard dialog/modal
    await page.waitForSelector('[role="dialog"], .report-wizard', { timeout: 5000 });

    // Verify wizard shows report type selection
    await expect(page.locator('text=Coach Report')).toBeVisible();
    await expect(page.locator('text=Individual Report')).toBeVisible();
  });

  test('should create a coach report with preset timeframe', async ({ page }) => {
    const testReport = generateTestReport();

    await page.goto(`${STAGING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    // Step 1: Open wizard and select "Coach Report"
    await page.click('button:has-text("Create Report"), button:has-text("New Report")');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    await page.click('button:has-text("Coach Report"), input[value="coach"] + label');

    // Step 2: Configure basic details
    await page.fill('input[name="name"], input[placeholder*="name"]', testReport.name);
    await page.fill('textarea[name="description"], textarea[placeholder*="description"]', testReport.description);

    // Click Next/Continue
    await page.click('button:has-text("Next"), button:has-text("Continue")');

    // Step 3: Select timeframe - preset option
    await page.click('button:has-text("Preset"), input[value="preset"] + label');
    await page.selectOption('select[name="preset"], select >> nth=0', 'season');

    // Click Next
    await page.click('button:has-text("Next"), button:has-text("Continue")');

    // Step 4: Select metrics (at least one)
    const metricCheckbox = page.locator('input[type="checkbox"]').first();
    await metricCheckbox.check();

    // Click Next
    await page.click('button:has-text("Next"), button:has-text("Continue")');

    // Step 5: Skip benchmarks for now (optional)
    await page.click('button:has-text("Skip"), button:has-text("Next"), button:has-text("Continue")');

    // Step 6: Skip composite index (optional)
    await page.click('button:has-text("Skip"), button:has-text("Next"), button:has-text("Continue")');

    // Step 7: Submit report creation
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/reports') && response.request().method() === 'POST'
    );

    await page.click('button:has-text("Create Report"), button[type="submit"]');

    // Capture report ID
    const response = await responsePromise;
    const data = await response.json();
    createdReportIds.push(data.id);

    // Verify success message
    await expect(page.locator('text=Report Created, text=Success')).toBeVisible({ timeout: 5000 });
  });

  test('should create a coach report with custom date range', async ({ page }) => {
    const testReport = generateTestReport();

    await page.goto(`${STAGING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    // Open wizard
    await page.click('button:has-text("Create Report"), button:has-text("New Report")');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Select Coach Report
    await page.click('button:has-text("Coach Report"), input[value="coach"] + label');

    // Fill basic details
    await page.fill('input[name="name"], input[placeholder*="name"]', testReport.name);
    await page.click('button:has-text("Next"), button:has-text("Continue")');

    // Select custom timeframe
    await page.click('button:has-text("Custom"), input[value="custom"] + label');

    // Fill date range
    const startDate = page.locator('input[type="date"], input[name="customStart"]').first();
    const endDate = page.locator('input[type="date"], input[name="customEnd"]').last();

    await startDate.fill('2024-01-01');
    await endDate.fill('2024-12-31');

    await page.click('button:has-text("Next")');

    // Select at least one metric
    await page.locator('input[type="checkbox"]').first().check();
    await page.click('button:has-text("Next")');

    // Skip remaining steps and create
    await page.click('button:has-text("Skip"), button:has-text("Next")'); // Benchmarks
    await page.click('button:has-text("Skip"), button:has-text("Next")'); // Composite index

    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/reports') && response.request().method() === 'POST'
    );

    await page.click('button:has-text("Create Report"), button[type="submit"]');

    const response = await responsePromise;
    const data = await response.json();
    createdReportIds.push(data.id);

    await expect(page.locator('text=Report Created, text=Success')).toBeVisible({ timeout: 5000 });
  });

  test('should configure composite index with weights', async ({ page }) => {
    const testReport = generateTestReport();

    await page.goto(`${STAGING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    // Create report and navigate to composite index step
    await page.click('button:has-text("Create Report"), button:has-text("New Report")');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    await page.click('button:has-text("Coach Report")');

    await page.fill('input[name="name"]', testReport.name);
    await page.click('button:has-text("Next")');

    // Timeframe
    await page.selectOption('select[name="preset"]', 'season');
    await page.click('button:has-text("Next")');

    // Select multiple metrics
    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    if (count >= 2) {
      await checkboxes.nth(0).check();
      await checkboxes.nth(1).check();
    }
    await page.click('button:has-text("Next")');

    // Skip benchmarks
    await page.click('button:has-text("Skip"), button:has-text("Next")');

    // Enable composite index
    await page.click('input[type="checkbox"][name="enableCompositeIndex"], button:has-text("Enable")');

    // Set weights (should equal 1.0 total)
    const weightInput = page.locator('input[type="number"], input[type="range"]').first();
    await weightInput.fill('0.5');

    await page.click('button:has-text("Next")');

    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/reports') && response.request().method() === 'POST'
    );

    await page.click('button:has-text("Create Report")');

    const response = await responsePromise;
    const data = await response.json();
    createdReportIds.push(data.id);

    // Verify composite index is in config
    expect(data.config.compositeIndex).toBeDefined();
    expect(data.config.compositeIndex.enabled).toBe(true);
  });

  test('should generate and display coach report', async ({ page }) => {
    // First, get user's organizationContext
    const userOrgId = await page.evaluate(() => {
      const authData = localStorage.getItem('auth');
      if (authData) {
        const parsed = JSON.parse(authData);
        return parsed.organizationContext || null;
      }
      return null;
    });

    // Create a report via API
    const testReport = generateTestReport();
    const createResponse = await page.request.post(`${STAGING_URL}/api/reports`, {
      data: {
        name: testReport.name,
        description: testReport.description,
        reportType: 'coach',
        organizationId: userOrgId, // REQUIRED: organizationId must be included
        config: {
          timeframe: { type: 'preset', preset: 'season' },
          metrics: ['FLY10_TIME'],
          filters: {}
        }
      }
    });

    const reportData = await createResponse.json();
    createdReportIds.push(reportData.id);

    // Navigate to report
    await page.goto(`${STAGING_URL}/reports/${reportData.id}`);
    await page.waitForLoadState('networkidle');

    // Click "Generate Report" button
    await page.click('button:has-text("Generate Report"), button:has-text("Run Report")');

    // Wait for report to load
    await page.waitForResponse(response =>
      response.url().includes(`/api/reports/${reportData.id}/generate`) &&
      response.request().method() === 'POST'
    );

    // Verify report displays
    await expect(page.locator('text=Performance Snapshot, text=Team Analysis')).toBeVisible({ timeout: 10000 });

    // Verify report has data tables
    await expect(page.locator('table, [role="table"]')).toBeVisible();
  });

  test('should display metric rankings (1-to-n)', async ({ page }) => {
    // Get user's organizationContext
    const userOrgId = await page.evaluate(() => {
      const authData = localStorage.getItem('auth');
      if (authData) {
        const parsed = JSON.parse(authData);
        return parsed.organizationContext || null;
      }
      return null;
    });

    // Create and generate a report
    const testReport = generateTestReport();
    const createResponse = await page.request.post(`${STAGING_URL}/api/reports`, {
      data: {
        name: testReport.name,
        reportType: 'coach',
        organizationId: userOrgId, // REQUIRED: organizationId must be included
        config: {
          timeframe: { type: 'preset', preset: 'season' },
          metrics: ['FLY10_TIME', 'VERTICAL_JUMP']
        }
      }
    });

    const reportData = await createResponse.json();
    createdReportIds.push(reportData.id);

    await page.goto(`${STAGING_URL}/reports/${reportData.id}`);
    await page.click('button:has-text("Generate Report")');

    // Wait for report generation
    await page.waitForTimeout(2000);

    // Verify metric ranking sections exist
    await expect(page.locator('text=FLY10_TIME Rankings, text=10-Yard Fly')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=VERTICAL_JUMP Rankings, text=Vertical Jump')).toBeVisible({ timeout: 5000 });

    // Verify ranking numbers (1, 2, 3, etc.)
    await expect(page.locator('text=1., text=#1')).toBeVisible();
  });

  test('should display composite index rankings when enabled', async ({ page }) => {
    // Get user's organizationContext
    const userOrgId = await page.evaluate(() => {
      const authData = localStorage.getItem('auth');
      if (authData) {
        const parsed = JSON.parse(authData);
        return parsed.organizationContext || null;
      }
      return null;
    });

    const testReport = generateTestReport();
    const createResponse = await page.request.post(`${STAGING_URL}/api/reports`, {
      data: {
        name: testReport.name,
        reportType: 'coach',
        organizationId: userOrgId, // REQUIRED: organizationId must be included
        config: {
          timeframe: { type: 'preset', preset: 'season' },
          metrics: ['FLY10_TIME', 'VERTICAL_JUMP'],
          compositeIndex: {
            enabled: true,
            weights: { 'FLY10_TIME': 0.6, 'VERTICAL_JUMP': 0.4 }
          }
        }
      }
    });

    const reportData = await createResponse.json();
    createdReportIds.push(reportData.id);

    await page.goto(`${STAGING_URL}/reports/${reportData.id}`);
    await page.click('button:has-text("Generate Report")');

    await page.waitForTimeout(2000);

    // Verify composite index section
    await expect(page.locator('text=Composite Index, text=Overall Rankings')).toBeVisible({ timeout: 5000 });

    // Verify composite score displayed
    await expect(page.locator('text=Score, text=Index')).toBeVisible();
  });
});
