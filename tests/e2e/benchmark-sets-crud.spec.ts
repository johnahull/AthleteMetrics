import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * BENCHMARK SETS FEATURE: End-to-End Tests
 *
 * Comprehensive E2E test suite for the benchmark sets feature covering:
 * - Benchmark Set CRUD operations (Create, Read, Update, Delete)
 * - Benchmark Set Items management (Add, Remove, Reorder)
 * - Report Wizard integration (Select by Set)
 * - Analytics integration (Quick Load from Set)
 *
 * Benchmark sets are named collections of benchmarks across different metrics
 * (e.g., "NCAA D1 Women's Soccer" containing fly 10, vertical jump, 5-0-5).
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

// Helper to generate unique test data
function generateTestBenchmarkSet() {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  return {
    name: `Test Set ${uniqueId}`,
    description: `E2E test benchmark set created at ${new Date().toISOString()}`,
    sport: 'SOCCER',
    level: 'College',
    gender: 'Female',
  };
}

test.describe('Benchmark Sets - CRUD Operations', () => {
  let testOrgId: string;
  let createdSetIds: string[] = [];

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    createdSetIds = [];

    // Get current user's organization ID
    const userResponse = await page.request.get(`${STAGING_URL}/api/auth/me`);
    const userData = await userResponse.json();
    testOrgId = userData.organizationId || userData.userOrganizations?.[0]?.organizationId;
  });

  test.afterEach(async ({ page }) => {
    // Cleanup: Delete created benchmark sets
    for (const setId of createdSetIds) {
      try {
        await page.request.delete(
          `${STAGING_URL}/api/organizations/${testOrgId}/benchmark-sets/${setId}`
        );
      } catch (error) {
        console.warn(`Failed to cleanup benchmark set ${setId}:`, error);
      }
    }
  });

  test('should create a new benchmark set', async ({ page }) => {
    if (!testOrgId) test.skip();

    const testSet = generateTestBenchmarkSet();

    // Navigate to benchmark sets page
    await page.goto(`${STAGING_URL}/organizations/${testOrgId}/benchmark-sets`);
    await page.waitForLoadState('networkidle');

    // Click "New Benchmark Set" button
    await page.click('button:has-text("New Benchmark Set")');

    // Wait for form modal
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Fill in benchmark set details
    await page.fill('input[name="name"]', testSet.name);
    await page.fill('textarea[name="description"]', testSet.description);

    // Select sport if dropdown exists
    const sportSelect = page.locator('select[name="sport"], button[role="combobox"][name="sport"]');
    if (await sportSelect.count() > 0) {
      await sportSelect.click();
      await page.click(`[role="option"]:has-text("Soccer")`);
    }

    // Listen for API response
    const responsePromise = page.waitForResponse(response =>
      response.url().includes(`/api/organizations/${testOrgId}/benchmark-sets`) &&
      response.request().method() === 'POST'
    );

    // Submit form
    await page.click('button[type="submit"]:has-text("Create")');

    // Capture set ID
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const data = await response.json();
    createdSetIds.push(data.id);

    // Verify success message
    await expect(page.locator('text=Benchmark Set Created')).toBeVisible({ timeout: 5000 });

    // Verify set appears in list
    await expect(page.locator(`text=${testSet.name}`)).toBeVisible();
  });

  test('should display benchmark sets list', async ({ page }) => {
    if (!testOrgId) test.skip();

    // Create a benchmark set via API
    const testSet = generateTestBenchmarkSet();
    const createResponse = await page.request.post(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmark-sets`,
      {
        data: {
          name: testSet.name,
          description: testSet.description,
          sport: testSet.sport,
        },
      }
    );
    const created = await createResponse.json();
    createdSetIds.push(created.id);

    // Navigate to benchmark sets page
    await page.goto(`${STAGING_URL}/organizations/${testOrgId}/benchmark-sets`);
    await page.waitForLoadState('networkidle');

    // Verify the set appears in the list
    await expect(page.locator(`text=${testSet.name}`)).toBeVisible();
  });

  test('should edit a benchmark set', async ({ page }) => {
    if (!testOrgId) test.skip();

    // Create a benchmark set via API
    const testSet = generateTestBenchmarkSet();
    const createResponse = await page.request.post(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmark-sets`,
      {
        data: {
          name: testSet.name,
          description: testSet.description,
        },
      }
    );
    const created = await createResponse.json();
    createdSetIds.push(created.id);

    // Navigate to benchmark sets page
    await page.goto(`${STAGING_URL}/organizations/${testOrgId}/benchmark-sets`);
    await page.waitForLoadState('networkidle');

    // Find and click edit button
    const setCard = page.locator(`[data-set-id="${created.id}"], text=${testSet.name}`).locator('..');
    await setCard.locator('button[aria-label*="Edit"], button:has-text("Edit")').first().click();

    // Wait for form modal
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Update name
    const updatedName = `${testSet.name} - Updated`;
    await page.fill('input[name="name"]', updatedName);

    // Submit
    await page.click('button[type="submit"]:has-text("Update"), button[type="submit"]:has-text("Save")');

    // Verify success
    await expect(page.locator('text=Benchmark Set Updated')).toBeVisible({ timeout: 5000 });
    await expect(page.locator(`text=${updatedName}`)).toBeVisible();
  });

  test('should delete a benchmark set', async ({ page }) => {
    if (!testOrgId) test.skip();

    // Create a benchmark set via API
    const testSet = generateTestBenchmarkSet();
    const createResponse = await page.request.post(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmark-sets`,
      {
        data: {
          name: testSet.name,
          description: testSet.description,
        },
      }
    );
    const created = await createResponse.json();
    // Don't add to cleanup array since we're deleting it in the test

    // Navigate to benchmark sets page
    await page.goto(`${STAGING_URL}/organizations/${testOrgId}/benchmark-sets`);
    await page.waitForLoadState('networkidle');

    // Find and click delete button
    const setCard = page.locator(`text=${testSet.name}`).locator('..');
    await setCard.locator('button[aria-label*="Delete"], button:has-text("Delete")').click();

    // Confirm deletion in dialog
    await page.waitForSelector('[role="alertdialog"], [role="dialog"]', { timeout: 5000 });
    await page.click('button:has-text("Delete"), button:has-text("Confirm")');

    // Verify success
    await expect(page.locator('text=Benchmark Set Deleted')).toBeVisible({ timeout: 5000 });
    await expect(page.locator(`text=${testSet.name}`)).not.toBeVisible();
  });

  test('should view benchmark set details', async ({ page }) => {
    if (!testOrgId) test.skip();

    // Create a benchmark set via API
    const testSet = generateTestBenchmarkSet();
    const createResponse = await page.request.post(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmark-sets`,
      {
        data: {
          name: testSet.name,
          description: testSet.description,
          sport: 'SOCCER',
          level: 'College',
          gender: 'Female',
        },
      }
    );
    const created = await createResponse.json();
    createdSetIds.push(created.id);

    // Navigate to benchmark sets page
    await page.goto(`${STAGING_URL}/organizations/${testOrgId}/benchmark-sets`);
    await page.waitForLoadState('networkidle');

    // Click on the set to view details
    await page.click(`text=${testSet.name}`);

    // Verify details are shown
    await expect(page.locator(`text=${testSet.description}`)).toBeVisible();
    await expect(page.locator('text=Soccer')).toBeVisible();
    await expect(page.locator('text=College')).toBeVisible();
    await expect(page.locator('text=Female')).toBeVisible();
  });
});

