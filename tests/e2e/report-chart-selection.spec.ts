import { test, expect } from '@playwright/test';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * REPORT CHART SELECTION + DISTRIBUTION: End-to-End Tests
 *
 * Verifies the per-report chart-selection toggles end-to-end, with emphasis on
 * the new peer-distribution section:
 *  1. With config.charts = { radar, benchmarkStanding, trends, distribution } all
 *     true, the live report renders the radar ([data-report-chart="radar"]), the
 *     trend section ([data-testid="trend-section"]), the distribution card
 *     ([data-report-chart="distribution"]) and at least one per-metric
 *     distribution chart ([data-report-chart^="dist:"]).
 *  2. A second report with charts.distribution = false (others true) renders the
 *     trend section but NOT the distribution card — proving the toggle gates the
 *     section.
 *  3. The public shared snapshot of the first report renders the distribution
 *     card unauthenticated.
 *
 * Modeled closely on tests/e2e/individual-report-charts.spec.ts (same harness):
 *  - loginAsDefaultUser + localStorage organizationContext resolution
 *  - inline API data setup: team + athlete + measurements
 *  - public snapshot creation + unauthenticated render
 *
 * A team is created and athletes are added to it because a measurement's
 * organizationId is derived from the athlete's team — the report athlete AND the
 * peers must share the report's organization for the peer distribution to find
 * them. Peers are seeded with a VERTICAL_JUMP measurement each so that metric has
 * >= 2 athletes and computeDistribution renders a box + dots.
 *
 * Screenshots (per the project UI screenshot convention) are written to
 * screenshots/report-chart-selection-desktop.png and
 * screenshots/report-chart-selection-mobile.png.
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

// >=3 metrics so the radar (which requires >=3 percentiles) renders; each gets
// >=2 measurements on distinct dates so trends have a series.
const METRICS: Array<{ code: string; earlier: number; latest: number }> = [
  { code: 'VERTICAL_JUMP', earlier: 24, latest: 28 },
  { code: 'FLY10_TIME', earlier: 1.35, latest: 1.22 },
  { code: 'AGILITY_505', earlier: 2.6, latest: 2.45 },
];

const METRIC_CODES = METRICS.map((m) => m.code);

// >=2 peers, each with a VERTICAL_JUMP measurement, so the distribution for that
// metric has >= 2 peers (plus the report athlete) and renders a box + dots.
const PEER_VERTICALS = [21, 31];

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * Resolve the organization to operate in.
 * Mirrors individual-report-charts.spec.ts (localStorage organizationContext);
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

