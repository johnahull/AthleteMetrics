import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * TIER 1 CRITICAL: Metric Management Tests
 *
 * These tests verify the site-level metric management and organization-level metric enablement:
 * - Creating custom metrics (site admin only)
 * - Editing metric properties
 * - Enabling/disabling metrics globally
 * - Deleting metrics (with validation)
 * - Organization-level metric opt-in
 * - Permission enforcement
 * - Metric visibility in measurement forms
 *
 * Tests follow TDD methodology: written first, infrastructure built to make them pass.
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

// Helper to generate unique test metric data
function generateTestMetric() {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  return {
    code: `TEST_METRIC_${uniqueId.toUpperCase()}`,
    label: `Test Metric ${uniqueId}`,
    category: 'speed',
    unit: 'm/s',
    metricType: 'higher_is_better' as const,
    description: 'Test metric for E2E testing',
    decimalPrecision: 2,
  };
}

test.describe('Metric Management - Site Admin', () => {
  let createdMetricCodes: string[] = [];

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page); // Assumes default user is site admin
    createdMetricCodes = [];
  });

  test.afterEach(async ({ page }) => {
    // Cleanup: Delete test metrics created during test
    for (const code of createdMetricCodes) {
      try {
        await page.request.delete(`${STAGING_URL}/api/metrics/${code}`);
      } catch (error) {
        console.warn(`Failed to cleanup metric ${code}:`, error);
      }
    }
  });

  test('should navigate to Metrics management page from admin menu', async ({ page }) => {
    // Click on admin/site admin dropdown in navigation
    await page.click('[data-testid="site-admin-menu"]');

    // Click "Metrics" link
    await page.click('[data-testid="metrics-menu-item"]');

    // Verify we're on the metrics page
    await expect(page).toHaveURL(/\/metrics/);
    await expect(page.locator('h1')).toContainText('Metrics Management');
  });

  test('should display list of existing metrics', async ({ page }) => {
    await page.goto(`${STAGING_URL}/metrics`);

    // Should show metrics table
    await page.waitForSelector('[data-testid="metrics-table"]', { timeout: 5000 });

    // Should show at least the 8 default metrics
    const metricRows = page.locator('[data-testid^="metric-row-"]');
    await expect(metricRows).toHaveCount(8, { timeout: 5000 });

    // Should display FLY10_TIME as a system default
    const fly10Row = page.locator('[data-testid="metric-row-FLY10_TIME"]');
    await expect(fly10Row).toBeVisible();
    await expect(fly10Row).toContainText('10-Yard Fly Time');
    await expect(fly10Row).toContainText('System Default');
  });

  test('should successfully create a new custom metric', async ({ page }) => {
    const testMetric = generateTestMetric();

    await page.goto(`${STAGING_URL}/metrics`);

    // Click "Add Metric" button
    await page.click('[data-testid="add-metric-button"]');

    // Wait for modal to appear
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Fill in metric form
    await page.fill('[name="code"]', testMetric.code);
    await page.fill('[name="label"]', testMetric.label);
    await page.selectOption('[name="category"]', testMetric.category);
    await page.fill('[name="unit"]', testMetric.unit);
    await page.fill('[name="description"]', testMetric.description);
    await page.selectOption('[name="decimalPrecision"]', testMetric.decimalPrecision.toString());

    // Select metric type (metricType dropdown)
    await page.selectOption('[name="metricType"]', testMetric.metricType);

    // Submit form
    await page.click('[data-testid="submit-metric-button"]');

    // Wait for success message
    await expect(page.locator('[data-testid="success-toast"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="success-toast"]')).toContainText('Metric created successfully');

    // Verify metric appears in table
    const newMetricRow = page.locator(`[data-testid="metric-row-${testMetric.code}"]`);
    await expect(newMetricRow).toBeVisible();
    await expect(newMetricRow).toContainText(testMetric.label);
    await expect(newMetricRow).toContainText(testMetric.category);

    // Track for cleanup
    createdMetricCodes.push(testMetric.code);
  });

  test('should validate metric code format', async ({ page }) => {
    await page.goto(`${STAGING_URL}/metrics`);

    await page.click('[data-testid="add-metric-button"]');
    await page.waitForSelector('[role="dialog"]');

    // Try invalid code with lowercase letters
    await page.fill('[name="code"]', 'invalid_code');
    await page.fill('[name="label"]', 'Invalid Code');
    await page.click('[data-testid="submit-metric-button"]');

    // Should show validation error
    await expect(page.locator('[data-testid="form-error"]')).toContainText(
      /must contain only uppercase letters, numbers, and underscores/i
    );
  });

  test('should prevent duplicate metric codes', async ({ page }) => {
    await page.goto(`${STAGING_URL}/metrics`);

    await page.click('[data-testid="add-metric-button"]');
    await page.waitForSelector('[role="dialog"]');

    // Try to create metric with existing code (FLY10_TIME)
    await page.fill('[name="code"]', 'FLY10_TIME');
    await page.fill('[name="label"]', 'Duplicate Fly Time');
    await page.click('[data-testid="submit-metric-button"]');

    // Should show error
    await expect(page.locator('[data-testid="error-toast"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="error-toast"]')).toContainText(/already exists/i);
  });

  test('should successfully edit a custom metric', async ({ page }) => {
    // First create a metric
    const testMetric = generateTestMetric();
    const response = await page.request.post(`${STAGING_URL}/api/metrics`, {
      data: testMetric,
    });
    expect(response.ok()).toBeTruthy();
    createdMetricCodes.push(testMetric.code);

    // Navigate to metrics page
    await page.goto(`${STAGING_URL}/metrics`);

    // Click edit button on the metric
    await page.click(`[data-testid="edit-metric-${testMetric.code}"]`);

    // Wait for edit modal
    await page.waitForSelector('[role="dialog"]');

    // Update label and description
    const updatedLabel = `${testMetric.label} - Updated`;
    const updatedDescription = 'Updated description';
    await page.fill('[name="label"]', updatedLabel);
    await page.fill('[name="description"]', updatedDescription);

    // Submit
    await page.click('[data-testid="submit-metric-button"]');

    // Verify update
    await expect(page.locator('[data-testid="success-toast"]')).toContainText('Metric updated successfully');
    const updatedRow = page.locator(`[data-testid="metric-row-${testMetric.code}"]`);
    await expect(updatedRow).toContainText(updatedLabel);
  });

  test('should toggle metric active status', async ({ page }) => {
    // Create a metric
    const testMetric = generateTestMetric();
    const response = await page.request.post(`${STAGING_URL}/api/metrics`, {
      data: testMetric,
    });
    expect(response.ok()).toBeTruthy();
    createdMetricCodes.push(testMetric.code);

    await page.goto(`${STAGING_URL}/metrics`);

    // Click disable toggle
    await page.click(`[data-testid="toggle-metric-${testMetric.code}"]`);

    // Confirm disable action
    await page.click('[data-testid="confirm-disable"]');

    // Verify metric is marked as inactive
    const metricRow = page.locator(`[data-testid="metric-row-${testMetric.code}"]`);
    await expect(metricRow).toContainText('Inactive');

    // Re-enable
    await page.click(`[data-testid="toggle-metric-${testMetric.code}"]`);
    await page.click('[data-testid="confirm-enable"]');

    // Verify metric is active again
    await expect(metricRow).not.toContainText('Inactive');
  });

  test('should prevent disabling system default metrics', async ({ page }) => {
    await page.goto(`${STAGING_URL}/metrics`);

    // Try to disable FLY10_TIME (system default)
    const fly10Toggle = page.locator(`[data-testid="toggle-metric-FLY10_TIME"]`);

    // Toggle should be disabled or hidden
    await expect(fly10Toggle).toBeDisabled();
  });

  test('should successfully delete a custom metric without measurements', async ({ page }) => {
    // Create a metric
    const testMetric = generateTestMetric();
    const response = await page.request.post(`${STAGING_URL}/api/metrics`, {
      data: testMetric,
    });
    expect(response.ok()).toBeTruthy();

    await page.goto(`${STAGING_URL}/metrics`);

    // Click delete button
    await page.click(`[data-testid="delete-metric-${testMetric.code}"]`);

    // Confirm deletion
    await page.waitForSelector('[role="alertdialog"]');
    await page.click('[data-testid="confirm-delete"]');

    // Verify deletion
    await expect(page.locator('[data-testid="success-toast"]')).toContainText('Metric deleted successfully');
    const deletedRow = page.locator(`[data-testid="metric-row-${testMetric.code}"]`);
    await expect(deletedRow).not.toBeVisible();
  });

  test('should prevent deletion of system default metrics', async ({ page }) => {
    await page.goto(`${STAGING_URL}/metrics`);

    // Delete button for system defaults should be disabled/hidden
    const deleteButton = page.locator(`[data-testid="delete-metric-FLY10_TIME"]`);
    await expect(deleteButton).toBeDisabled();
  });

  test('should prevent deletion of metrics with measurement data', async ({ page }) => {
    // This test requires creating a measurement with the metric first
    // Implementation depends on measurement creation flow
    // For now, this is a placeholder test structure
    test.skip('Requires measurement creation setup');
  });
});

