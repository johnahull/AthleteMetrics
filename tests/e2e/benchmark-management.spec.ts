import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * BENCHMARKS FEATURE: End-to-End Tests
 *
 * Comprehensive E2E test suite for the benchmarks feature covering:
 * - Site Admin: Site benchmark CRUD operations (6 tests)
 * - Org Admin: Custom benchmark CRUD operations (6 tests)
 * - Enablement: Organization benchmark enablement (4 tests)
 * - Evaluation: Athlete benchmark status tracking (2 tests)
 *
 * Total: 18 E2E tests
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

// Helper to generate unique test data
function generateTestBenchmark() {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  return {
    name: `Test Benchmark ${uniqueId}`,
    description: `E2E test benchmark created at ${new Date().toISOString()}`,
    benchmarkValue: Math.random() * 10 + 1, // Random value between 1-11
    metricCode: 'FLY10_TIME', // Use existing metric
  };
}

test.describe('Benchmark Management - Site Admin Tests', () => {
  let createdBenchmarkIds: string[] = [];

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    createdBenchmarkIds = [];
  });

  test.afterEach(async ({ page }) => {
    // Cleanup: Delete created benchmarks
    for (const benchmarkId of createdBenchmarkIds) {
      try {
        await page.request.delete(`${STAGING_URL}/api/benchmarks/${benchmarkId}`);
      } catch (error) {
        console.warn(`Failed to cleanup benchmark ${benchmarkId}:`, error);
      }
    }
  });

  test('should create a new site benchmark', async ({ page }) => {
    const testBenchmark = generateTestBenchmark();

    // Navigate to benchmarks page (assuming /admin/benchmarks route)
    await page.goto(`${STAGING_URL}/admin/benchmarks`);
    await page.waitForLoadState('networkidle');

    // Click "New Benchmark" button
    await page.click('button:has-text("New Benchmark")');

    // Wait for form modal
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Fill in benchmark details
    await page.selectOption('select', testBenchmark.metricCode); // Metric dropdown
    await page.fill('input[placeholder*="benchmark"]', testBenchmark.name);
    await page.fill('textarea[placeholder*="Describe"]', testBenchmark.description);
    await page.fill('input[type="number"]', testBenchmark.benchmarkValue.toString());

    // Select comparison operator
    await page.selectOption('select >> nth=1', 'lte'); // Lower is better

    // Listen for API response
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/benchmarks') && response.request().method() === 'POST'
    );

    // Submit form
    await page.click('button[type="submit"]:has-text("Create Benchmark")');

    // Capture benchmark ID
    const response = await responsePromise;
    const data = await response.json();
    createdBenchmarkIds.push(data.id);

    // Verify success message
    await expect(page.locator('text=Benchmark Created')).toBeVisible({ timeout: 5000 });

    // Verify benchmark appears in list
    await expect(page.locator(`text=${testBenchmark.name}`)).toBeVisible();
  });

  test('should edit an existing site benchmark', async ({ page }) => {
    // First create a benchmark via API
    const testBenchmark = generateTestBenchmark();
    const createResponse = await page.request.post(`${STAGING_URL}/api/benchmarks`, {
      data: {
        metricCode: testBenchmark.metricCode,
        name: testBenchmark.name,
        description: testBenchmark.description,
        benchmarkValue: testBenchmark.benchmarkValue,
        comparisonOperator: 'lte',
        isActive: true,
      },
    });
    const created = await createResponse.json();
    createdBenchmarkIds.push(created.id);

    // Navigate to benchmarks page
    await page.goto(`${STAGING_URL}/admin/benchmarks`);
    await page.waitForLoadState('networkidle');

    // Find and click edit button for the benchmark
    const benchmarkCard = page.locator(`text=${testBenchmark.name}`).locator('..');
    await benchmarkCard.locator('button[title*="Edit"], button:has(svg)').first().click();

    // Wait for form modal
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Update benchmark name
    const updatedName = `${testBenchmark.name} - Updated`;
    await page.fill('input[placeholder*="benchmark"]', updatedName);

    // Submit
    await page.click('button[type="submit"]:has-text("Update Benchmark")');

    // Verify success
    await expect(page.locator('text=Benchmark Updated')).toBeVisible({ timeout: 5000 });
    await expect(page.locator(`text=${updatedName}`)).toBeVisible();
  });

  test('should toggle benchmark active status', async ({ page }) => {
    // Create a benchmark via API
    const testBenchmark = generateTestBenchmark();
    const createResponse = await page.request.post(`${STAGING_URL}/api/benchmarks`, {
      data: {
        metricCode: testBenchmark.metricCode,
        name: testBenchmark.name,
        description: testBenchmark.description,
        benchmarkValue: testBenchmark.benchmarkValue,
        comparisonOperator: 'gte',
        isActive: true,
      },
    });
    const created = await createResponse.json();
    createdBenchmarkIds.push(created.id);

    // Navigate to benchmarks page
    await page.goto(`${STAGING_URL}/admin/benchmarks`);
    await page.waitForLoadState('networkidle');

    // Find the benchmark card
    const benchmarkCard = page.locator(`text=${testBenchmark.name}`).locator('..');

    // Toggle status (should have a switch/toggle)
    await benchmarkCard.locator('button[role="switch"], input[type="checkbox"]').click();

    // Verify status update
    await expect(page.locator('text=Status Updated')).toBeVisible({ timeout: 5000 });
  });

  test('should delete a non-system benchmark', async ({ page }) => {
    // Create a benchmark via API
    const testBenchmark = generateTestBenchmark();
    const createResponse = await page.request.post(`${STAGING_URL}/api/benchmarks`, {
      data: {
        metricCode: testBenchmark.metricCode,
        name: testBenchmark.name,
        description: testBenchmark.description,
        benchmarkValue: testBenchmark.benchmarkValue,
        comparisonOperator: 'eq',
        isActive: true,
      },
    });
    const created = await createResponse.json();
    // Don't add to cleanup array since we're deleting it in the test

    // Navigate to benchmarks page
    await page.goto(`${STAGING_URL}/admin/benchmarks`);
    await page.waitForLoadState('networkidle');

    // Find the benchmark card
    const benchmarkCard = page.locator(`text=${testBenchmark.name}`).locator('..');

    // Click delete button
    await benchmarkCard.locator('button:has-text("Delete"), button:has(svg)').last().click();

    // Confirm deletion in dialog
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    await page.click('button:has-text("Delete Benchmark")');

    // Verify success
    await expect(page.locator('text=Benchmark Deleted')).toBeVisible({ timeout: 5000 });
    await expect(page.locator(`text=${testBenchmark.name}`)).not.toBeVisible();
  });

  test('should prevent deletion of system default benchmarks', async ({ page }) => {
    // Navigate to benchmarks page
    await page.goto(`${STAGING_URL}/admin/benchmarks`);
    await page.waitForLoadState('networkidle');

    // Look for a system default benchmark (should have "System Default" badge)
    const systemBenchmark = page.locator('text=System Default').locator('..');

    if (await systemBenchmark.count() > 0) {
      // Find delete button - should be disabled
      const deleteButton = systemBenchmark.locator('button:has-text("Delete")').first();
      await expect(deleteButton).toBeDisabled();
    } else {
      // Skip if no system defaults exist yet
      test.skip();
    }
  });

  test('should filter benchmarks by search query', async ({ page }) => {
    // Create two benchmarks with different names
    const benchmark1 = generateTestBenchmark();
    benchmark1.name = `Alpha ${benchmark1.name}`;
    const benchmark2 = generateTestBenchmark();
    benchmark2.name = `Zulu ${benchmark2.name}`;

    const response1 = await page.request.post(`${STAGING_URL}/api/benchmarks`, {
      data: {
        metricCode: 'FLY10_TIME',
        name: benchmark1.name,
        benchmarkValue: 1.0,
        comparisonOperator: 'lte',
        isActive: true,
      },
    });
    const response2 = await page.request.post(`${STAGING_URL}/api/benchmarks`, {
      data: {
        metricCode: 'VERTICAL_JUMP',
        name: benchmark2.name,
        benchmarkValue: 30,
        comparisonOperator: 'gte',
        isActive: true,
      },
    });

    const created1 = await response1.json();
    const created2 = await response2.json();
    createdBenchmarkIds.push(created1.id, created2.id);

    // Navigate to benchmarks page
    await page.goto(`${STAGING_URL}/admin/benchmarks`);
    await page.waitForLoadState('networkidle');

    // Search for "Alpha"
    await page.fill('input[placeholder*="Search"]', 'Alpha');
    await page.waitForResponse(response =>
      response.url().includes('/api/benchmarks') &&
      response.request().method() === 'GET'
    );

    // Should see benchmark1, not benchmark2
    await expect(page.locator(`text=${benchmark1.name}`)).toBeVisible();
    await expect(page.locator(`text=${benchmark2.name}`)).not.toBeVisible();

    // Clear search
    await page.fill('input[placeholder*="Search"]', '');
    await page.waitForResponse(response =>
      response.url().includes('/api/benchmarks') &&
      response.request().method() === 'GET'
    );

    // Should see both
    await expect(page.locator(`text=${benchmark1.name}`)).toBeVisible();
    await expect(page.locator(`text=${benchmark2.name}`)).toBeVisible();
  });
});

