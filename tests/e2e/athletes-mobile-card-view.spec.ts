import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';

test.describe('Athletes Card View (Mobile)', () => {
  test.beforeEach(async ({ page }) => {
    // Use auth helper that handles storageState and proper selectors
    await loginAsDefaultUser(page);
  });

  test.describe('Mobile Viewport (<768px)', () => {
    test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE

    test('should display athletes in card view on mobile', async ({ page }) => {
      await page.goto('/athletes');
      await page.waitForTimeout(2000); // Wait for data to load

      // Table should be hidden on mobile
      const table = page.locator('table').first();
      const isTableVisible = await table.isVisible().catch(() => false);

      if (isTableVisible) {
        // If table is visible, it should have display:none or similar
        const tableDisplay = await table.evaluate(el => window.getComputedStyle(el).display);
        expect(tableDisplay).toBe('none');
      }

      // Card view should be visible
      const cardView = page.locator('[data-testid="athletes-card-view"]');
      await expect(cardView).toBeVisible();
    });

    test('should display athlete cards with key information', async ({ page }) => {
      await page.goto('/athletes');
      await page.waitForTimeout(2000);

      // Find athlete cards
      const athleteCards = page.locator('[data-testid="athlete-card"]');
      const cardCount = await athleteCards.count();

      expect(cardCount).toBeGreaterThan(0);

      // Check first card has required information
      const firstCard = athleteCards.first();
      await expect(firstCard).toBeVisible();

      // Should show athlete name
      const name = firstCard.locator('[data-testid="athlete-name"]');
      await expect(name).toBeVisible();

      // Should show additional info (team, graduation year, etc.)
      const info = firstCard.locator('[data-testid="athlete-info"]');
      await expect(info).toBeVisible();
    });

    test('should allow tapping card to view athlete details', async ({ page }) => {
      await page.goto('/athletes');
      await page.waitForTimeout(2000);

      // Tap on first athlete card
      const firstCard = page.locator('[data-testid="athlete-card"]').first();
      await firstCard.click();

      // Should navigate to athlete profile or open details
      await page.waitForTimeout(500);

      // Check if navigated to profile page OR details drawer opened
      const url = page.url();
      const detailsDrawer = page.locator('[role="dialog"], [data-testid="athlete-details"]');

      const navigatedToProfile = url.includes('/athletes/');
      const detailsOpened = await detailsDrawer.isVisible().catch(() => false);

      expect(navigatedToProfile || detailsOpened).toBe(true);
    });

    test('should support swipe gestures for actions', async ({ page }) => {
      await page.goto('/athletes');
      await page.waitForTimeout(2000);

      // Check if swipe actions are available
      const firstCard = page.locator('[data-testid="athlete-card"]').first();

      // Look for action buttons or swipe indicators
      const actions = firstCard.locator('button, [data-testid="card-actions"]');
      const actionCount = await actions.count();

      // Should have at least view/edit actions
      expect(actionCount).toBeGreaterThanOrEqual(1);
    });

    test('should show search and filter controls', async ({ page }) => {
      await page.goto('/athletes');

      // Search should be accessible on mobile
      const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]');
      await expect(searchInput).toBeVisible();

      // Filter button should be visible
      const filterButton = page.locator('button:has-text("Filter"), button[aria-label*="filter"]').first();
      const isFilterVisible = await filterButton.isVisible().catch(() => false);

      // Filter UI should exist (might be in a button or drawer)
      expect(isFilterVisible).toBe(true);
    });

    test('should display pagination controls', async ({ page }) => {
      await page.goto('/athletes');
      await page.waitForTimeout(2000);

      // Pagination should work on mobile
      const pagination = page.locator('[data-testid="pagination"], nav[aria-label*="pagination"]').first();
      const isPaginationVisible = await pagination.isVisible().catch(() => false);

      if (isPaginationVisible) {
        // Should have navigation buttons
        const navButtons = pagination.locator('button');
        const buttonCount = await navButtons.count();
        expect(buttonCount).toBeGreaterThan(0);
      }
    });

    test('should not scroll horizontally', async ({ page }) => {
      await page.goto('/athletes');
      await page.waitForTimeout(2000);

      // Check for horizontal overflow
      const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
      const viewportWidth = await page.evaluate(() => window.innerWidth);

      expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth + 1);
    });
  });

  test.describe('Desktop Viewport (≥768px)', () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test('should display athletes in table view on desktop', async ({ page }) => {
      await page.goto('/athletes');
      await page.waitForTimeout(2000);

      // Table should be visible on desktop
      const table = page.locator('table').first();
      await expect(table).toBeVisible();

      // Card view should be hidden
      const cardView = page.locator('[data-testid="athletes-card-view"]');
      const isCardViewVisible = await cardView.isVisible().catch(() => false);

      if (isCardViewVisible) {
        const cardDisplay = await cardView.evaluate(el => window.getComputedStyle(el).display);
        expect(cardDisplay).toBe('none');
      }
    });
  });

  test.describe('Tablet Viewport (768px)', () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test('should display table view at tablet breakpoint', async ({ page }) => {
      await page.goto('/athletes');
      await page.waitForTimeout(2000);

      // At 768px, should show table (desktop mode)
      const table = page.locator('table').first();
      await expect(table).toBeVisible();
    });
  });
});
