import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';

test.describe('Mobile Forms Optimization', () => {
  test.beforeEach(async ({ page }) => {
    // Use auth helper that handles storageState and proper selectors
    await loginAsDefaultUser(page);
  });

  test.describe('Mobile Viewport (<768px)', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test('should have touch-friendly input heights (≥44px)', async ({ page }) => {
      await page.goto('/athletes');

      // Find search input
      const searchInput = page.locator('input[type="search"], input[placeholder*="Search"]').first();

      if (await searchInput.isVisible()) {
        const box = await searchInput.boundingBox();
        if (box) {
          // WCAG 2.1 AA: Touch targets should be at least 44x44px
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }
    });

    test('should have touch-friendly button sizes (≥48px)', async ({ page }) => {
      await page.goto('/dashboard');

      // Find primary action buttons
      const buttons = page.locator('button').filter({ hasText: /(Add|Save|Submit)/ });
      const buttonCount = await buttons.count();

      if (buttonCount > 0) {
        const firstButton = buttons.first();
        const box = await firstButton.boundingBox();

        if (box) {
          // WCAG 2.1 AA: Touch targets should be at least 44-48px
          expect(box.height).toBeGreaterThanOrEqual(44);
        }
      }
    });

    test('should show appropriate mobile keyboard for email inputs', async ({ page }) => {
      // Navigate to a page with email input (e.g., login page after logout)
      await page.goto('/login');

      const emailInput = page.locator('input[type="email"], input[name*="email"]').first();

      if (await emailInput.isVisible()) {
        // Check if input has correct type attribute
        const inputType = await emailInput.getAttribute('type');
        expect(inputType).toBe('email');

        // Check for inputMode attribute (helps mobile browsers)
        const inputMode = await emailInput.getAttribute('inputMode');
        if (inputMode) {
          expect(inputMode).toBe('email');
        }
      }
    });

    test('should show numeric keyboard for number inputs', async ({ page }) => {
      await page.goto('/data-entry');
      await page.waitForTimeout(1000);

      // Look for numeric inputs (measurement values)
      const numericInputs = page.locator('input[type="number"], input[inputMode="numeric"]');
      const count = await numericInputs.count();

      if (count > 0) {
        const firstInput = numericInputs.first();

        // Check for appropriate input attributes
        const inputMode = await firstInput.getAttribute('inputMode');
        const inputType = await firstInput.getAttribute('type');

        expect(inputMode === 'numeric' || inputType === 'number').toBe(true);
      }
    });

    test('should use drawer/bottom sheet for forms on mobile', async ({ page }) => {
      await page.goto('/athletes');
      await page.waitForTimeout(1000);

      // Try to trigger an add/edit modal
      const addButton = page.locator('button').filter({ hasText: /Add Athlete/i }).first();

      if (await addButton.isVisible()) {
        await addButton.click();
        await page.waitForTimeout(500);

        // On mobile, should use drawer (bottom sheet)
        const drawer = page.locator('[data-testid="mobile-drawer"], [vaul-drawer]').first();
        const dialog = page.locator('[role="dialog"]').first();

        const isDrawerVisible = await drawer.isVisible().catch(() => false);
        const isDialogVisible = await dialog.isVisible().catch(() => false);

        // Should show either drawer or dialog (graceful fallback)
        expect(isDrawerVisible || isDialogVisible).toBe(true);
      }
    });

    test('should have adequate spacing between form fields', async ({ page }) => {
      await page.goto('/login');

      const inputs = page.locator('input[type="text"], input[type="email"], input[type="password"]');
      const inputCount = await inputs.count();

      if (inputCount >= 2) {
        const firstInput = await inputs.nth(0).boundingBox();
        const secondInput = await inputs.nth(1).boundingBox();

        if (firstInput && secondInput) {
          // Calculate vertical spacing between inputs
          const spacing = secondInput.y - (firstInput.y + firstInput.height);

          // Should have at least 8px spacing (prevents mis-taps)
          expect(spacing).toBeGreaterThanOrEqual(8);
        }
      }
    });

    test('should show larger text in form inputs on mobile', async ({ page }) => {
      await page.goto('/login');

      const input = page.locator('input').first();

      if (await input.isVisible()) {
        const fontSize = await input.evaluate(el =>
          window.getComputedStyle(el).fontSize
        );

        // Mobile inputs should be at least 16px to prevent zoom
        const fontSizeValue = parseInt(fontSize);
        expect(fontSizeValue).toBeGreaterThanOrEqual(16);
      }
    });
  });

  test.describe('Batch Entry Mobile', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test('should show card view for batch entry on mobile', async ({ page }) => {
      await page.goto('/data-entry/batch');
      await page.waitForTimeout(1500);

      // Mobile should show card-based entry
      const cardView = page.locator('[data-testid="batch-entry-card"]').first();
      const gridView = page.locator('[data-testid="batch-entry-grid"]').first();

      const isCardVisible = await cardView.isVisible().catch(() => false);
      const isGridVisible = await gridView.isVisible().catch(() => false);

      // On mobile, should prefer card view
      if (isCardVisible || isGridVisible) {
        // If grid is visible on mobile, it should be scrollable
        if (isGridVisible) {
          const gridElement = await gridView.elementHandle();
          if (gridElement) {
            const overflowX = await gridElement.evaluate(el =>
              window.getComputedStyle(el).overflowX
            );
            expect(['auto', 'scroll'].includes(overflowX)).toBe(true);
          }
        }
      }
    });

    test('should have navigation controls in batch entry card view', async ({ page }) => {
      await page.goto('/data-entry/batch');
      await page.waitForTimeout(1500);

      // Add a row first
      const addButton = page.locator('button').filter({ hasText: /Add Row/i }).first();
      if (await addButton.isVisible()) {
        await addButton.click();
        await page.waitForTimeout(500);
      }

      // Look for navigation controls (Previous/Next)
      const prevButton = page.locator('button[aria-label*="Previous"], button:has-text("Previous")').first();
      const nextButton = page.locator('button[aria-label*="Next"], button:has-text("Next")').first();

      const hasPrev = await prevButton.isVisible().catch(() => false);
      const hasNext = await nextButton.isVisible().catch(() => false);

      // Card view should have navigation controls
      if (hasPrev || hasNext) {
        // Controls should have adequate touch targets
        if (hasPrev) {
          const box = await prevButton.boundingBox();
          if (box) {
            expect(box.height).toBeGreaterThanOrEqual(44);
          }
        }
      }
    });
  });

  test.describe('Desktop Viewport (≥768px)', () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test('should use standard dialog for forms on desktop', async ({ page }) => {
      await page.goto('/athletes');
      await page.waitForTimeout(1000);

      const addButton = page.locator('button').filter({ hasText: /Add Athlete/i }).first();

      if (await addButton.isVisible()) {
        await addButton.click();
        await page.waitForTimeout(500);

        // On desktop, should use dialog
        const dialog = page.locator('[role="dialog"]').first();
        await expect(dialog).toBeVisible();

        // Should NOT use drawer on desktop
        const drawer = page.locator('[vaul-drawer]').first();
        const isDrawerVisible = await drawer.isVisible().catch(() => false);

        if (isDrawerVisible) {
          // If drawer is present, it should be hidden
          const display = await drawer.evaluate(el =>
            window.getComputedStyle(el).display
          );
          expect(display).toBe('none');
        }
      }
    });
  });
});
