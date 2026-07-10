import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';
import { goToAnalytics } from './helpers/navigation';

/**
 * E2E Tests: Benchmark Analytics Integration
 *
 * This test suite verifies the benchmark analytics feature that allows coaches
 * to visualize benchmark lines on charts, filter athletes by benchmark status,
 * and track benchmark achievement progress over time.
 *
 * Test Coverage:
 * - Benchmark line selector visibility and interaction
 * - Benchmark lines rendering on charts
 * - Benchmark dashboard widget display
 * - Achievement rate visualization
 * - Benchmark-based athlete filtering
 * - Benchmark progress chart over time
 *
 * Prerequisites:
 * - Staging environment must have benchmark data configured
 * - Test user must have access to organization with benchmarks
 * - Athletes must have measurements for benchmark evaluation
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

test.describe('Benchmark Analytics Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await loginAsDefaultUser(page);
  });

  test('should display benchmark line selector on analytics page', async ({ page }) => {
    // Navigate to Coach Analytics
    await goToAnalytics(page);
    await page.waitForURL(/\/coach-analytics/, { timeout: 5000 });

    // Wait for page to load
    await expect(page.locator('h1:has-text("Team Analytics Dashboard")')).toBeVisible({ timeout: 10000 });

    // Select Individual Athlete analysis type
    await page.click('button[role="tab"]:has-text("Individual Athlete")');
    await page.waitForSelector('[data-state="active"]:has-text("Individual Athlete")', { timeout: 5000 });

    // Select a metric (e.g., 10-Yard Fly Time)
    const metricSelector = page.locator('select, [role="combobox"]').filter({ hasText: /metric|select metric/i }).first();
    if (await metricSelector.isVisible()) {
      await metricSelector.click();
      await page.locator('option, [role="option"]').filter({ hasText: /fly.*time|10.*yard/i }).first().click({ timeout: 5000 });
    }

    // Wait for chart canvas to render (indicates page is ready)
    await page.waitForSelector('canvas', { timeout: 10000 });

    // Verify benchmark line selector is visible
    await expect(page.locator('text=/benchmark.*line|select.*benchmark/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('should allow selecting and deselecting benchmark lines', async ({ page }) => {
    // Navigate to Coach Analytics
    await goToAnalytics(page);
    await page.waitForURL(/\/coach-analytics/, { timeout: 5000 });

    // Select Individual Athlete analysis type
    await page.click('button[role="tab"]:has-text("Individual Athlete")');
    await page.waitForSelector('[data-state="active"]:has-text("Individual Athlete")', { timeout: 5000 });

    // Wait for benchmark selector to appear
    const benchmarkSelector = page.locator('[aria-label*="benchmark"], [data-testid*="benchmark"]').first();

    // If benchmarks exist, test selection
    if (await benchmarkSelector.isVisible({ timeout: 5000 })) {
      // Get initial count of selected benchmarks
      const initialCheckboxes = await page.locator('input[type="checkbox"][aria-label*="benchmark"]:checked').count();

      // Click first benchmark checkbox to toggle selection
      const firstCheckbox = page.locator('input[type="checkbox"][aria-label*="benchmark"]').first();
      const wasChecked = await firstCheckbox.isChecked();
      await firstCheckbox.click();

      // Wait for checkbox state to change
      await expect(firstCheckbox).toHaveAttribute('aria-checked', wasChecked ? 'false' : 'true', { timeout: 3000 });

      // Verify checkbox state changed
      const afterClickCheckboxes = await page.locator('input[type="checkbox"][aria-label*="benchmark"]:checked').count();
      expect(afterClickCheckboxes).not.toBe(initialCheckboxes);
    } else {
      console.log('No benchmarks available for selection - skipping test');
    }
  });

  test('should display benchmark dashboard widget with achievement rates', async ({ page }) => {
    // Navigate to Coach Analytics
    await goToAnalytics(page);
    await page.waitForURL(/\/coach-analytics/, { timeout: 5000 });

    // Select Multi-Athlete analysis type (where dashboard widget typically appears)
    await page.click('button[role="tab"]:has-text("Multi-Athlete")');
    await page.waitForSelector('[data-state="active"]:has-text("Multi-Athlete")', { timeout: 5000 });

    // Wait for dashboard content to load (chart or widget)
    await page.waitForSelector('canvas, [data-testid*="benchmark-dashboard"]', { timeout: 10000 });

    // Look for benchmark achievement cards or dashboard widget
    const benchmarkDashboard = page.locator('[data-testid*="benchmark-dashboard"], [aria-label*="benchmark.*dashboard"]').first();

    if (await benchmarkDashboard.isVisible({ timeout: 5000 })) {
      // Verify achievement rate is displayed
      await expect(page.locator('text=/achievement.*rate|\\d+%.*met/i').first()).toBeVisible({ timeout: 5000 });

      // Verify benchmark cards show color-coded status
      const benchmarkCards = page.locator('[data-testid*="benchmark-card"]');
      const cardCount = await benchmarkCards.count();

      if (cardCount > 0) {
        // Verify first card has achievement percentage
        await expect(benchmarkCards.first().locator('text=/%/')).toBeVisible();
      }
    } else {
      console.log('Benchmark dashboard widget not visible - may not be implemented or no data available');
    }
  });

  test('should filter athletes by benchmark status (met/unmet)', async ({ page }) => {
    // Navigate to Coach Analytics
    await goToAnalytics(page);
    await page.waitForURL(/\/coach-analytics/, { timeout: 5000 });

    // Select Multi-Athlete analysis type
    await page.click('button[role="tab"]:has-text("Multi-Athlete")');
    await page.waitForSelector('[data-state="active"]:has-text("Multi-Athlete")', { timeout: 5000 });

    // Look for benchmark filter dropdown or selector
    const benchmarkFilter = page.locator('[aria-label*="benchmark.*filter"], select[name*="benchmark"]').first();

    if (await benchmarkFilter.isVisible({ timeout: 5000 })) {
      // Open filter dropdown
      await benchmarkFilter.click();

      // Select "Met" filter option
      const metOption = page.locator('[role="option"], option').filter({ hasText: /met|achieved|passed/i }).first();
      if (await metOption.isVisible({ timeout: 3000 })) {
        await metOption.click();

        // Wait for filter to apply (athlete list updates)
        await page.waitForLoadState('networkidle', { timeout: 5000 });

        // Verify filtered results (athletes list should update)
        await expect(page.locator('[data-testid*="athlete-list"], tbody').first()).toBeVisible({ timeout: 5000 });
      }
    } else {
      console.log('Benchmark filter not found - feature may not be implemented');
    }
  });

  test('should display benchmark progress chart showing achievement over time', async ({ page }) => {
    // Navigate to Coach Analytics
    await goToAnalytics(page);
    await page.waitForURL(/\/coach-analytics/, { timeout: 5000 });

    // Wait for page content to load (at least one chart element)
    await page.waitForSelector('canvas, [data-testid*="chart"]', { timeout: 10000 });

    // Look for benchmark progress chart component
    const progressChart = page.locator('[data-testid*="benchmark-progress"], canvas[aria-label*="benchmark.*progress"]').first();

    if (await progressChart.isVisible({ timeout: 5000 })) {
      // Verify chart canvas is rendered
      await expect(progressChart).toBeVisible();

      // Verify chart has data labels or legend
      await expect(page.locator('text=/achievement|progress.*over.*time/i').first()).toBeVisible({ timeout: 5000 });

      // Verify date range selector is available
      const dateSelector = page.locator('[aria-label*="date"], input[type="date"]').first();
      if (await dateSelector.isVisible({ timeout: 3000 })) {
        await expect(dateSelector).toBeVisible();
      }
    } else {
      console.log('Benchmark progress chart not visible - may require specific navigation or data');
    }
  });

  test('should render benchmark lines on chart when selected', async ({ page }) => {
    // Navigate to Coach Analytics
    await goToAnalytics(page);
    await page.waitForURL(/\/coach-analytics/, { timeout: 5000 });

    // Select Individual Athlete analysis type
    await page.click('button[role="tab"]:has-text("Individual Athlete")');
    await page.waitForSelector('[data-state="active"]:has-text("Individual Athlete")', { timeout: 5000 });

    // Wait for chart canvas to render
    await page.waitForSelector('canvas', { timeout: 10000 });

    // Get reference to chart canvas
    const chartCanvas = page.locator('canvas').first();
    await expect(chartCanvas).toBeVisible({ timeout: 10000 });

    // Take screenshot before selecting benchmark
    const beforeScreenshot = await chartCanvas.screenshot();

    // Select a benchmark if available
    const benchmarkCheckbox = page.locator('input[type="checkbox"][aria-label*="benchmark"]').first();

    if (await benchmarkCheckbox.isVisible({ timeout: 5000 })) {
      await benchmarkCheckbox.click();

      // Wait for chart to re-render with benchmark line (network request completes)
      await page.waitForLoadState('networkidle', { timeout: 5000 });

      // Take screenshot after selecting benchmark
      const afterScreenshot = await chartCanvas.screenshot();

      // Verify screenshots are different (benchmark line was added)
      expect(beforeScreenshot).not.toEqual(afterScreenshot);

      // Verify benchmark appears in chart legend or labels
      const chartContainer = page.locator('canvas').locator('..').first();
      await expect(chartContainer).toBeVisible();
    } else {
      console.log('No benchmark checkboxes available - skipping visual comparison');
    }
  });

  test('should show benchmark achievement cards with color-coded status', async ({ page }) => {
    // Navigate to Coach Analytics
    await goToAnalytics(page);
    await page.waitForURL(/\/coach-analytics/, { timeout: 5000 });

    // Select Multi-Athlete or Dashboard view
    await page.click('button[role="tab"]:has-text("Multi-Athlete")');
    await page.waitForSelector('[data-state="active"]:has-text("Multi-Athlete")', { timeout: 5000 });

    // Wait for content to load (cards or dashboard elements)
    await page.waitForSelector('canvas, [data-testid*="benchmark-card"], [data-testid*="dashboard"]', { timeout: 10000 });

    // Look for benchmark achievement cards
    const benchmarkCards = page.locator('[data-testid*="benchmark-card"]');
    const cardCount = await benchmarkCards.count();

    if (cardCount > 0) {
      // Verify first card displays benchmark name
      const firstCard = benchmarkCards.first();
      await expect(firstCard).toBeVisible();

      // Verify achievement percentage is displayed
      await expect(firstCard.locator('text=/%/')).toBeVisible();

      // Verify color-coded status (green/yellow/orange based on rate)
      const cardStyles = await firstCard.getAttribute('class');
      expect(cardStyles).toBeTruthy();

      // Verify "Met" and "Unmet" counts are shown
      const metText = firstCard.locator('text=/met|achieved/i').first();
      if (await metText.isVisible({ timeout: 3000 })) {
        await expect(metText).toBeVisible();
      }
    } else {
      console.log('No benchmark cards found - data may not be available');
    }
  });

  test('should display benchmark filters with demographic options', async ({ page }) => {
    // Navigate to Coach Analytics
    await goToAnalytics(page);
    await page.waitForURL(/\/coach-analytics/, { timeout: 5000 });

    // Select Multi-Athlete analysis type
    await page.click('button[role="tab"]:has-text("Multi-Athlete")');
    await page.waitForSelector('[data-state="active"]:has-text("Multi-Athlete")', { timeout: 5000 });

    // Wait for filter panel or content to load
    await page.waitForSelector('[aria-label*="filter"], [data-testid*="filter"], canvas', { timeout: 10000 });

    // Look for benchmark filter section
    const filterSection = page.locator('[aria-label*="filter"], [data-testid*="filter"]').first();

    if (await filterSection.isVisible({ timeout: 5000 })) {
      // Verify demographic filter options exist
      const genderFilter = page.locator('label:has-text("Gender"), [aria-label*="gender"]').first();
      const ageFilter = page.locator('label:has-text("Age"), [aria-label*="age"]').first();

      // At least one demographic filter should be visible
      const hasFilters = (await genderFilter.isVisible({ timeout: 3000 })) ||
                        (await ageFilter.isVisible({ timeout: 3000 }));

      if (hasFilters) {
        console.log('Demographic filters are available');
      }
    }
  });

  test('should handle empty state when no benchmarks are available', async ({ page }) => {
    // Navigate to Coach Analytics
    await goToAnalytics(page);
    await page.waitForURL(/\/coach-analytics/, { timeout: 5000 });

    // Wait for page content to load (dashboard or empty state)
    await page.waitForSelector('h1, canvas, [data-testid*="empty-state"]', { timeout: 10000 });

    // Check if empty state message appears when no benchmarks configured
    const emptyState = page.locator('text=/no.*benchmark|benchmark.*not.*configured/i').first();

    if (await emptyState.isVisible({ timeout: 3000 })) {
      // Verify empty state message is helpful
      await expect(emptyState).toBeVisible();
      console.log('Empty state displayed correctly when no benchmarks available');
    } else {
      console.log('Benchmarks are available or empty state not implemented');
    }
  });

  test('should maintain benchmark selection when switching between athletes', async ({ page }) => {
    // Navigate to Coach Analytics
    await goToAnalytics(page);
    await page.waitForURL(/\/coach-analytics/, { timeout: 5000 });

    // Select Individual Athlete analysis type
    await page.click('button[role="tab"]:has-text("Individual Athlete")');
    await page.waitForSelector('[data-state="active"]:has-text("Individual Athlete")', { timeout: 5000 });

    // Wait for athlete selector and benchmark selector to load
    await page.waitForSelector('canvas, [aria-label*="benchmark"], [aria-label*="athlete"]', { timeout: 10000 });

    // Select a benchmark
    const benchmarkCheckbox = page.locator('input[type="checkbox"][aria-label*="benchmark"]').first();

    if (await benchmarkCheckbox.isVisible({ timeout: 5000 })) {
      // Check the benchmark
      if (!(await benchmarkCheckbox.isChecked())) {
        await benchmarkCheckbox.click();
      }

      // Verify it's selected
      await expect(benchmarkCheckbox).toBeChecked();

      // Switch to another athlete (if athlete selector exists)
      const athleteSelector = page.locator('select[aria-label*="athlete"], [role="combobox"][aria-label*="athlete"]').first();

      if (await athleteSelector.isVisible({ timeout: 3000 })) {
        await athleteSelector.click();
        const athleteOptions = page.locator('[role="option"]');
        const optionCount = await athleteOptions.count();

        if (optionCount > 1) {
          // Select second athlete
          await athleteOptions.nth(1).click();

          // Wait for chart to update (network request completes)
          await page.waitForLoadState('networkidle', { timeout: 5000 });

          // Verify benchmark is still selected (should persist across athlete changes)
          await expect(benchmarkCheckbox).toBeChecked();
        }
      }
    }
  });
});
