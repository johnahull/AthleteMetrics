/**
 * The analytics chart query caps its rows (PAGINATION.ANALYTICS_LIMIT). The cap must never drop the rows that decide
 * the result: "best" and "trends" collapse to each athlete's best value before the cap, so more matching rows than
 * the cap (device imports store every run) still give the true best.
 *
 * The cap is mocked down to 5 so a handful of rows reach it. Runs on the CI DB shape (db:push + default seed):
 * the two metrics are created here when missing and removed afterwards.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../packages/api/constants/pagination', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../packages/api/constants/pagination')>();
  return { PAGINATION: { ...original.PAGINATION, ANALYTICS_LIMIT: 5 } };
});

import { inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { customOrgMetrics, measurements, organizations, siteMetrics, teams, userOrganizations, users, userTeams } from '@shared/schema';
import { filterToBestMeasurements, filterToBestMeasurementsPerDate } from '@shared/analytics-utils';
import type { ChartDataPoint } from '@shared/analytics-types';
import { AnalyticsService } from '../../packages/api/analytics-simple';
import { PAGINATION } from '../../packages/api/constants/pagination';
import { purgeTestRows } from '../helpers/purge-test-rows';

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const LOWER = 'FLY10_TIME';
const HIGHER = 'VERTICAL_JUMP';
// Custom metrics of the test organization (no site_metrics row): the direction comes from custom_org_metrics
const ORG_LOWER = `ORG_LIM_LOW_${suffix}`.toUpperCase();
const ORG_TRACKING = `ORG_LIM_TRK_${suffix}`.toUpperCase();

describe('analytics row limit keeps the best values', () => {
  let orgId: string;
  let otherOrgId: string;
  let teamA: string;
  let teamB: string;
  const athletes: string[] = [];
  const createdMetrics: string[] = [];

  type Row = { athlete: number; metric: string; value: number; date: string; team?: string };
  const add = async (rows: Row[]) => {
    // One insert per row, in order, so the physical order is the listed order
    for (const r of rows) {
      await db.insert(measurements).values({
        userId: athletes[r.athlete],
        submittedBy: athletes[r.athlete],
        organizationId: orgId,
        teamId: r.team ?? teamA,
        date: r.date,
        age: 17,
        metric: r.metric,
        value: r.value.toFixed(2),
        units: r.metric === LOWER ? 's' : 'in',
        isVerified: true,
      } as any);
    }
  };

  const run = (type: 'best' | 'trends', metric: string) =>
    new AnalyticsService().getAnalyticsData({
      analysisType: 'intra_group',
      filters: { organizationId: orgId },
      metrics: { primary: metric, additional: [] },
      timeframe: { type, period: 'all_time' },
    } as any);

  const summary = (data: ChartDataPoint[]) =>
    data
      .map((d) => `${athletes.indexOf(d.athleteId)}|${d.metric}|${d.date.toISOString().slice(0, 10)}|${d.value}`)
      .sort();

  beforeAll(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const inserted = await db
      .insert(siteMetrics)
      .values([
        { code: LOWER, label: LOWER, unit: 's', metricType: 'lower_is_better', displayOrder: 1 },
        { code: HIGHER, label: HIGHER, unit: 'in', metricType: 'higher_is_better', displayOrder: 2 },
      ] as any)
      .onConflictDoNothing()
      .returning({ code: siteMetrics.code });
    createdMetrics.push(...inserted.map((r) => r.code));

    const [org] = await db.insert(organizations).values({ name: `AnalyticsLimit ${suffix}` }).returning();
    orgId = org.id;
    const [other] = await db.insert(organizations).values({ name: `AnalyticsLimit Other ${suffix}` }).returning();
    otherOrgId = other.id;
    const [ta] = await db.insert(teams).values({ organizationId: orgId, name: `AnalyticsLimit A ${suffix}` }).returning();
    const [tb] = await db.insert(teams).values({ organizationId: orgId, name: `AnalyticsLimit B ${suffix}` }).returning();
    await db.insert(customOrgMetrics).values([
      { organizationId: orgId, code: ORG_LOWER, label: 'Org Low', unit: 's', metricType: 'lower_is_better' },
      { organizationId: orgId, code: ORG_TRACKING, label: 'Org Track', unit: 'in', metricType: 'tracking' },
    ] as any);
    teamA = ta.id;
    teamB = tb.id;
    for (const i of [0, 1]) {
      const [u] = await db
        .insert(users)
        .values({
          username: `analyticslimit_${i}_${suffix}`,
          emails: [`analyticslimit_${i}_${suffix}@test.com`],
          firstName: 'Limit',
          lastName: `Athlete${i}`,
          fullName: `Limit Athlete${i}`,
          birthDate: '2009-01-01',
          birthYear: 2009,
        } as any)
        .returning();
      athletes.push(u.id);
      await db.insert(userTeams).values({ userId: u.id, teamId: teamA });
      await db.insert(userOrganizations).values({ userId: u.id, organizationId: orgId, role: 'athlete' });
    }
  });

  beforeEach(async () => {
    await db.delete(measurements).where(inArray(measurements.userId, athletes));
  });

  afterAll(async () => {
    await db.delete(customOrgMetrics).where(inArray(customOrgMetrics.organizationId, [orgId]));
    await purgeTestRows({ userIds: athletes, orgIds: [orgId, otherOrgId] });
    if (createdMetrics.length > 0) await db.delete(siteMetrics).where(inArray(siteMetrics.code, createdMetrics));
  });

  it.each([
    [LOWER, [4.5, 4.3, 3.9, 4.4, 4.6], 3.9, [4.2, 4.1, 3.8, 4.0, 4.3], 3.8],
    [HIGHER, [20, 22, 30, 21, 19], 30, [25, 24, 33, 26, 23], 33],
  ])("'best' over the limit returns each athlete's true best %s", async (metric, runs0, best0, runs1, best1) => {
    // 10 rows > limit 5; each best sits in the middle of its athlete's runs
    await add([
      ...runs0.map((value, i) => ({ athlete: 0, metric, value, date: `2026-0${i + 1}-15` })),
      ...runs1.map((value, i) => ({ athlete: 1, metric, value, date: `2026-0${i + 1}-15` })),
    ]);
    const { data } = await run('best', metric);
    expect(data.map((d) => [athletes.indexOf(d.athleteId), d.value]).sort()).toEqual([[0, best0], [1, best1]]);
  });

  it.each([
    [ORG_LOWER, 3.7],
    // tracking keeps the latest date's value, as filterToBestMeasurements does
    [ORG_TRACKING, 60],
  ])("'best' over the limit reads the organization's custom metric %s", async (metric, deciding) => {
    // 12 rows > limit 5; the deciding row (lowest value, latest date) sits in the middle
    const values = [4.1, 3.9, 4.0, 4.3, 4.2, 4.05, deciding, 4.15, 3.95, 4.25, 4.35, 4.45];
    await add(values.map((value, i) => ({ athlete: 0, metric, value, date: i === 6 ? '2026-01-01' : `2025-${String(i + 1).padStart(2, '0')}-01` })));
    const { data } = await run('best', metric);
    expect(data.map((d) => d.value)).toEqual([deciding]);
  });

  it("'trends' over the limit returns the best value of each date", async () => {
    // 4 dates x 4 runs = 16 rows > limit 5, the day's best in the middle; 4 points fit under the limit
    const days = [4.1, 4.0, 3.95, 3.9];
    await add(
      days.flatMap((best, i) =>
        [best + 0.3, best + 0.1, best, best + 0.2].map((value) => ({ athlete: 0, metric: LOWER, value, date: `2026-0${i + 1}-01` }))
      )
    );
    const { data } = await run('trends', LOWER);
    expect(summary(data)).toEqual(days.map((best, i) => `0|${LOWER}|2026-0${i + 1}-01|${best}`));
  });

  it('when the collapsed rows still exceed the limit, the oldest dates are dropped', async () => {
    await add([1, 6, 3, 2, 5, 4].map((month) => ({ athlete: 0, metric: LOWER, value: 4, date: `2026-0${month}-01` })));
    const { data } = await run('trends', LOWER);
    expect(summary(data)).toEqual([2, 3, 4, 5, 6].map((month) => `0|${LOWER}|2026-0${month}-01|4`));
  });

  it('a dataset under the limit gives the same result as filtering every row in JS', async () => {
    const rows: Row[] = [
      { athlete: 0, metric: LOWER, value: 4.4, date: '2026-03-01' },
      { athlete: 0, metric: LOWER, value: 4.1, date: '2026-03-01' },
      { athlete: 0, metric: LOWER, value: 4.2, date: '2026-04-01' },
      { athlete: 1, metric: LOWER, value: 4.0, date: '2026-04-01' },
    ];
    await add(rows);
    const points = rows.map((r) => ({
      athleteId: athletes[r.athlete], athleteName: '', value: r.value, date: new Date(r.date), metric: r.metric,
    })) as ChartDataPoint[];
    const types = { [LOWER]: 'lower_is_better' as const };

    expect(summary((await run('best', LOWER)).data)).toEqual(summary(filterToBestMeasurements(points, types)));
    expect(summary((await run('trends', LOWER)).data)).toEqual(summary(filterToBestMeasurementsPerDate(points, types)));
  });

  it('a multi-team athlete in two organizations is counted once', async () => {
    await db.insert(userTeams).values({ userId: athletes[0], teamId: teamB });
    await db.insert(userOrganizations).values({ userId: athletes[0], organizationId: otherOrgId, role: 'athlete' });
    try {
      // 6 measurements, each joined twice (two organizations) = 12 joined rows > limit 5; best of each day in the middle
      await add([
        { athlete: 0, metric: HIGHER, value: 20, date: '2026-03-01', team: teamA },
        { athlete: 0, metric: HIGHER, value: 22, date: '2026-03-01', team: teamB },
        { athlete: 0, metric: HIGHER, value: 21, date: '2026-03-01', team: teamA },
        { athlete: 0, metric: HIGHER, value: 25, date: '2026-04-01', team: teamA },
        { athlete: 0, metric: HIGHER, value: 31, date: '2026-04-01', team: teamB },
        { athlete: 0, metric: HIGHER, value: 24, date: '2026-04-01', team: teamA },
      ]);
      const best = await run('best', HIGHER);
      expect(summary(best.data)).toEqual([`0|${HIGHER}|2026-04-01|31`]);
      expect(best.statistics[HIGHER].count).toBe(1);

      const trends = await run('trends', HIGHER);
      expect(summary(trends.data)).toEqual([`0|${HIGHER}|2026-03-01|22`, `0|${HIGHER}|2026-04-01|31`]);
    } finally {
      await db.delete(userOrganizations).where(inArray(userOrganizations.organizationId, [otherOrgId]));
    }
  });

  it('runs with the limit mocked down to 5', () => {
    expect(PAGINATION.ANALYTICS_LIMIT).toBe(5);
  });
});