test.describe('Metric Management - Organization Level', () => {
  let testOrgId: string;

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);

    // Get or create a test organization
    const orgsResponse = await page.request.get(`${STAGING_URL}/api/organizations`);
    const orgs = await orgsResponse.json();
    testOrgId = orgs[0]?.id; // Use first org for testing
  });

  test('should display available metrics for organization', async ({ page }) => {
    await page.goto(`${STAGING_URL}/organizations/${testOrgId}`);

    // Navigate to metrics settings tab
    await page.click('[data-testid="org-metrics-tab"]');

    // Should show list of available metrics
    await page.waitForSelector('[data-testid="org-metrics-list"]');

    // Should show enabled/disabled status for each metric
    const metricItems = page.locator('[data-testid^="org-metric-item-"]');
    await expect(metricItems.first()).toBeVisible();
  });

  test('should enable a metric for organization', async ({ page }) => {
    await page.goto(`${STAGING_URL}/organizations/${testOrgId}`);
    await page.click('[data-testid="org-metrics-tab"]');

    // Find a disabled metric and enable it
    const disabledMetric = page.locator('[data-testid="org-metric-item-disabled"]').first();
    const metricCode = await disabledMetric.getAttribute('data-metric-code');

    await disabledMetric.click('[data-testid="enable-metric-toggle"]');

    // Verify enabled status
    await expect(page.locator('[data-testid="success-toast"]')).toContainText('Metric enabled');
    const enabledMetric = page.locator(`[data-testid="org-metric-item-${metricCode}"]`);
    await expect(enabledMetric).toHaveAttribute('data-enabled', 'true');
  });

  test('should disable a metric for organization', async ({ page }) => {
    await page.goto(`${STAGING_URL}/organizations/${testOrgId}`);
    await page.click('[data-testid="org-metrics-tab"]');

    // Find an enabled metric and disable it
    const enabledMetric = page.locator('[data-testid="org-metric-item-enabled"]').first();
    const metricCode = await enabledMetric.getAttribute('data-metric-code');

    await enabledMetric.click('[data-testid="disable-metric-toggle"]');

    // Verify disabled status
    await expect(page.locator('[data-testid="success-toast"]')).toContainText('Metric disabled');
    const disabledMetric = page.locator(`[data-testid="org-metric-item-${metricCode}"]`);
    await expect(disabledMetric).toHaveAttribute('data-enabled', 'false');
  });

  test('should only show enabled metrics in measurement form dropdown', async ({ page }) => {
    // Navigate to measurement entry
    await page.goto(`${STAGING_URL}/data-entry`);

    // Open metric dropdown
    await page.click('[data-testid="metric-select"]');

    // Should only see enabled metrics for the current organization
    const metricOptions = page.locator('[data-testid^="metric-option-"]');

    // Verify FLY10_TIME is available (should be enabled by default)
    const fly10Option = page.locator('[data-testid="metric-option-FLY10_TIME"]');
    await expect(fly10Option).toBeVisible();

    // Count of visible options should match enabled metrics count
    const enabledCount = await metricOptions.count();
    expect(enabledCount).toBeGreaterThan(0);
  });

  test('should hide disabled metrics from analytics selector', async ({ page }) => {
    await page.goto(`${STAGING_URL}/analytics`);

    // Open metric selector
    await page.click('[data-testid="analytics-metric-selector"]');

    // Should only show enabled metrics
    const metricCheckboxes = page.locator('[data-testid^="analytics-metric-checkbox-"]');

    // All visible metrics should be from the enabled list
    const count = await metricCheckboxes.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should allow custom label override for organization metric', async ({ page }) => {
    await page.goto(`${STAGING_URL}/organizations/${testOrgId}`);
    await page.click('[data-testid="org-metrics-tab"]');

    // Click customize button for a metric
    await page.click('[data-testid="customize-metric-FLY10_TIME"]');

    // Enter custom label
    await page.fill('[name="customLabel"]', 'Flying 10-Yard Sprint');
    await page.click('[data-testid="save-custom-label"]');

    // Verify custom label is saved
    await expect(page.locator('[data-testid="success-toast"]')).toContainText('Custom label saved');
    const metricItem = page.locator('[data-testid="org-metric-item-FLY10_TIME"]');
    await expect(metricItem).toContainText('Flying 10-Yard Sprint');
  });
});

