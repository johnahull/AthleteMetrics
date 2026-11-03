import { test, expect } from '@playwright/test';
import { loginAsDefaultUser } from './helpers/auth';

/**
 * REPORT SPRINT RUNS: End-to-End Tests
 *
 * Verifies the "Sprint runs" section of an individual report:
 *  1. With config.charts.sprintRuns = true the live report shows the Sprint runs card with the
 *     athlete's dash run (no range / unit toggles: the report window is fixed).
 *  2. With charts.sprintRuns = false the card is absent.
 *  3. The public shared snapshot shows the card unauthenticated.
 *
 * Dash rows entered through the API have no run id, so they show as one pooled row per day
 * ("mixed attempts"); run grouping with splits is covered by the unit and integration tests.
 *
 * Screenshots go to screenshots/report-sprint-runs-{desktop,mobile}.png.
 */

const STAGING_URL = process.env.STAGING_URL || 'http://localhost:5000';

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

async function resolveOrgId(page: any): Promise<string | null> {
  const lsOrg = await page.evaluate(() => {
    const auth = localStorage.getItem('auth');
    return auth ? JSON.parse(auth).organizationContext || null : null;
  });
  if (lsOrg) return lsOrg;
  // The org POST /api/athletes puts a new athlete in (the user's first membership). The first entry of
  // /api/organizations can be a different org for a site admin, and a report only accepts members of its own org.
  const mine = await page.request.get(`${STAGING_URL}/api/auth/me/organizations`);
  if (mine.ok()) {
    const memberships = await mine.json();
    if (memberships?.[0]?.organizationId) return memberships[0].organizationId;
  }
  const res = await page.request.get(`${STAGING_URL}/api/organizations`);
  if (!res.ok()) return null;
  const body = await res.json();
  const orgs = Array.isArray(body) ? body : body?.organizations;
  return orgs?.[0]?.id || null;
}

test.describe('Report sprint runs (live + public)', () => {
  let orgId: string | null;
  let athleteId: string;
  let athleteFirstName: string;
  let createdReportIds: string[] = [];
  let createdSnapshots: Array<{ reportId: string; snapshotId: string }> = [];
  const runDate = new Date().toISOString().split('T')[0];

  async function createReport(page: any, sprintRuns: boolean): Promise<string> {
    const res = await page.request.post(`${STAGING_URL}/api/reports`, {
      data: {
        name: `SprintRuns Report ${uid()}`,
        reportType: 'individual',
        organizationId: orgId,
        config: {
          athleteId,
          athleteIds: [athleteId],
          timeframe: { type: 'preset', preset: 'all_time' },
          metrics: ['DASH_40YD'],
          charts: { sprintRuns },
        },
      },
    });
    expect(res.ok(), 'report was created').toBeTruthy();
    const created = await res.json();
    const id = created.id || created.reports?.[0]?.id;
    expect(id, 'report id returned').toBeTruthy();
    createdReportIds.push(id);
    return id;
  }

  test.beforeEach(async ({ page }) => {
    await loginAsDefaultUser(page);
    createdReportIds = [];
    createdSnapshots = [];
    orgId = await resolveOrgId(page);
    expect(orgId, 'an organization is required to create a report').toBeTruthy();

    const suffix = uid();
    athleteFirstName = `SprintAthlete_${suffix}`;
    const teamRes = await page.request.post(`${STAGING_URL}/api/teams`, {
      data: { name: `SprintTeam_${suffix}`, organizationId: orgId, level: 'Club' },
    });
    const teamId = (await teamRes.json()).id;

    const athleteRes = await page.request.post(`${STAGING_URL}/api/athletes`, {
      data: { firstName: athleteFirstName, lastName: 'Runs', birthDate: '2000-01-01', emails: [] },
    });
    athleteId = (await athleteRes.json()).id;
    await page.request.post(`${STAGING_URL}/api/teams/${teamId}/members`, { data: { userId: athleteId } });

    // The batch endpoint has its own rate-limit bucket. The single-create one (200 / 15 min) is shared by the whole
    // E2E run and is already used up by the time this spec runs, so it answered 429 here.
    const m = await page.request.post(`${STAGING_URL}/api/measurements/batch`, {
      data: { measurements: [{ userId: athleteId, metric: 'DASH_40YD', value: 5.5, date: runDate, teamId }] },
    });
    expect(m.ok(), `dash measurement was created (HTTP ${m.status()})`).toBeTruthy();
  });

  test.afterEach(async ({ page }) => {
    for (const { reportId, snapshotId } of createdSnapshots) {
      await page.request.delete(`${STAGING_URL}/api/reports/${reportId}/snapshots/${snapshotId}`).catch(() => undefined);
    }
    for (const id of createdReportIds) {
      await page.request.delete(`${STAGING_URL}/api/reports/${id}`).catch(() => undefined);
    }
  });

  test('shows the Sprint runs card on the live report when selected', async ({ page }) => {
    const reportId = await createReport(page, true);
    await page.goto(`${STAGING_URL}/reports/${reportId}`);

    await expect(page.getByRole('heading', { name: 'Sprint runs' })).toBeVisible({ timeout: 30000 });
    await expect(page.locator('[data-report-chart^="sprintRuns:YD:summary"]')).toBeVisible();
    await expect(page.locator('[data-report-chart^="sprintRuns:YD:table"]').first()).toBeVisible();
    await expect(page.getByText('mixed attempts')).toBeVisible();
    // The report window is fixed: no range or unit controls
    await expect(page.getByRole('group', { name: 'Time range' })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Distance unit' })).toHaveCount(0);

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.screenshot({ path: 'screenshots/report-sprint-runs-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 375, height: 667 });
    await page.screenshot({ path: 'screenshots/report-sprint-runs-mobile.png', fullPage: true });
  });

  test('omits the card when the chart is off', async ({ page }) => {
    const reportId = await createReport(page, false);
    await page.goto(`${STAGING_URL}/reports/${reportId}`);

    // The report has loaded once the athlete's name shows
    await expect(page.getByText(athleteFirstName).first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('heading', { name: 'Sprint runs' })).toHaveCount(0);
  });

  test('shows the card on the public snapshot without logging in', async ({ page, browser }) => {
    const reportId = await createReport(page, true);
    // Open the live report once so it generates and the snapshot freezes real data
    await page.goto(`${STAGING_URL}/reports/${reportId}`);
    await expect(page.getByRole('heading', { name: 'Sprint runs' })).toBeVisible({ timeout: 30000 });
    const snap = await page.request.post(`${STAGING_URL}/api/reports/${reportId}/snapshots`, {
      data: { expirationDays: 7 },
    });
    expect(snap.ok(), 'snapshot was created').toBeTruthy();
    const snapshot = await snap.json();
    createdSnapshots.push({ reportId, snapshotId: snapshot.id });

    const anon = await (await browser.newContext()).newPage();
    await anon.goto(`${STAGING_URL}/public/reports/${snapshot.publicToken}`);
    await expect(anon.getByRole('heading', { name: 'Sprint runs' })).toBeVisible({ timeout: 30000 });
    await anon.context().close();
  });
});