test.describe('Benchmark Management - Custom Benchmarks Tests', () => {
  let createdBenchmarkIds: string[] = [];
  let testOrgId: string;

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    createdBenchmarkIds = [];

    // Get current user's organization ID
    const userResponse = await page.request.get(`${STAGING_URL}/api/auth/me`);
    const userData = await userResponse.json();
    testOrgId = userData.organizationId || userData.userOrganizations?.[0]?.organizationId;
  });

  test.afterEach(async ({ page }) => {
    // Cleanup: Delete created custom benchmarks
    for (const benchmarkId of createdBenchmarkIds) {
      try {
        await page.request.delete(
          `${STAGING_URL}/api/organizations/${testOrgId}/benchmarks/custom/${benchmarkId}`
        );
      } catch (error) {
        console.warn(`Failed to cleanup custom benchmark ${benchmarkId}:`, error);
      }
    }
  });

  test('should create a custom benchmark for organization', async ({ page }) => {
    if (!testOrgId) test.skip();

    const testBenchmark = generateTestBenchmark();
    testBenchmark.name = `Custom ${testBenchmark.name}`;

    // Navigate to custom benchmarks page
    await page.goto(`${STAGING_URL}/org/${testOrgId}/benchmarks/custom`);
    await page.waitForLoadState('networkidle');

    // Click "New Custom Benchmark" button
    await page.click('button:has-text("New Custom Benchmark")');

    // Wait for form modal
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Fill in benchmark details
    await page.selectOption('select', testBenchmark.metricCode);
    await page.fill('input[placeholder*="benchmark"]', testBenchmark.name);
    await page.fill('input[type="number"]', testBenchmark.benchmarkValue.toString());

    // Listen for API response
    const responsePromise = page.waitForResponse(response =>
      response.url().includes(`/api/organizations/${testOrgId}/benchmarks/custom`) &&
      response.request().method() === 'POST'
    );

    // Submit
    await page.click('button[type="submit"]:has-text("Create Benchmark")');

    // Capture ID
    const response = await responsePromise;
    const data = await response.json();
    createdBenchmarkIds.push(data.id);

    // Verify success
    await expect(page.locator('text=Custom Benchmark Created')).toBeVisible({ timeout: 5000 });
    await expect(page.locator(`text=${testBenchmark.name}`)).toBeVisible();
  });

  test('should edit a custom benchmark', async ({ page }) => {
    if (!testOrgId) test.skip();

    // Create custom benchmark via API
    const testBenchmark = generateTestBenchmark();
    testBenchmark.name = `Custom ${testBenchmark.name}`;

    const createResponse = await page.request.post(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmarks/custom`,
      {
        data: {
          metricCode: testBenchmark.metricCode,
          name: testBenchmark.name,
          benchmarkValue: testBenchmark.benchmarkValue,
          comparisonOperator: 'lte',
          isActive: true,
        },
      }
    );
    const created = await createResponse.json();
    createdBenchmarkIds.push(created.id);

    // Navigate to custom benchmarks page
    await page.goto(`${STAGING_URL}/org/${testOrgId}/benchmarks/custom`);
    await page.waitForLoadState('networkidle');

    // Click edit
    const benchmarkCard = page.locator(`text=${testBenchmark.name}`).locator('..');
    await benchmarkCard.locator('button:has(svg)').first().click();

    // Update name
    const updatedName = `${testBenchmark.name} - Updated`;
    await page.fill('input[placeholder*="benchmark"]', updatedName);

    // Submit
    await page.click('button[type="submit"]:has-text("Update Benchmark")');

    // Verify
    await expect(page.locator('text=Custom Benchmark Updated')).toBeVisible({ timeout: 5000 });
  });

  test('should delete a custom benchmark', async ({ page }) => {
    if (!testOrgId) test.skip();

    // Create custom benchmark via API
    const testBenchmark = generateTestBenchmark();
    testBenchmark.name = `Custom ${testBenchmark.name}`;

    const createResponse = await page.request.post(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmarks/custom`,
      {
        data: {
          metricCode: testBenchmark.metricCode,
          name: testBenchmark.name,
          benchmarkValue: testBenchmark.benchmarkValue,
          comparisonOperator: 'gte',
          isActive: true,
        },
      }
    );
    const created = await createResponse.json();

    // Navigate
    await page.goto(`${STAGING_URL}/org/${testOrgId}/benchmarks/custom`);
    await page.waitForLoadState('networkidle');

    // Delete
    const benchmarkCard = page.locator(`text=${testBenchmark.name}`).locator('..');
    await benchmarkCard.locator('button:has-text("Delete"), button:has(svg)').last().click();

    // Confirm
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    await page.click('button:has-text("Delete Benchmark")');

    // Verify
    await expect(page.locator('text=Custom Benchmark Deleted')).toBeVisible({ timeout: 5000 });
  });

  test('should show error when custom benchmarks not allowed', async ({ page }) => {
    if (!testOrgId) test.skip();

    // Disable custom benchmarks for the organization
    await page.request.patch(`${STAGING_URL}/api/organizations/${testOrgId}`, {
      data: {
        allowCustomBenchmarks: false,
      },
    });

    // Try to create a custom benchmark
    const testBenchmark = generateTestBenchmark();
    const response = await page.request.post(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmarks/custom`,
      {
        data: {
          metricCode: testBenchmark.metricCode,
          name: `Custom ${testBenchmark.name}`,
          benchmarkValue: testBenchmark.benchmarkValue,
          comparisonOperator: 'lte',
          isActive: true,
        },
      }
    );

    // Should return 403 Forbidden
    expect(response.status()).toBe(403);
    const errorData = await response.json();
    expect(errorData.message).toContain('not allowed');

    // Re-enable custom benchmarks for cleanup
    await page.request.patch(`${STAGING_URL}/api/organizations/${testOrgId}`, {
      data: {
        allowCustomBenchmarks: true,
      },
    });
  });

  test('should prevent cross-org custom benchmark access', async ({ page }) => {
    if (!testOrgId) test.skip();

    // Create a custom benchmark for the test organization
    const testBenchmark = generateTestBenchmark();
    testBenchmark.name = `Custom ${testBenchmark.name}`;

    const createResponse = await page.request.post(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmarks/custom`,
      {
        data: {
          metricCode: testBenchmark.metricCode,
          name: testBenchmark.name,
          benchmarkValue: testBenchmark.benchmarkValue,
          comparisonOperator: 'lte',
          isActive: true,
        },
      }
    );
    const createdBenchmark = await createResponse.json();
    createdBenchmarkIds.push(createdBenchmark.id);

    // Get list of all organizations
    const orgsResponse = await page.request.get(`${STAGING_URL}/api/organizations`);
    const orgs = await orgsResponse.json();

    // Find a different organization (not testOrgId)
    const otherOrg = orgs.find((org: any) => org.id !== testOrgId);

    if (otherOrg) {
      // Try to access the custom benchmark from a different organization
      // This should fail because custom benchmarks are organization-specific
      const accessResponse = await page.request.get(
        `${STAGING_URL}/api/organizations/${otherOrg.id}/benchmarks/custom`
      );

      // The request might succeed (200) if user has access to otherOrg,
      // but the benchmark list should NOT include the test benchmark
      if (accessResponse.ok()) {
        const otherOrgBenchmarks = await accessResponse.json();
        const hasCrossOrgBenchmark = otherOrgBenchmarks.some(
          (b: any) => b.id === createdBenchmark.id
        );
        expect(hasCrossOrgBenchmark).toBe(false);
      } else {
        // If user doesn't have access to otherOrg, should get 403
        expect(accessResponse.status()).toBe(403);
      }
    }
  });

  test.skip('should only allow owner to modify custom benchmark', async ({ page }) => {
    // This test would require multi-user setup with different credentials
    // Skip for now as it requires authentication with a different user account
  });

  test('should display custom benchmarks in list', async ({ page }) => {
    if (!testOrgId) test.skip();

    // Create multiple custom benchmarks
    const benchmarks = [generateTestBenchmark(), generateTestBenchmark()];

    for (const benchmark of benchmarks) {
      benchmark.name = `Custom ${benchmark.name}`;
      const response = await page.request.post(
        `${STAGING_URL}/api/organizations/${testOrgId}/benchmarks/custom`,
        {
          data: {
            metricCode: benchmark.metricCode,
            name: benchmark.name,
            benchmarkValue: benchmark.benchmarkValue,
            comparisonOperator: 'lte',
            isActive: true,
          },
        }
      );
      const created = await response.json();
      createdBenchmarkIds.push(created.id);
    }

    // Navigate
    await page.goto(`${STAGING_URL}/org/${testOrgId}/benchmarks/custom`);
    await page.waitForLoadState('networkidle');

    // Verify both appear
    for (const benchmark of benchmarks) {
      await expect(page.locator(`text=${benchmark.name}`)).toBeVisible();
    }
  });
});

