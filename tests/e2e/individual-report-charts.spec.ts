import { test, expect } from '@playwright/test';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * INDIVIDUAL REPORT CHARTS: End-to-End Tests
 *
 * Verifies the new individual-report visualizations end-to-end:
 *  1. The all-around percentile RADAR section renders when an athlete has >=3
 *     metrics with percentiles ([data-report-chart="radar"], "All-Around
 *     Profile (percentiles)").
 *  2. The TREND section + per-metric trend charts render (these carry the
 *     personal-best / benchmark-crossing markers in-canvas) — reusing the
 *     report-trends harness ([data-testid="trend-section"], [data-chart-metric]).
 *  3. The TIER-PROGRESS chart ([data-report-chart^="tier:"]) renders when a tier
 *     benchmark is present. Tier benchmarks are NOT seeded here, so this is a
 *     best-effort/conditional assertion to avoid flakiness.
 *  4. The public shared snapshot renders the radar + trend charts.
 *
 * Mirrors tests/e2e/report-trends.spec.ts verbatim for setup:
 *  - loginAsDefaultUser + localStorage organizationContext
 *  - inline API data setup: team + athlete + measurements
 *  - public snapshot creation + unauthenticated render
 *
 * A team is created and the athlete is added to it because a measurement's
 * organizationId is derived from the athlete's team — measurements must share the
 * report's organization for percentile/trend computation to include them.
 *
 * Screenshots (per the project UI screenshot convention) are written to
 * screenshots/individual-report-charts-desktop.png and
 * screenshots/individual-report-charts-mobile.png.
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

// >=3 metrics so the radar (which requires >=3 percentiles) renders.
const METRICS: Array<{ code: string; earlier: number; latest: number }> = [
  { code: 'VERTICAL_JUMP', earlier: 24, latest: 28 },
  { code: 'FLY10_TIME', earlier: 1.35, latest: 1.22 },
  { code: 'AGILITY_505', earlier: 2.6, latest: 2.45 },
];

const METRIC_CODES = METRICS.map((m) => m.code);

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * Resolve the organization to operate in.
 * Mirrors report-trends.spec.ts (localStorage organizationContext);
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

test.describe('Individual Report Charts (radar, tier-progress, trends)', () => {
  let orgId: string | null;
  let reportId: string;
  let teamId: string;
  let athleteId: string;
  let athleteFirstName: string;
  let benchmarkId: string | null;
  let createdSnapshotIds: string[] = [];

  // Single-value benchmark seeded for the Benchmark Standing bar. VERTICAL_JUMP is
  // higher-is-better, so operator 'gte' with value 26 (< seeded best of 28) means
  // the athlete "meets" the benchmark — producing a single-value comparison.
  const BENCH_METRIC = 'VERTICAL_JUMP';
  const BENCH_VALUE = 26;

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    createdSnapshotIds = [];
    benchmarkId = null;

    orgId = await resolveOrgId(page);
    expect(orgId, 'an organization is required to create a report').toBeTruthy();

    const suffix = uid();

    // Team in the target org (gives created measurements an organization context)
    const teamRes = await page.request.post(`${STAGING_URL}/api/teams`, {
      data: { name: `ChartTeam_${suffix}`, organizationId: orgId, level: 'Club' },
    });
    teamId = (await teamRes.json()).id;

    // Adult athlete (adult avoids COPPA public-link restriction)
    athleteFirstName = `ChartAthlete_${suffix}`;
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

    // Seed a single-value SITE benchmark and enable it for the org so the
    // Benchmark Standing bar renders. Inline config.benchmarks.userDefined does
    // NOT work for individual reports — getBenchmarkComparisons() sources
    // single-value comparisons from the reportBenchmarks table (nothing writes it
    // via API) OR from site/custom benchmarks that are org-enabled AND selected in
    // config.benchmarks.{site|custom}. We use the site-benchmark path here.

    // Benchmarks must be enabled at the org level before a benchmark can be
    // enabled for the org (benchmarkService.enableBenchmarkForOrg checks this).
    await page.request.patch(`${STAGING_URL}/api/organizations/${orgId}`, {
      data: { benchmarksEnabled: true },
    });

    const benchRes = await page.request.post(`${STAGING_URL}/api/benchmarks`, {
      data: {
        metricCode: BENCH_METRIC,
        name: `BenchStanding_${suffix}`,
        benchmarkValue: BENCH_VALUE,
        comparisonOperator: 'gte', // higher-is-better; 28 >= 26 → meets
      },
    });
    expect(benchRes.ok(), 'site benchmark was created').toBeTruthy();
    benchmarkId = (await benchRes.json()).id;
    expect(benchmarkId, 'benchmark id returned').toBeTruthy();

    const enableRes = await page.request.post(
      `${STAGING_URL}/api/organizations/${orgId}/benchmarks/${benchmarkId}/enable`,
      { data: { benchmarkType: 'site' } }
    );
    expect(enableRes.ok(), 'benchmark was enabled for the org').toBeTruthy();

    // Individual report with "Show progress over time" enabled.
    // The create endpoint returns { reports: [...] } (one report per athlete).
    const createRes = await page.request.post(`${STAGING_URL}/api/reports`, {
      data: {
        name: `Chart Report ${suffix}`,
        reportType: 'individual',
        organizationId: orgId,
        config: {
          athleteId, // backend generate() reads config.athleteId (singular)
          athleteIds: [athleteId],
          timeframe: { type: 'preset', preset: 'all_time' },
          metrics: METRIC_CODES,
          showTrends: true,
          // Select the seeded single-value site benchmark so the Benchmark
          // Standing bar ([data-report-chart^="bench:"]) renders.
          benchmarks: {
            site: [benchmarkId],
          },
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
    try {
      if (benchmarkId) await page.request.delete(`${STAGING_URL}/api/benchmarks/${benchmarkId}`);
    } catch (error) {
      console.warn('Failed to cleanup benchmark:', error);
    }
  });

  test('renders the radar, trend charts (PB markers) and tier-progress on the live report', async ({ page }) => {
    // IndividualReportView auto-generates on mount (no Generate button needed)
    await page.goto(`${STAGING_URL}/reports/${reportId}`);
    await page.waitForLoadState('networkidle');

    // --- Radar (all-around percentile profile) ---
    const radar = page.locator('[data-report-chart="radar"]');
    await expect(radar).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('All-Around Profile (percentiles)')).toBeVisible();

    // --- Trend section + per-metric chart (carries the in-canvas PB markers) ---
    const trendSection = page.getByTestId('trend-section');
    await expect(trendSection).toBeVisible({ timeout: 15000 });
    const trendChart = page.locator('[data-chart-metric]').first();
    await expect(trendChart).toBeVisible({ timeout: 15000 });
    await expect(page.locator(`[data-chart-metric="${METRICS[0].code}"]`)).toBeVisible();

    // --- Tier-progress (best-effort: only present when a tier benchmark exists) ---
    const tierCharts = page.locator('[data-report-chart^="tier:"]');
    if ((await tierCharts.count()) > 0) {
      await expect(tierCharts.first()).toBeVisible();
    }

    // --- Benchmark Standing for the seeded single-value site benchmark ---
    const benchBars = page.locator('[data-report-chart^="bench:"]');
    await expect(benchBars.first()).toBeVisible({ timeout: 15000 });
    expect(await benchBars.count()).toBeGreaterThanOrEqual(1);

    // Screenshot capture (UI screenshot convention) - desktop then mobile
    await page.setViewportSize({ width: 1280, height: 720 });
    await radar.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'screenshots/individual-report-charts-desktop.png', fullPage: true });

    await page.setViewportSize({ width: 375, height: 667 });
    await expect(radar).toBeVisible({ timeout: 15000 });
    await radar.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'screenshots/individual-report-charts-mobile.png', fullPage: true });
  });

  test('renders the radar + trend charts on the public shared link', async ({ page, context }) => {
    // Create a public snapshot via API (freezes the generated chart data)
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

      // Radar renders on the public snapshot
      await expect(incognitoPage.locator('[data-report-chart="radar"]')).toBeVisible({ timeout: 15000 });
      await expect(incognitoPage.getByText('All-Around Profile (percentiles)')).toBeVisible();

      // Trend section + chart render on the public snapshot
      await expect(incognitoPage.getByTestId('trend-section')).toBeVisible({ timeout: 15000 });
      await expect(incognitoPage.locator('[data-chart-metric]').first()).toBeVisible({ timeout: 15000 });
      await expect(
        incognitoPage.locator(`[data-chart-metric="${METRICS[0].code}"]`)
      ).toBeVisible();

      // Regression guard for the stale-snapshot-shape bug: the real performance
      // content (athlete name + summary) must render, not blank placeholders.
      await expect(
        incognitoPage.getByText(athleteFirstName, { exact: false }).first()
      ).toBeVisible({ timeout: 15000 });
      await expect(incognitoPage.getByText('Performance Summary')).toBeVisible();
    } finally {
      await incognitoPage.close();
      await incognitoContext.close();
    }
  });
});
