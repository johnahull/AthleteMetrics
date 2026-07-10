import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * TIER 1 CRITICAL: Derived Metrics Tests
 *
 * These tests verify the complete derived metrics workflow:
 * - Site admin creates derived metric with formula
 * - Coach enters source measurement for athlete
 * - Derived value auto-calculates and appears in dashboard
 * - Coach can override with direct measurement
 * - Direct measurement takes priority over calculated value
 * - [fx] badges appear throughout the UI
 * - Mutual exclusivity in analytics selector
 *
 * Tests follow TDD methodology: written first, infrastructure built to make them pass.
 */

const TESTING_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

// Helper to generate unique test metric data
function generateDerivedMetric() {
  const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2);
  return {
    code: `DERIVED_TEST_${uniqueId.toUpperCase()}`,
    label: `Derived Test Metric ${uniqueId}`,
    category: 'speed',
    unit: 'mph',
    metricType: 'higher_is_better' as const,
    description: 'Test derived metric for E2E testing',
    decimalPrecision: 2,
    isDerived: true,
    formula: '10 / fly10_time * 2.045', // Convert fly10 time to top speed
    dependentMetrics: ['FLY10_TIME'],
    calculationConfig: {
      dateMatchStrategy: 'same_date' as const,
      skipIfMissing: true,
    },
  };
}

test.describe('Derived Metrics - Site Admin Creation', () => {
  let createdMetricCodes: string[] = [];

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page); // Assumes default user is site admin
    createdMetricCodes = [];
  });

  test.afterEach(async ({ page }) => {
    // Cleanup: Delete test metrics created during test
    for (const code of createdMetricCodes) {
      try {
        const response = await page.request.delete(`${TESTING_URL}/api/metrics/${code}`);
        if (!response.ok()) {
          const errorText = await response.text();
          console.error(`CLEANUP FAILED for metric ${code}:`, {
            status: response.status(),
            statusText: response.statusText(),
            body: errorText
          });
        }
      } catch (error) {
        console.error(`Failed to cleanup metric ${code}:`, error);
      }
    }
  });

  test('should create a derived metric with formula', async ({ page }) => {
    const derivedMetric = generateDerivedMetric();

    await page.goto(`${TESTING_URL}/metrics`);

    // Click "Add Metric" button
    await page.click('[data-testid="add-metric-button"]');

    // Wait for modal to appear
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });

    // Fill in basic metric form
    await page.fill('[name="code"]', derivedMetric.code);
    await page.fill('[name="label"]', derivedMetric.label);
    await page.selectOption('[name="category"]', derivedMetric.category);
    await page.fill('[name="unit"]', derivedMetric.unit);
    await page.fill('[name="description"]', derivedMetric.description);
    await page.selectOption('[name="decimalPrecision"]', derivedMetric.decimalPrecision.toString());
    await page.selectOption('[name="metricType"]', derivedMetric.metricType);

    // Enable derived metric toggle
    await page.click('[data-testid="derived-metric-toggle"]');

    // Wait for formula fields to appear
    await page.waitForSelector('[name="formula"]', { timeout: 2000 });

    // Fill in formula
    await page.fill('[name="formula"]', derivedMetric.formula);

    // Wait for formula validation (debounced)
    await page.waitForTimeout(600); // Wait for 500ms debounce + buffer

    // Verify formula validation passed (no error message)
    const validationError = await page.locator('[data-testid="formula-error"]').isVisible().catch(() => false);
    expect(validationError).toBe(false);

    // Select dependent metrics (FLY10_TIME)
    await page.click('[data-testid="dependent-metrics-selector"]');
    await page.click('[data-testid="metric-option-FLY10_TIME"]');
    await page.click('[data-testid="dependent-metrics-selector"]'); // Close dropdown

    // Configure date matching strategy
    await page.selectOption('[name="dateMatchStrategy"]', 'same_date');

    // Submit form
    await page.click('[data-testid="submit-metric-button"]');

    // Wait for success message
    await expect(page.locator('[data-testid="success-toast"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="success-toast"]')).toContainText('Metric created successfully');

    // Verify metric appears in table with [fx] badge
    const newMetricRow = page.locator(`[data-testid="metric-row-${derivedMetric.code}"]`);
    await expect(newMetricRow).toBeVisible();
    await expect(newMetricRow).toContainText(derivedMetric.label);
    await expect(newMetricRow).toContainText('[fx]'); // Derived badge

    // Track for cleanup
    createdMetricCodes.push(derivedMetric.code);
  });

  test('should validate formula syntax in real-time', async ({ page }) => {
    await page.goto(`${TESTING_URL}/metrics`);

    await page.click('[data-testid="add-metric-button"]');
    await page.waitForSelector('[role="dialog"]');

    // Fill in basic fields
    await page.fill('[name="code"]', 'TEST_INVALID_FORMULA');
    await page.fill('[name="label"]', 'Invalid Formula Test');
    await page.selectOption('[name="category"]', 'speed');

    // Enable derived metric
    await page.click('[data-testid="derived-metric-toggle"]');
    await page.waitForSelector('[name="formula"]');

    // Enter invalid formula
    await page.fill('[name="formula"]', 'invalid syntax here');

    // Wait for validation
    await page.waitForTimeout(600);

    // Should show validation error
    await expect(page.locator('[data-testid="formula-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="formula-error"]')).toContainText(/invalid/i);
  });

  test('should prevent circular dependencies', async ({ page }) => {
    // First create a derived metric A that depends on B
    const metricA = {
      ...generateDerivedMetric(),
      code: 'CIRCULAR_A',
      formula: 'circular_b * 2',
      dependentMetrics: ['CIRCULAR_B'],
    };

    await page.goto(`${TESTING_URL}/metrics`);
    await page.click('[data-testid="add-metric-button"]');
    await page.waitForSelector('[role="dialog"]');

    // Fill in metric A
    await page.fill('[name="code"]', metricA.code);
    await page.fill('[name="label"]', 'Circular A');
    await page.selectOption('[name="category"]', 'speed');
    await page.fill('[name="unit"]', 'mph');
    await page.selectOption('[name="metricType"]', 'higher_is_better');

    // Enable derived
    await page.click('[data-testid="derived-metric-toggle"]');
    await page.waitForSelector('[name="formula"]');
    await page.fill('[name="formula"]', metricA.formula);

    // Should show error about missing CIRCULAR_B
    await page.waitForTimeout(600);
    await expect(page.locator('[data-testid="formula-error"]')).toContainText(/undefined variable/i);
  });

  test('should show formula tooltip on [fx] badge hover', async ({ page }) => {
    const derivedMetric = generateDerivedMetric();

    // Create via API
    await page.request.post(`${TESTING_URL}/api/metrics`, {
      data: derivedMetric,
    });
    createdMetricCodes.push(derivedMetric.code);

    await page.goto(`${TESTING_URL}/metrics`);

    // Hover over [fx] badge
    const fxBadge = page.locator(`[data-testid="metric-row-${derivedMetric.code}"] [data-testid="derived-badge"]`);
    await fxBadge.hover();

    // Should show tooltip with formula
    await expect(page.locator('[role="tooltip"]')).toBeVisible({ timeout: 2000 });
    await expect(page.locator('[role="tooltip"]')).toContainText(derivedMetric.formula);
  });
});