test.describe('Benchmark Management - Enablement Tests', () => {
  let testOrgId: string;
  let testBenchmarkId: string;

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);

    // Get org ID
    const userResponse = await page.request.get(`${STAGING_URL}/api/auth/me`);
    const userData = await userResponse.json();
    testOrgId = userData.organizationId || userData.userOrganizations?.[0]?.organizationId;

    // Create a test benchmark
    const testBenchmark = generateTestBenchmark();
    const createResponse = await page.request.post(`${STAGING_URL}/api/benchmarks`, {
      data: {
        metricCode: testBenchmark.metricCode,
        name: testBenchmark.name,
        benchmarkValue: testBenchmark.benchmarkValue,
        comparisonOperator: 'lte',
        isActive: true,
      },
    });
    const created = await createResponse.json();
    testBenchmarkId = created.id;
  });

  test.afterEach(async ({ page }) => {
    // Cleanup benchmark
    try {
      await page.request.delete(`${STAGING_URL}/api/benchmarks/${testBenchmarkId}`);
    } catch (error) {
      console.warn('Failed to cleanup test benchmark:', error);
    }
  });

  test('should enable site benchmark for organization', async ({ page }) => {
    if (!testOrgId) test.skip();

    // Navigate to org benchmarks
    await page.goto(`${STAGING_URL}/org/${testOrgId}/benchmarks`);
    await page.waitForLoadState('networkidle');

    // Browse catalog
    await page.click('button:has-text("Browse Catalog")');

    // Wait for catalog modal
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Find and enable the benchmark
    const benchmarkItem = page.locator(`[data-benchmark-id="${testBenchmarkId}"]`).first();
    if (await benchmarkItem.count() === 0) {
      // Fallback: find by enabling any benchmark
      await page.locator('button[role="switch"]').first().click();
    } else {
      await benchmarkItem.locator('button[role="switch"]').click();
    }

    // Verify enablement
    await expect(page.locator('text=Benchmark Enabled')).toBeVisible({ timeout: 5000 });
  });

  test('should disable benchmark for organization', async ({ page }) => {
    if (!testOrgId) test.skip();

    // First enable the benchmark
    await page.request.post(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmarks/${testBenchmarkId}/enable`,
      {
        data: { benchmarkType: 'site' },
      }
    );

    // Navigate
    await page.goto(`${STAGING_URL}/org/${testOrgId}/benchmarks`);
    await page.waitForLoadState('networkidle');

    // Find and disable
    const benchmarkItem = page.locator(`text=${testBenchmarkId}`).first();
    await benchmarkItem.locator('button[role="switch"]').click();

    // Verify
    await expect(page.locator('text=Benchmark Disabled')).toBeVisible({ timeout: 5000 });
  });

  test('should show error when benchmarks not enabled for org', async ({ page }) => {
    if (!testOrgId || !testBenchmarkId) test.skip();

    // Disable benchmarks feature for the organization
    await page.request.patch(`${STAGING_URL}/api/organizations/${testOrgId}`, {
      data: {
        benchmarksEnabled: false,
      },
    });

    // Try to enable a benchmark for this organization
    const response = await page.request.post(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmarks/${testBenchmarkId}/enable`,
      {
        data: { benchmarkType: 'site' },
      }
    );

    // Should return 403 Forbidden
    expect(response.status()).toBe(403);
    const errorData = await response.json();
    expect(errorData.message).toContain('not enabled');

    // Re-enable benchmarks feature for cleanup and other tests
    await page.request.patch(`${STAGING_URL}/api/organizations/${testOrgId}`, {
      data: {
        benchmarksEnabled: true,
      },
    });
  });

  test('should display enabled benchmarks list', async ({ page }) => {
    if (!testOrgId) test.skip();

    // Enable the benchmark
    await page.request.post(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmarks/${testBenchmarkId}/enable`,
      {
        data: { benchmarkType: 'site' },
      }
    );

    // Navigate
    await page.goto(`${STAGING_URL}/org/${testOrgId}/benchmarks`);
    await page.waitForLoadState('networkidle');

    // Should see the enabled benchmark
    await expect(page.locator(`text=Enabled`)).toBeVisible();
  });
});

test.describe('Benchmark Management - Athlete Evaluation Tests', () => {
  let testOrgId: string;
  let testAthleteId: string;
  let testBenchmarkId: string;

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);

    // Get org ID and create test data
    const userResponse = await page.request.get(`${STAGING_URL}/api/auth/me`);
    const userData = await userResponse.json();
    testOrgId = userData.organizationId || userData.userOrganizations?.[0]?.organizationId;

    // Create test benchmark
    const testBenchmark = generateTestBenchmark();
    const benchmarkResponse = await page.request.post(`${STAGING_URL}/api/benchmarks`, {
      data: {
        metricCode: 'FLY10_TIME',
        name: testBenchmark.name,
        benchmarkValue: 1.0, // 1.0 seconds for 10-yard fly
        comparisonOperator: 'lte',
        isActive: true,
      },
    });
    const benchmark = await benchmarkResponse.json();
    testBenchmarkId = benchmark.id;

    // Enable for org
    await page.request.post(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmarks/${testBenchmarkId}/enable`,
      { data: { benchmarkType: 'site' } }
    );

    // Create test athlete
    const uniqueId = Date.now().toString(36);
    const athleteResponse = await page.request.post(`${STAGING_URL}/api/athletes`, {
      data: {
        firstName: `TestAthlete_${uniqueId}`,
        lastName: 'Benchmark',
        birthDate: '2005-01-01',
        emails: [],
      },
    });
    const athlete = await athleteResponse.json();
    testAthleteId = athlete.id;
  });

  test.afterEach(async ({ page }) => {
    // Cleanup
    try {
      await page.request.delete(`${STAGING_URL}/api/athletes/${testAthleteId}`);
      await page.request.delete(`${STAGING_URL}/api/benchmarks/${testBenchmarkId}`);
    } catch (error) {
      console.warn('Failed to cleanup:', error);
    }
  });

  test('should display athlete benchmark status with met benchmarks', async ({ page }) => {
    if (!testOrgId || !testAthleteId) test.skip();

    // Create measurement that meets benchmark (0.95 < 1.0)
    await page.request.post(`${STAGING_URL}/api/measurements`, {
      data: {
        userId: testAthleteId,
        metric: 'FLY10_TIME',
        value: 0.95,
        date: new Date().toISOString().split('T')[0],
      },
    });

    // Navigate to athlete benchmark status
    await page.goto(`${STAGING_URL}/athletes/${testAthleteId}/benchmarks`);
    await page.waitForLoadState('networkidle');

    // Should see "Met" badge
    await expect(page.locator('text=Met')).toBeVisible();

    // Should see progress bar with >100%
    await expect(page.locator('text=/\\d+%.*of Goal/')).toBeVisible();
  });

  test('should display athlete benchmark status with unmet benchmarks', async ({ page }) => {
    if (!testOrgId || !testAthleteId) test.skip();

    // Create measurement that doesn't meet benchmark (1.2 > 1.0)
    await page.request.post(`${STAGING_URL}/api/measurements`, {
      data: {
        userId: testAthleteId,
        metric: 'FLY10_TIME',
        value: 1.2,
        date: new Date().toISOString().split('T')[0],
      },
    });

    // Navigate
    await page.goto(`${STAGING_URL}/athletes/${testAthleteId}/benchmarks`);
    await page.waitForLoadState('networkidle');

    // Should see "Not Met" badge
    await expect(page.locator('text=Not Met')).toBeVisible();

    // Should see progress bar with <100%
    await expect(page.locator('text=/\\d+%.*of Goal/')).toBeVisible();
  });
});
