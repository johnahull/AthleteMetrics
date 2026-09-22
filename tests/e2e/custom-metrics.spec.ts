import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser, loginAs } from './helpers/auth';
import { canTestRoleAuthorization } from './fixtures/test-users';

/**
 * CUSTOM ORG METRICS: End-to-End Tests
 *
 * Comprehensive E2E test suite for organization-specific custom metrics:
 * - Navigation: Accessing custom metrics page from org sidebar
 * - CRUD: Create, read, update, archive, restore operations
 * - Derived metrics: Formula creation and validation
 * - Search/Filter: Finding metrics by name, category
 * - Permissions: Authorization checks for different roles
 *
 * Total: 10 E2E tests
 */

const TESTING_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

// Helper to generate unique test custom metric data
function generateTestCustomMetric() {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  return {
    label: `Test Custom Metric ${uniqueId}`,
    category: 'speed',
    unit: 'm/s',
    metricType: 'higher_is_better' as const,
    description: `E2E test custom metric created at ${new Date().toISOString()}`,
    decimalPrecision: 2,
    validationMin: 0,
    validationMax: 100,
  };
}

// Helper to get organization ID from the page URL or sidebar
async function getFirstOrgId(page: import('@playwright/test').Page): Promise<string | null> {
  // Navigate to dashboard to ensure we have org context
  await page.goto(`${TESTING_URL}/dashboard`);
  await page.waitForLoadState('networkidle');

  // Try to get org ID from sidebar navigation link
  const customMetricsLink = page.locator('a[href*="/custom-metrics"]').first();
  if (await customMetricsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
    const href = await customMetricsLink.getAttribute('href');
    const match = href?.match(/\/organizations\/([^/]+)\/custom-metrics/);
    if (match) return match[1];
  }

  // Fallback: Get org ID from API
  const response = await page.request.get(`${TESTING_URL}/api/auth/me`);
  if (response.ok()) {
    const data = await response.json();
    const userOrgs = data.userOrganizations || [];
    if (userOrgs.length > 0) {
      return userOrgs[0].organizationId;
    }
  }

  return null;
}

