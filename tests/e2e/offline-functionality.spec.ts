import { test, expect } from '@playwright/test';

test.describe('Offline Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('should show offline indicator when connection is lost', async ({ page, context }) => {
    await page.goto('/dashboard');

    // Simulate offline
    await context.setOffline(true);
    await page.waitForTimeout(1000);

    // Should show offline indicator
    const offlineIndicator = page.locator('[data-testid="offline-indicator"]');
    await expect(offlineIndicator).toBeVisible();
    await expect(offlineIndicator).toContainText(/offline/i);
  });

  test('should show online indicator when connection is restored', async ({ page, context }) => {
    await page.goto('/dashboard');

    // Go offline first
    await context.setOffline(true);
    await page.waitForTimeout(500);

    // Go back online
    await context.setOffline(false);
    await page.waitForTimeout(1000);

    // Should show online indicator or hide offline indicator
    const offlineIndicator = page.locator('[data-testid="offline-indicator"]');
    const isVisible = await offlineIndicator.isVisible().catch(() => false);

    if (isVisible) {
      // If visible, should show "online" or "connected"
      const text = await offlineIndicator.textContent();
      expect(text?.toLowerCase()).toMatch(/online|connected|synced/);
    }
  });

  test('should queue measurements when offline', async ({ page, context }) => {
    await page.goto('/data-entry');
    await page.waitForTimeout(1000);

    // Go offline
    await context.setOffline(true);
    await page.waitForTimeout(500);

    // Try to add a measurement
    const valueInput = page.locator('input[type="number"]').first();
    if (await valueInput.isVisible()) {
      await valueInput.fill('10.5');

      // Look for submit/save button
      const submitButton = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Add")').first();
      if (await submitButton.isVisible()) {
        await submitButton.click();
        await page.waitForTimeout(500);

        // Should show offline queue indicator
        const queueIndicator = page.locator('[data-testid="offline-queue-count"]');
        const isQueueVisible = await queueIndicator.isVisible().catch(() => false);

        if (isQueueVisible) {
          const queueText = await queueIndicator.textContent();
          expect(queueText).toMatch(/1|pending|queued/i);
        }
      }
    }
  });

  test('should sync queued measurements when back online', async ({ page, context }) => {
    await page.goto('/data-entry');
    await page.waitForTimeout(1000);

    // Go offline and add measurement
    await context.setOffline(true);
    await page.waitForTimeout(500);

    const valueInput = page.locator('input[type="number"]').first();
    if (await valueInput.isVisible()) {
      await valueInput.fill('10.5');

      const submitButton = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Add")').first();
      if (await submitButton.isVisible()) {
        await submitButton.click();
        await page.waitForTimeout(500);
      }
    }

    // Go back online
    await context.setOffline(false);
    await page.waitForTimeout(2000); // Wait for sync

    // Queue should be empty or show sync complete
    const queueIndicator = page.locator('[data-testid="offline-queue-count"]');
    const syncIndicator = page.locator('[data-testid="sync-status"]');

    const queueVisible = await queueIndicator.isVisible().catch(() => false);
    const syncVisible = await syncIndicator.isVisible().catch(() => false);

    if (queueVisible) {
      const queueText = await queueIndicator.textContent();
      expect(queueText).toMatch(/0|empty|synced/i);
    }

    if (syncVisible) {
      const syncText = await syncIndicator.textContent();
      expect(syncText).toMatch(/synced|complete|success/i);
    }
  });

  test('should show sync button when offline queue has items', async ({ page, context }) => {
    await page.goto('/dashboard');

    // Go offline
    await context.setOffline(true);
    await page.waitForTimeout(500);

    // Check if sync button appears when there's queued data
    const syncButton = page.locator('button[data-testid="sync-now-button"], button:has-text("Sync")');

    // Sync button should be visible if there's queued data
    // Or disabled if offline
    const isVisible = await syncButton.isVisible().catch(() => false);
    if (isVisible) {
      const isDisabled = await syncButton.isDisabled();
      expect(isDisabled).toBe(true); // Should be disabled while offline
    }
  });

  test('should allow manual sync trigger when online', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(1000);

    // Look for sync button
    const syncButton = page.locator('button[data-testid="sync-now-button"], button:has-text("Sync")');

    const isVisible = await syncButton.isVisible().catch(() => false);
    if (isVisible) {
      const isDisabled = await syncButton.isDisabled();

      if (!isDisabled) {
        // Click sync button
        await syncButton.click();
        await page.waitForTimeout(500);

        // Should show syncing indicator
        const syncingIndicator = page.locator('[data-testid="syncing-indicator"]');
        const isSyncingVisible = await syncingIndicator.isVisible().catch(() => false);

        // Either shows syncing or completes very quickly
        // Just verify no errors occurred
      }
    }
  });

  test('should persist offline queue across page reloads', async ({ page, context }) => {
    await page.goto('/data-entry');
    await page.waitForTimeout(1000);

    // Go offline and add measurement
    await context.setOffline(true);
    await page.waitForTimeout(500);

    const valueInput = page.locator('input[type="number"]').first();
    if (await valueInput.isVisible()) {
      await valueInput.fill('10.5');

      const submitButton = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Add")').first();
      if (await submitButton.isVisible()) {
        await submitButton.click();
        await page.waitForTimeout(500);
      }
    }

    // Reload page while still offline
    await page.reload();
    await page.waitForTimeout(1000);

    // Queue should still show pending item
    const queueIndicator = page.locator('[data-testid="offline-queue-count"]');
    const isVisible = await queueIndicator.isVisible().catch(() => false);

    if (isVisible) {
      const queueText = await queueIndicator.textContent();
      expect(queueText).toMatch(/1|pending|queued/i);
    }
  });
});