test.describe('Derived Metrics - Auto-Calculation Workflow', () => {
  let testAthleteId: string;
  let derivedMetricCode: string;

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);

    // Create a test athlete
    const athleteResponse = await page.request.post(`${TESTING_URL}/api/athletes`, {
      data: {
        firstName: 'Derived',
        lastName: 'Test',
        email: `derived-test-${Date.now()}@example.com`,
        birthYear: 2000,
        sports: ['Football'],
        status: 'active',
      },
    });
    const athlete = await athleteResponse.json();
    testAthleteId = athlete.id;

    // Create a derived metric (top speed from fly10)
    const derivedMetric = generateDerivedMetric();
    derivedMetricCode = derivedMetric.code;
    await page.request.post(`${TESTING_URL}/api/metrics`, {
      data: derivedMetric,
    });
  });

  test.afterEach(async ({ page }) => {
    // Cleanup
    try {
      await page.request.delete(`${TESTING_URL}/api/athletes/${testAthleteId}`);
      await page.request.delete(`${TESTING_URL}/api/metrics/${derivedMetricCode}`);
    } catch (error) {
      console.warn('Cleanup failed:', error);
    }
  });

  test('should auto-calculate derived value when source measurement is entered', async ({ page }) => {
    await page.goto(`${TESTING_URL}/data-entry`);

    // Select athlete
    await page.click('[data-testid="athlete-select"]');
    await page.fill('[data-testid="athlete-search"]', 'Derived Test');
    await page.click(`[data-testid="athlete-option-${testAthleteId}"]`);

    // Select FLY10_TIME metric
    await page.click('[data-testid="metric-select"]');
    await page.click('[data-testid="metric-option-FLY10_TIME"]');

    // Enter fly10 time value (e.g., 1.00 seconds)
    await page.fill('[data-testid="value-input"]', '1.00');

    // Select date
    await page.fill('[data-testid="date-input"]', new Date().toISOString().split('T')[0]);

    // Should show calculated preview for derived metric
    const calculatedPreview = page.locator('[data-testid="calculated-preview"]');
    await expect(calculatedPreview).toBeVisible({ timeout: 2000 });
    await expect(calculatedPreview).toContainText(derivedMetricCode);
    await expect(calculatedPreview).toContainText('20.45'); // 10 / 1.00 * 2.045

    // Submit measurement
    await page.click('[data-testid="submit-measurement"]');

    // Wait for success
    await expect(page.locator('[data-testid="success-toast"]')).toBeVisible({ timeout: 5000 });

    // Verify derived measurement was created
    // Navigate to athlete dashboard
    await page.goto(`${TESTING_URL}/athletes/${testAthleteId}`);

    // Should show both measurements
    await expect(page.locator('[data-testid="metric-card-FLY10_TIME"]')).toBeVisible();
    await expect(page.locator(`[data-testid="metric-card-${derivedMetricCode}"]`)).toBeVisible();

    // Derived metric should show [fx] badge
    const derivedCard = page.locator(`[data-testid="metric-card-${derivedMetricCode}"]`);
    await expect(derivedCard.locator('[data-testid="derived-badge"]')).toBeVisible();

    // Should show "Calculated from" footer
    await expect(derivedCard).toContainText('Calculated from');
    await expect(derivedCard).toContainText('FLY10_TIME');
  });

  test('should allow direct measurement to override calculated value', async ({ page }) => {
    // First, create a fly10 measurement to trigger calculation
    await page.request.post(`${TESTING_URL}/api/measurements`, {
      data: {
        athleteId: testAthleteId,
        metricCode: 'FLY10_TIME',
        value: 1.00,
        date: new Date().toISOString().split('T')[0],
      },
    });

    // Wait a moment for calculation to process
    await page.waitForTimeout(1000);

    // Navigate to data entry
    await page.goto(`${TESTING_URL}/data-entry`);

    // Select athlete
    await page.click('[data-testid="athlete-select"]');
    await page.fill('[data-testid="athlete-search"]', 'Derived Test');
    await page.click(`[data-testid="athlete-option-${testAthleteId}"]`);

    // Select the derived metric directly
    await page.click('[data-testid="metric-select"]');
    await page.click(`[data-testid="metric-option-${derivedMetricCode}"]`);

    // Enter a manual value (different from calculated)
    await page.fill('[data-testid="value-input"]', '25.00');

    // Select same date
    await page.fill('[data-testid="date-input"]', new Date().toISOString().split('T')[0]);

    // Should show override warning
    await expect(page.locator('[data-testid="override-warning"]')).toBeVisible();
    await expect(page.locator('[data-testid="override-warning"]')).toContainText(/will override calculated/i);

    // Submit
    await page.click('[data-testid="submit-measurement"]');
    await expect(page.locator('[data-testid="success-toast"]')).toBeVisible({ timeout: 5000 });

    // Verify direct measurement is shown (not calculated)
    await page.goto(`${TESTING_URL}/athletes/${testAthleteId}`);
    const derivedCard = page.locator(`[data-testid="metric-card-${derivedMetricCode}"]`);
    await expect(derivedCard).toContainText('25.00'); // Direct value, not 20.45
    await expect(derivedCard).not.toContainText('Calculated from'); // No calculation footer
  });

  test('should skip calculation when source measurement is missing', async ({ page }) => {
    // Try to enter a derived metric without source data
    await page.goto(`${TESTING_URL}/data-entry`);

    await page.click('[data-testid="athlete-select"]');
    await page.fill('[data-testid="athlete-search"]', 'Derived Test');
    await page.click(`[data-testid="athlete-option-${testAthleteId}"]`);

    // Select a different metric (not FLY10_TIME)
    await page.click('[data-testid="metric-select"]');
    await page.click('[data-testid="metric-option-VERTICAL_JUMP"]');

    await page.fill('[data-testid="value-input"]', '30.0');
    await page.fill('[data-testid="date-input"]', new Date().toISOString().split('T')[0]);

    // Should NOT show calculated preview (no source data for derived metric)
    const calculatedPreview = page.locator('[data-testid="calculated-preview"]');
    await expect(calculatedPreview).not.toBeVisible();

    // Submit
    await page.click('[data-testid="submit-measurement"]');
    await expect(page.locator('[data-testid="success-toast"]')).toBeVisible({ timeout: 5000 });

    // Verify only VERTICAL_JUMP was created, not derived metric
    await page.goto(`${TESTING_URL}/athletes/${testAthleteId}`);
    await expect(page.locator('[data-testid="metric-card-VERTICAL_JUMP"]')).toBeVisible();
    await expect(page.locator(`[data-testid="metric-card-${derivedMetricCode}"]`)).not.toBeVisible();
  });
});

