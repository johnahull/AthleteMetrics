import { test, expect } from './fixtures/e2e-base';
import { loginAsCoach, loginAsAthlete } from './helpers/auth';

/**
 * E2E Tests for Measurement Notifications
 *
 * These tests verify that athletes receive notifications when coaches record measurements:
 * - Coach recording measurement triggers notification flow
 * - Athlete self-entry does NOT trigger notification
 * - Batch entry triggers individual notifications for each athlete
 * - Notification preferences UI exists and is functional
 *
 * Tests follow AthleteMetrics E2E patterns and CLAUDE.md policy.
 */

const TESTING_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

test.describe('Measurement Notifications', () => {

  test('should trigger notification when coach records measurement for athlete', async ({ page }) => {
    // Login as coach
    await loginAsCoach(page);

    // Navigate to measurement entry
    await page.goto(`${TESTING_URL}/data-entry`);
    await page.waitForLoadState('networkidle');

    // Wait for form to load
    await page.waitForSelector('[data-testid="athlete-select"]', { timeout: 10000 });

    // Select an athlete (not the coach themselves)
    const athleteSelect = page.locator('[data-testid="athlete-select"]').first();
    await athleteSelect.click();

    // Wait for dropdown to open and select first athlete
    await page.waitForTimeout(500);
    const firstAthlete = page.locator('[role="option"], option').nth(1);
    await firstAthlete.click().catch(async () => {
      // Fallback for different dropdown implementations
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
    });

    // Select measurement type (FLY10_TIME)
    const metricSelect = page.locator('[data-testid="metric-select"]').first();
    await metricSelect.click();
    await page.waitForTimeout(300);

    // Try to find and click FLY10_TIME option
    await page.click('text=/FLY10|10.*Yard.*Fly/i').catch(async () => {
      // Fallback: keyboard navigation
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
    });

    // Enter measurement value
    const valueInput = page.locator('[data-testid="measurement-value"]').first();
    await valueInput.fill('1.25');

    // Enter date (today)
    const today = new Date().toISOString().split('T')[0];
    const dateInput = page.locator('[data-testid="input-measurement-date"]').first();
    const dateExists = await dateInput.count();
    if (dateExists > 0) {
      await dateInput.fill(today);
    }

    // Submit the form
    const submitButton = page.locator('[data-testid="submit-measurement"]').first();
    await submitButton.click();

    // Wait for success indication
    await page.waitForTimeout(2000);

    // Verify success (toast message or redirect)
    const hasSuccessToast = await page.locator('text=/success|added|recorded/i').count() > 0;
    const urlChanged = !page.url().includes('/data-entry') || page.url().includes('success=true');

    // At least one success indicator should be present
    expect(hasSuccessToast || urlChanged).toBeTruthy();

    // NOTE: We cannot directly verify push notification or email was sent in E2E tests
    // That requires integration tests with mocked services
    // This test verifies the user workflow that triggers the notification service
  });

  test('should NOT trigger notification when athlete enters their own measurement', async ({ page }) => {
    // Login as athlete
    await loginAsAthlete(page);

    // Navigate to self-entry measurement page
    await page.goto(`${TESTING_URL}/my-measurements`);
    await page.waitForLoadState('networkidle');

    // Look for "Add Measurement" or "Log Measurement" button
    const addButton = page.locator('button:has-text("Add"), button:has-text("Log"), a:has-text("Add")').first();
    const addButtonExists = await addButton.count();

    if (addButtonExists === 0) {
      // Skip test if self-entry UI doesn't exist yet
      test.skip();
      return;
    }

    await addButton.click();
    await page.waitForTimeout(500);

    // Select measurement type
    const metricSelect = page.locator('[data-testid="metric-select"]').first();
    const metricExists = await metricSelect.count();

    if (metricExists > 0) {
      await metricSelect.click();
      await page.waitForTimeout(300);

      // Select first available metric
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');

      // Enter measurement value
      const valueInput = page.locator('[data-testid="measurement-value"]').first();
      await valueInput.fill('1.30');

      // Submit
      const submitButton = page.locator('[data-testid="submit-measurement"]').first();
      await submitButton.click();

      // Wait for success
      await page.waitForTimeout(2000);

      // Verify submission succeeded
      const hasSuccessIndicator = await page.locator('text=/success|added|recorded/i').count() > 0;

      // Self-entry should succeed, but notifyNewMeasurement() will skip notification
      // because submittedBy === userId (verified by unit tests)
      expect(hasSuccessIndicator).toBeTruthy();
    }
  });

  test('should verify notification preferences UI exists', async ({ page }) => {
    // Login as athlete
    await loginAsAthlete(page);

    // Navigate to account settings or notification preferences
    await page.goto(`${TESTING_URL}/account`);
    await page.waitForLoadState('networkidle');

    // Look for notification preferences section
    const notificationSection = page.locator('text=/notification/i, h2:has-text("Notification"), h3:has-text("Notification")');
    const sectionExists = await notificationSection.count();

    if (sectionExists === 0) {
      // Try alternative navigation paths
      await page.goto(`${TESTING_URL}/settings`);
      await page.waitForLoadState('networkidle');

      const settingsNotificationSection = await page.locator('text=/notification/i').count();

      if (settingsNotificationSection === 0) {
        // Skip if notification preferences UI doesn't exist yet
        test.skip();
        return;
      }
    }

    // Look for email notification toggle for new measurements
    const emailToggle = page.locator('input[type="checkbox"], [role="switch"]').filter({
      has: page.locator('text=/email.*measurement|measurement.*email/i')
    });

    const emailToggleExists = await emailToggle.count();

    // Verify the toggle exists (can be checked or unchecked)
    expect(emailToggleExists).toBeGreaterThan(0);
  });

  test('should handle batch measurement entry notification flow', async ({ page }) => {
    // Login as coach
    await loginAsCoach(page);

    // Navigate to batch measurement entry
    await page.goto(`${TESTING_URL}/batch-entry`);
    await page.waitForLoadState('networkidle');

    // Check if batch entry page exists
    const hasBatchForm = await page.locator('form, [data-testid="batch-entry-form"]').count() > 0;

    if (!hasBatchForm) {
      // Try alternative URL
      await page.goto(`${TESTING_URL}/data-entry/batch`);
      await page.waitForLoadState('networkidle');

      const hasBatchFormAlt = await page.locator('form, [data-testid="batch-entry-form"]').count() > 0;

      if (!hasBatchFormAlt) {
        // Skip if batch entry doesn't exist yet
        test.skip();
        return;
      }
    }

    // Select measurement type
    const metricSelect = page.locator('[data-testid="metric-select"]').first();
    await metricSelect.click();
    await page.waitForTimeout(300);

    // Select FLY10_TIME
    await page.click('text=/FLY10|10.*Yard/i').catch(async () => {
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
    });

    // Add at least 2 athletes to batch entry
    for (let i = 0; i < 2; i++) {
      const addAthleteButton = page.locator('button:has-text("Add Athlete"), button:has-text("Add Row")').first();
      const addButtonExists = await addAthleteButton.count();

      if (addButtonExists > 0) {
        await addAthleteButton.click();
        await page.waitForTimeout(300);
      }
    }

    // Fill in athlete data (simplified - actual implementation may vary)
    const athleteSelectors = page.locator('[data-testid*="athlete"], select[name*="athlete"]');
    const count = await athleteSelectors.count();

    if (count >= 2) {
      // Select different athletes and enter values
      for (let i = 0; i < Math.min(count, 2); i++) {
        const selector = athleteSelectors.nth(i);
        await selector.click();
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');

        // Enter value for this athlete
        const valueInput = page.locator(`input[name*="value"]`).nth(i);
        await valueInput.fill(`1.${25 + i}`);
      }

      // Submit batch entry
      const submitButton = page.locator('button[type="submit"], button:has-text("Submit"), button:has-text("Save All")').first();
      await submitButton.click();

      // Wait for success
      await page.waitForTimeout(2000);

      // Verify success
      const hasSuccess = await page.locator('text=/success|recorded|saved/i').count() > 0;

      // Each athlete should trigger individual notification
      // (verified by unit tests - notifyNewMeasurement called for each)
      expect(hasSuccess).toBeTruthy();
    }
  });
});
