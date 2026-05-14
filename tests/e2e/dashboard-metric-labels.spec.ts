import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

/**
 * Regression test for the metric-label display bug.
 *
 * Before the fix, the dashboard's "Recent Measurements" table showed raw
 * metric codes ("FLY10_TIME", "VERTICAL_JUMP") instead of human-readable
 * labels ("10-Yard Fly Time", "Vertical Jump"). Same bug appeared in many
 * other surfaces; this spec locks the dashboard scenario specifically because
 * that's where the user originally reported it (org admins, coaches,
 * athletes).
 */

const TESTING_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

// Metric codes that should NEVER appear verbatim in user-facing display.
// If any of these strings shows up in the dashboard DOM, the deprecated
// helper is still being called somewhere.
const METRIC_CODES = [
  'FLY10_TIME',
  'VERTICAL_JUMP',
  'AGILITY_505',
  'AGILITY_5105',
  'T_TEST',
  'DASH_40YD',
  'TOP_SPEED',
  'RSI',
];

test.describe('Dashboard metric label display', () => {
  test('renders metric labels (not codes) in Recent Measurements for org admin', async ({ page }) => {
    await loginAs(page, 'org_admin');
    await page.goto(`${TESTING_URL}/dashboard`);
    await page.waitForLoadState('networkidle');

    // The card is targeted via data-testid so the assertion survives class-name
    // refactors. innerText (not innerHTML) excludes attribute values, so legitimate
    // data-testid="stat-best-fly10_time" strings elsewhere don't trigger us.
    const card = page.getByTestId('recent-measurements-card');
    await expect(card).toBeVisible({ timeout: 10000 });
    const cardText = await card.innerText();

    for (const code of METRIC_CODES) {
      expect(cardText, `metric code "${code}" leaked into Recent Measurements`).not.toContain(code);
    }
  });

  test('renders metric labels (not codes) in Recent Measurements for coach', async ({ page }) => {
    await loginAs(page, 'coach');
    await page.goto(`${TESTING_URL}/dashboard`);
    await page.waitForLoadState('networkidle');

    const card = page.getByTestId('recent-measurements-card');
    await expect(card).toBeVisible({ timeout: 10000 });
    const cardText = await card.innerText();

    for (const code of METRIC_CODES) {
      expect(cardText, `metric code "${code}" leaked into Recent Measurements`).not.toContain(code);
    }
  });
});
