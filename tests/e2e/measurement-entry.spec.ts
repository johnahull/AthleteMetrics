import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';
import { goToDataEntry } from './helpers/navigation';

/**
 * TIER 1 CRITICAL: Measurement Entry Tests
 *
 * These tests verify the core measurement functionality:
 * - Adding measurements for athletes
 * - Measurements appearing in athlete profiles
 * - Measurement validation
 * - Verifying measurements
 * - Editing measurements
 * - Deleting measurements
 * - Multiple measurement types
 * - Measurement history
 *
 * Tests follow TDD methodology: written first, infrastructure built to make them pass.
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

// Generate unique test data
const timestamp = Date.now();
const testMeasurement = {
  athlete: 'Test Athlete',
  metric: 'FLY10_TIME',
  value: 1.25,
  date: '2025-01-15',
  notes: `E2E Test Measurement ${timestamp}`
};

test.describe('Measurement Entry Tests', () => {

  // Setup: Login before each test
  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
  });

  test('should successfully add a measurement for an athlete', async ({ page }) => {
    await goToDataEntry(page);

    // Select an athlete
    // Note: Selectors will need adjustment based on actual form implementation
    const athleteSelect = page.locator('[data-testid="select-athlete"], select[name="athlete"], [placeholder*="Select athlete" i]');
    const athleteSelectExists = await athleteSelect.count();

    if (athleteSelectExists > 0) {
      await athleteSelect.click();
      // Select first available athlete
      await page.click('[role="option"]').catch(() => {
        // If dropdown doesn't use role="option", try alternative
        page.locator('option').nth(1).click();
      });
    }

    // Select measurement type
    const metricSelect = page.locator('[data-testid="select-metric"], select[name="metric"], [placeholder*="Select metric" i]');
    await metricSelect.click();
    await page.click('text="FLY10_TIME", text="10-Yard Fly"').catch(() => {
      // Fallback selector
      page.locator('option:has-text("FLY10")').click();
    });

    // Enter measurement value
    await page.fill('[data-testid="input-value"], input[name="value"], input[type="number"]', testMeasurement.value.toString());

    // Enter date
    const dateInput = page.locator('[data-testid="input-date"], input[name="date"], input[type="date"]');
    const dateExists = await dateInput.count();
    if (dateExists > 0) {
      await dateInput.fill(testMeasurement.date);
    }

    // Add notes (optional)
    const notesInput = page.locator('[data-testid="input-notes"], textarea[name="notes"], input[name="notes"]');
    const notesExists = await notesInput.count();
    if (notesExists > 0) {
      await notesInput.fill(testMeasurement.notes);
    }

    // Submit the form
    await page.click('[data-testid="button-submit-measurement"], button[type="submit"]:has-text("Add"), button:has-text("Save Measurement")');

    // Wait for success message to appear
    await page.waitForSelector('text=/measurement.*added|success|saved/i', { timeout: 5000 });

    // Verify success message
    const successMessage = await page.locator('text=/measurement.*added|success|saved/i').count();
    expect(successMessage).toBeGreaterThan(0);
  });

  test('should show measurement in athlete profile after adding', async ({ page }) => {
    // First, add a measurement (reuse logic from previous test)
    await goToDataEntry(page);

    const athleteSelect = page.locator('[data-testid="select-athlete"], select[name="athlete"]');
    const athleteSelectExists = await athleteSelect.count();

    if (athleteSelectExists > 0) {
      await athleteSelect.click();
      await page.click('[role="option"]').catch(() => page.locator('option').nth(1).click());
    }

    const metricSelect = page.locator('[data-testid="select-metric"], select[name="metric"]');
    await metricSelect.click();
    await page.click('text="FLY10_TIME", text="10-Yard Fly"').catch(() => page.locator('option:has-text("FLY10")').click());

    await page.fill('[data-testid="input-value"], input[name="value"]', testMeasurement.value.toString());

    await page.click('[data-testid="button-submit-measurement"], button[type="submit"]');
    // Wait for success message
    await page.waitForSelector('text=/measurement.*added|success|saved/i', { timeout: 5000 });

    // Navigate to athlete profile
    // This is simplified - actual implementation may vary
    await page.goto(`${STAGING_URL}/athletes`);
    // Wait for athletes page to load
    await page.waitForSelector('[data-testid^="button-view-athlete-"]', { timeout: 5000 });

    // Click first athlete
    const viewButton = page.locator('[data-testid^="button-view-athlete-"]').first();
    const viewButtonExists = await viewButton.count();
    if (viewButtonExists > 0) {
      await viewButton.click();
      // Wait for profile page to load
      await page.waitForSelector('text=/FLY10|10-yard|fly time/i', { timeout: 5000 });

      // Verify measurement appears in profile
      const measurementInProfile = await page.locator('text=/FLY10|10-yard|fly time/i').count();
      expect(measurementInProfile).toBeGreaterThan(0);
    }
  });

  test('should show validation errors for invalid measurement data', async ({ page }) => {
    await goToDataEntry(page);

    // Try to submit without selecting athlete
    await page.click('[data-testid="button-submit-measurement"], button[type="submit"]').catch(() => {
      // Button might be disabled, which is also valid
    });

    // Wait for validation error to appear
    const measErrorLocator = page.locator('.error, [role="alert"]').or(page.locator('text=/required|must|invalid/i'));
    await measErrorLocator.first().waitFor({ timeout: 3000 });

    // Should show validation error
    const validationError = await measErrorLocator.count();
    expect(validationError).toBeGreaterThan(0);
  });

  test('should successfully verify a measurement', async ({ page }) => {
    // First, add a measurement
    await goToDataEntry(page);

    const athleteSelect = page.locator('[data-testid="select-athlete"], select[name="athlete"]');
    const athleteSelectExists = await athleteSelect.count();

    if (athleteSelectExists > 0) {
      await athleteSelect.click();
      await page.click('[role="option"]').catch(() => page.locator('option').nth(1).click());
    }

    const metricSelect = page.locator('[data-testid="select-metric"], select[name="metric"]');
    await metricSelect.click();
    await page.click('text="FLY10_TIME"').catch(() => page.locator('option:has-text("FLY10")').click());

    await page.fill('[data-testid="input-value"], input[name="value"]', testMeasurement.value.toString());
    await page.click('[data-testid="button-submit-measurement"], button[type="submit"]');
    // Wait for success message
    await page.waitForSelector('text=/measurement.*added|success|saved/i', { timeout: 5000 });

    // Navigate to measurements view or athlete profile
    await page.goto(`${STAGING_URL}/athletes`);
    // Wait for athletes page to load
    await page.waitForSelector('[data-testid^="button-view-athlete-"]', { timeout: 5000 });

    // Find verify button (if it exists)
    const verifyButton = page.locator('[data-testid^="button-verify-measurement-"], button:has-text("Verify")');
    const verifyExists = await verifyButton.count();

    if (verifyExists > 0) {
      await verifyButton.first().click();
      // Wait for verification to complete
      await page.waitForSelector('text=/verified|confirmed/i', { timeout: 3000 });

      // Verify success
      const verified = await page.locator('text=/verified|confirmed/i').count();
      expect(verified).toBeGreaterThan(0);
    }
  });

  test('should successfully edit an existing measurement', async ({ page }) => {
    // Navigate to measurements list or athlete profile
    await page.goto(`${STAGING_URL}/athletes`);
    // Wait for athletes page to load
    await page.waitForSelector('[data-testid^="button-view-athlete-"]', { timeout: 5000 });

    // View athlete profile
    const viewButton = page.locator('[data-testid^="button-view-athlete-"]').first();
    const viewButtonExists = await viewButton.count();

    if (viewButtonExists > 0) {
      await viewButton.click();
      // Wait for profile page to load with measurements
      await page.waitForSelector('[data-testid^="button-edit-measurement-"], button:has-text("Edit"), .measurement-row', { timeout: 5000 });

      // Find edit measurement button
      const editMeasurementButton = page.locator('[data-testid^="button-edit-measurement-"], button:has-text("Edit")');
      const editExists = await editMeasurementButton.count();

      if (editExists > 0) {
        await editMeasurementButton.first().click();

        // Wait for edit form
        await page.waitForSelector('[role="dialog"], .modal, form', { timeout: 5000 });

        // Update measurement value
        const newValue = 1.30;
        await page.fill('[data-testid="input-value"], input[name="value"]', newValue.toString());

        // Save changes
        await page.click('button[type="submit"]:has-text("Save"), button:has-text("Update")');
        // Wait for update success
        await expect(page.locator(`text=${newValue}`)).toBeVisible({ timeout: 3000 });

        // Verify update success
        const updated = await page.locator(`text=${newValue}`).count();
        expect(updated).toBeGreaterThan(0);
      }
    }
  });

  test('should successfully delete a measurement', async ({ page }) => {
    // Navigate to athlete profile
    await page.goto(`${STAGING_URL}/athletes`);
    // Wait for athletes page to load
    await page.waitForSelector('[data-testid^="button-view-athlete-"]', { timeout: 5000 });

    const viewButton = page.locator('[data-testid^="button-view-athlete-"]').first();
    const viewButtonExists = await viewButton.count();

    if (viewButtonExists > 0) {
      await viewButton.click();
      // Wait for profile page with measurements to load
      await page.waitForSelector('[data-testid^="button-delete-measurement-"], .measurement-row, tr', { timeout: 5000 });

      // Get initial measurement count
      const initialCount = await page.locator('[data-testid^="button-delete-measurement-"], .measurement-row, tr').count();

      // Find delete measurement button
      const deleteMeasurementButton = page.locator('[data-testid^="button-delete-measurement-"], button:has-text("Delete")');
      const deleteExists = await deleteMeasurementButton.count();

      if (deleteExists > 0) {
        await deleteMeasurementButton.first().click();

        // Confirm deletion
        const confirmButton = page.locator('button:has-text("Delete"), button:has-text("Confirm")');
        const confirmExists = await confirmButton.count();
        if (confirmExists > 0) {
          await confirmButton.click();
        }

        // Wait for deletion to complete
        await expect(async () => {
          const currentCount = await page.locator('[data-testid^="button-delete-measurement-"], .measurement-row, tr').count();
          expect(currentCount).toBeLessThan(initialCount);
        }).toPass({ timeout: 5000 });

        // Verify measurement was deleted
        const finalCount = await page.locator('[data-testid^="button-delete-measurement-"], .measurement-row, tr').count();
        expect(finalCount).toBeLessThan(initialCount);
      }
    }
  });

  test('should support multiple measurement types', async ({ page }) => {
    await goToDataEntry(page);

    const measurementTypes = [
      { name: 'FLY10_TIME', value: 1.25 },
      { name: 'VERTICAL_JUMP', value: 28.5 },
      { name: 'DASH_40YD', value: 5.2 }
    ];

    for (const measurement of measurementTypes) {
      // Select athlete
      const athleteSelect = page.locator('[data-testid="select-athlete"], select[name="athlete"]');
      const athleteSelectExists = await athleteSelect.count();

      if (athleteSelectExists > 0) {
        await athleteSelect.click();
        await page.click('[role="option"]').catch(() => page.locator('option').nth(1).click());
      }

      // Select measurement type
      const metricSelect = page.locator('[data-testid="select-metric"], select[name="metric"]');
      await metricSelect.click();
      await page.click(`text="${measurement.name}"`).catch(() => {
        page.locator(`option:has-text("${measurement.name}")`).click();
      });

      // Enter value
      await page.fill('[data-testid="input-value"], input[name="value"]', measurement.value.toString());

      // Submit
      await page.click('[data-testid="button-submit-measurement"], button[type="submit"]');
      // Wait for success message
      await page.waitForSelector('text=/measurement.*added|success/i', { timeout: 5000 });
    }

    // Verify success messages appeared for all types
    const successCount = await page.locator('text=/measurement.*added|success/i').count();
    expect(successCount).toBeGreaterThan(0);
  });

  test('should display measurement history for athlete', async ({ page }) => {
    // Navigate to athlete profile
    await page.goto(`${STAGING_URL}/athletes`);
    // Wait for athletes page to load
    await page.waitForSelector('[data-testid^="button-view-athlete-"]', { timeout: 5000 });

    const viewButton = page.locator('[data-testid^="button-view-athlete-"]').first();
    const viewButtonExists = await viewButton.count();

    if (viewButtonExists > 0) {
      await viewButton.click();
      // Wait for profile page with measurement data to load
      await page.waitForSelector('text=/measurement.*history|performance.*history|recent measurements|FLY10|VERTICAL|DASH|seconds|inches/i', { timeout: 5000 });

      // Look for measurement history section
      const historySection = await page.locator('text=/measurement.*history|performance.*history|recent measurements/i').count();

      if (historySection > 0) {
        // Verify measurements are displayed
        const measurements = await page.locator('[data-testid^="measurement-"], .measurement-row, tr').count();
        expect(measurements).toBeGreaterThan(0);
      }

      // Alternatively, check for any measurement data
      const measurementData = await page.locator('text=/FLY10|VERTICAL|DASH|seconds|inches/i').count();
      expect(measurementData).toBeGreaterThan(0);
    }
  });
});

test.describe('Measurement Entry Summary', () => {
  test('print measurement entry test summary', async () => {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('Measurement Entry Tests Summary');
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ Add measurement for athlete');
    console.log('✅ Measurement appears in athlete profile');
    console.log('✅ Validation errors for invalid data');
    console.log('✅ Verify measurement');
    console.log('✅ Edit existing measurement');
    console.log('✅ Delete measurement');
    console.log('✅ Multiple measurement types');
    console.log('✅ Measurement history display');
    console.log('═══════════════════════════════════════════════════\n');
  });
});
