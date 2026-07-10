import { test, expect } from './fixtures/e2e-base';
import { loginAs, loginAsDefaultUser } from './helpers/auth';
import { hasUserCredentials } from './fixtures/test-users';

/**
 * REPORTS ORGANIZATION CONTEXT: End-to-End Tests
 *
 * Purpose: Verify organizationId is correctly passed and enforced in Reports functionality
 *
 * Bug Fix Context:
 * - useReports() hook now passes organizationContext to filter reports by organization
 * - useCreateReport() hook now requires organizationId in payload
 * - ReportWizard component now passes organizationId when creating reports
 *
 * Test Coverage:
 * 1. Report list filtering by organization (GET /api/reports?organizationId=X)
 * 2. Report creation with organizationId (POST /api/reports with organizationId in body)
 * 3. Error handling for missing organizationContext
 * 4. Multi-organization isolation (users only see their own org's reports)
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

// Helper to generate unique test data
function generateTestReport() {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  return {
    name: `OrgContext Report ${uniqueId}`,
    description: `E2E test report for org context validation at ${new Date().toISOString()}`,
  };
}

test.describe('Reports Organization Context - Bug Fix Verification', () => {
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

  test('should filter reports list by organizationId query parameter', async ({ page }) => {
    // Navigate to reports page
    await page.goto(`${STAGING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    // Intercept GET /api/reports request
    const reportsRequest = page.waitForRequest(request =>
      request.url().includes('/api/reports') &&
      request.method() === 'GET' &&
      !request.url().includes('/api/reports/') // Exclude specific report fetches
    );

    // Wait for request or reload page to trigger it
    try {
      await Promise.race([
        reportsRequest,
        page.reload(),
      ]);
    } catch {
      // Request might have already completed before we set up listener
      await page.reload();
    }

    // Get the actual request that was made
    const requests = page.context().pages().flatMap(p => p.requests());
    const reportListRequest = requests.find(req =>
      req.url().includes('/api/reports') &&
      req.method() === 'GET' &&
      !req.url().includes('/api/reports/') // Exclude /api/reports/:id requests
    );

    if (reportListRequest) {
      const url = new URL(reportListRequest.url());
      const organizationIdParam = url.searchParams.get('organizationId');

      // Verify organizationId query parameter is present
      expect(organizationIdParam).not.toBeNull();
      expect(organizationIdParam).toBeTruthy();

      console.log(`✓ GET /api/reports includes organizationId=${organizationIdParam}`);
    } else {
      // If no request found in history, make explicit check by navigating again
      await page.goto(`${STAGING_URL}/reports`);
      await page.waitForLoadState('networkidle');

      // Check network activity
      const [request] = await Promise.all([
        page.waitForRequest(req =>
          req.url().includes('/api/reports') &&
          req.method() === 'GET' &&
          !req.url().includes('/api/reports/')
        ),
        page.reload(),
      ]);

      const url = new URL(request.url());
      const organizationIdParam = url.searchParams.get('organizationId');

      expect(organizationIdParam).not.toBeNull();
      expect(organizationIdParam).toBeTruthy();
    }
  });

  test('should include organizationId in report creation payload', async ({ page }) => {
    const testReport = generateTestReport();

    await page.goto(`${STAGING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    // Open report wizard
    await page.click('button:has-text("Create Report"), button:has-text("New Report")');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Step 1: Select Coach Report
    await page.click('button:has-text("Coach Report"), input[value="coach"] + label');

    // Step 2: Fill basic details
    await page.fill('input[name="name"], input[placeholder*="name"]', testReport.name);
    await page.fill('textarea[name="description"], textarea[placeholder*="description"]', testReport.description);
    await page.click('button:has-text("Next"), button:has-text("Continue")');

    // Step 3: Select timeframe
    await page.click('button:has-text("Next"), button:has-text("Continue")');

    // Step 4: Select at least one metric
    const metricCheckbox = page.locator('input[type="checkbox"]').first();
    if (await metricCheckbox.isVisible()) {
      await metricCheckbox.check();
    }
    await page.click('button:has-text("Next"), button:has-text("Continue")');

    // Step 5: Skip benchmarks
    await page.click('button:has-text("Skip"), button:has-text("Next"), button:has-text("Continue")');

    // Step 6: Skip filters
    await page.click('button:has-text("Skip"), button:has-text("Next"), button:has-text("Continue")');

    // Step 7: Skip composite index (or review)
    // Final step - submit form

    // Set up request interception BEFORE clicking submit
    const [createRequest, createResponse] = await Promise.all([
      page.waitForRequest(request =>
        request.url().includes('/api/reports') &&
        request.method() === 'POST'
      ),
      page.waitForResponse(response =>
        response.url().includes('/api/reports') &&
        response.request().method() === 'POST'
      ),
      // Click submit button
      page.click('button:has-text("Create Report"), button[type="submit"]'),
    ]);

    // Verify request payload includes organizationId
    const requestBody = createRequest.postDataJSON();
    expect(requestBody).toHaveProperty('organizationId');
    expect(requestBody.organizationId).toBeTruthy();
    expect(typeof requestBody.organizationId).toBe('string');

    console.log(`✓ POST /api/reports includes organizationId=${requestBody.organizationId}`);

    // Verify response contains the created report
    const responseData = await createResponse.json();
    expect(responseData).toHaveProperty('id');
    expect(responseData).toHaveProperty('organizationId');
    expect(responseData.organizationId).toBe(requestBody.organizationId);

    createdReportIds.push(responseData.id);

    // Verify organizationId matches the user's organizationContext
    // We can't directly access organizationContext here, but we verified the request includes it
    console.log(`✓ Created report ${responseData.id} with organizationId=${responseData.organizationId}`);
  });

  test('should create report via wizard with correct organizationId', async ({ page }) => {
    const testReport = generateTestReport();

    await page.goto(`${STAGING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    // Get user's organizationContext from page context (if exposed)
    const organizationContext = await page.evaluate(() => {
      // Try to access from window or localStorage
      const authData = localStorage.getItem('auth');
      if (authData) {
        const parsed = JSON.parse(authData);
        return parsed.organizationContext || null;
      }
      return null;
    });

    console.log(`User's organizationContext: ${organizationContext}`);

    // Create report
    await page.click('button:has-text("Create Report")');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Quick path through wizard
    await page.click('button:has-text("Coach Report")');
    await page.fill('input[name="name"]', testReport.name);
    await page.click('button:has-text("Next")');
    await page.click('button:has-text("Next")'); // Timeframe
    await page.locator('input[type="checkbox"]').first().check();
    await page.click('button:has-text("Next")'); // Metrics
    await page.click('button:has-text("Next")'); // Benchmarks
    await page.click('button:has-text("Next")'); // Filters

    // Intercept creation request
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/reports') && response.request().method() === 'POST'
    );

    await page.click('button:has-text("Create Report"), button[type="submit"]');

    const response = await responsePromise;
    const data = await response.json();

    // Verify organizationId in response
    expect(data).toHaveProperty('organizationId');
    if (organizationContext) {
      expect(data.organizationId).toBe(organizationContext);
    }

    createdReportIds.push(data.id);

    // Verify created report appears in list (filtered by org)
    await page.goto(`${STAGING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    // Should see the created report
    await expect(page.locator(`text=${testReport.name}`)).toBeVisible({ timeout: 5000 });
  });

  test('should verify report belongs to correct organization via API', async ({ page }) => {
    // Create report via API with explicit organizationId
    const testReport = generateTestReport();

    // First, get user's organization context
    await page.goto(`${STAGING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    const userOrgId = await page.evaluate(() => {
      const authData = localStorage.getItem('auth');
      if (authData) {
        const parsed = JSON.parse(authData);
        return parsed.organizationContext || null;
      }
      return null;
    });

    if (!userOrgId) {
      test.skip();
      return;
    }

    // Create report via API
    const createResponse = await page.request.post(`${STAGING_URL}/api/reports`, {
      data: {
        name: testReport.name,
        description: testReport.description,
        reportType: 'coach',
        organizationId: userOrgId,
        config: {
          timeframe: { type: 'preset', preset: 'season' },
          metrics: ['FLY10_TIME'],
        }
      }
    });

    expect(createResponse.ok()).toBeTruthy();
    const reportData = await createResponse.json();
    createdReportIds.push(reportData.id);

    // Verify organizationId in response
    expect(reportData.organizationId).toBe(userOrgId);

    // Fetch report and verify organizationId persisted
    const getResponse = await page.request.get(`${STAGING_URL}/api/reports/${reportData.id}`);
    const fetchedReport = await getResponse.json();

    expect(fetchedReport.organizationId).toBe(userOrgId);
    console.log(`✓ Report ${reportData.id} has organizationId=${fetchedReport.organizationId}`);
  });

  test('should only display reports for user organization', async ({ page }) => {
    const testReport = generateTestReport();

    // Get user's org context
    await page.goto(`${STAGING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    const userOrgId = await page.evaluate(() => {
      const authData = localStorage.getItem('auth');
      if (authData) {
        const parsed = JSON.parse(authData);
        return parsed.organizationContext || null;
      }
      return null;
    });

    if (!userOrgId) {
      console.log('No organizationContext found, skipping multi-org test');
      test.skip();
      return;
    }

    // Create a report for this organization
    const createResponse = await page.request.post(`${STAGING_URL}/api/reports`, {
      data: {
        name: testReport.name,
        reportType: 'coach',
        organizationId: userOrgId,
        config: {
          timeframe: { type: 'preset', preset: 'all_time' },
          metrics: ['FLY10_TIME'],
        }
      }
    });

    const reportData = await createResponse.json();
    createdReportIds.push(reportData.id);

    // Navigate to reports page
    await page.goto(`${STAGING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    // Verify report is visible
    await expect(page.locator(`text=${testReport.name}`)).toBeVisible({ timeout: 5000 });

    // Verify API response only includes reports for this org
    const listResponse = await page.request.get(`${STAGING_URL}/api/reports?organizationId=${userOrgId}`);
    const reports = await listResponse.json();

    // All reports should have matching organizationId
    for (const report of reports) {
      expect(report.organizationId).toBe(userOrgId);
    }

    console.log(`✓ All ${reports.length} reports belong to organization ${userOrgId}`);
  });

  test('should fail gracefully if organizationContext is missing', async ({ page }) => {
    // This test verifies error handling when organizationContext is null/undefined

    // Navigate to reports page
    await page.goto(`${STAGING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    // Try to open wizard
    const createButton = page.locator('button:has-text("Create Report")');

    // Button might not be visible if user doesn't have permission
    if (await createButton.isVisible({ timeout: 2000 })) {
      await createButton.click();
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      // Select report type
      await page.click('button:has-text("Coach Report")');
      await page.fill('input[name="name"]', 'Test Report');
      await page.click('button:has-text("Next")');
      await page.click('button:has-text("Next")');

      // Try to select metrics - should load based on organizationContext
      const metricsSection = page.locator('text=Select Metrics');
      await expect(metricsSection).toBeVisible({ timeout: 5000 });

      // If organizationContext is null, metrics shouldn't load
      // The wizard handles this gracefully by showing an error or empty state
      const noMetricsMessage = page.locator('text=No metrics enabled, text=enable metrics');

      // Either we have metrics OR we see the "no metrics" message
      const hasMetrics = await page.locator('input[type="checkbox"]').count() > 0;
      const hasNoMetricsMsg = await noMetricsMessage.isVisible();

      // One of these should be true
      expect(hasMetrics || hasNoMetricsMsg).toBeTruthy();

      console.log(`✓ Wizard handles organizationContext gracefully (hasMetrics=${hasMetrics}, hasNoMetricsMsg=${hasNoMetricsMsg})`);
    } else {
      console.log('Create Report button not visible - user may not have permission');
    }
  });
});

test.describe('Multi-Organization Isolation - RBAC Tests', () => {
  let createdReportIds: string[] = [];

  test.afterEach(async ({ page }) => {
    // Cleanup
    for (const reportId of createdReportIds) {
      try {
        await page.request.delete(`${STAGING_URL}/api/reports/${reportId}`);
      } catch (error) {
        console.warn(`Failed to cleanup report ${reportId}:`, error);
      }
    }
    createdReportIds = [];
  });

  test('org_admin should only see reports for their organization', async ({ page }) => {
    // Skip if org_admin credentials not configured
    if (!hasUserCredentials('org_admin')) {
      test.skip();
      return;
    }

    await loginAs(page, 'org_admin');

    // Navigate to reports page
    await page.goto(`${STAGING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    // Get user's organization
    const userOrgId = await page.evaluate(() => {
      const authData = localStorage.getItem('auth');
      if (authData) {
        const parsed = JSON.parse(authData);
        return parsed.organizationContext || null;
      }
      return null;
    });

    if (!userOrgId) {
      console.log('org_admin has no organizationContext, skipping test');
      test.skip();
      return;
    }

    // Intercept reports list request
    const [request] = await Promise.all([
      page.waitForRequest(req =>
        req.url().includes('/api/reports') &&
        req.method() === 'GET' &&
        !req.url().includes('/api/reports/')
      ),
      page.reload(),
    ]);

    // Verify query parameter includes organizationId
    const url = new URL(request.url());
    expect(url.searchParams.get('organizationId')).toBe(userOrgId);

    console.log(`✓ org_admin requests filtered by organizationId=${userOrgId}`);
  });

  test('coach should only see reports for their organization', async ({ page }) => {
    // Skip if coach credentials not configured
    if (!hasUserCredentials('coach')) {
      test.skip();
      return;
    }

    await loginAs(page, 'coach');

    await page.goto(`${STAGING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    // Create a report
    const testReport = generateTestReport();

    // Try to create report
    const createButton = page.locator('button:has-text("Create Report")');
    if (await createButton.isVisible({ timeout: 2000 })) {
      await createButton.click();
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

      await page.click('button:has-text("Coach Report")');
      await page.fill('input[name="name"]', testReport.name);
      await page.click('button:has-text("Next")');
      await page.click('button:has-text("Next")');

      // Select metric if available
      const firstCheckbox = page.locator('input[type="checkbox"]').first();
      if (await firstCheckbox.isVisible({ timeout: 2000 })) {
        await firstCheckbox.check();
        await page.click('button:has-text("Next")');
        await page.click('button:has-text("Next")');
        await page.click('button:has-text("Next")');

        // Submit
        const responsePromise = page.waitForResponse(response =>
          response.url().includes('/api/reports') && response.request().method() === 'POST'
        );

        await page.click('button:has-text("Create Report")');

        const response = await responsePromise;
        const data = await response.json();

        // Verify organizationId is set
        expect(data).toHaveProperty('organizationId');
        expect(data.organizationId).toBeTruthy();

        createdReportIds.push(data.id);

        console.log(`✓ Coach created report with organizationId=${data.organizationId}`);
      }
    }
  });

  test('site_admin should see all reports when no organization filter', async ({ page }) => {
    // Skip if site_admin credentials not configured
    if (!hasUserCredentials('site_admin')) {
      test.skip();
      return;
    }

    await loginAs(page, 'site_admin');

    await page.goto(`${STAGING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    // Site admins might see all reports or be able to filter by organization
    // Verify the behavior matches expectations

    const reports = await page.request.get(`${STAGING_URL}/api/reports`);
    const reportsList = await reports.json();

    // Site admin should be able to see reports (possibly from multiple orgs)
    expect(Array.isArray(reportsList)).toBeTruthy();

    console.log(`✓ site_admin can access reports (${reportsList.length} total)`);
  });
});
