import { test, expect } from '@playwright/test';
import { loginAsDefaultUser, loginAsSiteAdmin } from './helpers/auth';

/**
 * BENCHMARK GROUPS FEATURE: End-to-End Tests
 *
 * Comprehensive E2E test suite for benchmark groups covering:
 * - Site Admin: Site benchmark group CRUD operations
 * - Org Admin: Custom benchmark group CRUD operations
 * - ReportWizard: Integration with report creation
 * - Loading states: Verify no infinite loading issues
 *
 * Tests the composite benchmark groups feature added in feat/composite-benchmark-groups
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

// Helper to generate unique test data
function generateTestGroup(prefix: string = 'Test Group') {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  return {
    name: `${prefix} ${uniqueId}`,
    description: `E2E test group created at ${new Date().toISOString()}`,
  };
}

test.describe('Benchmark Groups - Site Admin Tests', () => {
  let createdGroupIds: string[] = [];
  let createdBenchmarkIds: string[] = [];

  test.beforeEach(async ({ page }) => {
    await loginAsSiteAdmin(page);
    createdGroupIds = [];
    createdBenchmarkIds = [];
  });

  test.afterEach(async ({ page }) => {
    // Cleanup: Delete created groups
    for (const groupId of createdGroupIds) {
      try {
        await page.request.delete(`${STAGING_URL}/api/benchmark-groups/${groupId}`);
      } catch (error) {
        console.warn(`Failed to cleanup benchmark group ${groupId}:`, error);
      }
    }

    // Cleanup: Delete created benchmarks
    for (const benchmarkId of createdBenchmarkIds) {
      try {
        await page.request.delete(`${STAGING_URL}/api/benchmarks/${benchmarkId}`);
      } catch (error) {
        console.warn(`Failed to cleanup benchmark ${benchmarkId}:`, error);
      }
    }
  });

  test('should navigate to benchmark groups page', async ({ page }) => {
    // Navigate to benchmarks page
    await page.goto(`${STAGING_URL}/benchmarks`);
    await page.waitForLoadState('networkidle');

    // Click "Benchmark Groups" nav link in sidebar
    const groupsLink = page.locator('[data-testid="benchmark-groups-menu-item"]');
    await expect(groupsLink).toBeVisible({ timeout: 5000 });
    await groupsLink.click();

    // Verify we're on the benchmark groups page
    await expect(page).toHaveURL(/\/benchmark-groups/);
    await expect(page.locator('h1:has-text("Site Benchmark Groups")')).toBeVisible();
  });

  test('should create a new site benchmark group', async ({ page }) => {
    const testGroup = generateTestGroup('Elite Standards');

    // Navigate to benchmark groups page
    await page.goto(`${STAGING_URL}/benchmark-groups`);
    await page.waitForLoadState('networkidle');

    // Click "Create Group" button
    const createButton = page.locator('[data-testid="create-site-group-button"]');
    await expect(createButton).toBeVisible({ timeout: 5000 });
    await createButton.click();

    // Wait for form dialog
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=Create Site Benchmark Group')).toBeVisible();

    // Fill in group details
    await page.locator('[data-testid="site-group-name-input"]').fill(testGroup.name);
    await page.locator('[data-testid="site-group-description-input"]').fill(testGroup.description);

    // Verify active toggle is on by default
    const activeToggle = page.locator('[data-testid="site-group-active-toggle"]');
    await expect(activeToggle).toBeChecked();

    // Listen for API response
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/benchmark-groups') && response.request().method() === 'POST'
    );

    // Submit form
    await page.locator('[data-testid="save-site-group-button"]').click();

    // Capture group ID
    const response = await responsePromise;
    const data = await response.json();
    createdGroupIds.push(data.id);

    // Verify success toast
    await expect(page.locator('text=Site benchmark group created successfully')).toBeVisible({ timeout: 5000 });

    // Verify group appears in list
    const groupCard = page.locator(`[data-testid="site-group-card-${data.id}"]`);
    await expect(groupCard).toBeVisible();
    await expect(groupCard.locator(`text=${testGroup.name}`)).toBeVisible();
  });

  test('should add benchmarks to a group', async ({ page }) => {
    // First create a group
    const testGroup = generateTestGroup('Performance Standards');
    const createGroupResponse = await page.request.post(`${STAGING_URL}/api/benchmark-groups`, {
      data: {
        name: testGroup.name,
        description: testGroup.description,
        isActive: true,
      },
    });
    const groupData = await createGroupResponse.json();
    createdGroupIds.push(groupData.id);

    // Create some benchmarks to add to the group
    const benchmark1Response = await page.request.post(`${STAGING_URL}/api/benchmarks`, {
      data: {
        name: 'Elite 10-Yard Fly',
        metricCode: 'FLY10_TIME',
        benchmarkValue: 1.0,
        comparisonOperator: 'lte',
        isActive: true,
      },
    });
    const benchmark1 = await benchmark1Response.json();
    createdBenchmarkIds.push(benchmark1.id);

    // Navigate to benchmark groups page
    await page.goto(`${STAGING_URL}/benchmark-groups`);
    await page.waitForLoadState('networkidle');

    // Find and click edit button for the group
    const editButton = page.locator(`[data-testid="edit-site-group-${groupData.id}"]`);
    await expect(editButton).toBeVisible({ timeout: 5000 });
    await editButton.click();

    // Wait for editor dialog
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.locator('text=Edit Site Benchmark Group')).toBeVisible();

    // Select the benchmark
    const benchmarkCheckbox = page.locator(`[data-testid="site-benchmark-checkbox-${benchmark1.id}"]`);
    await expect(benchmarkCheckbox).toBeVisible({ timeout: 5000 });
    await benchmarkCheckbox.click();

    // Verify selection count updates
    await expect(page.locator('text=1 benchmark selected')).toBeVisible();

    // Save
    await page.locator('[data-testid="save-site-group-button"]').click();

    // Verify success
    await expect(page.locator('text=Site benchmark group updated successfully')).toBeVisible({ timeout: 5000 });

    // Verify benchmark appears in group preview
    const groupCard = page.locator(`[data-testid="site-group-card-${groupData.id}"]`);
    await expect(groupCard.locator('text=Elite 10-Yard Fly')).toBeVisible();
  });

  test('should delete a benchmark group', async ({ page }) => {
    // Create a group via API
    const testGroup = generateTestGroup('Temp Group');
    const createResponse = await page.request.post(`${STAGING_URL}/api/benchmark-groups`, {
      data: {
        name: testGroup.name,
        description: testGroup.description,
        isActive: true,
      },
    });
    const groupData = await createResponse.json();
    // Don't add to cleanup array - we're testing deletion

    // Navigate to benchmark groups page
    await page.goto(`${STAGING_URL}/benchmark-groups`);
    await page.waitForLoadState('networkidle');

    // Click delete button
    const deleteButton = page.locator(`[data-testid="delete-site-group-${groupData.id}"]`);
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // Confirm in dialog
    await expect(page.locator('[role="alertdialog"]')).toBeVisible();
    await expect(page.locator('text=Delete Site Benchmark Group?')).toBeVisible();

    const confirmButton = page.locator('button:has-text("Delete")').last();
    await confirmButton.click();

    // Verify success
    await expect(page.locator('text=Site benchmark group deleted successfully')).toBeVisible({ timeout: 5000 });

    // Verify group is removed from list
    const groupCard = page.locator(`[data-testid="site-group-card-${groupData.id}"]`);
    await expect(groupCard).not.toBeVisible();
  });

  test('should filter groups by active/inactive status', async ({ page }) => {
    // Create an active and inactive group
    const activeGroup = generateTestGroup('Active Group');
    const inactiveGroup = generateTestGroup('Inactive Group');

    const activeResponse = await page.request.post(`${STAGING_URL}/api/benchmark-groups`, {
      data: { ...activeGroup, isActive: true },
    });
    const activeData = await activeResponse.json();
    createdGroupIds.push(activeData.id);

    const inactiveResponse = await page.request.post(`${STAGING_URL}/api/benchmark-groups`, {
      data: { ...inactiveGroup, isActive: false },
    });
    const inactiveData = await inactiveResponse.json();
    createdGroupIds.push(inactiveData.id);

    // Navigate to page
    await page.goto(`${STAGING_URL}/benchmark-groups`);
    await page.waitForLoadState('networkidle');

    // Initially, only active group should be visible
    await expect(page.locator(`[data-testid="site-group-card-${activeData.id}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="site-group-card-${inactiveData.id}"]`)).not.toBeVisible();

    // Toggle "Show inactive"
    const inactiveToggle = page.locator('[data-testid="include-inactive-toggle"]');
    await inactiveToggle.click();

    // Now both should be visible
    await expect(page.locator(`[data-testid="site-group-card-${activeData.id}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="site-group-card-${inactiveData.id}"]`)).toBeVisible();
  });

  test('should search groups by name', async ({ page }) => {
    const group1 = generateTestGroup('Elite Performance');
    const group2 = generateTestGroup('Youth Standards');

    const response1 = await page.request.post(`${STAGING_URL}/api/benchmark-groups`, {
      data: { ...group1, isActive: true },
    });
    const data1 = await response1.json();
    createdGroupIds.push(data1.id);

    const response2 = await page.request.post(`${STAGING_URL}/api/benchmark-groups`, {
      data: { ...group2, isActive: true },
    });
    const data2 = await response2.json();
    createdGroupIds.push(data2.id);

    // Navigate to page
    await page.goto(`${STAGING_URL}/benchmark-groups`);
    await page.waitForLoadState('networkidle');

    // Both groups should be visible initially
    await expect(page.locator(`[data-testid="site-group-card-${data1.id}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="site-group-card-${data2.id}"]`)).toBeVisible();

    // Search for "Elite"
    const searchInput = page.locator('[data-testid="search-site-groups"]');
    await searchInput.fill('Elite');

    // Only first group should be visible
    await expect(page.locator(`[data-testid="site-group-card-${data1.id}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="site-group-card-${data2.id}"]`)).not.toBeVisible();
  });
});

test.describe('Benchmark Groups - Org Admin Tests', () => {
  let createdGroupIds: string[] = [];
  let createdBenchmarkIds: string[] = [];
  let organizationId: string;

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page); // Org admin
    createdGroupIds = [];
    createdBenchmarkIds = [];

    // Get organization ID from auth context
    await page.goto(`${STAGING_URL}/dashboard`);
    const orgId = await page.evaluate(() => {
      const context = (window as any).__ORGANIZATION_CONTEXT__;
      return context || null;
    });

    if (!orgId) {
      // Try to get from URL or session storage
      const stored = await page.evaluate(() => sessionStorage.getItem('organizationContext'));
      organizationId = stored || ''; // Will need to be set via another method if not available
    } else {
      organizationId = orgId;
    }
  });

  test.afterEach(async ({ page }) => {
    // Cleanup custom groups
    for (const groupId of createdGroupIds) {
      try {
        if (organizationId) {
          await page.request.delete(`${STAGING_URL}/api/organizations/${organizationId}/benchmark-groups/custom/${groupId}`);
        }
      } catch (error) {
        console.warn(`Failed to cleanup custom group ${groupId}:`, error);
      }
    }

    // Cleanup custom benchmarks
    for (const benchmarkId of createdBenchmarkIds) {
      try {
        if (organizationId) {
          await page.request.delete(`${STAGING_URL}/api/organizations/${organizationId}/benchmarks/custom/${benchmarkId}`);
        }
      } catch (error) {
        console.warn(`Failed to cleanup custom benchmark ${benchmarkId}:`, error);
      }
    }
  });

  test('should navigate to custom benchmark groups page from org benchmarks', async ({ page }) => {
    // Skip if no org ID available
    test.skip(!organizationId, 'No organization ID available');

    // Navigate to organization benchmarks page
    await page.goto(`${STAGING_URL}/organizations/${organizationId}/benchmarks`);
    await page.waitForLoadState('networkidle');

    // Click "Benchmark Groups" button
    const groupsButton = page.locator('button:has-text("Benchmark Groups")');
    await expect(groupsButton).toBeVisible({ timeout: 5000 });
    await groupsButton.click();

    // Verify we're on custom benchmark groups page
    await expect(page).toHaveURL(/\/organizations\/.*\/benchmark-groups/);
    await expect(page.locator('h1:has-text("Custom Benchmark Groups")')).toBeVisible();

    // Verify page loaded without infinite spinner
    await expect(page.locator('text=Loading')).not.toBeVisible({ timeout: 3000 });
  });

  test('should create a custom benchmark group', async ({ page }) => {
    test.skip(!organizationId, 'No organization ID available');

    const testGroup = generateTestGroup('Custom Team Standards');

    await page.goto(`${STAGING_URL}/organizations/${organizationId}/benchmark-groups`);
    await page.waitForLoadState('networkidle');

    // Click create button
    const createButton = page.locator('[data-testid="create-custom-group-button"]');
    await expect(createButton).toBeVisible({ timeout: 5000 });
    await createButton.click();

    // Fill form
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await page.locator('[data-testid="custom-group-name-input"]').fill(testGroup.name);
    await page.locator('[data-testid="custom-group-description-input"]').fill(testGroup.description);

    // Listen for API response
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/benchmark-groups/custom') && response.request().method() === 'POST'
    );

    // Submit
    await page.locator('[data-testid="save-custom-group-button"]').click();

    // Capture ID
    const response = await responsePromise;
    const data = await response.json();
    createdGroupIds.push(data.id);

    // Verify success
    await expect(page.locator('text=Custom benchmark group created successfully')).toBeVisible({ timeout: 5000 });

    // Verify in list
    const groupCard = page.locator(`[data-testid="custom-group-card-${data.id}"]`);
    await expect(groupCard).toBeVisible();
  });
});

test.describe('Benchmark Groups - ReportWizard Integration', () => {
  let organizationId: string;

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);

    // Get organization context
    await page.goto(`${STAGING_URL}/dashboard`);
    const orgId = await page.evaluate(() => {
      return (window as any).__ORGANIZATION_CONTEXT__ || sessionStorage.getItem('organizationContext');
    });
    organizationId = orgId || '';
  });

  test('should load benchmark groups in ReportWizard without infinite loading', async ({ page }) => {
    test.skip(!organizationId, 'No organization ID available');

    // Navigate to reports page
    await page.goto(`${STAGING_URL}/reports`);
    await page.waitForLoadState('networkidle');

    // Click "Create Report" button
    const createButton = page.locator('button:has-text("Create Report")');
    await expect(createButton).toBeVisible({ timeout: 5000 });
    await createButton.click();

    // Wait for wizard dialog
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });

    // Step 1: Select team report type
    const teamRadio = page.locator('input[value="team"]');
    await teamRadio.click();

    // Navigate through steps to benchmarks step (step 5)
    // Step 1 -> Step 3 (skips athlete selection for team reports)
    await page.locator('button:has-text("Next")').click();

    // Step 3: Timeframe
    await page.locator('button:has-text("Next")').click();

    // Step 4: Metrics (select at least one)
    const firstMetric = page.locator('input[type="checkbox"]').first();
    await firstMetric.click();
    await page.locator('button:has-text("Next")').click();

    // Step 5: Benchmarks - THIS IS THE CRITICAL TEST
    await expect(page.locator('text=Benchmarks (Optional)')).toBeVisible({ timeout: 5000 });

    // VERIFY: No infinite loading spinner
    await expect(page.locator('text=Loading').first()).not.toBeVisible({ timeout: 3000 });

    // VERIFY: Benchmark groups section is visible
    const groupsSection = page.locator('text=Benchmark Groups');
    await expect(groupsSection).toBeVisible({ timeout: 5000 });

    // VERIFY: Can interact with benchmark group checkboxes
    const groupCheckboxes = page.locator('input[type="checkbox"][id^="site-group-"]');
    const count = await groupCheckboxes.count();

    // If there are groups available, verify they're interactive
    if (count > 0) {
      const firstGroupCheckbox = groupCheckboxes.first();
      await expect(firstGroupCheckbox).toBeEnabled();
      await firstGroupCheckbox.click();
      await expect(firstGroupCheckbox).toBeChecked();
    }
  });

  test('should select benchmark groups in report creation', async ({ page }) => {
    test.skip(!organizationId, 'No organization ID available');

    // Create a test group first
    const groupResponse = await page.request.post(`${STAGING_URL}/api/benchmark-groups`, {
      data: {
        name: 'E2E Test Group for Reports',
        description: 'Test group for report wizard',
        isActive: true,
      },
    });
    const groupData = await groupResponse.json();

    try {
      // Navigate to reports and open wizard
      await page.goto(`${STAGING_URL}/reports`);
      await page.locator('button:has-text("Create Report")').click();

      // Navigate to benchmarks step
      await page.locator('input[value="team"]').click();
      await page.locator('button:has-text("Next")').click(); // Step 3
      await page.locator('button:has-text("Next")').click(); // Step 4
      const firstMetric = page.locator('input[type="checkbox"]').first();
      await firstMetric.click();
      await page.locator('button:has-text("Next")').click(); // Step 5: Benchmarks

      // Select the test group
      const groupCheckbox = page.locator(`#site-group-${groupData.id}`);
      await expect(groupCheckbox).toBeVisible({ timeout: 5000 });
      await groupCheckbox.click();
      await expect(groupCheckbox).toBeChecked();

      // Verify we can proceed
      await page.locator('button:has-text("Next")').click();

      // Should be able to reach step 6 without errors
      await expect(page.locator('text=Filters (Optional)')).toBeVisible({ timeout: 5000 });

    } finally {
      // Cleanup
      await page.request.delete(`${STAGING_URL}/api/benchmark-groups/${groupData.id}`);
    }
  });
});

test.describe('Benchmark Groups - Loading States', () => {
  test('should not show infinite loading on custom groups page', async ({ page }) => {
    await loginAsDefaultUser(page);

    // Get org ID
    await page.goto(`${STAGING_URL}/dashboard`);
    const orgId = await page.evaluate(() => {
      return (window as any).__ORGANIZATION_CONTEXT__ || sessionStorage.getItem('organizationContext');
    });

    test.skip(!orgId, 'No organization ID available');

    // Navigate to custom groups page
    await page.goto(`${STAGING_URL}/organizations/${orgId}/benchmark-groups`);

    // Page should load within 5 seconds
    await page.waitForLoadState('networkidle', { timeout: 5000 });

    // Should not see persistent loading spinner
    await expect(page.locator('text=Loading')).not.toBeVisible({ timeout: 3000 });

    // Should see the page content
    await expect(page.locator('h1:has-text("Custom Benchmark Groups")')).toBeVisible();
  });
});
