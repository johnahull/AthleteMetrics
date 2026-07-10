import { test, expect } from './fixtures/e2e-base';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * REPORT TIME-RANGE TRENDS: End-to-End Tests
 *
 * Verifies the "Show progress over time" trend feature end-to-end:
 *  1. An individual report with showTrends enabled (athlete with >=2 measurements)
 *     renders the trend section ([data-testid="trend-section"]) with at least one
 *     trend chart ([data-chart-metric]).
 *  2. The public shared snapshot of such a report renders the trend charts.
 *
 * Mirrors the existing report E2E setup:
 *  - loginAsDefaultUser + localStorage organizationContext (report-public-sharing.spec.ts)
 *  - inline API data setup: team + athlete + measurements (benchmark-management.spec.ts)
 *
 * A team is created and the athlete is added to it because a measurement's
 * organizationId is derived from the athlete's team — measurements must share the
 * report's organization for the trend computation to include them.
 *
 * Screenshots (per the project UI screenshot convention) are written to
 * screenshots/report-trends-desktop.png and screenshots/report-trends-mobile.png.
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

const TREND_METRIC = 'FLY10_TIME';

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * Resolve the organization to operate in.
 * Mirrors report-public-sharing.spec.ts (localStorage organizationContext);
 * falls back to the first organization for org-less site-admin sessions.
 */
async function resolveOrgId(page: any): Promise<string | null> {
  const lsOrg = await page.evaluate(() => {
    const auth = localStorage.getItem('auth');
    return auth ? JSON.parse(auth).organizationContext || null : null;
  });
  if (lsOrg) return lsOrg;

  const res = await page.request.get(`${STAGING_URL}/api/organizations`);
  if (!res.ok()) return null;
  const body = await res.json();
  const orgs = Array.isArray(body) ? body : body?.organizations;
  return orgs?.[0]?.id || null;
}