test.describe('Report Chart Selection + Distribution (live + public)', () => {
  let orgId: string | null;
  let teamId: string;
  let athleteId: string;
  let athleteFirstName: string;
  let peerIds: string[] = [];
  let createdReportIds: string[] = [];
  let createdSnapshots: Array<{ reportId: string; snapshotId: string }> = [];

  /**
   * Create an individual report with an explicit chart selection. The create
   * endpoint returns { id } or { reports: [...] } (one report per athlete).
   */
  async function createReport(
    page: any,
    charts: { radar: boolean; benchmarkStanding: boolean; trends: boolean; distribution: boolean }
  ): Promise<string> {
    const createRes = await page.request.post(`${STAGING_URL}/api/reports`, {
      data: {
        name: `ChartSel Report ${uid()}`,
        reportType: 'individual',
        organizationId: orgId,
        config: {
          athleteId, // backend generate() reads config.athleteId (singular)
          athleteIds: [athleteId],
          timeframe: { type: 'preset', preset: 'all_time' },
          metrics: METRIC_CODES,
          charts,
        },
      },
    });
    expect(createRes.ok(), 'report was created').toBeTruthy();
    const created = await createRes.json();
    const reportId = created.id || created.reports?.[0]?.id;
    expect(reportId, 'report id returned').toBeTruthy();
    createdReportIds.push(reportId);
    return reportId;
  }

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    peerIds = [];
    createdReportIds = [];
    createdSnapshots = [];

    orgId = await resolveOrgId(page);
    expect(orgId, 'an organization is required to create a report').toBeTruthy();

    const suffix = uid();

    // Team in the target org (gives created measurements an organization context)
    const teamRes = await page.request.post(`${STAGING_URL}/api/teams`, {
      data: { name: `DistTeam_${suffix}`, organizationId: orgId, level: 'Club' },
    });
    teamId = (await teamRes.json()).id;

    // Adult athlete (adult avoids COPPA public-link restriction)
    athleteFirstName = `DistAthlete_${suffix}`;
    const athleteRes = await page.request.post(`${STAGING_URL}/api/athletes`, {
      data: {
        firstName: athleteFirstName,
        lastName: 'Charts',
        birthDate: '2000-01-01',
        emails: [],
      },
    });
    athleteId = (await athleteRes.json()).id;

    await page.request.post(`${STAGING_URL}/api/teams/${teamId}/members`, {
      data: { userId: athleteId },
    });

    // Seed >=2 measurements for each of >=3 metrics on distinct dates so that
    // percentiles (radar) and trends both have data.
    const today = new Date();
    const earlier = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000);
    const earlierDate = earlier.toISOString().split('T')[0];
    const todayDate = today.toISOString().split('T')[0];

    for (const { code, earlier: earlyValue, latest: latestValue } of METRICS) {
      for (const [date, value] of [
        [earlierDate, earlyValue],
        [todayDate, latestValue],
      ] as Array<[string, number]>) {
        await page.request.post(`${STAGING_URL}/api/measurements`, {
          data: { userId: athleteId, metric: code, value, date, teamId },
        });
      }
    }

    // Seed >=2 PEER athletes in the SAME org/team, each with a VERTICAL_JUMP
    // measurement. The peer distribution is "best value per athlete in the org
    // for the metric" — report athlete + these peers gives >= 2 peers so the
    // VERTICAL_JUMP distribution box + dots renders.
    for (const peerVertical of PEER_VERTICALS) {
      const peerRes = await page.request.post(`${STAGING_URL}/api/athletes`, {
        data: {
          firstName: `DistPeer_${uid()}`,
          lastName: 'Charts',
          birthDate: '2000-01-01',
          emails: [],
        },
      });
      const peerId = (await peerRes.json()).id;
      peerIds.push(peerId);

      await page.request.post(`${STAGING_URL}/api/teams/${teamId}/members`, {
        data: { userId: peerId },
      });

      await page.request.post(`${STAGING_URL}/api/measurements`, {
        data: { userId: peerId, metric: 'VERTICAL_JUMP', value: peerVertical, date: todayDate, teamId },
      });
    }
  });

  test.afterEach(async ({ page }) => {
    for (const { reportId, snapshotId } of createdSnapshots) {
      try {
        await page.request.delete(`${STAGING_URL}/api/reports/${reportId}/snapshots/${snapshotId}`);
      } catch (error) {
        console.warn(`Failed to cleanup snapshot ${snapshotId}:`, error);
      }
    }
    for (const reportId of createdReportIds) {
      try {
        await page.request.delete(`${STAGING_URL}/api/reports/${reportId}`);
      } catch (error) {
        console.warn(`Failed to cleanup report ${reportId}:`, error);
      }
    }
    for (const peerId of peerIds) {
      try {
        await page.request.delete(`${STAGING_URL}/api/athletes/${peerId}`);
      } catch (error) {
        console.warn(`Failed to cleanup peer ${peerId}:`, error);
      }
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

  test('renders the radar, trend section and peer distribution on the live report', async ({ page }) => {
    const reportId = await createReport(page, {
      radar: true,
      benchmarkStanding: true,
      trends: true,
      distribution: true,
    });

    // IndividualReportView auto-generates on mount (no Generate button needed)
    await page.goto(`${STAGING_URL}/reports/${reportId}`);
    await page.waitForLoadState('networkidle');

    // --- Radar (all-around percentile profile) ---
    const radar = page.locator('[data-report-chart="radar"]');
    await expect(radar).toBeVisible({ timeout: 15000 });

    // --- Trend section ---
    const trendSection = page.getByTestId('trend-section');
    await expect(trendSection).toBeVisible({ timeout: 15000 });

    // --- Distribution card + at least one per-metric distribution chart ---
    const distribution = page.locator('[data-report-chart="distribution"]');
    await expect(distribution).toBeVisible({ timeout: 15000 });
    const distMetricCharts = page.locator('[data-report-chart^="dist:"]');
    await expect(distMetricCharts.first()).toBeVisible({ timeout: 15000 });
    expect(await distMetricCharts.count()).toBeGreaterThanOrEqual(1);
    await expect(page.locator('[data-report-chart="dist:VERTICAL_JUMP"]')).toBeVisible();

    // Screenshot capture (UI screenshot convention) - desktop then mobile
    await page.setViewportSize({ width: 1280, height: 720 });
    await distribution.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'screenshots/report-chart-selection-desktop.png', fullPage: true });

    await page.setViewportSize({ width: 375, height: 667 });
    await expect(distribution).toBeVisible({ timeout: 15000 });
    await distribution.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'screenshots/report-chart-selection-mobile.png', fullPage: true });
  });

  test('omits the distribution card when charts.distribution is false (trend section still shows)', async ({ page }) => {
    const reportId = await createReport(page, {
      radar: true,
      benchmarkStanding: true,
      trends: true,
      distribution: false,
    });

    await page.goto(`${STAGING_URL}/reports/${reportId}`);
    await page.waitForLoadState('networkidle');

    // Trend section is the proof that the report generated and the toggle is the
    // only thing gating the distribution section.
    await expect(page.getByTestId('trend-section')).toBeVisible({ timeout: 15000 });

    // Distribution is gated off — the card must not be present at all.
    await expect(page.locator('[data-report-chart="distribution"]')).toHaveCount(0);
    await expect(page.locator('[data-report-chart^="dist:"]')).toHaveCount(0);
  });

  test('renders the peer distribution on the public shared link', async ({ page, context }) => {
    const reportId = await createReport(page, {
      radar: true,
      benchmarkStanding: true,
      trends: true,
      distribution: true,
    });

    // Open the live report once so it generates and the snapshot freezes real data.
    await page.goto(`${STAGING_URL}/reports/${reportId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-report-chart="distribution"]')).toBeVisible({ timeout: 15000 });

    // Create a public snapshot via API (freezes the generated chart data)
    const snapshotRes = await page.request.post(`${STAGING_URL}/api/reports/${reportId}/snapshots`, {
      data: { expirationDays: 7 },
    });
    const snapshot = await snapshotRes.json();
    createdSnapshots.push({ reportId, snapshotId: snapshot.id });

    const publicUrl = `${STAGING_URL}/public/reports/${snapshot.publicToken}`;

    // Open the public link in a fresh, unauthenticated context
    const incognitoContext = await context.browser()!.newContext();
    const incognitoPage = await incognitoContext.newPage();

    try {
      await incognitoPage.goto(publicUrl);
      await incognitoPage.waitForLoadState('networkidle');

      // Distribution card renders on the public snapshot
      await expect(incognitoPage.locator('[data-report-chart="distribution"]')).toBeVisible({ timeout: 15000 });
      await expect(
        incognitoPage.locator('[data-report-chart="dist:VERTICAL_JUMP"]')
      ).toBeVisible({ timeout: 15000 });

      // Regression guard: the real performance content (athlete name) must render.
      await expect(
        incognitoPage.getByText(athleteFirstName, { exact: false }).first()
      ).toBeVisible({ timeout: 15000 });
    } finally {
      await incognitoPage.close();
      await incognitoContext.close();
    }
  });
});