test.describe('Metric Management - Tracking Metrics', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
  });

  test('should create a metric with tracking type', async ({ page }) => {
    const testMetric = {
      code: `TEST_TRACKING_${Date.now().toString(36).toUpperCase()}`,
      label: 'Test Tracking Metric',
      category: 'body_composition',
      unit: 'kg',
      metricType: 'tracking' as const,
      description: 'Test tracking metric for E2E',
      decimalPrecision: 1,
    };

    await page.goto(`${STAGING_URL}/metrics`);

    // Click "Add Metric" button
    await page.click('[data-testid="add-metric-button"]');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Fill in form with tracking type
    await page.fill('[name="code"]', testMetric.code);
    await page.fill('[name="label"]', testMetric.label);
    await page.selectOption('[name="category"]', testMetric.category);
    await page.fill('[name="unit"]', testMetric.unit);
    await page.fill('[name="description"]', testMetric.description);
    await page.selectOption('[name="decimalPrecision"]', testMetric.decimalPrecision.toString());
    await page.selectOption('[name="metricType"]', 'tracking');

    // Submit form
    await page.click('[data-testid="submit-metric-button"]');

    // Verify success
    await expect(page.locator('[data-testid="success-toast"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="success-toast"]')).toContainText('Metric created successfully');

    // Verify metric appears with "Tracking" badge
    const metricRow = page.locator(`[data-testid="metric-row-${testMetric.code}"]`);
    await expect(metricRow).toBeVisible();
    await expect(metricRow).toContainText('Tracking');

    // Cleanup
    await page.request.delete(`${STAGING_URL}/api/metrics/${testMetric.code}`);
  });

  test('should display HEIGHT and WEIGHT as tracking metrics', async ({ page }) => {
    await page.goto(`${STAGING_URL}/metrics`);

    // Wait for metrics table
    await page.waitForSelector('[data-testid="metrics-table"]', { timeout: 5000 });

    // Check HEIGHT metric
    const heightRow = page.locator('[data-testid="metric-row-HEIGHT"]');
    await expect(heightRow).toBeVisible();
    await expect(heightRow).toContainText('Height');
    await expect(heightRow).toContainText('Tracking');

    // Check WEIGHT metric
    const weightRow = page.locator('[data-testid="metric-row-WEIGHT"]');
    await expect(weightRow).toBeVisible();
    await expect(weightRow).toContainText('Weight');
    await expect(weightRow).toContainText('Tracking');
  });

  test('should show neutral styling for tracking metrics in analytics', async ({ page }) => {
    // This test verifies that tracking metrics show neutral trend styling
    // Navigate to analytics page (requires existing athlete data)
    await page.goto(`${STAGING_URL}/analytics`);

    // Select HEIGHT or WEIGHT metric if available
    await page.click('[data-testid="analytics-metric-selector"]');

    // Try to find HEIGHT checkbox
    const heightCheckbox = page.locator('[data-testid="analytics-metric-checkbox-HEIGHT"]');
    const isHeightAvailable = await heightCheckbox.isVisible().catch(() => false);

    if (isHeightAvailable) {
      await heightCheckbox.click();

      // If there's data, verify neutral (gray) styling is used for trends
      // This is a visual check - the exact implementation depends on the component
      // For now, we just verify the metric can be selected without errors
      await expect(page.locator('[data-testid="analytics-chart"]')).toBeVisible({ timeout: 10000 });
    } else {
      // If HEIGHT is not available, skip the visual check
      test.skip(true, 'HEIGHT metric not available in this organization');
    }
  });
});

test.describe('Metric Management - Permissions', () => {
  test('should deny metric creation to non-site-admin users', async ({ page }) => {
    // TODO: This requires a non-site-admin test user
    // For now, placeholder structure
    test.skip('Requires non-admin user setup');
  });

  test('should deny metric deletion to non-site-admin users', async ({ page }) => {
    test.skip('Requires non-admin user setup');
  });

  test('should allow org admin to manage org-level metrics', async ({ page }) => {
    test.skip('Requires org-admin user setup');
  });
});
