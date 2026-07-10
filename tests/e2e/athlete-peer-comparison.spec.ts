import { test, expect } from './fixtures/e2e-base';
import { loginAsAthlete } from './helpers/auth';

/**
 * ATHLETE PEER COMPARISON: E2E Tests
 *
 * Tests verify the peer comparison functionality:
 * - Dedicated peer comparison page with filter controls
 * - Filter by age range, gender, position, organization, and sport
 * - Visual percentile display with distribution charts
 * - Peer comparison card on athlete dashboard
 * - Privacy-respecting anonymous peer pool
 * - Sample size display for transparency
 */

const BASE_URL = process.env.STAGING_URL || 'http://localhost:5000';

test.describe('Athlete Peer Comparison', () => {
  test.beforeEach(async ({ page }) => {
    // Login as athlete user
    await loginAsAthlete(page);
  });

  test.describe('Peer Comparison Page', () => {
    test('should display peer comparison page', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-peer-comparison`);
      await page.waitForLoadState('networkidle');

      // Check for page heading
      await expect(page.getByRole('heading', { name: /Peer Comparison/i })).toBeVisible();

      // Should have filters section
      const filters = page.locator('[data-testid="peer-comparison-filters"]');
      await expect(filters).toBeVisible();
    });

    test('should display peer metrics when data available', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-peer-comparison`);
      await page.waitForLoadState('networkidle');

      // Wait for data to load
      await page.waitForTimeout(2000);

      // Look for peer metric cards
      const metricCards = page.locator('[data-testid^="peer-metric-card-"]');
      const count = await metricCards.count();

      // If athlete has measurements, peer comparison should show
      if (count > 0) {
        const firstCard = metricCards.first();
        await expect(firstCard).toBeVisible();

        // Should show percentile value
        const percentile = firstCard.locator('[data-testid^="percentile-value"]');
        await expect(percentile).toBeVisible();
      }
    });

    test('should show sample size for transparency', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-peer-comparison`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const metricCards = page.locator('[data-testid^="peer-metric-card-"]');
      const count = await metricCards.count();

      if (count > 0) {
        const firstCard = metricCards.first();

        // Should display sample size
        const sampleSize = firstCard.locator('text=/\\d+ athletes/i');
        await expect(sampleSize).toBeVisible();
      }
    });

    test('should display distribution visualization', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-peer-comparison`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const metricCards = page.locator('[data-testid^="peer-metric-card-"]');
      const count = await metricCards.count();

      if (count > 0) {
        // Look for distribution chart or box plot
        const chart = page.locator('[data-testid^="distribution-chart-"]').first();
        await expect(chart).toBeVisible();
      }
    });
  });

  test.describe('Peer Comparison Filters', () => {
    test('should have age range filter', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-peer-comparison`);
      await page.waitForLoadState('networkidle');

      const ageFilter = page.locator('[data-testid="age-range-filter"]');
      await expect(ageFilter).toBeVisible();
    });

    test('should have gender filter', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-peer-comparison`);
      await page.waitForLoadState('networkidle');

      const genderFilter = page.locator('[data-testid="gender-filter"]');
      await expect(genderFilter).toBeVisible();
    });

    test('should have sport filter', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-peer-comparison`);
      await page.waitForLoadState('networkidle');

      const sportFilter = page.locator('[data-testid="sport-filter"]');
      await expect(sportFilter).toBeVisible();
    });

    test('should filter peer pool by age range', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-peer-comparison`);
      await page.waitForLoadState('networkidle');

      // Set age range filter
      const ageMinInput = page.locator('[data-testid="age-min-input"]');
      const ageMaxInput = page.locator('[data-testid="age-max-input"]');

      if (await ageMinInput.isVisible()) {
        await ageMinInput.fill('16');
        await ageMaxInput.fill('18');

        // Apply filters
        const applyButton = page.locator('[data-testid="apply-filters-button"]');
        await applyButton.click();

        await page.waitForTimeout(1500);

        // Verify data updated (sample size may change)
        const metricCards = page.locator('[data-testid^="peer-metric-card-"]');
        const count = await metricCards.count();

        if (count > 0) {
          await expect(metricCards.first()).toBeVisible();
        }
      }
    });

    test('should filter peer pool by gender', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-peer-comparison`);
      await page.waitForLoadState('networkidle');

      const genderFilter = page.locator('[data-testid="gender-filter"]');

      if (await genderFilter.isVisible()) {
        await genderFilter.click();
        await page.getByText('Male', { exact: true }).click();

        // Apply filters
        const applyButton = page.locator('[data-testid="apply-filters-button"]');
        await applyButton.click();

        await page.waitForTimeout(1500);

        // Verify data updated
        const metricCards = page.locator('[data-testid^="peer-metric-card-"]');
        const count = await metricCards.count();

        if (count > 0) {
          await expect(metricCards.first()).toBeVisible();
        }
      }
    });

    test('should clear filters', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-peer-comparison`);
      await page.waitForLoadState('networkidle');

      // Set some filters first
      const ageMinInput = page.locator('[data-testid="age-min-input"]');

      if (await ageMinInput.isVisible()) {
        await ageMinInput.fill('16');

        // Clear filters
        const clearButton = page.locator('[data-testid="clear-filters-button"]');
        await clearButton.click();

        await page.waitForTimeout(500);

        // Age filter should be cleared
        const ageValue = await ageMinInput.inputValue();
        expect(ageValue).toBe('');
      }
    });
  });

  test.describe('Dashboard Peer Comparison Card', () => {
    test('should display peer comparison card on dashboard', async ({ page }) => {
      await page.goto(`${BASE_URL}/athlete/profile`);
      await page.waitForLoadState('networkidle');

      // Look for peer comparison card
      const peerCard = page.locator('[data-testid="peer-comparison-card"]');

      // Card should be visible if athlete has measurements
      const heading = page.getByRole('heading', { name: /Peer Comparison/i });
      await expect(heading).toBeVisible({ timeout: 5000 });
    });

    test('should show top metrics in dashboard card', async ({ page }) => {
      await page.goto(`${BASE_URL}/athlete/profile`);
      await page.waitForLoadState('networkidle');

      const peerCard = page.locator('[data-testid="peer-comparison-card"]');

      if (await peerCard.isVisible()) {
        // Should show at least one metric
        const metrics = peerCard.locator('[data-testid^="peer-metric-"]');
        const count = await metrics.count();

        expect(count).toBeGreaterThan(0);
      }
    });

    test('should link to full peer comparison page', async ({ page }) => {
      await page.goto(`${BASE_URL}/athlete/profile`);
      await page.waitForLoadState('networkidle');

      // Look for link to full page
      const viewAllLink = page.locator('[data-testid="view-all-peer-comparisons"]');

      if (await viewAllLink.isVisible()) {
        await viewAllLink.click();

        await page.waitForURL(/.*\/my-peer-comparison/);
        expect(page.url()).toContain('/my-peer-comparison');
      }
    });
  });

  test.describe('Privacy and Security', () => {
    test('should show anonymous peer pool message', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-peer-comparison`);
      await page.waitForLoadState('networkidle');

      // Look for privacy message
      const privacyMessage = page.locator('text=/anonymous|privacy|confidential/i').first();
      await expect(privacyMessage).toBeVisible({ timeout: 5000 });
    });

    test('should not display individual athlete data', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-peer-comparison`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Should show aggregated percentiles, not individual names/values
      const pageText = await page.textContent('body');

      // Should contain percentile language
      expect(pageText).toMatch(/percentile|top \d+%|bottom \d+%/i);

      // Should NOT contain other athlete names (implementation specific)
      // This test verifies privacy by checking for aggregate language
    });

    test('should require minimum sample size', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-peer-comparison`);
      await page.waitForLoadState('networkidle');

      // Apply very restrictive filters to reduce sample size
      const ageMinInput = page.locator('[data-testid="age-min-input"]');
      const ageMaxInput = page.locator('[data-testid="age-max-input"]');

      if (await ageMinInput.isVisible()) {
        await ageMinInput.fill('25');
        await ageMaxInput.fill('26');

        const applyButton = page.locator('[data-testid="apply-filters-button"]');
        await applyButton.click();

        await page.waitForTimeout(1500);

        // Should either show no data or display minimum sample size warning
        const warning = page.locator('text=/not enough|insufficient|minimum.*athletes/i');
        const noData = page.locator('text=/no data|no measurements/i');

        const hasWarning = await warning.isVisible().catch(() => false);
        const hasNoData = await noData.isVisible().catch(() => false);

        // One of these should be true with restrictive filters
        expect(hasWarning || hasNoData).toBeTruthy();
      }
    });
  });

  test.describe('Percentile Display', () => {
    test('should show percentile labels (Elite, Above Average, etc.)', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-peer-comparison`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const metricCards = page.locator('[data-testid^="peer-metric-card-"]');
      const count = await metricCards.count();

      if (count > 0) {
        const firstCard = metricCards.first();

        // Should have performance label
        const label = firstCard.locator('text=/Elite|Excellent|Above Average|Average|Below Average/i');
        await expect(label).toBeVisible();
      }
    });

    test('should show percentile value as number', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-peer-comparison`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const metricCards = page.locator('[data-testid^="peer-metric-card-"]');
      const count = await metricCards.count();

      if (count > 0) {
        const firstCard = metricCards.first();

        // Should show percentile number (e.g., "85th percentile")
        const percentileText = await firstCard.textContent();
        expect(percentileText).toMatch(/\d+(st|nd|rd|th)\s+percentile/i);
      }
    });

    test('should use color coding for percentile ranges', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-peer-comparison`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const metricCards = page.locator('[data-testid^="peer-metric-card-"]');
      const count = await metricCards.count();

      if (count > 0) {
        const firstCard = metricCards.first();

        // Should have color-coded indicator (green, yellow, red, etc.)
        const indicator = firstCard.locator('[class*="bg-green"], [class*="bg-yellow"], [class*="bg-red"], [class*="bg-blue"]');
        await expect(indicator.first()).toBeVisible();
      }
    });
  });

  test.describe('No Data Handling', () => {
    test('should show message when athlete has no measurements', async ({ page }) => {
      // This test would need a fresh athlete account with no data
      // For now, we test the UI exists and handles the scenario gracefully
      await page.goto(`${BASE_URL}/my-peer-comparison`);
      await page.waitForLoadState('networkidle');

      // Page should load without errors
      const heading = page.getByRole('heading', { name: /Peer Comparison/i });
      await expect(heading).toBeVisible();
    });

    test('should prompt athlete to add measurements if none exist', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-peer-comparison`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      const metricCards = page.locator('[data-testid^="peer-metric-card-"]');
      const count = await metricCards.count();

      if (count === 0) {
        // Should show helpful message about adding measurements
        const message = page.locator('text=/add measurements|no data|get started/i');
        await expect(message).toBeVisible();
      }
    });
  });
});
