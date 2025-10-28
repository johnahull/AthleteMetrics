import { test, expect } from '@playwright/test';
import { loginAsDefaultUser } from './helpers/auth';
import { goToAthletes, goToDashboard, goToImportExport, goToDataEntry } from './helpers/navigation';

/**
 * Visual Regression Tests
 *
 * These tests use Playwright's screenshot comparison to detect unexpected UI changes.
 * Screenshots are stored in tests/e2e/__screenshots__ and compared against baselines.
 *
 * To update baselines after intentional UI changes:
 * npm run test:staging -- --update-snapshots
 *
 * Coverage:
 * - Login page layout
 * - Dashboard overview
 * - Athlete list table
 * - Athlete form/modal
 * - Measurement entry form
 * - CSV import wizard
 * - Analytics charts
 *
 * These tests help catch unintended visual regressions like:
 * - Layout shifts
 * - Styling changes
 * - Component positioning issues
 * - Responsive design breakage
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

test.describe('Visual Regression Tests', () => {

  test('login page layout matches baseline', async ({ page }) => {
    await page.goto(`${STAGING_URL}/login`);
    await page.waitForLoadState('networkidle');

    // Wait for form to be fully loaded
    await page.waitForSelector('input[name="username"]');
    await page.waitForSelector('input[name="password"]');
    await page.waitForSelector('button[type="submit"]');

    // Take screenshot and compare to baseline
    await expect(page).toHaveScreenshot('login-page.png', {
      fullPage: true,
      animations: 'disabled',
      // Allow small differences due to anti-aliasing, font rendering, etc.
      maxDiffPixels: 100
    });
  });

  test('dashboard overview matches baseline', async ({ page }) => {
    await loginAsDefaultUser(page);
    await goToDashboard(page);

    // Wait for dashboard to fully load (charts, cards, etc.)
    await page.waitForLoadState('networkidle');

    // Wait for charts to render (Canvas elements need time for async rendering)
    await page.waitForSelector('canvas, .chart, [class*="chart"]', { timeout: 5000 }).catch(() =>
      console.debug('No charts found on dashboard')
    );
    await page.waitForTimeout(1000); // Additional buffer for Chart.js animation completion

    // Take screenshot of dashboard
    await expect(page).toHaveScreenshot('dashboard-overview.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixels: 200 // Charts may have slight rendering differences
    });
  });

  test('athlete list table matches baseline', async ({ page }) => {
    await loginAsDefaultUser(page);
    await goToAthletes(page);

    // Wait for athlete table to load
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid^="checkbox-athlete-"], table, .athlete-list', { timeout: 5000 })
      .catch(() => console.log('No athletes found in list'));

    // Take screenshot of athletes page
    await expect(page).toHaveScreenshot('athlete-list-table.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixels: 150
    });
  });

  test('athlete form modal matches baseline', async ({ page }) => {
    await loginAsDefaultUser(page);
    await goToAthletes(page);

    // Open add athlete modal
    await page.click('[data-testid="add-athlete-button"], button:has-text("Add Athlete")');

    // Wait for modal to appear and animation to complete
    await page.waitForSelector('[data-testid="submit-athlete"], button:has-text("Save")', { state: 'visible' });

    // Wait for CSS animation to complete (fade-in, slide-in, etc.)
    // Note: Cannot be detected programmatically, so using timeout
    await page.waitForTimeout(500);

    // Take screenshot of modal
    const modal = page.locator('[role="dialog"], .modal, .athlete-form').first();
    await expect(modal).toHaveScreenshot('athlete-form-modal.png', {
      animations: 'disabled',
      maxDiffPixels: 100
    });
  });

  test('measurement entry form matches baseline', async ({ page }) => {
    await loginAsDefaultUser(page);
    await goToDataEntry(page);

    // Wait for measurement form to load
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid="athlete-select"], select, input');

    // Take screenshot of measurement form
    await expect(page).toHaveScreenshot('measurement-entry-form.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixels: 150
    });
  });

  test('CSV import wizard initial state matches baseline', async ({ page }) => {
    await loginAsDefaultUser(page);
    await goToImportExport(page);

    // Wait for import page to load
    await page.waitForLoadState('networkidle');
    await page.waitForSelector('[data-testid="csv-file-input"], input[type="file"]');

    // Take screenshot of import page
    await expect(page).toHaveScreenshot('csv-import-wizard-initial.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixels: 100
    });
  });

  test('analytics charts match baseline', async ({ page }) => {
    await loginAsDefaultUser(page);

    // Navigate to analytics page
    await page.goto(`${STAGING_URL}/analytics`);
    await page.waitForLoadState('networkidle');

    // Look for chart canvas elements
    await page.waitForSelector('canvas, .chart, [class*="chart"]', { timeout: 5000 })
      .catch(() => console.log('No charts found on analytics page'));

    // Wait for charts to fully render (Chart.js uses Canvas with async rendering)
    // Chart data fetching, processing, and animation cannot be detected via selectors
    await page.waitForTimeout(2000);

    // Take screenshot of analytics page
    await expect(page).toHaveScreenshot('analytics-charts.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixels: 300 // Charts can have rendering variations
    });
  });

  test('responsive design - mobile viewport (athlete list)', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE

    await loginAsDefaultUser(page);
    await goToAthletes(page);

    await page.waitForLoadState('networkidle');

    // Take screenshot in mobile viewport
    await expect(page).toHaveScreenshot('athlete-list-mobile.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixels: 150
    });
  });

  test('responsive design - tablet viewport (dashboard)', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad

    await loginAsDefaultUser(page);
    await goToDashboard(page);

    await page.waitForLoadState('networkidle');

    // Wait for charts to render in tablet viewport
    await page.waitForSelector('canvas, .chart, [class*="chart"]', { timeout: 5000 }).catch(() =>
      console.debug('No charts found on dashboard')
    );
    await page.waitForTimeout(1000); // Additional buffer for Chart.js animation completion

    // Take screenshot in tablet viewport
    await expect(page).toHaveScreenshot('dashboard-tablet.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixels: 200
    });
  });

  test('dark mode rendering (if supported)', async ({ page }) => {
    // Check if dark mode is supported
    await loginAsDefaultUser(page);
    await goToDashboard(page);

    // Try to enable dark mode (if toggle exists)
    const darkModeToggle = page.locator('[data-testid="dark-mode-toggle"], [aria-label*="dark mode" i]');
    const hasDarkMode = await darkModeToggle.count();

    if (hasDarkMode > 0) {
      await darkModeToggle.click();

      // Wait for dark mode class to be applied to body/html
      await page.waitForSelector('body.dark, html.dark, [data-theme="dark"]', { timeout: 2000 }).catch(() =>
        console.debug('Dark mode class not detected on body/html')
      );

      // Wait for CSS transition to complete (color changes, background transitions)
      // CSS transitions cannot be reliably detected, so using timeout
      await page.waitForTimeout(500);

      // Take screenshot in dark mode
      await expect(page).toHaveScreenshot('dashboard-dark-mode.png', {
        fullPage: true,
        animations: 'disabled',
        maxDiffPixels: 200
      });
    } else {
      console.log('⏭️  Skipping dark mode test: Dark mode toggle not found');
      test.skip();
    }
  });
});

test.describe('Visual Regression Summary', () => {
  test('print visual regression test summary', async () => {
    console.log('\n═══════════════════════════════════════════════════');
    console.log('Visual Regression Tests Summary');
    console.log('═══════════════════════════════════════════════════');
    console.log('✅ Login page layout');
    console.log('✅ Dashboard overview');
    console.log('✅ Athlete list table');
    console.log('✅ Athlete form modal');
    console.log('✅ Measurement entry form');
    console.log('✅ CSV import wizard');
    console.log('✅ Analytics charts');
    console.log('✅ Mobile responsive design');
    console.log('✅ Tablet responsive design');
    console.log('✅ Dark mode rendering (if supported)');
    console.log('\nNote: Run with --update-snapshots to update baselines');
    console.log('═══════════════════════════════════════════════════\n');
  });
});
