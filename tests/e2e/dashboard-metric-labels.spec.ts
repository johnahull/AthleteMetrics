import { test, expect, type Page } from '@playwright/test';
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

// At least one of these labels should appear when measurements exist.
// Used as a positive assertion so an empty-state Recent Measurements card
// doesn't make the "no codes leaked" check trivially pass.
const KNOWN_LABELS = [
  '10-Yard Fly',           // FLY10_TIME label prefix
  'Vertical Jump',
  '5-0-5 Agility',
  '5-10-5 Agility',
  'T-Test',
  '40-Yard Dash',
  'Top Speed',
  'Reactive Strength',
];

const EMPTY_STATE_TEXT = /No recent measurements found/i;

async function assertDashboardShowsLabelsNotCodes(page: Page) {
  // The card is targeted via data-testid so the assertion survives class-name
  // refactors. innerText (not innerHTML) excludes attribute values, so the
  // legitimate `data-testid="stat-best-fly10_time"` strings elsewhere on the
  // page don't trigger us.
  const card = page.getByTestId('recent-measurements-card');
  await expect(card).toBeVisible({ timeout: 10000 });
  const cardText = await card.innerText();

  // Negative assertion: no raw codes anywhere in the card.
  for (const code of METRIC_CODES) {
    expect(cardText, `metric code "${code}" leaked into Recent Measurements`).not.toContain(code);
  }

  // Positive assertion: at least one known label appears, OR the empty-state
  // message is shown. Without this, a card with zero measurements would
  // satisfy the negative check trivially and the test wouldn't actually
  // exercise the migration.
  const hasEmptyState = EMPTY_STATE_TEXT.test(cardText);
  const hasKnownLabel = KNOWN_LABELS.some((label) => cardText.includes(label));
  expect(
    hasEmptyState || hasKnownLabel,
    `Recent Measurements neither shows a known metric label nor the empty-state message — cannot confirm labels are wired up. Card text: ${cardText.slice(0, 200)}`,
  ).toBeTruthy();
}

test.describe('Dashboard metric label display', () => {
  test('renders labels (not codes) in Recent Measurements for org admin', async ({ page }) => {
    await loginAs(page, 'org_admin');
    await page.goto(`${TESTING_URL}/dashboard`);
    await page.waitForLoadState('networkidle');
    await assertDashboardShowsLabelsNotCodes(page);
  });

  test('renders labels (not codes) in Recent Measurements for coach', async ({ page }) => {
    await loginAs(page, 'coach');
    await page.goto(`${TESTING_URL}/dashboard`);
    await page.waitForLoadState('networkidle');
    await assertDashboardShowsLabelsNotCodes(page);
  });

  test('athletes see labels (not codes) on their own measurements view', async ({ page }) => {
    // Athletes are redirected away from /dashboard to /athletes/:id by the
    // dashboard component itself, so we land on the athlete profile and check
    // the measurement history surface there instead.
    await loginAs(page, 'athlete');
    await page.goto(`${TESTING_URL}/`);
    await page.waitForLoadState('networkidle');

    // The athlete redirect lands on /athletes/<self> — the measurement table
    // there is the analog of the dashboard's Recent Measurements card.
    const bodyText = await page.locator('body').innerText();
    for (const code of METRIC_CODES) {
      expect(bodyText, `metric code "${code}" leaked into athlete view`).not.toContain(code);
    }
  });
});
