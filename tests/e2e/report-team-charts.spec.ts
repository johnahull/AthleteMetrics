import { test, expect } from './fixtures/e2e-base';
import { readFileSync, statSync } from 'fs';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * TEAM REPORT CHARTS: End-to-End Tests
 *
 * Verifies the Stage 2 coach-view team-report charts end-to-end:
 *  1. All 5 team charts (benchmark standing, trends, box+swarm distribution,
 *     leaderboard, tier distribution) render on the live coach report when
 *     `config.charts` selects them all, via their `[data-report-chart]` tags.
 *     (A team radar chart was considered but dropped: a team's average
 *     percentile-within-its-own-roster converges toward ~50% regardless of
 *     how good the team actually is, so it wasn't a meaningful chart.)
 *  2. A chart disappears from the live report when its selection checkbox is
 *     unchecked (config.charts.<key> = false) while the others still render —
 *     proving the toggle actually gates the section (not just always-on).
 *
 * Stage 3 additionally verifies:
 *  3. The public shared-report link for a team report renders the same 5
 *     `[data-report-chart]` sections (public-report.tsx team branch).
 *  4. PDF export for a team report (both the authenticated coach-view export
 *     and the public unauthenticated export) succeeds and produces a PDF
 *     large enough to contain the embedded chart images — mirroring the
 *     size-threshold pattern used in tests/e2e/report-pdf-export.spec.ts's
 *     "should export PDF with charts included" (individual-report-charts.spec.ts
 *     does not itself assert on PDF content, so there is no closer pattern to
 *     mirror for the chart-embedding check specifically).
 *
 * Modeled closely on tests/e2e/report-chart-selection.spec.ts and
 * tests/e2e/individual-report-charts.spec.ts (same harness): reports are
 * created directly via the API (mirroring how those two specs validate
 * chart-selection behavior) rather than by driving the multi-step wizard UI,
 * which is slower and more failure-prone for the same coverage; the wizard's
 * own persistence of `config.charts` for team reports is Stage 1 work,
 * already covered by its own tests.
 *
 * Screenshots (per the project UI screenshot convention) are written to
 * screenshots/team-report-charts-coach-view-desktop.png,
 * screenshots/team-report-charts-coach-view-mobile.png,
 * screenshots/team-report-charts-public-view-desktop.png, and
 * screenshots/team-report-charts-public-view-mobile.png.
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

// 3 metrics for thorough coverage; each gets >=2 measurements on distinct
// dates so team trends have a series.
const METRICS: Array<{ code: string; earlier: number; latest: number }> = [
  { code: 'VERTICAL_JUMP', earlier: 24, latest: 28 },
  { code: 'FLY10_TIME', earlier: 1.35, latest: 1.22 },
  { code: 'AGILITY_505', earlier: 2.6, latest: 2.45 },
];
const METRIC_CODES = METRICS.map((m) => m.code);

// 3 tiers on VERTICAL_JUMP so the tiered benchmark-standing chart AND the
// tier-distribution chart both have data (tierOrder 1 = best, matching the
// codebase-wide convention).
const VJ_TIERS = [
  { tierName: 'JV', tierOrder: 3, minValue: 20, maxValue: 24 },
  { tierName: 'Varsity', tierOrder: 2, minValue: 24, maxValue: 28 },
  { tierName: 'Elite', tierOrder: 1, minValue: 28, maxValue: 32 },
];

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

test.describe('Team Report Charts (coach view)', () => {
  let orgId: string | null;
  let teamId: string;
  let athleteIds: string[] = [];
  let benchmarkIds: string[] = [];
  let createdReportIds: string[] = [];
  let createdSnapshotIds: Array<{ reportId: string; snapshotId: string }> = [];

  /**
   * Create a team report scoped to the seeded team/metrics with an explicit
   * chart selection. The create endpoint returns the report directly (team
   * reports don't hit the per-athlete batch-creation branch).
   */
  async function createTeamReport(
    page: any,
    charts: {
      benchmarkStanding: boolean;
      trends: boolean;
      boxSwarm: boolean;
      leaderboard: boolean;
      tierDistribution: boolean;
    }
  ): Promise<string> {
    const createRes = await page.request.post(`${STAGING_URL}/api/reports`, {
      data: {
        name: `Team ChartSel Report ${uid()}`,
        reportType: 'team',
        organizationId: orgId,
        config: {
          timeframe: { type: 'preset', preset: 'all_time' },
          metrics: METRIC_CODES,
          filters: { teamIds: [teamId] },
          benchmarks: { site: benchmarkIds },
          charts,
        },
      },
    });
    expect(createRes.ok(), 'team report was created').toBeTruthy();
    const created = await createRes.json();
    const reportId = created.id;
    expect(reportId, 'report id returned').toBeTruthy();
    createdReportIds.push(reportId);
    return reportId;
  }

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    athleteIds = [];
    benchmarkIds = [];
    createdReportIds = [];
    createdSnapshotIds = [];

    orgId = await resolveOrgId(page);
    expect(orgId, 'an organization is required to create a report').toBeTruthy();

    const suffix = uid();

    // Team in the target org (gives created measurements an organization context).
    const teamRes = await page.request.post(`${STAGING_URL}/api/teams`, {
      data: { name: `TeamChartsTeam_${suffix}`, organizationId: orgId, level: 'Club' },
    });
    teamId = (await teamRes.json()).id;

    // 3 athletes on the team — enough for a "roster" without exceeding the
    // trends 8-athlete faint-overlay cap, and >=2 for box+swarm/leaderboard.
    const today = new Date();
    const earlier = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000);
    const earlierDate = earlier.toISOString().split('T')[0];
    const todayDate = today.toISOString().split('T')[0];

    for (let i = 0; i < 3; i++) {
      const athleteRes = await page.request.post(`${STAGING_URL}/api/athletes`, {
        data: {
          firstName: `TeamChartAthlete${i}_${suffix}`,
          lastName: 'Charts',
          birthDate: '2000-01-01',
          emails: [],
        },
      });
      const athleteId = (await athleteRes.json()).id;
      athleteIds.push(athleteId);

      await page.request.post(`${STAGING_URL}/api/teams/${teamId}/members`, {
        data: { userId: athleteId },
      });

      // Seed >=2 measurements for each of >=3 metrics on distinct dates so
      // trends (team-average series) have data.
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
    }

    // Benchmarks must be enabled at the org level before any benchmark can be
    // enabled for the org (benchmarkService.enableBenchmarkForOrg checks this).
    await page.request.patch(`${STAGING_URL}/api/organizations/${orgId}`, {
      data: { benchmarksEnabled: true },
    });

    // Tiered benchmark group on VERTICAL_JUMP (site admin only) — drives both
    // the tiered Benchmark Standing chart and the Tier Distribution chart.
    const tierGroupRes = await page.request.post(`${STAGING_URL}/api/site-benchmarks/tier-group`, {
      data: {
        metricCode: 'VERTICAL_JUMP',
        name: `TeamChartsTiers_${suffix}`,
        comparisonOperator: 'range',
        tiers: VJ_TIERS,
      },
    });
    expect(tierGroupRes.ok(), 'tier group was created').toBeTruthy();
    const tierGroup = await tierGroupRes.json();
    benchmarkIds = (tierGroup.benchmarks || []).map((b: { id: string }) => b.id);
    expect(benchmarkIds.length, 'tier group produced one benchmark per tier').toBe(VJ_TIERS.length);

    for (const id of benchmarkIds) {
      const enableRes = await page.request.post(
        `${STAGING_URL}/api/organizations/${orgId}/benchmarks/${id}/enable`,
        { data: { benchmarkType: 'site' } }
      );
      expect(enableRes.ok(), `tier benchmark ${id} enabled for the org`).toBeTruthy();
    }
  });

  test.afterEach(async ({ page }) => {
    for (const { reportId, snapshotId } of createdSnapshotIds) {
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
    for (const athleteId of athleteIds) {
      try {
        await page.request.delete(`${STAGING_URL}/api/athletes/${athleteId}`);
      } catch (error) {
        console.warn(`Failed to cleanup athlete ${athleteId}:`, error);
      }
    }
    try {
      if (teamId) await page.request.delete(`${STAGING_URL}/api/teams/${teamId}`);
    } catch (error) {
      console.warn('Failed to cleanup team:', error);
    }
    try {
      for (const id of benchmarkIds) await page.request.delete(`${STAGING_URL}/api/benchmarks/${id}`);
    } catch (error) {
      console.warn('Failed to cleanup tier benchmarks:', error);
    }
  });

  test('renders all 5 team chart sections on the live coach report', async ({ page }) => {
    const reportId = await createTeamReport(page, {
      benchmarkStanding: true,
      trends: true,
      boxSwarm: true,
      leaderboard: true,
      tierDistribution: true,
    });

    // TeamReportView auto-generates on mount (no Generate button needed).
    await page.goto(`${STAGING_URL}/reports/${reportId}`);
    await page.waitForLoadState('networkidle');

    // --- Benchmark standing (tiered, VERTICAL_JUMP) ---
    await expect(page.locator('[data-report-chart="tier:VERTICAL_JUMP"]')).toBeVisible({ timeout: 15000 });

    // --- Trends (team-average bold line + faint athlete lines) ---
    await expect(page.getByTestId('team-trend-section')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-chart-metric]').first()).toBeVisible({ timeout: 15000 });

    // --- Box + swarm distribution ---
    const boxSwarmCharts = page.locator('[data-report-chart^="boxswarm:"]');
    await expect(boxSwarmCharts.first()).toBeVisible({ timeout: 15000 });
    expect(await boxSwarmCharts.count()).toBeGreaterThanOrEqual(1);

    // --- Leaderboard ---
    const leaderboardCharts = page.locator('[data-report-chart^="leaderboard:"]');
    await expect(leaderboardCharts.first()).toBeVisible({ timeout: 15000 });
    expect(await leaderboardCharts.count()).toBeGreaterThanOrEqual(1);

    // --- Tier distribution ---
    const tierDistribution = page.locator('[data-report-chart="tierDistribution"]');
    await expect(tierDistribution).toBeVisible({ timeout: 15000 });

    // Screenshot capture (UI screenshot convention) - desktop then mobile.
    await page.setViewportSize({ width: 1280, height: 720 });
    await tierDistribution.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'screenshots/team-report-charts-coach-view-desktop.png', fullPage: true });

    await page.setViewportSize({ width: 375, height: 667 });
    await expect(tierDistribution).toBeVisible({ timeout: 15000 });
    await tierDistribution.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'screenshots/team-report-charts-coach-view-mobile.png', fullPage: true });
  });

  test('omits the tier-distribution chart when its selection is false (other charts still render)', async ({ page }) => {
    const reportId = await createTeamReport(page, {
      benchmarkStanding: true,
      trends: true,
      boxSwarm: true,
      leaderboard: true,
      tierDistribution: false,
    });

    await page.goto(`${STAGING_URL}/reports/${reportId}`);
    await page.waitForLoadState('networkidle');

    // Leaderboard is the proof the report generated and other toggles still work.
    await expect(page.locator('[data-report-chart^="leaderboard:"]').first()).toBeVisible({ timeout: 15000 });

    // Tier distribution is gated off — must not be present at all.
    await expect(page.locator('[data-report-chart="tierDistribution"]')).toHaveCount(0);
  });

  test('renders all 5 team chart sections on the public shared-report link', async ({ page, context }) => {
    const reportId = await createTeamReport(page, {
      benchmarkStanding: true,
      trends: true,
      boxSwarm: true,
      leaderboard: true,
      tierDistribution: true,
    });

    // Create a public snapshot via API (freezes the generated chart data),
    // mirroring individual-report-charts.spec.ts's public-link test.
    const snapshotRes = await page.request.post(`${STAGING_URL}/api/reports/${reportId}/snapshots`, {
      data: { expirationDays: 7 },
    });
    expect(snapshotRes.ok(), 'snapshot was created').toBeTruthy();
    const snapshot = await snapshotRes.json();
    createdSnapshotIds.push({ reportId, snapshotId: snapshot.id });

    const publicUrl = `${STAGING_URL}/public/reports/${snapshot.publicToken}`;

    // Open the public link in a fresh, unauthenticated context.
    const incognitoContext = await context.browser()!.newContext();
    const incognitoPage = await incognitoContext.newPage();

    try {
      await incognitoPage.goto(publicUrl);
      await incognitoPage.waitForLoadState('networkidle');

      await expect(incognitoPage.locator('[data-report-chart="tier:VERTICAL_JUMP"]')).toBeVisible({ timeout: 15000 });

      await expect(incognitoPage.getByTestId('team-trend-section')).toBeVisible({ timeout: 15000 });
      await expect(incognitoPage.locator('[data-chart-metric]').first()).toBeVisible({ timeout: 15000 });

      const boxSwarmCharts = incognitoPage.locator('[data-report-chart^="boxswarm:"]');
      await expect(boxSwarmCharts.first()).toBeVisible({ timeout: 15000 });
      expect(await boxSwarmCharts.count()).toBeGreaterThanOrEqual(1);

      const leaderboardCharts = incognitoPage.locator('[data-report-chart^="leaderboard:"]');
      await expect(leaderboardCharts.first()).toBeVisible({ timeout: 15000 });
      expect(await leaderboardCharts.count()).toBeGreaterThanOrEqual(1);

      const tierDistribution = incognitoPage.locator('[data-report-chart="tierDistribution"]');
      await expect(tierDistribution).toBeVisible({ timeout: 15000 });

      // Screenshot capture (UI screenshot convention) - desktop then mobile.
      await incognitoPage.setViewportSize({ width: 1280, height: 720 });
      await tierDistribution.scrollIntoViewIfNeeded();
      await incognitoPage.screenshot({ path: 'screenshots/team-report-charts-public-view-desktop.png', fullPage: true });

      await incognitoPage.setViewportSize({ width: 375, height: 667 });
      await expect(tierDistribution).toBeVisible({ timeout: 15000 });
      await tierDistribution.scrollIntoViewIfNeeded();
      await incognitoPage.screenshot({ path: 'screenshots/team-report-charts-public-view-mobile.png', fullPage: true });
    } finally {
      await incognitoPage.close();
      await incognitoContext.close();
    }
  });

  test('team PDF export (coach view) succeeds and embeds captured chart images', async ({ page }) => {
    // A 5-section team report with 3 metrics produces well over a dozen
    // individual chart images. Capturing all of them client-side (html2canvas)
    // plus server-side jsPDF assembly measured at 60-85s locally in dev mode
    // — give this test generous headroom.
    test.setTimeout(180000);

    const reportId = await createTeamReport(page, {
      benchmarkStanding: true,
      trends: true,
      boxSwarm: true,
      leaderboard: true,
      tierDistribution: true,
    });

    await page.goto(`${STAGING_URL}/reports/${reportId}`);
    await page.waitForLoadState('networkidle');

    // Wait for the charts to actually render before capturing — html2canvas
    // needs live canvases/SVGs in the DOM, not just the section containers.
    await expect(page.locator('[data-report-chart^="leaderboard:"]').first()).toBeVisible({ timeout: 15000 });

    const downloadPromise = page.waitForEvent('download', { timeout: 150000 });
    await page.click('button:has-text("Export PDF")');
    await page.click('text=Visual (Match UI)');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    const path = await download.path();
    expect(path).toBeTruthy();

    const stats = statSync(path!);
    // A team PDF with 5 embedded chart sections is substantially larger than a
    // tables-only PDF (report-pdf-export.spec.ts uses a >5000-byte threshold
    // for a single chart; five chart sections push this well past 10KB).
    expect(stats.size).toBeGreaterThan(10000);
    const buffer = readFileSync(path!);
    expect(buffer.slice(0, 4).toString()).toBe('%PDF');
  });

  test('team PDF export (public link) succeeds and embeds captured chart images', async ({ page, context }) => {
    test.setTimeout(180000);

    const reportId = await createTeamReport(page, {
      benchmarkStanding: true,
      trends: true,
      boxSwarm: true,
      leaderboard: true,
      tierDistribution: true,
    });

    const snapshotRes = await page.request.post(`${STAGING_URL}/api/reports/${reportId}/snapshots`, {
      data: { expirationDays: 7 },
    });
    expect(snapshotRes.ok(), 'snapshot was created').toBeTruthy();
    const snapshot = await snapshotRes.json();
    createdSnapshotIds.push({ reportId, snapshotId: snapshot.id });

    const publicUrl = `${STAGING_URL}/public/reports/${snapshot.publicToken}`;
    const incognitoContext = await context.browser()!.newContext();
    const incognitoPage = await incognitoContext.newPage();

    try {
      await incognitoPage.goto(publicUrl);
      await incognitoPage.waitForLoadState('networkidle');
      await expect(incognitoPage.locator('[data-report-chart^="leaderboard:"]').first()).toBeVisible({ timeout: 15000 });

      const downloadPromise = incognitoPage.waitForEvent('download', { timeout: 150000 });
      await incognitoPage.click('button:has-text("Download PDF")');
      const download = await downloadPromise;

      expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
      const path = await download.path();
      expect(path).toBeTruthy();

      const stats = statSync(path!);
      expect(stats.size).toBeGreaterThan(10000);
      const buffer = readFileSync(path!);
      expect(buffer.slice(0, 4).toString()).toBe('%PDF');
    } finally {
      await incognitoPage.close();
      await incognitoContext.close();
    }
  });
});
