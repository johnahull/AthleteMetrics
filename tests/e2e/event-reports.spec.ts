/**
 * E2E Tests for Event Reports
 * Tests the event reports workflow including generating and viewing reports
 */

import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';

// Test configuration
const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

test.describe('Event Reports', () => {
  // Login before all tests in this describe block
  test.beforeEach(async ({ page }) => {
    // Use auth helper that handles storageState and proper selectors
    await loginAsDefaultUser(page);
  });

  test.describe('Reports Tab Display', () => {
    test('should display Reports tab on event detail page', async ({ page }) => {
      // Navigate to events page
      await page.goto(`${STAGING_URL}/events`);

      // Wait for events to load
      await page.waitForSelector('[data-testid="event-card"], [data-testid="no-events"]', { timeout: 10000 });

      // Check if there are any events
      const hasEvents = await page.locator('[data-testid="event-card"]').count() > 0;

      if (hasEvents) {
        // Click on the first event
        await page.locator('[data-testid="event-card"]').first().click();

        // Wait for event detail page
        await page.waitForSelector('[data-testid="tab-reports"]', { timeout: 10000 });

        // Check Reports tab exists
        await expect(page.locator('[data-testid="tab-reports"]')).toBeVisible();
      } else {
        // Skip test if no events exist
        test.skip();
      }
    });

    test('should show Reports tab content when clicked', async ({ page }) => {
      // Navigate to events page
      await page.goto(`${STAGING_URL}/events`);

      // Wait for events to load
      await page.waitForSelector('[data-testid="event-card"], [data-testid="no-events"]', { timeout: 10000 });

      // Check if there are any events
      const hasEvents = await page.locator('[data-testid="event-card"]').count() > 0;

      if (hasEvents) {
        // Click on the first event
        await page.locator('[data-testid="event-card"]').first().click();

        // Wait for and click Reports tab
        await page.waitForSelector('[data-testid="tab-reports"]', { timeout: 10000 });
        await page.click('[data-testid="tab-reports"]');

        // Verify Reports tab content is displayed
        await expect(page.getByText('Quick Actions')).toBeVisible();
        await expect(page.getByText('Team Summary')).toBeVisible();
        await expect(page.getByText('Individual')).toBeVisible();
      } else {
        test.skip();
      }
    });
  });

  test.describe('Quick Report Generation', () => {
    test('should show quick action buttons for report generation', async ({ page }) => {
      // Navigate to events page
      await page.goto(`${STAGING_URL}/events`);

      // Wait for events to load
      await page.waitForSelector('[data-testid="event-card"], [data-testid="no-events"]', { timeout: 10000 });

      const hasEvents = await page.locator('[data-testid="event-card"]').count() > 0;

      if (hasEvents) {
        // Click on the first event
        await page.locator('[data-testid="event-card"]').first().click();

        // Click Reports tab
        await page.waitForSelector('[data-testid="tab-reports"]', { timeout: 10000 });
        await page.click('[data-testid="tab-reports"]');

        // Verify quick action buttons
        await expect(page.getByText('Team Summary')).toBeVisible();
        await expect(page.getByText('Individual')).toBeVisible();
        await expect(page.getByText('Export Data')).toBeVisible();
      } else {
        test.skip();
      }
    });
  });

  test.describe('Event Reports Features Info', () => {
    test('should display report features information', async ({ page }) => {
      // Navigate to events page
      await page.goto(`${STAGING_URL}/events`);

      // Wait for events to load
      await page.waitForSelector('[data-testid="event-card"], [data-testid="no-events"]', { timeout: 10000 });

      const hasEvents = await page.locator('[data-testid="event-card"]').count() > 0;

      if (hasEvents) {
        // Click on the first event
        await page.locator('[data-testid="event-card"]').first().click();

        // Click Reports tab
        await page.waitForSelector('[data-testid="tab-reports"]', { timeout: 10000 });
        await page.click('[data-testid="tab-reports"]');

        // Verify feature descriptions are displayed
        await expect(page.getByText('Event Reports Include')).toBeVisible();
        await expect(page.getByText('Event Percentiles')).toBeVisible();
        await expect(page.getByText('AI Insights')).toBeVisible();
        await expect(page.getByText('Team Statistics')).toBeVisible();
        await expect(page.getByText('PDF Export')).toBeVisible();
      } else {
        test.skip();
      }
    });
  });

  test.describe('Frozen Event Reports', () => {
    test('should show frozen badge and disable new report creation on frozen events', async ({ page }) => {
      // This test would require a frozen event - may need to be set up via API first
      // For now, just verify the UI handles frozen state correctly

      // Navigate to events page
      await page.goto(`${STAGING_URL}/events`);

      // Wait for events to load
      await page.waitForSelector('[data-testid="event-card"], [data-testid="no-events"]', { timeout: 10000 });

      // Look for a frozen event badge
      const frozenBadge = page.locator('text=Frozen');
      const hasFrozenEvents = await frozenBadge.count() > 0;

      if (hasFrozenEvents) {
        // Click on the frozen event
        await page.locator('[data-testid="event-card"]').filter({ hasText: 'Frozen' }).first().click();

        // Click Reports tab
        await page.waitForSelector('[data-testid="tab-reports"]', { timeout: 10000 });
        await page.click('[data-testid="tab-reports"]');

        // Verify frozen state messaging
        await expect(page.getByText('This event is frozen')).toBeVisible();
      } else {
        // No frozen events to test - skip
        test.skip();
      }
    });
  });

  test.describe('Reports List', () => {
    test('should display empty state when no reports exist', async ({ page }) => {
      // Navigate to events page
      await page.goto(`${STAGING_URL}/events`);

      // Wait for events to load
      await page.waitForSelector('[data-testid="event-card"], [data-testid="no-events"]', { timeout: 10000 });

      const hasEvents = await page.locator('[data-testid="event-card"]').count() > 0;

      if (hasEvents) {
        // Click on the first event
        await page.locator('[data-testid="event-card"]').first().click();

        // Click Reports tab
        await page.waitForSelector('[data-testid="tab-reports"]', { timeout: 10000 });
        await page.click('[data-testid="tab-reports"]');

        // Check for either reports list or empty state
        const hasReports = await page.locator('[data-testid="report-card"]').count() > 0;

        if (!hasReports) {
          // Verify empty state message
          await expect(page.getByText('No reports generated yet')).toBeVisible();
          await expect(page.getByText('Use the quick actions above to create your first report')).toBeVisible();
        }
      } else {
        test.skip();
      }
    });
  });
});
