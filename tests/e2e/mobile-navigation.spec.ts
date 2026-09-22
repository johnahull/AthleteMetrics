import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';

test.describe('Mobile Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Use auth helper that handles storageState and proper selectors
    await loginAsDefaultUser(page);
  });

  test.describe('Desktop Navigation (≥768px)', () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test('should show sidebar on desktop', async ({ page }) => {
      await page.goto('/dashboard');

      // Sidebar should be visible
      const sidebar = await page.locator('aside, nav[aria-label="Main navigation"], [data-testid="sidebar"]');
      await expect(sidebar).toBeVisible();

      // Bottom navigation should be hidden
      const bottomNav = await page.locator('[data-testid="mobile-bottom-nav"]');
      await expect(bottomNav).not.toBeVisible();
    });

    test('should navigate using sidebar links', async ({ page }) => {
      await page.goto('/dashboard');

      // Click on Athletes link in sidebar
      const athletesLink = page.locator('nav a[href="/athletes"], aside a[href="/athletes"]').first();
      await athletesLink.click();

      await page.waitForURL('/athletes');
      expect(page.url()).toContain('/athletes');
    });
  });

  test.describe('Mobile Navigation (<768px)', () => {
    test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE

    test('should hide sidebar on mobile', async ({ page }) => {
      await page.goto('/dashboard');

      // Sidebar drawer should be closed by default
      // Check if sidebar is hidden or in a drawer
      const sidebar = await page.locator('aside, nav[aria-label="Main navigation"]');
      const isVisible = await sidebar.isVisible();

      if (isVisible) {
        // If sidebar is visible, it should have a class indicating it's a drawer/modal
        const classes = await sidebar.getAttribute('class');
        expect(classes).toMatch(/(drawer|modal|hidden|md:block)/);
      }
    });

    test('should show bottom navigation bar on mobile', async ({ page }) => {
      await page.goto('/dashboard');

      // Bottom nav should be visible on mobile
      const bottomNav = await page.locator('[data-testid="mobile-bottom-nav"]');
      await expect(bottomNav).toBeVisible();

      // Should have navigation items
      const navItems = await bottomNav.locator('a, button').count();
      expect(navItems).toBeGreaterThanOrEqual(4); // At least 4-5 nav items
    });

    test('should navigate using bottom navigation bar', async ({ page }) => {
      await page.goto('/dashboard');

      // Find and click Athletes link in bottom nav
      const athletesLink = page.locator('[data-testid="mobile-bottom-nav"] a[href="/athletes"]');
      await athletesLink.click();

      await page.waitForURL('/athletes');
      expect(page.url()).toContain('/athletes');
    });

    test('should highlight active route in bottom nav', async ({ page }) => {
      await page.goto('/dashboard');

      // Dashboard icon should be highlighted/active
      const dashboardLink = page.locator('[data-testid="mobile-bottom-nav"] a[href="/"], [data-testid="mobile-bottom-nav"] a[href="/dashboard"]').first();
      const classes = await dashboardLink.getAttribute('class');

      // Should have active/selected styling
      expect(classes).toMatch(/(active|text-primary|bg-primary|selected)/);

      // Navigate to athletes
      await page.goto('/athletes');

      // Athletes icon should now be highlighted
      const athletesLink = page.locator('[data-testid="mobile-bottom-nav"] a[href="/athletes"]');
      const athletesClasses = await athletesLink.getAttribute('class');
      expect(athletesClasses).toMatch(/(active|text-primary|bg-primary|selected)/);
    });

    test('should open hamburger menu to access sidebar', async ({ page }) => {
      await page.goto('/dashboard');

      // Find hamburger menu button
      const hamburger = page.locator('button[aria-label*="menu"], button[aria-label*="Menu"], [data-testid="mobile-menu-button"]').first();

      if (await hamburger.isVisible()) {
        await hamburger.click();

        // Wait for drawer to be visible (replaced hard-coded timeout)
        const drawerContent = page.locator('[role="dialog"], [data-testid="mobile-drawer"]');
        await expect(drawerContent).toBeVisible({ timeout: 2000 });

        // Should contain navigation links
        const navLinks = await drawerContent.locator('a').count();
        expect(navLinks).toBeGreaterThan(0);
      }
    });

    test('should have touch-friendly targets (≥48px)', async ({ page }) => {
      await page.goto('/dashboard');

      const bottomNav = page.locator('[data-testid="mobile-bottom-nav"]');
      const navLinks = bottomNav.locator('a, button');

      const count = await navLinks.count();
      expect(count).toBeGreaterThan(0);

      // Check first few nav items for minimum touch target size
      for (let i = 0; i < Math.min(count, 5); i++) {
        const link = navLinks.nth(i);
        const box = await link.boundingBox();

        if (box) {
          // Touch targets should be at least 44-48px (WCAG 2.1 AA)
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }
    });
  });

  test.describe('Tablet Navigation (768px)', () => {
    test.use({ viewport: { width: 768, height: 1024 } }); // iPad

    test('should show sidebar at tablet breakpoint', async ({ page }) => {
      await page.goto('/dashboard');

      // At 768px, sidebar should be visible (≥768px is desktop mode)
      const sidebar = await page.locator('aside, nav[aria-label="Main navigation"]');
      await expect(sidebar).toBeVisible();

      // Bottom nav should be hidden at tablet size
      const bottomNav = await page.locator('[data-testid="mobile-bottom-nav"]');
      await expect(bottomNav).not.toBeVisible();
    });
  });

  test.describe('Quick Add Button', () => {
    test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE

    test('should open measurement modal from bottom nav (+) button', async ({ page }) => {
      await page.goto('/dashboard');

      // Find quick add button in bottom nav (+ icon)
      const quickAddButton = page.locator('[data-testid="mobile-bottom-nav"] button[aria-label*="Add"], [data-testid="mobile-bottom-nav"] button[aria-label*="add"]').first();

      if (await quickAddButton.isVisible()) {
        await quickAddButton.click();

        // Wait for modal to be visible (replaced hard-coded timeout)
        const modal = page.locator('[role="dialog"], [data-testid="measurement-modal"]');
        await expect(modal).toBeVisible({ timeout: 2000 });
      }
    });
  });

  test.describe('No Horizontal Scroll', () => {
    test('should not require horizontal scrolling on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/dashboard');

      // Check if body has horizontal scrollbar
      const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
      const viewportWidth = await page.evaluate(() => window.innerWidth);

      // Body scroll width should not exceed viewport width
      expect(bodyScrollWidth).toBeLessThanOrEqual(viewportWidth + 1); // +1 for rounding

      // Test other pages
      const pagesToTest = ['/athletes', '/teams'];

      for (const pageUrl of pagesToTest) {
        await page.goto(pageUrl);
        await page.waitForLoadState('networkidle');

        const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
        const width = await page.evaluate(() => window.innerWidth);

        expect(scrollWidth).toBeLessThanOrEqual(width + 1);
      }
    });
  });
});