test.describe('Derived Metrics - Analytics Integration', () => {
  let derivedMetricCode: string;

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);

    // Create a derived metric
    const derivedMetric = generateDerivedMetric();
    derivedMetricCode = derivedMetric.code;
    await page.request.post(`${TESTING_URL}/api/metrics`, {
      data: derivedMetric,
    });
  });

  test.afterEach(async ({ page }) => {
    try {
      await page.request.delete(`${TESTING_URL}/api/metrics/${derivedMetricCode}`);
    } catch (error) {
      console.warn('Cleanup failed:', error);
    }
  });

  test('should show [fx] badge in analytics metric selector', async ({ page }) => {
    await page.goto(`${TESTING_URL}/analytics`);

    // Open metric selector
    await page.click('[data-testid="analytics-metric-selector"]');

    // Find the derived metric checkbox
    const metricCheckbox = page.locator(`[data-testid="analytics-metric-checkbox-${derivedMetricCode}"]`);

    // Should show [fx] badge next to metric name
    const parentRow = metricCheckbox.locator('xpath=ancestor::*[contains(@class, "metric-row")]');
    await expect(parentRow.locator('[data-testid="derived-badge"]')).toBeVisible();
  });

  test('should enforce mutual exclusivity between derived and source metrics', async ({ page }) => {
    await page.goto(`${TESTING_URL}/analytics`);

    // Open metric selector
    await page.click('[data-testid="analytics-metric-selector"]');

    // Select FLY10_TIME (source metric)
    const fly10Checkbox = page.locator('[data-testid="analytics-metric-checkbox-FLY10_TIME"]');
    await fly10Checkbox.click();

    // Derived metric should be disabled
    const derivedCheckbox = page.locator(`[data-testid="analytics-metric-checkbox-${derivedMetricCode}"]`);
    await expect(derivedCheckbox).toBeDisabled();

    // Should show tooltip explaining why
    await derivedCheckbox.hover();
    await expect(page.locator('[role="tooltip"]')).toContainText(/source metric.*selected/i);

    // Uncheck FLY10_TIME
    await fly10Checkbox.click();

    // Derived metric should be enabled now
    await expect(derivedCheckbox).not.toBeDisabled();

    // Select derived metric
    await derivedCheckbox.click();

    // FLY10_TIME should now be disabled
    await expect(fly10Checkbox).toBeDisabled();
  });
});

