import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * E2E test for publish page date filter functionality
 * Tests the specific bug where dates before the 2nd of the month caused crashes
 */
test.describe('Publish Page - Date Filter E2E', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    const targetURL = process.env.TESTING_URL || baseURL || 'http://localhost:5000';

    // Use auth helper that handles storageState and proper selectors
    await loginAsDefaultUser(page);

    // Navigate to publish page
    await page.goto(`${targetURL}/publish`);
    await page.waitForLoadState('networkidle');
  });

  test('should not crash when selecting date on 1st of month', async ({ page }) => {
    // Select a metric first (required to enable filtering)
    const metricSelect = page.getByTestId('select-metric');
    await metricSelect.click();

    // Wait for dropdown and select first available metric
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    const firstMetric = page.locator('[role="option"]').first();
    await firstMetric.click();

    // Wait for initial data to load after metric selection
    await page.waitForLoadState('networkidle');

    // Set dateFrom to January 1st (the problematic date)
    const dateFromInput = page.getByTestId('input-date-from');
    await dateFromInput.fill('2024-01-01');

    // Wait for query to complete after date input
    await page.waitForLoadState('networkidle');

    // Page should not have crashed - check for error messages
    const errorMessage = page.locator('text=/error|crash|failed/i').first();
    await expect(errorMessage).not.toBeVisible();

    // Results heading should be visible (might be empty or have data)
    const resultsHeading = page.getByRole('heading', { name: /Results -/ });
    await expect(resultsHeading).toBeVisible();
  });

  test('should filter measurements by date range correctly', async ({ page }) => {
    // Select a metric
    const metricSelect = page.getByTestId('select-metric');
    await metricSelect.click();
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    const firstMetric = page.locator('[role="option"]').first();
    await firstMetric.click();

    // Wait for initial data to load after metric selection
    await page.waitForLoadState('networkidle');

    // Get initial count of results
    const initialResults = page.locator('table tbody tr');
    const initialCount = await initialResults.count();

    // Set a date range (last 30 days)
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dateFromInput = page.getByTestId('input-date-from');
    const dateToInput = page.getByTestId('input-date-to');

    await dateFromInput.fill(thirtyDaysAgo.toISOString().split('T')[0]);
    await dateToInput.fill(today.toISOString().split('T')[0]);

    // Wait for filtered query to complete
    await page.waitForLoadState('networkidle');

    // Should have results or "no measurements found" message
    const hasTable = await page.locator('table tbody tr').count();
    const noResultsMessage = page.locator('text=No measurements found');

    // Either we have results or we have the "no results" message
    expect(hasTable > 0 || await noResultsMessage.isVisible()).toBeTruthy();
  });

  test('should handle dates on 2nd of month', async ({ page }) => {
    // Select a metric
    const metricSelect = page.getByTestId('select-metric');
    await metricSelect.click();
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    const firstMetric = page.locator('[role="option"]').first();
    await firstMetric.click();

    // Wait for initial data to load after metric selection
    await page.waitForLoadState('networkidle');

    // Set dateFrom to 2nd of month
    const dateFromInput = page.getByTestId('input-date-from');
    await dateFromInput.fill('2024-01-02');

    // Wait for query to complete after date input
    await page.waitForLoadState('networkidle');

    // Should not crash - check results heading is visible
    const resultsHeading = page.getByRole('heading', { name: /Results -/ });
    await expect(resultsHeading).toBeVisible();
  });

  test('should reset date filters when Reset Filters is clicked', async ({ page }) => {
    // Select a metric
    const metricSelect = page.getByTestId('select-metric');
    await metricSelect.click();
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    const firstMetric = page.locator('[role="option"]').first();
    await firstMetric.click();

    // Set date filters
    const dateFromInput = page.getByTestId('input-date-from');
    const dateToInput = page.getByTestId('input-date-to');

    await dateFromInput.fill('2024-01-01');
    await dateToInput.fill('2024-12-31');

    // Verify dates are set
    await expect(dateFromInput).toHaveValue('2024-01-01');
    await expect(dateToInput).toHaveValue('2024-12-31');

    // Click Reset Filters
    const resetButton = page.getByTestId('reset-filters-button');
    await resetButton.click();

    // Wait for reset to complete (filters should be cleared)
    await expect(dateFromInput).toHaveValue('', { timeout: 1000 });

    // Date filters should be cleared
    await expect(dateFromInput).toHaveValue('');
    await expect(dateToInput).toHaveValue('');
  });

  test('should send ISO datetime format to API', async ({ page }) => {
    // Listen for API calls
    const apiCalls: string[] = [];
    page.on('request', request => {
      const url = request.url();
      if (url.includes('/api/measurements')) {
        apiCalls.push(url);
      }
    });

    // Select a metric
    const metricSelect = page.getByTestId('select-metric');
    await metricSelect.click();
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    const firstMetric = page.locator('[role="option"]').first();
    await firstMetric.click();

    // Set date filter
    const dateFromInput = page.getByTestId('input-date-from');
    await dateFromInput.fill('2024-01-15');

    // Wait for API call to complete
    await page.waitForLoadState('networkidle');

    // Check that API was called with ISO datetime format
    const measurementCall = apiCalls.find(url => url.includes('dateFrom='));
    expect(measurementCall).toBeDefined();

    // Extract dateFrom parameter
    if (measurementCall) {
      const urlObj = new URL(measurementCall);
      const dateFrom = urlObj.searchParams.get('dateFrom');

      // Should be ISO datetime format (e.g., 2024-01-15T00:00:00.000Z)
      expect(dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
  });
});
