import { test, expect, Page } from './fixtures/e2e-base';
import { loginAsAthlete } from './helpers/auth';

/**
 * E2E Tests — Athlete Metric Explanations
 *
 * Verifies the always-visible metric explanations added for athletes on
 * /my-dashboard, /my-peer-comparison, and /my-measurements.
 *
 * Scope:
 *  1. On /my-dashboard, metric cards surface a human title (never the raw
 *     code like "FLY10_TIME") and an inline short description.
 *  2. The "What is this?" disclosure expands to render what-it-measures
 *     and why-it-matters panels.
 *  3. On /my-peer-comparison, metric cards use human titles (previously
 *     showed raw codes due to the deprecated getMetricDisplayName bug).
 *  4. On /my-measurements, filtering to a specific metric surfaces the
 *     explanation block; the page does NOT render a bottom-of-page
 *     glossary dump.
 */

const BASE_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

const METRIC_CODES = ['FLY10_TIME', 'VERTICAL_JUMP', 'AGILITY_505', 'AGILITY_5105', 'T_TEST', 'DASH_40YD', 'TOP_SPEED', 'RSI'];

async function hasAnyVisibleMetricCard(page: Page): Promise<boolean> {
  const cards = page.locator('[data-testid="metric-progress-card"]');
  return (await cards.count()) > 0;
}

test.describe('Athlete Metric Explanations — E2E', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAthlete(page);
  });

  test('dashboard metric cards show human title + inline short description', async ({ page }) => {
    await page.goto(`${BASE_URL}/my-dashboard`);
    await page.waitForLoadState('networkidle');

    if (!(await hasAnyVisibleMetricCard(page))) {
      test.skip(true, 'Athlete has no measurements — nothing to render');
      return;
    }

    // No metric card should render a raw metric code as its title. The
    // `getMetricDisplayName` bug would have surfaced codes like "FLY10_TIME"
    // as the label; the fix sources the title from explanation.title instead.
    for (const code of METRIC_CODES) {
      const card = page.locator('[data-testid="metric-progress-card"]', {
        hasText: new RegExp(`^\\s*${code}\\s*$`, 'm'),
      });
      expect(await card.count(), `metric cards should not show raw code ${code}`).toBe(0);
    }

    // At least one short description must be present on the grid.
    const anyShortDescription = page.locator('[data-testid="athlete-metric-short-description"]').first();
    await expect(anyShortDescription).toBeVisible();
  });

  test('"What is this?" disclosure expands to reveal detail panel', async ({ page }) => {
    await page.goto(`${BASE_URL}/my-dashboard`);
    await page.waitForLoadState('networkidle');

    if (!(await hasAnyVisibleMetricCard(page))) {
      test.skip(true, 'Athlete has no measurements — nothing to expand');
      return;
    }

    const trigger = page.locator('[data-testid="athlete-metric-learn-more"]').first();
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    const panel = page.locator('[data-testid="athlete-metric-panel"]').first();
    await expect(panel).toBeVisible();
    await expect(panel).toContainText(/What it measures/i);
    await expect(panel).toContainText(/Why it matters/i);
  });

  test('peer comparison page renders human titles, not raw codes', async ({ page }) => {
    await page.goto(`${BASE_URL}/my-peer-comparison`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const peerCards = page.locator('[data-testid^="peer-metric-card-"]');
    const count = await peerCards.count();
    if (count === 0) {
      test.skip(true, 'Athlete has no peer comparison data');
      return;
    }

    // None of the peer metric cards should show a raw code header. The
    // previous bug was specifically that `getMetricDisplayName` returned
    // the code unchanged, so "FLY10_TIME" appeared as the title.
    for (const code of METRIC_CODES) {
      const rawCodeHeaders = peerCards.getByRole('heading', { name: new RegExp(`^\\s*${code}\\s*$`) });
      expect(await rawCodeHeaders.count(), `peer card must not show raw code ${code}`).toBe(0);
    }
  });

  test('my-measurements shows explanation only when filtered and no bottom glossary', async ({ page }) => {
    await page.goto(`${BASE_URL}/my-measurements`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // The plan explicitly forbids a glossary dump at the bottom of the page;
    // reports have one, athlete pages must not. Guard against regression.
    const glossary = page.locator('[data-testid="report-metrics-glossary"]');
    await expect(glossary).toHaveCount(0);

    // No explanation block should render when the "All metrics" filter is active.
    await expect(page.locator('[data-testid="metric-explanation-header"]')).toHaveCount(0);

    // Try to switch to a single-metric filter; implementation is a shadcn
    // Select identified by aria-label. If the athlete has no data or the
    // select is absent, skip the deeper assertion.
    const select = page.getByRole('combobox', { name: /Filter by metric/i });
    if ((await select.count()) === 0) {
      return;
    }

    await select.click();
    const firstRealOption = page.getByRole('option').filter({ hasNotText: /^all/i }).first();
    if ((await firstRealOption.count()) === 0) {
      return;
    }
    await firstRealOption.click();
    await page.waitForTimeout(500);

    const explanationBlock = page.locator('[data-testid="metric-explanation-header"]');
    await expect(explanationBlock).toBeVisible();
  });
});