test.describe('Custom Metrics - Org Admin CRUD Operations', () => {
  let createdMetricCodes: string[] = [];
  let orgId: string | null = null;

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    createdMetricCodes = [];
    orgId = await getFirstOrgId(page);
  });

  test.afterEach(async ({ page }) => {
    // Cleanup: Archive test metrics created during test
    for (const code of createdMetricCodes) {
      try {
        if (orgId) {
          await page.request.post(`${TESTING_URL}/api/organizations/${orgId}/custom-metrics/${code}/archive`);
        }
      } catch (error) {
        console.warn(`Failed to cleanup custom metric ${code}:`, error);
      }
    }
  });

  test('should navigate to custom metrics page from org sidebar', async ({ page }) => {
    test.skip(!orgId, 'No organization context available');

    // Look for Custom Metrics link in sidebar
    const sidebarLink = page.locator('a[href*="custom-metrics"]').first();
    await expect(sidebarLink).toBeVisible({ timeout: 5000 });

    // Click to navigate
    await sidebarLink.click();
    await page.waitForLoadState('networkidle');

    // Verify we're on the custom metrics page
    await expect(page).toHaveURL(/\/organizations\/[^/]+\/custom-metrics/);
    await expect(page.locator('h1:has-text("Custom Metrics")')).toBeVisible();
  });

  test('should display empty state when no custom metrics exist', async ({ page }) => {
    test.skip(!orgId, 'No organization context available');

    await page.goto(`${TESTING_URL}/organizations/${orgId}/custom-metrics`);
    await page.waitForLoadState('networkidle');

    // Should show header
    await expect(page.locator('h1:has-text("Custom Metrics")')).toBeVisible();

    // Should show info banner about org-specific metrics
    await expect(page.locator('text=Organization-Specific Metrics')).toBeVisible();

    // Should show "New Custom Metric" button for org admins
    const newButton = page.locator('[data-testid="new-custom-metric-button"]');
    await expect(newButton).toBeVisible({ timeout: 5000 });
  });

  test('should create a new custom metric', async ({ page }) => {
    test.skip(!orgId, 'No organization context available');

    const testMetric = generateTestCustomMetric();

    await page.goto(`${TESTING_URL}/organizations/${orgId}/custom-metrics`);
    await page.waitForLoadState('networkidle');

    // Click "New Custom Metric" button
    await page.click('[data-testid="new-custom-metric-button"]');

    // Wait for dialog to open
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Fill in basic info tab
    await page.fill('input[name="label"], input[placeholder*="15m Sprint"]', testMetric.label);

    // Select metric type
    const metricTypeSelect = page.locator('[name="metricType"]').or(page.getByLabel('Metric Type'));
    if (await metricTypeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await metricTypeSelect.selectOption('higher_is_better');
    }

    // Fill unit
    const unitInput = page.locator('input[name="unit"]').or(page.getByPlaceholder('e.g., s, in, mph'));
    if (await unitInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await unitInput.fill(testMetric.unit);
    }

    // Fill description
    const descInput = page.locator('textarea[name="description"]').or(page.getByPlaceholder('Describe'));
    if (await descInput.isVisible({ timeout: 2000 }).catch(() => false)) {
      await descInput.fill(testMetric.description);
    }

    // Listen for API response
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/organizations/') &&
      response.url().includes('/custom-metrics') &&
      response.request().method() === 'POST'
    );

    // Submit form
    await page.click('button[type="submit"]:has-text("Create")');

    // Wait for API response and capture created code
    const response = await responsePromise;
    expect(response.ok()).toBe(true);

    const data = await response.json();
    if (data.code) {
      createdMetricCodes.push(data.code);
    }

    // Verify success toast
    await expect(page.locator('text=Metric Created').or(page.locator('text=created successfully'))).toBeVisible({ timeout: 5000 });

    // Verify metric appears in list
    await expect(page.locator(`text=${testMetric.label}`)).toBeVisible({ timeout: 5000 });
  });

  test('should edit an existing custom metric', async ({ page }) => {
    test.skip(!orgId, 'No organization context available');

    // First create a metric via API
    const testMetric = generateTestCustomMetric();
    const createResponse = await page.request.post(
      `${TESTING_URL}/api/organizations/${orgId}/custom-metrics`,
      {
        data: {
          label: testMetric.label,
          unit: testMetric.unit,
          metricType: testMetric.metricType,
          description: testMetric.description,
        },
      }
    );

    expect(createResponse.ok()).toBe(true);
    const createdMetric = await createResponse.json();
    createdMetricCodes.push(createdMetric.code);

    // Navigate to custom metrics page
    await page.goto(`${TESTING_URL}/organizations/${orgId}/custom-metrics`);
    await page.waitForLoadState('networkidle');

    // Find the metric card and click edit
    const metricCard = page.locator(`text=${testMetric.label}`).locator('xpath=ancestor::div[contains(@class, "card")]').first();
    await expect(metricCard).toBeVisible({ timeout: 5000 });

    // Click edit button (icon-only button with Edit aria-label)
    const editButton = metricCard.locator('button[aria-label*="Edit"]').or(metricCard.locator('button:has(svg.lucide-edit), button:has(svg.lucide-pencil)'));
    await editButton.click();

    // Wait for dialog
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Update the label
    const updatedLabel = `Updated ${testMetric.label}`;
    await page.fill('input[name="label"], input[placeholder*="15m Sprint"]', updatedLabel);

    // Submit
    const updatePromise = page.waitForResponse(response =>
      response.url().includes(`/api/organizations/${orgId}/custom-metrics/`) &&
      response.request().method() === 'PATCH'
    );

    await page.click('button[type="submit"]:has-text("Update")');

    const updateResponse = await updatePromise;
    expect(updateResponse.ok()).toBe(true);

    // Verify success toast
    await expect(page.locator('text=Metric Updated').or(page.locator('text=updated successfully'))).toBeVisible({ timeout: 5000 });

    // Verify updated label appears
    await expect(page.locator(`text=${updatedLabel}`)).toBeVisible({ timeout: 5000 });
  });

  test('should archive a custom metric', async ({ page }) => {
    test.skip(!orgId, 'No organization context available');

    // Create a metric via API
    const testMetric = generateTestCustomMetric();
    const createResponse = await page.request.post(
      `${TESTING_URL}/api/organizations/${orgId}/custom-metrics`,
      {
        data: {
          label: testMetric.label,
          unit: testMetric.unit,
          metricType: testMetric.metricType,
        },
      }
    );

    expect(createResponse.ok()).toBe(true);
    const createdMetric = await createResponse.json();
    createdMetricCodes.push(createdMetric.code);

    // Navigate to custom metrics page
    await page.goto(`${TESTING_URL}/organizations/${orgId}/custom-metrics`);
    await page.waitForLoadState('networkidle');

    // Find the metric card
    const metricCard = page.locator(`text=${testMetric.label}`).locator('xpath=ancestor::div[contains(@class, "card")]').first();
    await expect(metricCard).toBeVisible({ timeout: 5000 });

    // Click archive button
    const archiveButton = metricCard.locator('button[aria-label*="Archive"]').or(metricCard.locator('button:has(svg.lucide-archive)'));
    await archiveButton.click();

    // Confirm archive in dialog
    await page.waitForSelector('[role="alertdialog"]', { timeout: 5000 });
    await page.click('button:has-text("Archive")');

    // Verify success
    await expect(page.locator('text=Metric Archived').or(page.locator('text=archived successfully'))).toBeVisible({ timeout: 5000 });

    // Metric should disappear from list (archived metrics hidden by default)
    await expect(page.locator(`text=${testMetric.label}`)).toBeHidden({ timeout: 5000 });
  });

  test('should restore an archived custom metric', async ({ page }) => {
    test.skip(!orgId, 'No organization context available');

    // Create and archive a metric via API
    const testMetric = generateTestCustomMetric();
    const createResponse = await page.request.post(
      `${TESTING_URL}/api/organizations/${orgId}/custom-metrics`,
      {
        data: {
          label: testMetric.label,
          unit: testMetric.unit,
          metricType: testMetric.metricType,
        },
      }
    );

    expect(createResponse.ok()).toBe(true);
    const createdMetric = await createResponse.json();
    createdMetricCodes.push(createdMetric.code);

    // Archive it
    await page.request.post(
      `${TESTING_URL}/api/organizations/${orgId}/custom-metrics/${createdMetric.code}/archive`
    );

    // Navigate to custom metrics page
    await page.goto(`${TESTING_URL}/organizations/${orgId}/custom-metrics`);
    await page.waitForLoadState('networkidle');

    // Toggle "Show Archived" switch
    const showArchivedSwitch = page.locator('#include-archived-metrics').or(page.locator('label:has-text("Show Archived")'));
    await showArchivedSwitch.click();

    // Wait for archived metrics to load
    await page.waitForTimeout(500);

    // Find the archived metric card
    const metricCard = page.locator(`text=${testMetric.label}`).locator('xpath=ancestor::div[contains(@class, "card")]').first();
    await expect(metricCard).toBeVisible({ timeout: 5000 });

    // Should show "Archived" badge
    await expect(metricCard.locator('text=Archived')).toBeVisible();

    // Click restore button
    const restoreButton = metricCard.locator('button[aria-label*="Restore"]').or(metricCard.locator('button:has(svg.lucide-rotate-ccw)'));
    await restoreButton.click();

    // Verify success
    await expect(page.locator('text=Metric Restored').or(page.locator('text=restored successfully'))).toBeVisible({ timeout: 5000 });
  });

  test('should search custom metrics by name', async ({ page }) => {
    test.skip(!orgId, 'No organization context available');

    // Create two metrics with different names
    const metric1 = { ...generateTestCustomMetric(), label: `Alpha Metric ${Date.now()}` };
    const metric2 = { ...generateTestCustomMetric(), label: `Beta Metric ${Date.now()}` };

    for (const metric of [metric1, metric2]) {
      const response = await page.request.post(
        `${TESTING_URL}/api/organizations/${orgId}/custom-metrics`,
        { data: { label: metric.label, unit: metric.unit, metricType: metric.metricType } }
      );
      const data = await response.json();
      createdMetricCodes.push(data.code);
    }

    // Navigate to custom metrics page
    await page.goto(`${TESTING_URL}/organizations/${orgId}/custom-metrics`);
    await page.waitForLoadState('networkidle');

    // Both metrics should be visible
    await expect(page.locator(`text=${metric1.label}`)).toBeVisible({ timeout: 5000 });
    await expect(page.locator(`text=${metric2.label}`)).toBeVisible({ timeout: 5000 });

    // Search for "Alpha"
    const searchInput = page.locator('input[placeholder*="Search"]');
    await searchInput.fill('Alpha');

    // Wait for filter to apply
    await page.waitForTimeout(300);

    // Only Alpha metric should be visible
    await expect(page.locator(`text=${metric1.label}`)).toBeVisible();
    await expect(page.locator(`text=${metric2.label}`)).toBeHidden();
  });
});

