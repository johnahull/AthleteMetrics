import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * INDIVIDUAL REPORTS FEATURE: End-to-End Tests
 *
 * TDD Approach: These tests are written BEFORE implementation
 * Expected: ALL TESTS WILL FAIL until backend and frontend are implemented
 *
 * Test Coverage:
 * - Create individual report
 * - Select athletes/teams
 * - Configure timeframe and metrics
 * - Display athlete performance with team rankings
 * - Show percentile rankings
 * - Compare against benchmarks
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

function generateTestReport() {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  return {
    name: `Individual Report ${uniqueId}`,
    description: `E2E test individual report created at ${new Date().toISOString()}`,
  };
}

// Skip all tests - Individual Reports feature not yet implemented (TDD tests)
test.describe.skip('Individual Report Creation - TDD Tests', () => {
  let createdReportIds: string[] = [];

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    createdReportIds = [];
  });

  test.afterEach(async ({ page }) => {
    for (const reportId of createdReportIds) {
      try {
        await page.request.delete(`${STAGING_URL}/api/reports/${reportId}`);
      } catch (error) {
        console.warn(`Failed to cleanup report ${reportId}:`, error);
      }
    }
  });

  test('should create an individual report for specific athletes', async ({ page }) => {
    const testReport = generateTestReport();

    await page.goto(`${STAGING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    // Open wizard
    await page.click('button:has-text("Create Report"), button:has-text("New Report")');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Select Individual Report
    await page.click('button:has-text("Individual Report"), input[value="individual"] + label');

    // Fill basic details
    await page.fill('input[name="name"]', testReport.name);
    await page.fill('textarea[name="description"]', testReport.description);
    await page.click('button:has-text("Next")');

    // Select athletes (at least one)
    const athleteCheckbox = page.locator('input[type="checkbox"][data-athlete-id], input[type="checkbox"]').first();
    await athleteCheckbox.check();

    await page.click('button:has-text("Next")');

    // Select timeframe
    await page.selectOption('select[name="preset"]', 'season');
    await page.click('button:has-text("Next")');

    // Select metrics
    await page.locator('input[type="checkbox"]').first().check();
    await page.click('button:has-text("Next")');

    // Skip benchmarks
    await page.click('button:has-text("Skip"), button:has-text("Next")');

    // Submit
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/reports') && response.request().method() === 'POST'
    );

    await page.click('button:has-text("Create Report")');

    const response = await responsePromise;
    const data = await response.json();
    createdReportIds.push(data.id);

    await expect(page.locator('text=Report Created, text=Success')).toBeVisible({ timeout: 5000 });
  });

  test('should create individual report for all athletes on a team', async ({ page }) => {
    const testReport = generateTestReport();

    await page.goto(`${STAGING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    await page.click('button:has-text("Create Report")');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Select Individual Report
    await page.click('button:has-text("Individual Report")');

    await page.fill('input[name="name"]', testReport.name);
    await page.click('button:has-text("Next")');

    // Select by team (generates reports for all team members)
    await page.click('button:has-text("Select by Team"), input[value="team"] + label');

    const teamCheckbox = page.locator('input[type="checkbox"][data-team-id], input[type="checkbox"]').first();
    await teamCheckbox.check();

    await page.click('button:has-text("Next")');

    // Timeframe
    await page.selectOption('select[name="preset"]', 'season');
    await page.click('button:has-text("Next")');

    // Metrics
    await page.locator('input[type="checkbox"]').first().check();
    await page.click('button:has-text("Next")');

    // Skip benchmarks
    await page.click('button:has-text("Skip"), button:has-text("Next")');

    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/reports') && response.request().method() === 'POST'
    );

    await page.click('button:has-text("Create Report")');

    const response = await responsePromise;
    const data = await response.json();
    createdReportIds.push(data.id);

    await expect(page.locator('text=Report Created')).toBeVisible({ timeout: 5000 });
  });

  test('should display athlete performance with team rank', async ({ page }) => {
    // Get user's organizationContext
    const userOrgId = await page.evaluate(() => {
      const authData = localStorage.getItem('auth');
      if (authData) {
        const parsed = JSON.parse(authData);
        return parsed.organizationContext || null;
      }
      return null;
    });

    // Create individual report via API
    const testReport = generateTestReport();
    const createResponse = await page.request.post(`${STAGING_URL}/api/reports`, {
      data: {
        name: testReport.name,
        reportType: 'individual',
        organizationId: userOrgId, // REQUIRED: organizationId must be included
        config: {
          timeframe: { type: 'preset', preset: 'season' },
          metrics: ['FLY10_TIME'],
          filters: {
            // Specific athlete IDs would be set here
          }
        }
      }
    });

    const reportData = await createResponse.json();
    createdReportIds.push(reportData.id);

    // Navigate to report
    await page.goto(`${STAGING_URL}/reports/${reportData.id}`);
    await page.waitForLoadState('networkidle');

    // Generate report
    await page.click('button:has-text("Generate Report")');
    await page.waitForTimeout(2000);

    // Verify athlete header with name and team
    await expect(page.locator('text=Athlete, h1, h2')).toBeVisible({ timeout: 5000 });

    // Verify performance table with team rank
    await expect(page.locator('text=Team Rank, text=Rank')).toBeVisible();

    // Verify rank is displayed (e.g., "3 of 15", "#3")
    await expect(page.locator('table, [role="table"]')).toBeVisible();
  });

  test('should display percentile ranking for athlete', async ({ page }) => {
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
        reportType: 'individual',
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
    await page.waitForTimeout(2000);

    // Verify percentile column exists
    await expect(page.locator('text=Percentile, text=%ile, text=Team %')).toBeVisible({ timeout: 5000 });

    // Verify percentile value is displayed (e.g., "85th", "72%")
    await expect(page.locator('td, [role="cell"]').filter({ hasText: /\d+%|\d+th/ })).toBeVisible();
  });

  test('should display benchmark comparisons', async ({ page }) => {
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
        reportType: 'individual',
        organizationId: userOrgId, // REQUIRED: organizationId must be included
        config: {
          timeframe: { type: 'preset', preset: 'season' },
          metrics: ['FLY10_TIME'],
          benchmarks: {
            site: [], // Site benchmark IDs would be here
            userDefined: [
              { metricCode: 'FLY10_TIME', value: 1.30, label: 'Elite Target' }
            ]
          }
        }
      }
    });

    const reportData = await createResponse.json();
    createdReportIds.push(reportData.id);

    await page.goto(`${STAGING_URL}/reports/${reportData.id}`);
    await page.click('button:has-text("Generate Report")');
    await page.waitForTimeout(2000);

    // Verify benchmark comparison section
    await expect(page.locator('text=Benchmarks, text=Elite Target')).toBeVisible({ timeout: 5000 });

    // Verify athlete's performance vs benchmark
    await expect(page.locator('text=vs., text=compared to')).toBeVisible();
  });

  test('should show personal bests for athlete', async ({ page }) => {
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
        reportType: 'individual',
        organizationId: userOrgId, // REQUIRED: organizationId must be included
        config: {
          timeframe: { type: 'preset', preset: 'all_time' },
          metrics: ['FLY10_TIME', 'VERTICAL_JUMP']
        }
      }
    });

    const reportData = await createResponse.json();
    createdReportIds.push(reportData.id);

    await page.goto(`${STAGING_URL}/reports/${reportData.id}`);
    await page.click('button:has-text("Generate Report")');
    await page.waitForTimeout(2000);

    // Verify personal bests section
    await expect(page.locator('text=Best, text=Personal Best, text=PR')).toBeVisible({ timeout: 5000 });

    // Verify best values are displayed
    await expect(page.locator('table')).toBeVisible();
  });

  test('should list report for each selected athlete', async ({ page }) => {
    // Get user's organizationContext
    const userOrgId = await page.evaluate(() => {
      const authData = localStorage.getItem('auth');
      if (authData) {
        const parsed = JSON.parse(authData);
        return parsed.organizationContext || null;
      }
      return null;
    });

    // Create individual report for multiple athletes
    const testReport = generateTestReport();
    const createResponse = await page.request.post(`${STAGING_URL}/api/reports`, {
      data: {
        name: testReport.name,
        reportType: 'individual',
        organizationId: userOrgId, // REQUIRED: organizationId must be included
        config: {
          timeframe: { type: 'preset', preset: 'season' },
          metrics: ['FLY10_TIME'],
          filters: {
            // Multiple athlete IDs
          }
        }
      }
    });

    const reportData = await createResponse.json();
    createdReportIds.push(reportData.id);

    await page.goto(`${STAGING_URL}/reports/${reportData.id}`);
    await page.click('button:has-text("Generate Report")');
    await page.waitForTimeout(2000);

    // Verify multiple athlete sections or list
    const athleteSections = page.locator('[data-athlete-section], .athlete-report-card');
    const count = await athleteSections.count();

    // Should have at least one athlete section
    expect(count).toBeGreaterThan(0);
  });
});
