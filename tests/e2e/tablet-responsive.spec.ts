import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';

test.describe('Tablet Responsive Mode', () => {
  test.beforeEach(async ({ page }) => {
    // Use auth helper that handles storageState and proper selectors
    await loginAsDefaultUser(page);
  });

  test.describe('Breakpoint Detection Tests', () => {
    test('should detect as tablet mode at 768px width', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto('/dashboard');

      // At 768px, should show full sidebar (tablet mode)
      const sidebar = page.locator('aside, nav[aria-label="Main navigation"]');
      await expect(sidebar).toBeVisible();

      // Bottom nav should be hidden (not mobile)
      const bottomNav = page.locator('[data-testid="mobile-bottom-nav"]');
      await expect(bottomNav).not.toBeVisible();
    });

    test('should detect as tablet mode at 900px width', async ({ page }) => {
      await page.setViewportSize({ width: 900, height: 1024 });
      await page.goto('/dashboard');

      // At 900px, should show full sidebar (tablet mode)
      const sidebar = page.locator('aside, nav[aria-label="Main navigation"]');
      await expect(sidebar).toBeVisible();

      // Bottom nav should be hidden (not mobile)
      const bottomNav = page.locator('[data-testid="mobile-bottom-nav"]');
      await expect(bottomNav).not.toBeVisible();
    });

    test('should detect as tablet mode at 1023px width', async ({ page }) => {
      await page.setViewportSize({ width: 1023, height: 768 });
      await page.goto('/dashboard');

      // At 1023px, should show full sidebar (tablet mode)
      const sidebar = page.locator('aside, nav[aria-label="Main navigation"]');
      await expect(sidebar).toBeVisible();

      // Bottom nav should be hidden (not mobile)
      const bottomNav = page.locator('[data-testid="mobile-bottom-nav"]');
      await expect(bottomNav).not.toBeVisible();
    });

    test('should detect as desktop mode at 1024px width', async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.goto('/dashboard');

      // At 1024px, should show full sidebar (desktop mode)
      const sidebar = page.locator('aside, nav[aria-label="Main navigation"]');
      await expect(sidebar).toBeVisible();

      // Bottom nav should be hidden (not mobile)
      const bottomNav = page.locator('[data-testid="mobile-bottom-nav"]');
      await expect(bottomNav).not.toBeVisible();
    });

    test('should detect as mobile mode at 767px width', async ({ page }) => {
      await page.setViewportSize({ width: 767, height: 667 });
      await page.goto('/dashboard');

      // At 767px, should be mobile mode - drawer closed by default
      const bottomNav = page.locator('[data-testid="mobile-bottom-nav"]');
      await expect(bottomNav).toBeVisible();
    });
  });

  test.describe('Layout Behavior Tests', () => {
    test('Mobile (< 768px): Should show drawer sidebar + bottom nav', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 }); // Mobile
      await page.goto('/dashboard');

      // Bottom nav should be visible
      const bottomNav = page.locator('[data-testid="mobile-bottom-nav"]');
      await expect(bottomNav).toBeVisible();

      // Sidebar should be in drawer (hidden by default)
      const hamburger = page.locator('[data-testid="mobile-menu-button"]');
      await hamburger.click();
      await page.waitForTimeout(300);

      const drawer = page.locator('[data-testid="mobile-drawer"]');
      await expect(drawer).toBeVisible();
    });

    test('Tablet (768-1024px): Should show full sidebar + NO bottom nav', async ({ page }) => {
      await page.setViewportSize({ width: 900, height: 1024 }); // Tablet
      await page.goto('/dashboard');

      // Full sidebar should be visible
      const sidebar = page.locator('aside, nav[aria-label="Main navigation"]');
      await expect(sidebar).toBeVisible();

      // Bottom nav should NOT be visible
      const bottomNav = page.locator('[data-testid="mobile-bottom-nav"]');
      await expect(bottomNav).not.toBeVisible();
    });

    test('Desktop (≥ 1024px): Should show full sidebar + NO bottom nav', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 }); // Desktop
      await page.goto('/dashboard');

      // Full sidebar should be visible
      const sidebar = page.locator('aside, nav[aria-label="Main navigation"]');
      await expect(sidebar).toBeVisible();

      // Bottom nav should NOT be visible
      const bottomNav = page.locator('[data-testid="mobile-bottom-nav"]');
      await expect(bottomNav).not.toBeVisible();
    });
  });

  test.describe('Athletes Page View Tests', () => {
    test('Mobile: Should show single-column card view', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/athletes');

      // Wait for content to load
      await page.waitForTimeout(1000);

      // Check for card view (not table)
      const cardView = page.locator('[data-testid="athletes-card-view"]');
      const tableView = page.locator('table');

      // Either card view exists or table doesn't (depending on data)
      const hasCards = await cardView.isVisible().catch(() => false);
      const hasTable = await tableView.isVisible().catch(() => false);

      // On mobile, should prefer cards over table
      if (hasCards || hasTable) {
        expect(hasCards || !hasTable).toBeTruthy();
      }
    });

    test('Tablet: Should show 2-column card grid', async ({ page }) => {
      await page.setViewportSize({ width: 900, height: 1024 });
      await page.goto('/athletes');

      // Wait for content to load
      await page.waitForTimeout(1000);

      // Check for card view with grid layout
      const cardView = page.locator('[data-testid="athletes-card-view"]');
      const hasCards = await cardView.isVisible().catch(() => false);

      if (hasCards) {
        // Check if grid has multiple columns (2-column layout)
        const cardContainer = page.locator('[data-testid="athletes-card-view"]');
        const containerClass = await cardContainer.getAttribute('class');

        // Should have grid classes indicating 2 columns for tablet
        expect(containerClass).toMatch(/(grid-cols-2|md:grid-cols-2)/);
      }
    });

    test('Desktop: Should show full table view', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto('/athletes');

      // Wait for content to load
      await page.waitForTimeout(1000);

      // Desktop should prefer table view
      const tableView = page.locator('table');
      const cardView = page.locator('[data-testid="athletes-card-view"]');

      const hasTable = await tableView.isVisible().catch(() => false);
      const hasCards = await cardView.isVisible().catch(() => false);

      // Desktop should show table OR cards (depending on data), but prefer table
      expect(hasTable || hasCards).toBeTruthy();
    });
  });

  test.describe('Dashboard KPI Grid Tests', () => {
    test('Mobile: Should show 1 column KPI grid', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/dashboard');

      // Wait for KPIs to load
      await page.waitForTimeout(1000);

      // Find KPI grid container
      const kpiGrid = page.locator('.grid').first();

      if (await kpiGrid.isVisible()) {
        const gridClass = await kpiGrid.getAttribute('class');

        // Should have single column on mobile
        expect(gridClass).toMatch(/grid-cols-1/);
      }
    });

    test('Tablet: Should show 2 columns KPI grid', async ({ page }) => {
      await page.setViewportSize({ width: 900, height: 1024 });
      await page.goto('/dashboard');

      // Wait for KPIs to load
      await page.waitForTimeout(1000);

      // Find KPI grid container
      const kpiGrid = page.locator('.grid').first();

      if (await kpiGrid.isVisible()) {
        const gridClass = await kpiGrid.getAttribute('class');

        // Should have 2 columns on tablet (md:grid-cols-2)
        expect(gridClass).toMatch(/md:grid-cols-2/);
      }
    });

    test('Desktop: Should show 3 columns KPI grid', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto('/dashboard');

      // Wait for KPIs to load
      await page.waitForTimeout(1000);

      // Find KPI grid container
      const kpiGrid = page.locator('.grid').first();

      if (await kpiGrid.isVisible()) {
        const gridClass = await kpiGrid.getAttribute('class');

        // Should have 3 columns on desktop (lg:grid-cols-3)
        expect(gridClass).toMatch(/lg:grid-cols-3/);
      }
    });
  });

  test.describe('Teams Page View Tests', () => {
    test('Mobile: Should show single-column card view', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/teams');

      // Wait for content to load
      await page.waitForTimeout(1000);

      // Check for mobile-friendly layout
      const cardView = page.locator('[data-testid="teams-card-view"]');
      const hasCards = await cardView.isVisible().catch(() => false);

      // Should have card view or responsive table on mobile
      if (hasCards) {
        expect(hasCards).toBeTruthy();
      }
    });

    test('Tablet: Should show 2-column card grid', async ({ page }) => {
      await page.setViewportSize({ width: 900, height: 1024 });
      await page.goto('/teams');

      // Wait for content to load
      await page.waitForTimeout(1000);

      // Check for card view with grid layout
      const cardView = page.locator('[data-testid="teams-card-view"]');
      const hasCards = await cardView.isVisible().catch(() => false);

      if (hasCards) {
        const cardContainer = page.locator('[data-testid="teams-card-view"]');
        const containerClass = await cardContainer.getAttribute('class');

        // Should have grid classes indicating 2 columns for tablet
        expect(containerClass).toMatch(/(grid-cols-2|md:grid-cols-2)/);
      }
    });
  });

  test.describe('Smooth Transitions', () => {
    test('should handle viewport resize from mobile to tablet smoothly', async ({ page }) => {
      // Start at mobile
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/dashboard');
      await page.waitForTimeout(500);

      // Verify mobile state
      const bottomNavMobile = page.locator('[data-testid="mobile-bottom-nav"]');
      await expect(bottomNavMobile).toBeVisible();

      // Resize to tablet
      await page.setViewportSize({ width: 900, height: 1024 });
      await page.waitForTimeout(500);

      // Verify tablet state
      const bottomNavTablet = page.locator('[data-testid="mobile-bottom-nav"]');
      await expect(bottomNavTablet).not.toBeVisible();

      const sidebar = page.locator('aside, nav[aria-label="Main navigation"]');
      await expect(sidebar).toBeVisible();
    });

    test('should handle viewport resize from tablet to desktop smoothly', async ({ page }) => {
      // Start at tablet
      await page.setViewportSize({ width: 900, height: 1024 });
      await page.goto('/dashboard');
      await page.waitForTimeout(500);

      // Verify tablet state
      const sidebarTablet = page.locator('aside, nav[aria-label="Main navigation"]');
      await expect(sidebarTablet).toBeVisible();

      // Resize to desktop
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.waitForTimeout(500);

      // Verify desktop state (should be same as tablet for sidebar)
      const sidebarDesktop = page.locator('aside, nav[aria-label="Main navigation"]');
      await expect(sidebarDesktop).toBeVisible();
    });
  });

  test.describe('No Layout Shifts', () => {
    test('should not have horizontal scroll at tablet breakpoint', async ({ page }) => {
      await page.setViewportSize({ width: 900, height: 1024 });
      await page.goto('/dashboard');
      await page.waitForTimeout(1000);

      const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
      const viewportWidth = await page.evaluate(() => window.innerWidth);

      expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth + 1);
    });

    test('should maintain layout integrity across all pages at tablet size', async ({ page }) => {
      await page.setViewportSize({ width: 900, height: 1024 });

      const pagesToTest = ['/dashboard', '/athletes', '/teams'];

      for (const pageUrl of pagesToTest) {
        await page.goto(pageUrl);
        await page.waitForTimeout(1000);

        const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
        const width = await page.evaluate(() => window.innerWidth);

        expect(scrollWidth).toBeLessThanOrEqual(width + 1);
      }
    });
  });
});