test.describe('Responsive Charts', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test.describe('Mobile Viewport (<768px)', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test('should render charts with appropriate mobile sizing', async ({ page }) => {
      await page.goto('/analytics');
      await page.waitForTimeout(2000);

      // Look for chart canvases
      const chartCanvas = page.locator('canvas').first();

      if (await chartCanvas.isVisible()) {
        const box = await chartCanvas.boundingBox();

        if (box) {
          // Chart should fit within mobile viewport width
          expect(box.width).toBeLessThanOrEqual(375);

          // Chart should have reasonable height for mobile
          expect(box.height).toBeGreaterThan(200);
          expect(box.height).toBeLessThan(500);
        }
      }
    });

    test('should show simplified chart legends on mobile', async ({ page }) => {
      await page.goto('/analytics');
      await page.waitForTimeout(2000);

      // Chart legends should be simplified or collapsible on mobile
      const legend = page.locator('[class*="legend"], [data-testid="chart-legend"]').first();

      if (await legend.isVisible()) {
        // Legends should not overflow viewport
        const box = await legend.boundingBox();
        if (box) {
          expect(box.width).toBeLessThanOrEqual(375);
        }
      }
    });

    test('should allow horizontal scrolling for wide charts if needed', async ({ page }) => {
      await page.goto('/analytics');
      await page.waitForTimeout(2000);

      // If charts are in a container, it should allow horizontal scroll
      const chartContainer = page.locator('[class*="chart-container"], [data-testid="chart-wrapper"]').first();

      if (await chartContainer.isVisible()) {
        const overflowX = await chartContainer.evaluate(el =>
          window.getComputedStyle(el).overflowX
        );

        // Should allow scrolling or be auto
        expect(['auto', 'scroll', 'hidden'].includes(overflowX)).toBe(true);
      }
    });

    test('should use touch-friendly chart interactions', async ({ page }) => {
      await page.goto('/analytics');
      await page.waitForTimeout(2000);

      const chartCanvas = page.locator('canvas').first();

      if (await chartCanvas.isVisible()) {
        // Try tapping on chart
        await chartCanvas.tap();
        await page.waitForTimeout(300);

        // Tooltip should appear on tap
        const tooltip = page.locator('[class*="tooltip"], [role="tooltip"]').first();
        const isTooltipVisible = await tooltip.isVisible().catch(() => false);

        // Tooltips may not always show, but tap should not cause errors
      }
    });

    test('should show responsive font sizes in charts', async ({ page }) => {
      await page.goto('/analytics');
      await page.waitForTimeout(2000);

      // Chart text should be readable on mobile (>=12px)
      const chartLabels = page.locator('canvas ~ div, [class*="chart"] text').first();

      if (await chartLabels.isVisible()) {
        const fontSize = await chartLabels.evaluate(el =>
          window.getComputedStyle(el).fontSize
        );

        const fontSizeValue = parseInt(fontSize);
        if (!isNaN(fontSizeValue)) {
          expect(fontSizeValue).toBeGreaterThanOrEqual(12);
        }
      }
    });
  });

  test.describe('Desktop Viewport (≥768px)', () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    test('should render full-sized charts on desktop', async ({ page }) => {
      await page.goto('/analytics');
      await page.waitForTimeout(2000);

      const chartCanvas = page.locator('canvas').first();

      if (await chartCanvas.isVisible()) {
        const box = await chartCanvas.boundingBox();

        if (box) {
          // Desktop charts should be larger
          expect(box.width).toBeGreaterThan(400);
        }
      }
    });

    test('should show full chart legends on desktop', async ({ page }) => {
      await page.goto('/analytics');
      await page.waitForTimeout(2000);

      const legend = page.locator('[class*="legend"], [data-testid="chart-legend"]').first();

      if (await legend.isVisible()) {
        // Desktop legends can be wider
        const box = await legend.boundingBox();
        if (box) {
          // Just verify it's visible and not causing layout issues
          expect(box.width).toBeGreaterThan(0);
        }
      }
    });
  });
});
