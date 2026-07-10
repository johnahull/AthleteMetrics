import { test, expect, type Page } from './fixtures/e2e-base';
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
 *
 * Test strategy:
 *   - Negative: no METRIC_CODES strings appear anywhere on the user's first
 *     screen. This is the regression we're locking down.
 *   - Positive: either at least one known label, or a recognized "empty"
 *     state (no measurements yet, no organization selected). Without this,
 *     a dashboard that fails to render the recent-measurements card would
 *     satisfy the negative check trivially.
 *
 * The page-level body scan keeps the spec robust to environment variance
 * (test users with or without org membership, with or without seeded
 * measurements) — the bug is "code leaked into user-visible text" and that
 * can be asserted globally regardless of which dashboard state renders.
 */

const TESTING_URL = process.env.TESTING_URL || process.env.STAGING_URL || 'http://localhost:5000';

// Metric codes that should NEVER appear verbatim in user-facing display.
// If any of these strings shows up in the visible text, the deprecated
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
const KNOWN_LABELS = [
  '10-Yard Fly',
  'Vertical Jump',
  '5-0-5 Agility',
  '5-10-5 Agility',
  'T-Test',
  '40-Yard Dash',
  'Top Speed',
  'Reactive Strength',
];

// Empty-state / non-data signals — any of these is acceptable in lieu of a
// real label, because each indicates a page state where no measurement data
// would render and the regression cannot apply.
const EMPTY_STATE_PATTERNS = [
  /No recent measurements/i,
  /No measurements/i,
  /Please select an organization/i,
  /Select an organization/i,
];

async function assertNoMetricCodesLeaked(page: Page, scenario: string) {
  // Wait until the dashboard heading is present so we don't snapshot the
  // body mid-load before any dashboard content has rendered.
  await expect(
    page.getByRole('heading', { name: /Dashboard|My (Measurements|Dashboard|Profile)/i }).first(),
  ).toBeVisible({ timeout: 15000 });

  const bodyText = await page.locator('body').innerText();

  for (const code of METRIC_CODES) {
    expect(
      bodyText,
      `[${scenario}] metric code "${code}" leaked into visible page text`,
    ).not.toContain(code);
  }

  const hasEmptyState = EMPTY_STATE_PATTERNS.some((re) => re.test(bodyText));
  const hasKnownLabel = KNOWN_LABELS.some((label) => bodyText.includes(label));
  expect(
    hasEmptyState || hasKnownLabel,
    `[${scenario}] page neither shows a known metric label nor a recognized empty-state — cannot confirm labels are wired up. Body sample: ${bodyText.slice(0, 200)}`,
  ).toBeTruthy();
}

test.describe('Dashboard metric label display', () => {
  test('org admin: labels render, codes do not leak', async ({ page }) => {
    await loginAs(page, 'org_admin');
    await page.goto(`${TESTING_URL}/dashboard`);
    await page.waitForLoadState('domcontentloaded');
    await assertNoMetricCodesLeaked(page, 'org_admin');
  });

  test('coach: labels render, codes do not leak', async ({ page }) => {
    await loginAs(page, 'coach');
    await page.goto(`${TESTING_URL}/dashboard`);
    await page.waitForLoadState('domcontentloaded');
    await assertNoMetricCodesLeaked(page, 'coach');
  });

  test('athlete: labels render on their own measurements view, codes do not leak', async ({ page }) => {
    // Athletes are redirected away from /dashboard to /athletes/:id by the
    // dashboard component itself, so the assertion runs on the athlete
    // landing page rather than the org dashboard.
    await loginAs(page, 'athlete');
    await page.goto(`${TESTING_URL}/`);
    await page.waitForLoadState('domcontentloaded');
    await assertNoMetricCodesLeaked(page, 'athlete');
  });
});
