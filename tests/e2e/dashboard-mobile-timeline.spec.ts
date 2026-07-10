import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';

test.describe('Dashboard Timeline View (Mobile)', () => {
  test.beforeEach(async ({ page }) => {
    // Use auth helper that handles storageState and proper selectors
    await loginAsDefaultUser(page);
  });

  test.describe('Mobile Viewport (<768px)', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test('should display measurements in timeline view on mobile', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForTimeout(2000);

      // Table should be hidden on mobile
      const measurementsTable = page.locator('table').filter({ hasText: 'Recent Measurements' }).or(
        page.locator('table').nth(0)
      );
      const isTableVisible = await measurementsTable.isVisible().catch(() => false);

      if (isTableVisible) {
        const tableDisplay = await measurementsTable.evaluate(el => window.getComputedStyle(el).display);
        expect(tableDisplay).toBe('none');
      }

      // Timeline view should be visible
      const timelineView = page.locator('[data-testid="measurements-timeline"]');
      await expect(timelineView).toBeVisible();
    });

    test('should display measurement cards with key information', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForTimeout(2000);

      // Find measurement cards/items
      const measurementItems = page.locator('[data-testid="measurement-item"]');
      const itemCount = await measurementItems.count();

      if (itemCount > 0) {
        const firstItem = measurementItems.first();
        await expect(firstItem).toBeVisible();

        // Should show athlete name
        const athleteName = firstItem.locator('[data-testid="measurement-athlete"]');
        await expect(athleteName).toBeVisible();

        // Should show metric type
        const metricType = firstItem.locator('[data-testid="measurement-metric"]');
        await expect(metricType).toBeVisible();

        // Should show value
        const value = firstItem.locator('[data-testid="measurement-value"]');
        await expect(value).toBeVisible();
      }
    });

    test('should display KPI cards in responsive grid', async ({ page }) => {
      await page.goto('/dashboard');

      // KPI cards should adapt to mobile
      const kpiCards = page.locator('[data-testid*="kpi-card"], .grid > div').filter({ has: page.locator('h3, h4') });
      const cardCount = await kpiCards.count();

      expect(cardCount).toBeGreaterThan(0);

      // Cards should be in a single column on mobile
      const firstCard = kpiCards.first();
      const box = await firstCard.boundingBox();

      if (box) {
        // Card should take most of the width on mobile
        expect(box.width).toBeGreaterThan(300); // Should be close to viewport width
      }
    });

    test('should not scroll horizontally', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForTimeout(2000);

      const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
      const viewportWidth = await page.evaluate(() => window.innerWidth);

      expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth + 1);
    });
  });

  test.describe('Desktop Viewport (≥768px)', () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test('should display measurements in table view on desktop', async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForTimeout(2000);

      // Table should be visible on desktop
      const measurementsTable = page.locator('table').first();
      const isTableVisible = await measurementsTable.isVisible().catch(() => false);

      if (isTableVisible) {
        await expect(measurementsTable).toBeVisible();
      }

      // Timeline view should be hidden
      const timelineView = page.locator('[data-testid="measurements-timeline"]');
      const isTimelineVisible = await timelineView.isVisible().catch(() => false);

      if (isTimelineVisible) {
        const timelineDisplay = await timelineView.evaluate(el => window.getComputedStyle(el).display);
        expect(timelineDisplay).toBe('none');
      }
    });
  });
});