test.describe('Report Time-Range Trends', () => {
  let orgId: string | null;
  let reportId: string;
  let teamId: string;
  let athleteId: string;
  let athleteFirstName: string;
  let createdSnapshotIds: string[] = [];

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    createdSnapshotIds = [];

    orgId = await resolveOrgId(page);
    expect(orgId, 'an organization is required to create a report').toBeTruthy();

    const suffix = uid();

    // Team in the target org (gives created measurements an organization context)
    const teamRes = await page.request.post(`${STAGING_URL}/api/teams`, {
      data: { name: `TrendTeam_${suffix}`, organizationId: orgId, level: 'Club' },
    });
    teamId = (await teamRes.json()).id;

    // Adult athlete (adult avoids COPPA public-link restriction)
    athleteFirstName = `TrendAthlete_${suffix}`;
    const athleteRes = await page.request.post(`${STAGING_URL}/api/athletes`, {
      data: {
        firstName: athleteFirstName,
        lastName: 'Trends',
        birthDate: '2000-01-01',
        emails: [],
      },
    });
    athleteId = (await athleteRes.json()).id;

    await page.request.post(`${STAGING_URL}/api/teams/${teamId}/members`, {
      data: { userId: athleteId },
    });

    // Seed >=2 measurements of one metric on distinct dates so a trend exists
    const today = new Date();
    const earlier = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000);
    for (const [date, value] of [
      [earlier.toISOString().split('T')[0], 1.35],
      [today.toISOString().split('T')[0], 1.22],
    ] as Array<[string, number]>) {
      await page.request.post(`${STAGING_URL}/api/measurements`, {
        data: { userId: athleteId, metric: TREND_METRIC, value, date, teamId },
      });
    }

    // Individual report with "Show progress over time" enabled.
    // The create endpoint returns { reports: [...] } (one report per athlete).
    const createRes = await page.request.post(`${STAGING_URL}/api/reports`, {
      data: {
        name: `Trend Report ${suffix}`,
        reportType: 'individual',
        organizationId: orgId,
        config: {
          athleteId, // backend generate() reads config.athleteId (singular)
          athleteIds: [athleteId],
          timeframe: { type: 'preset', preset: 'all_time' },
          metrics: [TREND_METRIC],
          showTrends: true,
        },
      },
    });
    const created = await createRes.json();
    reportId = created.id || created.reports?.[0]?.id;
    expect(reportId, 'report was created').toBeTruthy();
  });

  test.afterEach(async ({ page }) => {
    for (const snapshotId of createdSnapshotIds) {
      try {
        await page.request.delete(`${STAGING_URL}/api/reports/${reportId}/snapshots/${snapshotId}`);
      } catch (error) {
        console.warn(`Failed to cleanup snapshot ${snapshotId}:`, error);
      }
    }
    try {
      if (reportId) await page.request.delete(`${STAGING_URL}/api/reports/${reportId}`);
    } catch (error) {
      console.warn('Failed to cleanup report:', error);
    }
    try {
      if (athleteId) await page.request.delete(`${STAGING_URL}/api/athletes/${athleteId}`);
    } catch (error) {
      console.warn('Failed to cleanup athlete:', error);
    }
    try {
      if (teamId) await page.request.delete(`${STAGING_URL}/api/teams/${teamId}`);
    } catch (error) {
      console.warn('Failed to cleanup team:', error);
    }
  });

  test('renders the trend section and chart on the live individual report', async ({ page }) => {
    // IndividualReportView auto-generates on mount (no Generate button needed)
    await page.goto(`${STAGING_URL}/reports/${reportId}`);
    await page.waitForLoadState('networkidle');

    // Trend section wrapper is present
    const trendSection = page.getByTestId('trend-section');
    await expect(trendSection).toBeVisible({ timeout: 15000 });

    // At least one trend chart wrapper is rendered and visible
    const trendChart = page.locator('[data-chart-metric]').first();
    await expect(trendChart).toBeVisible({ timeout: 15000 });
    await expect(page.locator(`[data-chart-metric="${TREND_METRIC}"]`)).toBeVisible();

    // Screenshot capture (UI screenshot convention) - desktop then mobile
    await page.setViewportSize({ width: 1280, height: 720 });
    await trendChart.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'screenshots/report-trends-desktop.png', fullPage: true });

    await page.setViewportSize({ width: 375, height: 667 });
    await expect(trendSection).toBeVisible({ timeout: 15000 });
    await trendChart.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'screenshots/report-trends-mobile.png', fullPage: true });
  });

  test('renders the trend chart on the public shared link', async ({ page, context }) => {
    // Create a public snapshot via API (freezes the generated trend data)
    const snapshotRes = await page.request.post(`${STAGING_URL}/api/reports/${reportId}/snapshots`, {
      data: { expirationDays: 7 },
    });
    const snapshot = await snapshotRes.json();
    createdSnapshotIds.push(snapshot.id);

    const publicUrl = `${STAGING_URL}/public/reports/${snapshot.publicToken}`;

    // Open the public link in a fresh, unauthenticated context
    const incognitoContext = await context.browser()!.newContext();
    const incognitoPage = await incognitoContext.newPage();

    try {
      await incognitoPage.goto(publicUrl);
      await incognitoPage.waitForLoadState('networkidle');

      await expect(incognitoPage.getByTestId('trend-section')).toBeVisible({ timeout: 15000 });
      await expect(incognitoPage.locator('[data-chart-metric]').first()).toBeVisible({ timeout: 15000 });
      await expect(
        incognitoPage.locator(`[data-chart-metric="${TREND_METRIC}"]`)
      ).toBeVisible();

      // The public report must render the real performance content (regression
      // guard for the stale-snapshot-shape bug): the athlete's name and at least
      // one performance metric row/value must be visible. These rendered blank
      // before the consumer was fixed to read the real produced snapshot shape.
      await expect(
        incognitoPage.getByText(athleteFirstName, { exact: false }).first()
      ).toBeVisible({ timeout: 15000 });
      await expect(incognitoPage.getByText('Performance Summary')).toBeVisible();
      // The seeded FLY10 best value (1.22) is shown via dual format (seconds + mph);
      // assert the seconds value is present in the performance table.
      await expect(incognitoPage.getByText(/1\.22/).first()).toBeVisible();
    } finally {
      await incognitoPage.close();
      await incognitoContext.close();
    }
  });
});