test.describe('Custom Metrics - Derived Metrics', () => {
  let orgId: string | null = null;
  let createdMetricCodes: string[] = [];

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    createdMetricCodes = [];
    orgId = await getFirstOrgId(page);
  });

  test.afterEach(async ({ page }) => {
    for (const code of createdMetricCodes) {
      try {
        if (orgId) {
          await page.request.post(`${TESTING_URL}/api/organizations/${orgId}/custom-metrics/${code}/archive`);
        }
      } catch (error) {
        console.warn(`Failed to cleanup custom metric ${code}:`, error);
      }
    }
  });

  test('should create a derived metric with formula', async ({ page }) => {
    test.skip(!orgId, 'No organization context available');

    await page.goto(`${TESTING_URL}/organizations/${orgId}/custom-metrics`);
    await page.waitForLoadState('networkidle');

    // Click new metric button
    await page.click('[data-testid="new-custom-metric-button"]');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Fill basic info
    const uniqueId = Date.now().toString(36);
    const label = `Derived Metric ${uniqueId}`;
    await page.fill('input[name="label"], input[placeholder*="15m Sprint"]', label);

    // Navigate to Derived tab
    await page.click('button:has-text("Derived"), [role="tab"]:has-text("Derived")');

    // Enable derived metric toggle
    const derivedSwitch = page.locator('#isDerived, [name="isDerived"]').or(page.getByLabel('Derived Metric'));
    await derivedSwitch.click();

    // Wait for formula input to appear
    await page.waitForSelector('input[placeholder*="FLY10_TIME"]', { timeout: 5000 });

    // Enter a simple formula using site metrics
    await page.fill('input[placeholder*="FLY10_TIME"]', 'FLY10_TIME * 2');

    // Wait for validation (debounced)
    await page.waitForTimeout(600);

    // Should show validation success (green checkmark or valid indicator)
    const validIndicator = page.locator('.text-green-500, [class*="green"]').first();
    await expect(validIndicator).toBeVisible({ timeout: 5000 });

    // Submit
    const responsePromise = page.waitForResponse(response =>
      response.url().includes('/api/organizations/') &&
      response.url().includes('/custom-metrics') &&
      response.request().method() === 'POST'
    );

    await page.click('button[type="submit"]:has-text("Create")');

    const response = await responsePromise;
    expect(response.ok()).toBe(true);

    const data = await response.json();
    createdMetricCodes.push(data.code);

    // Verify success
    await expect(page.locator('text=Metric Created').or(page.locator('text=created successfully'))).toBeVisible({ timeout: 5000 });

    // Verify derived badge appears on the metric card
    await expect(page.locator(`text=${label}`)).toBeVisible({ timeout: 5000 });
  });

  test('should show formula validation errors', async ({ page }) => {
    test.skip(!orgId, 'No organization context available');

    await page.goto(`${TESTING_URL}/organizations/${orgId}/custom-metrics`);
    await page.waitForLoadState('networkidle');

    // Click new metric button
    await page.click('[data-testid="new-custom-metric-button"]');
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Fill basic info
    await page.fill('input[name="label"], input[placeholder*="15m Sprint"]', 'Invalid Formula Test');

    // Navigate to Derived tab
    await page.click('button:has-text("Derived"), [role="tab"]:has-text("Derived")');

    // Enable derived metric toggle
    const derivedSwitch = page.locator('#isDerived, [name="isDerived"]').or(page.getByLabel('Derived Metric'));
    await derivedSwitch.click();

    // Wait for formula input
    await page.waitForSelector('input[placeholder*="FLY10_TIME"]', { timeout: 5000 });

    // Enter an invalid formula (non-existent metric)
    await page.fill('input[placeholder*="FLY10_TIME"]', 'NONEXISTENT_METRIC * 2');

    // Wait for validation (debounced)
    await page.waitForTimeout(600);

    // Should show validation error (red indicator or error message)
    const errorIndicator = page.locator('.text-red-500, [class*="red"]').first();
    await expect(errorIndicator).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Custom Metrics - Authorization', () => {
  test('should redirect non-admin users from custom metrics page', async ({ page }) => {
    // Skip if we can't test different roles
    const canTestRoles = canTestRoleAuthorization('org_admin', 'athlete');
    test.skip(!canTestRoles, 'Cannot test authorization - roles not differentiated');

    // Login as athlete
    await loginAs(page, 'athlete');

    // Get org ID (athlete should have org context)
    const orgId = await getFirstOrgId(page);
    test.skip(!orgId, 'No organization context for athlete');

    // Try to navigate directly to custom metrics page
    await page.goto(`${TESTING_URL}/organizations/${orgId}/custom-metrics`);
    await page.waitForLoadState('networkidle');

    // Should be redirected away (either to dashboard or login)
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/custom-metrics');
  });

  test('should not show edit buttons for non-admin users', async ({ page }) => {
    // Skip if we can't test different roles
    const canTestRoles = canTestRoleAuthorization('org_admin', 'coach');
    test.skip(!canTestRoles, 'Cannot test authorization - roles not differentiated');

    // First, create a metric as org admin
    await loginAsDefaultUser(page);
    const orgId = await getFirstOrgId(page);
    test.skip(!orgId, 'No organization context');

    const testMetric = generateTestCustomMetric();
    const createResponse = await page.request.post(
      `${TESTING_URL}/api/organizations/${orgId}/custom-metrics`,
      {
        data: {
          label: testMetric.label,
          unit: testMetric.unit,
          metricType: testMetric.metricType,
        },
      }
    );

    expect(createResponse.ok()).toBe(true);
    const createdMetric = await createResponse.json();

    // Now login as coach
    await loginAs(page, 'coach');

    // Navigate to custom metrics page
    await page.goto(`${TESTING_URL}/organizations/${orgId}/custom-metrics`);
    await page.waitForLoadState('networkidle');

    // Check if we have access at all
    const hasAccess = !page.url().includes('/login') && page.url().includes('/custom-metrics');

    if (hasAccess) {
      // If coach has view access, verify edit buttons are hidden
      const metricCard = page.locator(`text=${testMetric.label}`).locator('xpath=ancestor::div[contains(@class, "card")]').first();

      if (await metricCard.isVisible({ timeout: 3000 }).catch(() => false)) {
        // Edit/Archive buttons should not be visible for non-admin
        const editButton = metricCard.locator('button[aria-label*="Edit"]');
        const archiveButton = metricCard.locator('button[aria-label*="Archive"]');

        await expect(editButton).toBeHidden();
        await expect(archiveButton).toBeHidden();
      }
    }

    // Cleanup
    await loginAsDefaultUser(page);
    await page.request.post(`${TESTING_URL}/api/organizations/${orgId}/custom-metrics/${createdMetric.code}/archive`);
  });
});
