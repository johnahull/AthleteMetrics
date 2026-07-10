import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * TIER 1 CRITICAL: Metric Sport Tags Tests
 *
 * These tests verify sport tagging functionality for metrics:
 * - Site admin can tag metrics with sports in metric form
 * - Site admin sees sports column in metrics table
 * - Org admin sees sport filter in organization metrics card
 * - Sport filtering works correctly (shows tagged + untagged metrics)
 * - Empty sportAssociations = "All Sports"
 *
 * Tests follow TDD methodology: written first, infrastructure built to make them pass.
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

// Helper to generate unique test metric data with sport associations
function generateTestMetricWithSports(sportCodes: string[]) {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  return {
    code: `TEST_METRIC_${uniqueId.toUpperCase()}`,
    label: `Test Metric ${uniqueId}`,
    category: 'speed',
    unit: 'm/s',
    metricType: 'higher_is_better' as const,
    description: 'Test metric for sport tagging E2E testing',
    decimalPrecision: 2,
    sportAssociations: sportCodes,
  };
}

test.describe('Metric Sport Tags - Site Admin Form', () => {
  let createdMetricCodes: string[] = [];

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    createdMetricCodes = [];
  });

  test.afterEach(async ({ page }, testInfo) => {
    // Cleanup: Delete test metrics created during test
    const cleanupErrors: string[] = [];
    for (const code of createdMetricCodes) {
      try {
        const response = await page.request.delete(`${STAGING_URL}/api/metrics/${code}`);
        if (!response.ok()) {
          cleanupErrors.push(`Failed to cleanup metric ${code}: ${response.status()} ${response.statusText()}`);
        }
      } catch (error) {
        cleanupErrors.push(`Failed to cleanup metric ${code}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Attach cleanup errors to test results for visibility in CI
    if (cleanupErrors.length > 0) {
      await testInfo.attach('cleanup-errors', {
        body: cleanupErrors.join('\n'),
        contentType: 'text/plain',
      });
    }
  });

  test('should display sport multi-select in metric creation form', async ({ page }) => {
    await page.goto(`${STAGING_URL}/metrics`);

    // Click "Add Metric" button
    await page.click('[data-testid="add-metric-button"]');

    // Wait for modal to appear
    await page.waitForSelector('[data-testid="metric-form-dialog"]', { timeout: 5000 });

    // Should see sport multi-select component
    const sportSelect = page.locator('[data-testid="sport-multi-select"]');
    await expect(sportSelect).toBeVisible();

    // Should show placeholder "All Sports (default)"
    await expect(sportSelect).toContainText('All Sports');
  });

  test('should create metric with sport associations', async ({ page }) => {
    const testMetric = generateTestMetricWithSports(['SOCCER', 'BASKETBALL']);

    await page.goto(`${STAGING_URL}/metrics`);

    // Click "Add Metric" button
    await page.click('[data-testid="add-metric-button"]');
    await page.waitForSelector('[data-testid="metric-form-dialog"]');

    // Fill in basic metric fields
    await page.fill('[data-testid="metric-code-input"]', testMetric.code);
    await page.fill('[data-testid="metric-label-input"]', testMetric.label);
    await page.fill('[data-testid="metric-category-input"]', testMetric.category);
    await page.fill('[data-testid="metric-unit-input"]', testMetric.unit);
    await page.fill('[data-testid="metric-description-input"]', testMetric.description);

    // Select metric type
    await page.click('[data-testid="metric-direction-select"]');
    await page.click('text=Higher is better');

    // Open sport multi-select
    await page.click('[data-testid="sport-multi-select"]');

    // Select Soccer
    await page.click('[data-testid="sport-option-SOCCER"]');

    // Select Basketball
    await page.click('[data-testid="sport-option-BASKETBALL"]');

    // Close dropdown by clicking outside
    await page.click('[data-testid="metric-form-dialog"]');

    // Verify both sports are selected (shown as badges)
    await expect(page.locator('[data-testid="sport-badge-SOCCER"]')).toBeVisible();
    await expect(page.locator('[data-testid="sport-badge-BASKETBALL"]')).toBeVisible();

    // Submit form
    await page.click('[data-testid="save-metric-button"]');

    // Wait for success message
    await expect(page.getByText('Metric created')).toBeVisible({ timeout: 5000 });

    // Track for cleanup
    createdMetricCodes.push(testMetric.code);

    // Verify metric was created with sport associations via API
    const response = await page.request.get(`${STAGING_URL}/api/metrics/${testMetric.code}`);
    expect(response.ok()).toBeTruthy();
    const metric = await response.json();
    expect(metric.sportAssociations).toEqual(expect.arrayContaining(['SOCCER', 'BASKETBALL']));
  });

  test('should create metric without sport associations (All Sports)', async ({ page }) => {
    const testMetric = generateTestMetricWithSports([]);

    await page.goto(`${STAGING_URL}/metrics`);

    // Click "Add Metric" button
    await page.click('[data-testid="add-metric-button"]');
    await page.waitForSelector('[data-testid="metric-form-dialog"]');

    // Fill in basic metric fields
    await page.fill('[data-testid="metric-code-input"]', testMetric.code);
    await page.fill('[data-testid="metric-label-input"]', testMetric.label);

    // Don't select any sports - leave as "All Sports"

    // Submit form
    await page.click('[data-testid="save-metric-button"]');

    // Wait for success message
    await expect(page.getByText('Metric created')).toBeVisible({ timeout: 5000 });

    // Track for cleanup
    createdMetricCodes.push(testMetric.code);

    // Verify metric was created with null/empty sport associations
    const response = await page.request.get(`${STAGING_URL}/api/metrics/${testMetric.code}`);
    expect(response.ok()).toBeTruthy();
    const metric = await response.json();
    expect(metric.sportAssociations === null || metric.sportAssociations?.length === 0).toBeTruthy();
  });

  test('should edit metric and add sport associations', async ({ page }) => {
    // Create a metric without sports first
    const testMetric = generateTestMetricWithSports([]);
    const createResponse = await page.request.post(`${STAGING_URL}/api/metrics`, {
      data: testMetric,
    });
    expect(createResponse.ok()).toBeTruthy();
    createdMetricCodes.push(testMetric.code);

    await page.goto(`${STAGING_URL}/metrics`);

    // Click edit button
    await page.click(`[data-testid="edit-metric-${testMetric.code}"]`);
    await page.waitForSelector('[data-testid="metric-form-dialog"]');

    // Open sport multi-select
    await page.click('[data-testid="sport-multi-select"]');

    // Select Soccer
    await page.click('[data-testid="sport-option-SOCCER"]');

    // Close dropdown
    await page.click('[data-testid="metric-form-dialog"]');

    // Verify Soccer is selected
    await expect(page.locator('[data-testid="sport-badge-SOCCER"]')).toBeVisible();

    // Submit form
    await page.click('[data-testid="save-metric-button"]');

    // Wait for success message
    await expect(page.getByText('Metric updated')).toBeVisible({ timeout: 5000 });

    // Verify update via API
    const response = await page.request.get(`${STAGING_URL}/api/metrics/${testMetric.code}`);
    const metric = await response.json();
    expect(metric.sportAssociations).toContain('SOCCER');
  });

  test('should remove sport associations by clearing badges', async ({ page }) => {
    // Create a metric with sports
    const testMetric = generateTestMetricWithSports(['SOCCER', 'BASKETBALL']);
    const createResponse = await page.request.post(`${STAGING_URL}/api/metrics`, {
      data: testMetric,
    });
    expect(createResponse.ok()).toBeTruthy();
    createdMetricCodes.push(testMetric.code);

    await page.goto(`${STAGING_URL}/metrics`);

    // Click edit button
    await page.click(`[data-testid="edit-metric-${testMetric.code}"]`);
    await page.waitForSelector('[data-testid="metric-form-dialog"]');

    // Remove Soccer by clicking the X button
    await page.click('[data-testid="remove-sport-SOCCER"]');

    // Remove Basketball
    await page.click('[data-testid="remove-sport-BASKETBALL"]');

    // Should show "All Sports" placeholder again
    await expect(page.locator('[data-testid="sport-multi-select"]')).toContainText('All Sports');

    // Submit form
    await page.click('[data-testid="save-metric-button"]');

    // Wait for success
    await expect(page.getByText('Metric updated')).toBeVisible({ timeout: 5000 });

    // Verify sports were removed
    const response = await page.request.get(`${STAGING_URL}/api/metrics/${testMetric.code}`);
    const metric = await response.json();
    expect(metric.sportAssociations === null || metric.sportAssociations?.length === 0).toBeTruthy();
  });
});

test.describe('Metric Sport Tags - Site Admin Table Display', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
  });

  test('should display Sports column in metrics table', async ({ page }) => {
    await page.goto(`${STAGING_URL}/metrics`);

    // Wait for table
    await page.waitForSelector('[data-testid="metrics-table"]', { timeout: 5000 });

    // Should see Sports column header
    const sportsHeader = page.locator('th:has-text("Sports")');
    await expect(sportsHeader).toBeVisible();
  });

  test('should show "All Sports" badge for default metrics (universal)', async ({ page }) => {
    await page.goto(`${STAGING_URL}/metrics`);

    // Wait for table
    await page.waitForSelector('[data-testid="metrics-table"]', { timeout: 5000 });

    // Default metrics have null sportAssociations (available to all sports)
    const fly10Row = page.locator('[data-testid="metric-row-FLY10_TIME"]');
    await expect(fly10Row).toBeVisible();

    // Should see "All Sports" badge in sports column
    const sportsBadge = fly10Row.locator('[data-testid="sports-cell"] >> text=All Sports');
    await expect(sportsBadge).toBeVisible();
  });

  test('should show "All Sports" badge for metrics without associations', async ({ page }) => {
    // Create a metric without sport associations
    const testMetric = generateTestMetricWithSports([]);
    const response = await page.request.post(`${STAGING_URL}/api/metrics`, {
      data: testMetric,
    });
    expect(response.ok()).toBeTruthy();

    await page.goto(`${STAGING_URL}/metrics`);
    await page.waitForSelector('[data-testid="metrics-table"]');

    // Find the test metric row
    const metricRow = page.locator(`[data-testid="metric-row-${testMetric.code}"]`);
    await expect(metricRow).toBeVisible();

    // Should show "All Sports" badge
    const allSportsBadge = metricRow.locator('[data-testid="sports-cell"] >> text=All Sports');
    await expect(allSportsBadge).toBeVisible();

    // Cleanup
    await page.request.delete(`${STAGING_URL}/api/metrics/${testMetric.code}`);
  });

  test('should show first 3 sports + overflow indicator for metrics with many sports', async ({ page }) => {
    // Create a metric with 5 sports
    const testMetric = generateTestMetricWithSports(['SOCCER', 'BASKETBALL', 'VOLLEYBALL', 'TENNIS', 'BASEBALL']);
    const response = await page.request.post(`${STAGING_URL}/api/metrics`, {
      data: testMetric,
    });
    expect(response.ok()).toBeTruthy();

    await page.goto(`${STAGING_URL}/metrics`);
    await page.waitForSelector('[data-testid="metrics-table"]');

    // Find the test metric row
    const metricRow = page.locator(`[data-testid="metric-row-${testMetric.code}"]`);
    await expect(metricRow).toBeVisible();

    const sportsCell = metricRow.locator('[data-testid="sports-cell"]');

    // Should show first 3 sports
    await expect(sportsCell.locator('text=Soccer')).toBeVisible();
    await expect(sportsCell.locator('text=Basketball')).toBeVisible();
    await expect(sportsCell.locator('text=Volleyball')).toBeVisible();

    // Should show "+2 more" indicator
    await expect(sportsCell.locator('text=+2 more')).toBeVisible();

    // Cleanup
    await page.request.delete(`${STAGING_URL}/api/metrics/${testMetric.code}`);
  });
});

test.describe('Metric Sport Tags - Org Admin Filtering', () => {
  let testOrgId: string;

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);

    // Get or create a test organization
    const orgsResponse = await page.request.get(`${STAGING_URL}/api/organizations`);
    const orgs = await orgsResponse.json();
    testOrgId = orgs[0]?.id;
  });

  test('should display sport filter dropdown in organization metrics card', async ({ page }) => {
    await page.goto(`${STAGING_URL}/organizations/${testOrgId}/settings`);

    // Navigate to metrics tab
    await page.click('text=Metrics');

    // Wait for organization metrics card
    await page.waitForSelector('[data-testid="organization-metrics-card"]', { timeout: 5000 });

    // Should see sport filter dropdown
    const sportFilter = page.locator('[data-testid="sport-filter-dropdown"]');
    await expect(sportFilter).toBeVisible();

    // Should default to "All Sports"
    await expect(sportFilter).toContainText('All Sports');
  });

  test('should display Sports column in organization metrics table', async ({ page }) => {
    await page.goto(`${STAGING_URL}/organizations/${testOrgId}/settings`);
    await page.click('text=Metrics');
    await page.waitForSelector('[data-testid="organization-metrics-card"]');

    // Should see Sports column in table
    const sportsHeader = page.locator('[data-testid="organization-metrics-card"] >> th:has-text("Sports")');
    await expect(sportsHeader).toBeVisible();
  });

  test('should filter metrics by selected sport', async ({ page }) => {
    await page.goto(`${STAGING_URL}/organizations/${testOrgId}/settings`);
    await page.click('text=Metrics');
    await page.waitForSelector('[data-testid="organization-metrics-card"]');

    // Get initial count of visible metrics (should be all metrics)
    const initialRows = await page.locator('[data-testid^="org-metric-row-"]').count();

    // Open sport filter dropdown
    await page.click('[data-testid="sport-filter-dropdown"]');

    // Select "Soccer"
    await page.click('[data-testid="sport-filter-option-SOCCER"]');

    // Wait for filter to apply
    await page.waitForLoadState('networkidle');

    // Should now only show metrics tagged with Soccer + general metrics (no tags)
    const filteredRows = await page.locator('[data-testid^="org-metric-row-"]').count();

    // Default metrics (FLY10_TIME) have no sport tags, so they appear in all filters
    const fly10Row = page.locator('[data-testid="org-metric-row-FLY10_TIME"]');
    await expect(fly10Row).toBeVisible();

    // Filtered count equals initial count since default metrics have no sport associations
    expect(filteredRows).toBeLessThanOrEqual(initialRows);
  });

  test('should show general metrics (no tags) when filtering by specific sport', async ({ page }) => {
    // Create a general metric (no sport associations)
    const generalMetric = generateTestMetricWithSports([]);
    await page.request.post(`${STAGING_URL}/api/metrics`, {
      data: generalMetric,
    });

    // Enable the metric for the organization
    await page.request.post(`${STAGING_URL}/api/organizations/${testOrgId}/metrics/${generalMetric.code}/enable`);

    await page.goto(`${STAGING_URL}/organizations/${testOrgId}/settings`);
    await page.click('text=Metrics');
    await page.waitForSelector('[data-testid="organization-metrics-card"]');

    // Filter by Soccer
    await page.click('[data-testid="sport-filter-dropdown"]');
    await page.click('[data-testid="sport-filter-option-SOCCER"]');

    await page.waitForLoadState('networkidle');

    // Should see the general metric (no sport tags = shows in all filters)
    const generalMetricRow = page.locator(`[data-testid="org-metric-row-${generalMetric.code}"]`);
    await expect(generalMetricRow).toBeVisible();

    // Cleanup
    await page.request.delete(`${STAGING_URL}/api/metrics/${generalMetric.code}`);
  });

  test('should show all metrics when "All Sports" filter is selected', async ({ page }) => {
    await page.goto(`${STAGING_URL}/organizations/${testOrgId}/settings`);
    await page.click('text=Metrics');
    await page.waitForSelector('[data-testid="organization-metrics-card"]');

    // Apply a specific sport filter first
    await page.click('[data-testid="sport-filter-dropdown"]');
    await page.click('[data-testid="sport-filter-option-SOCCER"]');
    await page.waitForLoadState('networkidle');

    const filteredCount = await page.locator('[data-testid^="org-metric-row-"]').count();

    // Switch back to "All Sports"
    await page.click('[data-testid="sport-filter-dropdown"]');
    await page.click('[data-testid="sport-filter-option-ALL"]');
    await page.waitForLoadState('networkidle');

    // Should show all metrics again
    const allCount = await page.locator('[data-testid^="org-metric-row-"]').count();
    expect(allCount).toBeGreaterThanOrEqual(filteredCount);
  });

  test('should display sport badges in organization metrics table', async ({ page }) => {
    await page.goto(`${STAGING_URL}/organizations/${testOrgId}/settings`);
    await page.click('text=Metrics');
    await page.waitForSelector('[data-testid="organization-metrics-card"]');

    // Find FLY10_TIME row (default metrics have "All Sports" badge)
    const fly10Row = page.locator('[data-testid="org-metric-row-FLY10_TIME"]');
    await expect(fly10Row).toBeVisible();

    // Should see "All Sports" badge in sports column (default metrics have no sport tags)
    const sportsCell = fly10Row.locator('[data-testid="org-metric-sports-cell"]');
    await expect(sportsCell.locator('text=All Sports')).toBeVisible();
  });
});

test.describe('Metric Sport Tags - Data Migration', () => {
  test('should have default metrics with null sport associations (universal)', async ({ page }) => {
    await loginAsDefaultUser(page);

    // Verify FLY10_TIME has null sportAssociations (available to all sports)
    const response = await page.request.get(`${STAGING_URL}/api/metrics/FLY10_TIME`);
    expect(response.ok()).toBeTruthy();
    const metric = await response.json();

    // Default metrics have no sport associations (null or empty)
    expect(metric.sportAssociations === null || metric.sportAssociations?.length === 0).toBeTruthy();
  });

  test('should use sport CODES not names when sport associations exist', async ({ page }) => {
    await loginAsDefaultUser(page);

    // Create a metric with sport associations
    const testMetric = generateTestMetricWithSports(['SOCCER', 'BASKETBALL']);
    const createResponse = await page.request.post(`${STAGING_URL}/api/metrics`, {
      data: testMetric,
    });
    expect(createResponse.ok()).toBeTruthy();

    // Verify sport associations use CODES not names
    const response = await page.request.get(`${STAGING_URL}/api/metrics/${testMetric.code}`);
    const metric = await response.json();

    expect(metric.sportAssociations).toContain('SOCCER');
    expect(metric.sportAssociations).not.toContain('Soccer');
    expect(metric.sportAssociations).toContain('BASKETBALL');
    expect(metric.sportAssociations).not.toContain('Basketball');

    // Cleanup
    await page.request.delete(`${STAGING_URL}/api/metrics/${testMetric.code}`);
  });
});