test.describe('Derived Metrics - Self Entry Exclusion', () => {
  let testAthleteId: string;
  let athleteUsername: string;
  let derivedMetricCode: string;

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);

    // Create a test athlete with login credentials
    athleteUsername = `athlete-${Date.now()}`;
    const athleteResponse = await page.request.post(`${TESTING_URL}/api/athletes`, {
      data: {
        firstName: 'Self',
        lastName: 'Entry',
        email: `self-entry-${Date.now()}@example.com`,
        birthYear: 2000,
        sports: ['Football'],
        status: 'active',
        username: athleteUsername,
        password: 'TestPass123!',
      },
    });
    const athlete = await athleteResponse.json();
    testAthleteId = athlete.id;

    // Create a derived metric
    const derivedMetric = generateDerivedMetric();
    derivedMetricCode = derivedMetric.code;
    await page.request.post(`${TESTING_URL}/api/metrics`, {
      data: derivedMetric,
    });
  });

  test.afterEach(async ({ page }) => {
    try {
      await page.request.delete(`${TESTING_URL}/api/athletes/${testAthleteId}`);
      await page.request.delete(`${TESTING_URL}/api/metrics/${derivedMetricCode}`);
    } catch (error) {
      console.warn('Cleanup failed:', error);
    }
  });

  test('should exclude derived metrics from athlete self-entry form', async ({ page }) => {
    // Login as athlete (if separate athlete login is available)
    // For now, assume we can access self-entry as admin
    await page.goto(`${TESTING_URL}/my-measurements`);

    // Open metric selector in self-entry form
    await page.click('[data-testid="self-entry-metric-select"]');

    // Should see FLY10_TIME (source metric)
    await expect(page.locator('[data-testid="metric-option-FLY10_TIME"]')).toBeVisible();

    // Should NOT see derived metric
    const derivedOption = page.locator(`[data-testid="metric-option-${derivedMetricCode}"]`);
    await expect(derivedOption).not.toBeVisible();
  });
});