test.describe('Benchmark Sets - Items Management', () => {
  let testOrgId: string;
  let testSetId: string;
  let testBenchmarkId: string;

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);

    // Get current user's organization ID
    const userResponse = await page.request.get(`${STAGING_URL}/api/auth/me`);
    const userData = await userResponse.json();
    testOrgId = userData.organizationId || userData.userOrganizations?.[0]?.organizationId;

    // Create a benchmark set for testing
    const testSet = generateTestBenchmarkSet();
    const setResponse = await page.request.post(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmark-sets`,
      {
        data: {
          name: testSet.name,
          description: testSet.description,
        },
      }
    );
    const set = await setResponse.json();
    testSetId = set.id;

    // Get an existing site benchmark to add to the set
    const benchmarksResponse = await page.request.get(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmarks`
    );
    const benchmarks = await benchmarksResponse.json();
    if (benchmarks.length > 0) {
      testBenchmarkId = benchmarks[0].benchmarkId || benchmarks[0].id;
    }
  });

  test.afterEach(async ({ page }) => {
    // Cleanup
    try {
      await page.request.delete(
        `${STAGING_URL}/api/organizations/${testOrgId}/benchmark-sets/${testSetId}`
      );
    } catch (error) {
      console.warn('Failed to cleanup test set:', error);
    }
  });

  test('should add a benchmark to the set', async ({ page }) => {
    if (!testOrgId || !testSetId) test.skip();

    // Navigate to the benchmark set detail page
    await page.goto(`${STAGING_URL}/organizations/${testOrgId}/benchmark-sets/${testSetId}`);
    await page.waitForLoadState('networkidle');

    // Click "Add Benchmark" button
    await page.click('button:has-text("Add Benchmark")');

    // Wait for benchmark picker modal
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Select a benchmark from the list
    const benchmarkItem = page.locator('[data-benchmark-id], [role="option"]').first();
    await benchmarkItem.click();

    // Confirm selection
    await page.click('button:has-text("Add"), button:has-text("Confirm")');

    // Verify success
    await expect(page.locator('text=Benchmark Added')).toBeVisible({ timeout: 5000 });
  });

  test('should remove a benchmark from the set', async ({ page }) => {
    if (!testOrgId || !testSetId || !testBenchmarkId) test.skip();

    // Add a benchmark to the set via API first
    await page.request.post(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmark-sets/${testSetId}/items`,
      {
        data: {
          benchmarkId: testBenchmarkId,
          benchmarkType: 'site',
        },
      }
    );

    // Navigate to the benchmark set detail page
    await page.goto(`${STAGING_URL}/organizations/${testOrgId}/benchmark-sets/${testSetId}`);
    await page.waitForLoadState('networkidle');

    // Find and click remove button on the benchmark item
    const benchmarkItem = page.locator('[data-benchmark-item]').first();
    await benchmarkItem.locator('button[aria-label*="Remove"], button:has-text("Remove")').click();

    // Confirm removal
    await page.waitForSelector('[role="alertdialog"], [role="dialog"]', { timeout: 5000 });
    await page.click('button:has-text("Remove"), button:has-text("Confirm")');

    // Verify success
    await expect(page.locator('text=Benchmark Removed')).toBeVisible({ timeout: 5000 });
  });

  test('should reorder benchmarks in the set via drag and drop', async ({ page }) => {
    if (!testOrgId || !testSetId) test.skip();

    // Get multiple benchmarks
    const benchmarksResponse = await page.request.get(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmarks`
    );
    const benchmarks = await benchmarksResponse.json();

    if (benchmarks.length < 2) {
      test.skip();
      return;
    }

    // Add two benchmarks to the set
    for (let i = 0; i < 2; i++) {
      await page.request.post(
        `${STAGING_URL}/api/organizations/${testOrgId}/benchmark-sets/${testSetId}/items`,
        {
          data: {
            benchmarkId: benchmarks[i].benchmarkId || benchmarks[i].id,
            benchmarkType: 'site',
            displayOrder: i,
          },
        }
      );
    }

    // Navigate to the benchmark set detail page
    await page.goto(`${STAGING_URL}/organizations/${testOrgId}/benchmark-sets/${testSetId}`);
    await page.waitForLoadState('networkidle');

    // Get the items
    const items = page.locator('[data-benchmark-item]');
    const itemCount = await items.count();

    if (itemCount < 2) {
      test.skip();
      return;
    }

    // Drag first item to second position (if drag-and-drop is implemented)
    // or use move up/down buttons
    const moveDownButton = items.first().locator('button[aria-label*="Move down"], button:has-text("Down")');
    if (await moveDownButton.count() > 0) {
      await moveDownButton.click();
      await expect(page.locator('text=Order Updated')).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe('Benchmark Sets - API Integration Tests', () => {
  let testOrgId: string;

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);

    const userResponse = await page.request.get(`${STAGING_URL}/api/auth/me`);
    const userData = await userResponse.json();
    testOrgId = userData.organizationId || userData.userOrganizations?.[0]?.organizationId;
  });

  test('should enforce unique name constraint within organization', async ({ page }) => {
    if (!testOrgId) test.skip();

    const testSet = generateTestBenchmarkSet();
    const name = `Unique Name ${Date.now()}`;

    // Create first set
    const response1 = await page.request.post(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmark-sets`,
      {
        data: { name, description: 'First set' },
      }
    );
    expect(response1.status()).toBe(201);
    const created1 = await response1.json();

    // Try to create second set with same name
    const response2 = await page.request.post(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmark-sets`,
      {
        data: { name, description: 'Second set' },
      }
    );
    expect(response2.status()).toBe(409); // Conflict

    // Cleanup
    await page.request.delete(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmark-sets/${created1.id}`
    );
  });

  test('should prevent cross-organization access', async ({ page }) => {
    if (!testOrgId) test.skip();

    // Create a set in test org
    const testSet = generateTestBenchmarkSet();
    const response = await page.request.post(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmark-sets`,
      {
        data: { name: testSet.name, description: testSet.description },
      }
    );
    const created = await response.json();

    // Get list of organizations
    const orgsResponse = await page.request.get(`${STAGING_URL}/api/organizations`);
    const orgs = await orgsResponse.json();
    const otherOrg = orgs.find((org: any) => org.id !== testOrgId);

    if (otherOrg) {
      // Try to access the set from another org
      const accessResponse = await page.request.get(
        `${STAGING_URL}/api/organizations/${otherOrg.id}/benchmark-sets/${created.id}`
      );
      // Should be 403 Forbidden or 404 Not Found
      expect([403, 404]).toContain(accessResponse.status());
    }

    // Cleanup
    await page.request.delete(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmark-sets/${created.id}`
    );
  });

  test('should return benchmark set with items populated', async ({ page }) => {
    if (!testOrgId) test.skip();

    // Create a set
    const testSet = generateTestBenchmarkSet();
    const setResponse = await page.request.post(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmark-sets`,
      {
        data: { name: testSet.name, description: testSet.description },
      }
    );
    const set = await setResponse.json();

    // Get enabled benchmarks for the org
    const benchmarksResponse = await page.request.get(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmarks`
    );
    const benchmarks = await benchmarksResponse.json();

    if (benchmarks.length > 0) {
      // Add a benchmark to the set
      await page.request.post(
        `${STAGING_URL}/api/organizations/${testOrgId}/benchmark-sets/${set.id}/items`,
        {
          data: {
            benchmarkId: benchmarks[0].benchmarkId || benchmarks[0].id,
            benchmarkType: 'site',
          },
        }
      );
    }

    // Get the set with items
    const getResponse = await page.request.get(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmark-sets/${set.id}`
    );
    expect(getResponse.status()).toBe(200);
    const fullSet = await getResponse.json();

    // Verify structure
    expect(fullSet).toHaveProperty('id');
    expect(fullSet).toHaveProperty('name', testSet.name);
    expect(fullSet).toHaveProperty('items');
    expect(Array.isArray(fullSet.items)).toBe(true);

    // Cleanup
    await page.request.delete(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmark-sets/${set.id}`
    );
  });
});

test.describe('Benchmark Sets - Report Wizard Integration', () => {
  let testOrgId: string;
  let testSetId: string;

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);

    const userResponse = await page.request.get(`${STAGING_URL}/api/auth/me`);
    const userData = await userResponse.json();
    testOrgId = userData.organizationId || userData.userOrganizations?.[0]?.organizationId;

    // Create a benchmark set with items
    const testSet = generateTestBenchmarkSet();
    const setResponse = await page.request.post(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmark-sets`,
      {
        data: {
          name: 'NCAA D1 Women Soccer Standards',
          description: 'Standard benchmarks for NCAA D1 Women Soccer',
          sport: 'SOCCER',
          level: 'College',
          gender: 'Female',
        },
      }
    );
    const set = await setResponse.json();
    testSetId = set.id;

    // Add some benchmarks to the set
    const benchmarksResponse = await page.request.get(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmarks`
    );
    const benchmarks = await benchmarksResponse.json();

    for (let i = 0; i < Math.min(3, benchmarks.length); i++) {
      await page.request.post(
        `${STAGING_URL}/api/organizations/${testOrgId}/benchmark-sets/${testSetId}/items`,
        {
          data: {
            benchmarkId: benchmarks[i].benchmarkId || benchmarks[i].id,
            benchmarkType: 'site',
            displayOrder: i,
          },
        }
      );
    }
  });

  test.afterEach(async ({ page }) => {
    try {
      await page.request.delete(
        `${STAGING_URL}/api/organizations/${testOrgId}/benchmark-sets/${testSetId}`
      );
    } catch (error) {
      console.warn('Failed to cleanup:', error);
    }
  });

  test('should allow selecting benchmark set in report wizard', async ({ page }) => {
    if (!testOrgId || !testSetId) test.skip();

    // Navigate to reports and start creating a new report
    await page.goto(`${STAGING_URL}/organizations/${testOrgId}/reports/new`);
    await page.waitForLoadState('networkidle');

    // Navigate through wizard to benchmark selection step (Step 6 based on plan)
    // This will vary based on the wizard implementation

    // Look for benchmark selection step
    const benchmarkStepButton = page.locator('button:has-text("Benchmarks"), [data-step="benchmarks"]');
    if (await benchmarkStepButton.count() > 0) {
      await benchmarkStepButton.click();
    }

    // Toggle to "Select by Set" mode
    const selectBySetToggle = page.locator('button:has-text("Select by Set"), [role="switch"][aria-label*="set"]');
    if (await selectBySetToggle.count() > 0) {
      await selectBySetToggle.click();
    }

    // Select the benchmark set
    const setSelector = page.locator('select[name="benchmarkSet"], [role="combobox"]');
    if (await setSelector.count() > 0) {
      await setSelector.click();
      await page.click('[role="option"]:has-text("NCAA D1 Women Soccer Standards")');
    }

    // Verify benchmarks from set are previewed
    await expect(page.locator('text=Benchmarks from set')).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Benchmark Sets - Analytics Integration', () => {
  let testOrgId: string;
  let testSetId: string;

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);

    const userResponse = await page.request.get(`${STAGING_URL}/api/auth/me`);
    const userData = await userResponse.json();
    testOrgId = userData.organizationId || userData.userOrganizations?.[0]?.organizationId;

    // Create a benchmark set
    const setResponse = await page.request.post(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmark-sets`,
      {
        data: {
          name: 'Analytics Test Set',
          description: 'Set for analytics testing',
        },
      }
    );
    const set = await setResponse.json();
    testSetId = set.id;

    // Add benchmarks
    const benchmarksResponse = await page.request.get(
      `${STAGING_URL}/api/organizations/${testOrgId}/benchmarks`
    );
    const benchmarks = await benchmarksResponse.json();

    for (let i = 0; i < Math.min(2, benchmarks.length); i++) {
      await page.request.post(
        `${STAGING_URL}/api/organizations/${testOrgId}/benchmark-sets/${testSetId}/items`,
        {
          data: {
            benchmarkId: benchmarks[i].benchmarkId || benchmarks[i].id,
            benchmarkType: 'site',
          },
        }
      );
    }
  });

  test.afterEach(async ({ page }) => {
    try {
      await page.request.delete(
        `${STAGING_URL}/api/organizations/${testOrgId}/benchmark-sets/${testSetId}`
      );
    } catch (error) {
      console.warn('Failed to cleanup:', error);
    }
  });

  test('should load benchmarks from set in analytics benchmark selector', async ({ page }) => {
    if (!testOrgId || !testSetId) test.skip();

    // Navigate to analytics page with benchmark line selector
    await page.goto(`${STAGING_URL}/organizations/${testOrgId}/analytics`);
    await page.waitForLoadState('networkidle');

    // Look for "Quick Load" or "Load from Set" button
    const loadFromSetButton = page.locator('button:has-text("Load from Set"), button:has-text("Quick Load")');
    if (await loadFromSetButton.count() > 0) {
      await loadFromSetButton.click();

      // Wait for set picker
      await page.waitForSelector('[role="dialog"], [role="menu"]', { timeout: 5000 });

      // Select the test set
      await page.click('[role="option"]:has-text("Analytics Test Set"), button:has-text("Analytics Test Set")');

      // Verify benchmarks are loaded
      await expect(page.locator('text=Benchmarks loaded from set')).toBeVisible({ timeout: 5000 });
    }
  });
});
