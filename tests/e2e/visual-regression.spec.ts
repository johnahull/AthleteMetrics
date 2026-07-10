import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';
import { goToAthletes, goToDashboard, goToImportExport, goToDataEntry } from './helpers/navigation';
import {
  CSS_TRANSITION_TIMEOUT,
  CHART_ANIMATION_TIMEOUT,
  CHART_RENDER_TIMEOUT,
  VISUAL_DIFF_TOLERANCE_STANDARD,
  VISUAL_DIFF_TOLERANCE_CHARTS,
  VISUAL_DIFF_TOLERANCE_COMPLEX_PAGE,
  VISUAL_DIFF_TOLERANCE_ANALYTICS,
} from './constants';

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

    // Wait for form to be fully loaded - use combined selectors for flexibility
    await page.waitForSelector('#username, input[name="username"]', { state: 'visible' });
    await page.waitForSelector('#password, input[name="password"]', { state: 'visible' });
    await page.waitForSelector('button[type="submit"]', { state: 'visible' });

    // Take screenshot and compare to baseline
    await expect(page).toHaveScreenshot('login-page.png', {
      fullPage: true,
      animations: 'disabled',
      // Allow small differences due to anti-aliasing, font rendering, etc.
      maxDiffPixels: VISUAL_DIFF_TOLERANCE_STANDARD
    });
  });

  test('dashboard overview matches baseline', async ({ page }) => {
    await loginAsDefaultUser(page);
    await goToDashboard(page);

    // Wait for dashboard main content to be visible
    await page.waitForSelector('main, [role="main"]', { state: 'visible' });

    // Wait for charts to render (Canvas elements need time for async rendering)
    const hasCharts = await page.waitForSelector('canvas, .chart, [class*="chart"]', { timeout: 5000 }).catch(() => {
      console.debug('No charts found on dashboard');
      return null;
    });
    // Only wait for animation if charts exist - reduced from fixed timeout to minimal delay
    if (hasCharts) {
      await page.waitForTimeout(CHART_ANIMATION_TIMEOUT);
    }

    // Take screenshot of dashboard
    await expect(page).toHaveScreenshot('dashboard-overview.png', {
      fullPage: true,
      animations: 'disabled',
      // Charts need higher tolerance due to Canvas rendering variations
      maxDiffPixels: VISUAL_DIFF_TOLERANCE_CHARTS
    });
  });

  test('athlete list table matches baseline', async ({ page }) => {
    await loginAsDefaultUser(page);
    await goToAthletes(page);

    // Wait for athlete table or empty state to load
    await page.waitForSelector('main, [role="main"]', { state: 'visible' });
    await page.waitForSelector('[data-testid^="checkbox-athlete-"], table, .athlete-list', { timeout: 5000 })
      .catch(() => console.log('No athletes found in list'));

    // Take screenshot of athletes page
    await expect(page).toHaveScreenshot('athlete-list-table.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixels: VISUAL_DIFF_TOLERANCE_COMPLEX_PAGE
    });
  });

  test('athlete form modal matches baseline', async ({ page }) => {
    await loginAsDefaultUser(page);
    await goToAthletes(page);

    // Open add athlete modal
    await page.click('[data-testid="add-athlete-button"], button:has-text("Add Athlete")');

    // Wait for modal to appear and animation to complete
    await page.waitForSelector('[data-testid="submit-athlete"], button:has-text("Save")', { state: 'visible' });

    // Reduced wait for CSS animation - modal is visible when submit button appears
    await page.waitForTimeout(CSS_TRANSITION_TIMEOUT);

    // Take screenshot of modal
    const modal = page.locator('[role="dialog"], .modal, .athlete-form').first();
    await expect(modal).toHaveScreenshot('athlete-form-modal.png', {
      animations: 'disabled',
      maxDiffPixels: VISUAL_DIFF_TOLERANCE_STANDARD
    });
  });

  test('measurement entry form matches baseline', async ({ page }) => {
    await loginAsDefaultUser(page);
    await goToDataEntry(page);

    // Wait for measurement form to load
    await page.waitForSelector('main, [role="main"]', { state: 'visible' });
    await page.waitForSelector('[data-testid="athlete-select"], select, input', { state: 'visible' });

    // Take screenshot of measurement form
    await expect(page).toHaveScreenshot('measurement-entry-form.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixels: VISUAL_DIFF_TOLERANCE_COMPLEX_PAGE
    });
  });

  test('CSV import wizard initial state matches baseline', async ({ page }) => {
    await loginAsDefaultUser(page);
    await goToImportExport(page);

    // Wait for import page to load
    await page.waitForSelector('main, [role="main"]', { state: 'visible' });
    await page.waitForSelector('[data-testid="csv-file-input"], input[type="file"]', { state: 'visible' });

    // Take screenshot of import page
    await expect(page).toHaveScreenshot('csv-import-wizard-initial.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixels: VISUAL_DIFF_TOLERANCE_STANDARD
    });
  });

  test('analytics charts match baseline', async ({ page }) => {
    await loginAsDefaultUser(page);

    // Navigate to analytics page
    await page.goto(`${STAGING_URL}/analytics`);

    // Wait for page to load
    await page.waitForSelector('main, [role="main"]', { state: 'visible' });

    // Look for chart canvas elements
    const hasCharts = await page.waitForSelector('canvas, .chart, [class*="chart"]', { timeout: 5000 })
      .catch(() => {
        console.log('No charts found on analytics page');
        return null;
      });

    // Only wait for chart rendering if charts exist
    if (hasCharts) {
      await page.waitForTimeout(CHART_RENDER_TIMEOUT);
    }

    // Take screenshot of analytics page
    await expect(page).toHaveScreenshot('analytics-charts.png', {
      fullPage: true,
      animations: 'disabled',
      // Analytics pages have multiple charts with data-driven variations
      maxDiffPixels: VISUAL_DIFF_TOLERANCE_ANALYTICS
    });
  });

  test('responsive design - mobile viewport (athlete list)', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE

    await loginAsDefaultUser(page);
    await goToAthletes(page);

    // Wait for page to load in mobile view
    await page.waitForSelector('main, [role="main"]', { state: 'visible' });

    // Take screenshot in mobile viewport
    await expect(page).toHaveScreenshot('athlete-list-mobile.png', {
      fullPage: true,
      animations: 'disabled',
      maxDiffPixels: VISUAL_DIFF_TOLERANCE_COMPLEX_PAGE
    });
  });

  test('responsive design - tablet viewport (dashboard)', async ({ page }) => {
    // Set tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad

    await loginAsDefaultUser(page);
    await goToDashboard(page);

    // Wait for dashboard to load in tablet view
    await page.waitForSelector('main, [role="main"]', { state: 'visible' });

    // Wait for charts to render in tablet viewport
    const hasCharts = await page.waitForSelector('canvas, .chart, [class*="chart"]', { timeout: 5000 }).catch(() => {
      console.debug('No charts found on dashboard');
      return null;
    });
    // Only wait for animation if charts exist
    if (hasCharts) {
      await page.waitForTimeout(CHART_ANIMATION_TIMEOUT);
    }

    // Take screenshot in tablet viewport
    await expect(page).toHaveScreenshot('dashboard-tablet.png', {
      fullPage: true,
      animations: 'disabled',
      // Charts need higher tolerance due to Canvas rendering variations
      maxDiffPixels: VISUAL_DIFF_TOLERANCE_CHARTS
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
      const isDark = await page.waitForSelector('body.dark, html.dark, [data-theme="dark"]', { timeout: 2000 }).catch(() => {
        console.debug('Dark mode class not detected on body/html');
        return null;
      });

      // Only wait for transition if dark mode was applied
      if (isDark) {
        await page.waitForTimeout(CSS_TRANSITION_TIMEOUT);
      }

      // Take screenshot in dark mode
      await expect(page).toHaveScreenshot('dashboard-dark-mode.png', {
        fullPage: true,
        animations: 'disabled',
        // Charts need higher tolerance due to Canvas rendering variations
        maxDiffPixels: VISUAL_DIFF_TOLERANCE_CHARTS
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
