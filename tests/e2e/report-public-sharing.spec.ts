import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * REPORT PUBLIC SHARING: End-to-End Tests
 *
 * TDD Approach: These tests are written BEFORE implementation
 * Expected: ALL TESTS WILL FAIL until public sharing is implemented
 *
 * Test Coverage:
 * - Create public snapshot with expiration
 * - Access public report without authentication
 * - Verify read-only snapshot (frozen data)
 * - Revoke public link
 * - Verify expired links return 404/410
 * - Track view count
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

function generateTestReport() {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  return {
    name: `Shared Report ${uniqueId}`,
    description: `E2E test shared report created at ${new Date().toISOString()}`,
  };
}

// Helper to get user's organizationContext from page
async function getUserOrgId(page: any): Promise<string | null> {
  return await page.evaluate(() => {
    const authData = localStorage.getItem('auth');
    if (authData) {
      const parsed = JSON.parse(authData);
      return parsed.organizationContext || null;
    }
    return null;
  });
}

test.describe('Report Public Sharing - TDD Tests', () => {
  let createdReportIds: string[] = [];
  let createdSnapshotIds: string[] = [];

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    createdReportIds = [];
    createdSnapshotIds = [];
  });

  test.afterEach(async ({ page }) => {
    // Cleanup snapshots first
    for (const snapshotId of createdSnapshotIds) {
      try {
        await page.request.delete(`${STAGING_URL}/api/reports/snapshots/${snapshotId}`);
      } catch (error) {
        console.warn(`Failed to cleanup snapshot ${snapshotId}:`, error);
      }
    }

    // Then cleanup reports
    for (const reportId of createdReportIds) {
      try {
        await page.request.delete(`${STAGING_URL}/api/reports/${reportId}`);
      } catch (error) {
        console.warn(`Failed to cleanup report ${reportId}:`, error);
      }
    }
  });

  test('should show share button on generated report', async ({ page }) => {
    const userOrgId = await getUserOrgId(page);
    const testReport = generateTestReport();
    const createResponse = await page.request.post(`${STAGING_URL}/api/reports`, {
      data: {
        name: testReport.name,
        reportType: 'coach',
        organizationId: userOrgId, // REQUIRED: organizationId must be included
        config: {
          timeframe: { type: 'preset', preset: 'season' },
          metrics: ['FLY10_TIME']
        }
      }
    });

    const reportData = await createResponse.json();
    createdReportIds.push(reportData.id);

    await page.goto(`${STAGING_URL}/reports/${reportData.id}`);
    await page.click('button:has-text("Generate Report")');
    await page.waitForTimeout(2000);

    // Verify share button exists
    await expect(page.locator('button:has-text("Share"), button:has-text("Create Link")')).toBeVisible({ timeout: 5000 });
  });

  test('should open share dialog with expiration options', async ({ page }) => {
    const userOrgId = await getUserOrgId(page);
    const testReport = generateTestReport();
    const createResponse = await page.request.post(`${STAGING_URL}/api/reports`, {
      data: {
        name: testReport.name,
        reportType: 'coach',
        organizationId: userOrgId,
        config: {
          timeframe: { type: 'preset', preset: 'season' },
          metrics: ['FLY10_TIME']
        }
      }
    });

    const reportData = await createResponse.json();
    createdReportIds.push(reportData.id);

    await page.goto(`${STAGING_URL}/reports/${reportData.id}`);
    await page.click('button:has-text("Generate Report")');
    await page.waitForTimeout(2000);

    // Click share button
    await page.click('button:has-text("Share"), button:has-text("Create Link")');

    // Wait for share dialog
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Verify expiration options exist
    await expect(page.locator('select, button:has-text("1 day"), button:has-text("7 days"), button:has-text("30 days")')).toBeVisible();
  });

  test('should create public snapshot and return shareable URL', async ({ page }) => {
    const userOrgId = await getUserOrgId(page);
    const testReport = generateTestReport();
    const createResponse = await page.request.post(`${STAGING_URL}/api/reports`, {
      data: {
        name: testReport.name,
        reportType: 'coach',
        organizationId: userOrgId,
        config: {
          timeframe: { type: 'preset', preset: 'season' },
          metrics: ['FLY10_TIME']
        }
      }
    });

    const reportData = await createResponse.json();
    createdReportIds.push(reportData.id);

    await page.goto(`${STAGING_URL}/reports/${reportData.id}`);
    await page.click('button:has-text("Generate Report")');
    await page.waitForTimeout(2000);

    await page.click('button:has-text("Share")');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Select 7 day expiration
    await page.click('button:has-text("7 days"), select option[value="7"]');

    // Listen for snapshot creation API call
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/reports/') &&
      response.url().includes('/snapshots') &&
      response.request().method() === 'POST'
    );

    // Click create link button
    await page.click('button:has-text("Create Link"), button:has-text("Generate")');

    const response = await responsePromise;
    const snapshotData = await response.json();

    createdSnapshotIds.push(snapshotData.id);

    // Verify public URL is displayed
    const publicUrlInput = page.locator('input[readonly], input[disabled]').filter({ hasText: /\/public\/reports\// });
    await expect(publicUrlInput).toBeVisible({ timeout: 5000 });

    // Verify URL contains token
    const url = await publicUrlInput.inputValue();
    expect(url).toContain('/public/reports/');
    expect(url.split('/').pop()).toHaveLength(21); // nanoid default length
  });

  test('should access public report without authentication', async ({ page, context }) => {
    // First, create a report and snapshot while authenticated
    const userOrgId = await getUserOrgId(page);
    const testReport = generateTestReport();
    const createResponse = await page.request.post(`${STAGING_URL}/api/reports`, {
      data: {
        name: testReport.name,
        reportType: 'coach',
        organizationId: userOrgId,
        config: {
          timeframe: { type: 'preset', preset: 'season' },
          metrics: ['FLY10_TIME']
        }
      }
    });

    const reportData = await createResponse.json();
    createdReportIds.push(reportData.id);

    // Create snapshot via API
    const snapshotResponse = await page.request.post(`${STAGING_URL}/api/reports/${reportData.id}/snapshots`, {
      data: {
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
      }
    });

    const snapshotData = await snapshotResponse.json();
    createdSnapshotIds.push(snapshotData.id);

    const publicToken = snapshotData.publicToken;
    const publicUrl = `${STAGING_URL}/public/reports/${publicToken}`;

    // Now open in incognito/new context (no authentication)
    const incognitoContext = await context.browser()!.newContext();
    const incognitoPage = await incognitoContext.newPage();

    try {
      // Navigate to public URL
      await incognitoPage.goto(publicUrl);
      await incognitoPage.waitForLoadState('networkidle');

      // Verify report is displayed without login
      await expect(incognitoPage.locator('text=Performance, text=Report')).toBeVisible({ timeout: 5000 });

      // Verify data tables are visible
      await expect(incognitoPage.locator('table, [role="table"]')).toBeVisible();

      // Verify NO edit/delete buttons (read-only)
      await expect(incognitoPage.locator('button:has-text("Edit"), button:has-text("Delete")')).not.toBeVisible();

    } finally {
      await incognitoPage.close();
      await incognitoContext.close();
    }
  });

  test('should display frozen snapshot data (not live)', async ({ page, context }) => {
    const userOrgId = await getUserOrgId(page);
    const testReport = generateTestReport();
    const createResponse = await page.request.post(`${STAGING_URL}/api/reports`, {
      data: {
        name: testReport.name,
        reportType: 'coach',
        organizationId: userOrgId,
        config: {
          timeframe: { type: 'preset', preset: 'season' },
          metrics: ['FLY10_TIME']
        }
      }
    });

    const reportData = await createResponse.json();
    createdReportIds.push(reportData.id);

    // Create snapshot
    const snapshotResponse = await page.request.post(`${STAGING_URL}/api/reports/${reportData.id}/snapshots`, {
      data: {
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }
    });

    const snapshotData = await snapshotResponse.json();
    createdSnapshotIds.push(snapshotData.id);

    const publicToken = snapshotData.publicToken;
    const publicUrl = `${STAGING_URL}/public/reports/${publicToken}`;

    // Verify snapshot has frozen data
    expect(snapshotData.snapshotData).toBeDefined();
    expect(snapshotData.snapshotData.generatedAt).toBeDefined();
    expect(snapshotData.snapshotData.dataSnapshot).toBeDefined();

    // Access public URL
    const incognitoContext = await context.browser()!.newContext();
    const incognitoPage = await incognitoContext.newPage();

    try {
      await incognitoPage.goto(publicUrl);
      await incognitoPage.waitForLoadState('networkidle');

      // Verify "Generated on" timestamp is displayed
      await expect(incognitoPage.locator('text=Generated on, text=Snapshot from')).toBeVisible({ timeout: 5000 });

    } finally {
      await incognitoPage.close();
      await incognitoContext.close();
    }
  });

  test('should revoke public link', async ({ page }) => {
    const userOrgId = await getUserOrgId(page);
    const testReport = generateTestReport();
    const createResponse = await page.request.post(`${STAGING_URL}/api/reports`, {
      data: {
        name: testReport.name,
        reportType: 'coach',
        organizationId: userOrgId,
        config: {
          timeframe: { type: 'preset', preset: 'season' },
          metrics: ['FLY10_TIME']
        }
      }
    });

    const reportData = await createResponse.json();
    createdReportIds.push(reportData.id);

    // Create snapshot
    const snapshotResponse = await page.request.post(`${STAGING_URL}/api/reports/${reportData.id}/snapshots`, {
      data: {
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }
    });

    const snapshotData = await snapshotResponse.json();
    const snapshotId = snapshotData.id;

    // Navigate to report to see snapshots
    await page.goto(`${STAGING_URL}/reports/${reportData.id}`);
    await page.click('button:has-text("Share")');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Find and click revoke button
    await page.click(`button:has-text("Revoke"), button[data-snapshot-id="${snapshotId}"]:has-text("Delete")`);

    // Confirm revocation
    await page.click('button:has-text("Confirm"), button:has-text("Yes")');

    // Verify snapshot is revoked via API
    const checkResponse = await page.request.get(`${STAGING_URL}/api/public/reports/${snapshotData.publicToken}`);
    expect(checkResponse.status()).toBe(404);
  });

  test('should return 404 for expired public link', async ({ page, context }) => {
    const userOrgId = await getUserOrgId(page);
    const testReport = generateTestReport();
    const createResponse = await page.request.post(`${STAGING_URL}/api/reports`, {
      data: {
        name: testReport.name,
        reportType: 'coach',
        organizationId: userOrgId,
        config: {
          timeframe: { type: 'preset', preset: 'season' },
          metrics: ['FLY10_TIME']
        }
      }
    });

    const reportData = await createResponse.json();
    createdReportIds.push(reportData.id);

    // Create snapshot that expires immediately
    const snapshotResponse = await page.request.post(`${STAGING_URL}/api/reports/${reportData.id}/snapshots`, {
      data: {
        expiresAt: new Date(Date.now() - 1000).toISOString() // Already expired
      }
    });

    const snapshotData = await snapshotResponse.json();
    const publicToken = snapshotData.publicToken;
    const publicUrl = `${STAGING_URL}/public/reports/${publicToken}`;

    // Try to access expired link
    const incognitoContext = await context.browser()!.newContext();
    const incognitoPage = await incognitoContext.newPage();

    try {
      const response = await incognitoPage.goto(publicUrl);

      // Should return 410 Gone or 404 Not Found
      expect([404, 410]).toContain(response!.status());

      // Verify error message displayed
      await expect(incognitoPage.locator('text=expired, text=no longer available')).toBeVisible({ timeout: 5000 });

    } finally {
      await incognitoPage.close();
      await incognitoContext.close();
    }
  });

  test('should track view count for public snapshots', async ({ page, context }) => {
    const userOrgId = await getUserOrgId(page);
    const testReport = generateTestReport();
    const createResponse = await page.request.post(`${STAGING_URL}/api/reports`, {
      data: {
        name: testReport.name,
        reportType: 'coach',
        organizationId: userOrgId,
        config: {
          timeframe: { type: 'preset', preset: 'season' },
          metrics: ['FLY10_TIME']
        }
      }
    });

    const reportData = await createResponse.json();
    createdReportIds.push(reportData.id);

    // Create snapshot
    const snapshotResponse = await page.request.post(`${STAGING_URL}/api/reports/${reportData.id}/snapshots`, {
      data: {
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      }
    });

    const snapshotData = await snapshotResponse.json();
    createdSnapshotIds.push(snapshotData.id);

    const publicToken = snapshotData.publicToken;
    const publicUrl = `${STAGING_URL}/public/reports/${publicToken}`;

    // Initial view count should be 0
    expect(snapshotData.viewCount).toBe(0);

    // Access public URL multiple times
    const incognitoContext = await context.browser()!.newContext();
    const incognitoPage = await incognitoContext.newPage();

    try {
      await incognitoPage.goto(publicUrl);
      await incognitoPage.waitForLoadState('networkidle');

      // Check view count via API
      const snapshotCheck = await page.request.get(`${STAGING_URL}/api/reports/${reportData.id}/snapshots/${snapshotData.id}`);
      const updatedSnapshot = await snapshotCheck.json();

      expect(updatedSnapshot.viewCount).toBe(1);

      // View again
      await incognitoPage.goto(publicUrl);
      await incognitoPage.waitForLoadState('networkidle');

      const snapshotCheck2 = await page.request.get(`${STAGING_URL}/api/reports/${reportData.id}/snapshots/${snapshotData.id}`);
      const updatedSnapshot2 = await snapshotCheck2.json();

      expect(updatedSnapshot2.viewCount).toBe(2);

    } finally {
      await incognitoPage.close();
      await incognitoContext.close();
    }
  });

  test('should copy public URL to clipboard', async ({ page }) => {
    const userOrgId = await getUserOrgId(page);
    const testReport = generateTestReport();
    const createResponse = await page.request.post(`${STAGING_URL}/api/reports`, {
      data: {
        name: testReport.name,
        reportType: 'coach',
        organizationId: userOrgId,
        config: {
          timeframe: { type: 'preset', preset: 'season' },
          metrics: ['FLY10_TIME']
        }
      }
    });

    const reportData = await createResponse.json();
    createdReportIds.push(reportData.id);

    await page.goto(`${STAGING_URL}/reports/${reportData.id}`);
    await page.click('button:has-text("Generate Report")');
    await page.waitForTimeout(2000);

    await page.click('button:has-text("Share")');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    await page.click('button:has-text("7 days")');
    await page.click('button:has-text("Create Link")');

    // Wait for URL to appear
    await page.waitForSelector('input[readonly]', { timeout: 5000 });

    // Click copy button
    await page.click('button:has-text("Copy"), button[title*="Copy"]');

    // Verify success toast/message
    await expect(page.locator('text=Copied, text=Link copied')).toBeVisible({ timeout: 3000 });
  });
});