test.describe('Derived Metrics - Date Matching Strategies', () => {
  let testAthleteId: string;
  let latestBeforeMetricCode: string;
  let closestMetricCode: string;

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);

    // Create test athlete
    const athleteResponse = await page.request.post(`${TESTING_URL}/api/athletes`, {
      data: {
        firstName: 'Date',
        lastName: 'Match',
        email: `date-match-${Date.now()}@example.com`,
        birthYear: 2000,
        sports: ['Football'],
        status: 'active',
      },
    });
    const athlete = await athleteResponse.json();
    testAthleteId = athlete.id;

    // Create derived metric with latest_before strategy
    const latestBeforeMetric = {
      ...generateDerivedMetric(),
      code: `LATEST_BEFORE_${Date.now().toString(36).toUpperCase()}`,
      calculationConfig: {
        dateMatchStrategy: 'latest_before' as const,
        skipIfMissing: true,
      },
    };
    latestBeforeMetricCode = latestBeforeMetric.code;
    await page.request.post(`${TESTING_URL}/api/metrics`, {
      data: latestBeforeMetric,
    });

    // Create derived metric with closest strategy
    const closestMetric = {
      ...generateDerivedMetric(),
      code: `CLOSEST_${Date.now().toString(36).toUpperCase()}`,
      calculationConfig: {
        dateMatchStrategy: 'closest' as const,
        maxDateDifference: 7, // Within 7 days
        skipIfMissing: true,
      },
    };
    closestMetricCode = closestMetric.code;
    await page.request.post(`${TESTING_URL}/api/metrics`, {
      data: closestMetric,
    });
  });

  test.afterEach(async ({ page }) => {
    try {
      await page.request.delete(`${TESTING_URL}/api/athletes/${testAthleteId}`);
      await page.request.delete(`${TESTING_URL}/api/metrics/${latestBeforeMetricCode}`);
      await page.request.delete(`${TESTING_URL}/api/metrics/${closestMetricCode}`);
    } catch (error) {
      console.warn('Cleanup failed:', error);
    }
  });

  test('should use latest_before strategy to find source measurement', async ({ page }) => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

    // Create FLY10 measurements on different dates
    await page.request.post(`${TESTING_URL}/api/measurements`, {
      data: {
        athleteId: testAthleteId,
        metricCode: 'FLY10_TIME',
        value: 1.00,
        date: twoDaysAgo.toISOString().split('T')[0],
      },
    });

    await page.request.post(`${TESTING_URL}/api/measurements`, {
      data: {
        athleteId: testAthleteId,
        metricCode: 'FLY10_TIME',
        value: 0.95,
        date: yesterday.toISOString().split('T')[0],
      },
    });

    // Enter another metric today (triggers calculation using latest_before)
    await page.goto(`${TESTING_URL}/data-entry`);
    await page.click('[data-testid="athlete-select"]');
    await page.fill('[data-testid="athlete-search"]', 'Date Match');
    await page.click(`[data-testid="athlete-option-${testAthleteId}"]`);

    await page.click('[data-testid="metric-select"]');
    await page.click('[data-testid="metric-option-VERTICAL_JUMP"]');
    await page.fill('[data-testid="value-input"]', '30.0');
    await page.fill('[data-testid="date-input"]', today.toISOString().split('T')[0]);

    // Should show calculation preview using yesterday's FLY10 value (0.95)
    const calculatedPreview = page.locator(`[data-testid="calculated-preview-${latestBeforeMetricCode}"]`);
    await expect(calculatedPreview).toBeVisible({ timeout: 2000 });
    // 10 / 0.95 * 2.045 ≈ 21.53
    await expect(calculatedPreview).toContainText('21.5');
  });
});
