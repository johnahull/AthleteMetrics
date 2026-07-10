import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * REPORT PDF EXPORT: End-to-End Tests
 *
 * TDD Approach: These tests are written BEFORE implementation
 * Expected: ALL TESTS WILL FAIL until PDF generation is implemented
 *
 * Test Coverage:
 * - Export coach report as PDF
 * - Export individual report as PDF
 * - Verify PDF download
 * - Verify PDF contains report data
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

function generateTestReport() {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  return {
    name: `PDF Report ${uniqueId}`,
    description: `E2E test PDF report created at ${new Date().toISOString()}`,
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

test.describe('Report PDF Export - TDD Tests', () => {
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

  test('should show PDF export button on generated report', async ({ page }) => {
    // Create a report via API
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

    // Navigate to report
    await page.goto(`${STAGING_URL}/reports/${reportData.id}`);
    await page.waitForLoadState('networkidle');

    // Generate report
    await page.click('button:has-text("Generate Report")');
    await page.waitForTimeout(2000);

    // Verify PDF export button exists
    await expect(page.locator('button:has-text("Export PDF"), button:has-text("Download PDF")')).toBeVisible({ timeout: 5000 });
  });

  test('should download PDF for coach report', async ({ page }) => {
    const userOrgId = await getUserOrgId(page);
    const testReport = generateTestReport();
    const createResponse = await page.request.post(`${STAGING_URL}/api/reports`, {
      data: {
        name: testReport.name,
        reportType: 'coach',
        organizationId: userOrgId,
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

    // Setup download listener
    const downloadPromise = page.waitForEvent('download');

    // Click export PDF button
    await page.click('button:has-text("Export PDF"), button:has-text("Download PDF")');

    // Wait for download
    const download = await downloadPromise;

    // Verify download filename
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/\.pdf$/);
    expect(filename).toContain('report');

    // Verify download completed
    const path = await download.path();
    expect(path).toBeTruthy();
  });

  test('should download PDF for individual report', async ({ page }) => {
    const userOrgId = await getUserOrgId(page);
    const testReport = generateTestReport();
    const createResponse = await page.request.post(`${STAGING_URL}/api/reports`, {
      data: {
        name: testReport.name,
        reportType: 'individual',
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

    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Export PDF"), button:has-text("Download PDF")');

    const download = await downloadPromise;
    const filename = download.suggestedFilename();

    expect(filename).toMatch(/\.pdf$/);

    const path = await download.path();
    expect(path).toBeTruthy();
  });

  test('should generate PDF via API endpoint', async ({ page }) => {
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

    // Request PDF via API
    const pdfResponse = await page.request.get(`${STAGING_URL}/api/reports/${reportData.id}/pdf`);

    // Verify response is PDF
    expect(pdfResponse.ok()).toBeTruthy();
    expect(pdfResponse.headers()['content-type']).toContain('application/pdf');

    // Verify PDF has content
    const buffer = await pdfResponse.body();
    expect(buffer.length).toBeGreaterThan(1000); // PDFs are typically > 1KB
  });

  test('should include report data in PDF', async ({ page }) => {
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

    // Request PDF
    const pdfResponse = await page.request.get(`${STAGING_URL}/api/reports/${reportData.id}/pdf`);

    expect(pdfResponse.ok()).toBeTruthy();

    // Note: Full PDF content validation would require PDF parsing library
    // For now, verify it's a valid PDF by checking magic bytes
    const buffer = await pdfResponse.body();
    const pdfHeader = buffer.slice(0, 4).toString();
    expect(pdfHeader).toBe('%PDF');
  });

  test('should export PDF with charts included', async ({ page }) => {
    const userOrgId = await getUserOrgId(page);
    const testReport = generateTestReport();
    const createResponse = await page.request.post(`${STAGING_URL}/api/reports`, {
      data: {
        name: testReport.name,
        reportType: 'coach',
        organizationId: userOrgId,
        config: {
          timeframe: { type: 'preset', preset: 'season' },
          metrics: ['FLY10_TIME', 'VERTICAL_JUMP'],
          compositeIndex: {
            enabled: true,
            weights: { 'FLY10_TIME': 0.5, 'VERTICAL_JUMP': 0.5 }
          }
        }
      }
    });

    const reportData = await createResponse.json();
    createdReportIds.push(reportData.id);

    await page.goto(`${STAGING_URL}/reports/${reportData.id}`);
    await page.click('button:has-text("Generate Report")');
    await page.waitForTimeout(2000);

    // Wait for charts to render
    await expect(page.locator('canvas, svg')).toBeVisible({ timeout: 5000 });

    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Export PDF")');

    const download = await downloadPromise;
    const path = await download.path();

    // Verify PDF is larger (contains chart images)
    const fs = require('fs');
    const stats = fs.statSync(path);
    expect(stats.size).toBeGreaterThan(5000); // PDFs with images are typically > 5KB
  });

  test('should handle PDF export errors gracefully', async ({ page }) => {
    // Try to export PDF for non-existent report
    const fakeReportId = 'non-existent-id';

    const pdfResponse = await page.request.get(`${STAGING_URL}/api/reports/${fakeReportId}/pdf`);

    // Should return 404 or appropriate error
    expect(pdfResponse.status()).toBe(404);
  });
});
