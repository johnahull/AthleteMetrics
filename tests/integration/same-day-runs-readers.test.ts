/**
 * Several runs of one drill on one day (device imports keep every run): readers that take an athlete's "latest"
 * value must take that day's best run, not an arbitrary one, and Sprint F-V must fit one run, never a mix.
 *
 * Runs on the CI DB shape (db:push + default seed): DASH_10YD/20YD/30YD are not seeded there, so they are created
 * here when missing and removed afterwards.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import {
  customBenchmarks,
  measurements,
  organizationBenchmarks,
  organizations,
  siteMetrics,
  sprintFvProfiles,
  teams,
  userOrganizations,
  users,
  userTeams,
} from '@shared/schema';
import { DerivedMetricCalculator } from '../../packages/api/services/derived-metric-calculator';
import { peerComparisonService } from '../../packages/api/services/peer-comparison-service';
import { BenchmarkAnalyticsService } from '../../packages/api/services/benchmark-analytics-service';
import { AnalyticsService } from '../../packages/api/services/analytics-service';
import { SprintFvService } from '../../packages/api/services/sprint-fv-service';
import { purgeTestRows } from '../helpers/purge-test-rows';

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const DATE = '2026-10-20';
const CODES = ['DASH_10YD', 'DASH_20YD', 'DASH_30YD'];
// Derived metrics that copy DASH_30YD, one per source selection the calculator has
const DERIVED_LATEST_BEFORE = `TST_SDR_LB_${suffix}`.toUpperCase();
const DERIVED_LATEST_EVENT = `TST_SDR_LE_${suffix}`.toUpperCase();

describe('readers with several same-day runs', () => {
  let orgId: string;
  let athleteId: string;
  let benchmarkId: string;
  const createdMetrics: string[] = [];

  /** Verified DASH rows; `runId` ties a drill's rows together as a device import does. */
  const add = async (rows: Array<{ metric?: string; value: number; date?: string; runId?: string }>) => {
    // One insert, so every row gets the same created_at, as a device import commit does
    await db.insert(measurements).values(
      rows.map((r) => ({
        userId: athleteId,
        submittedBy: athleteId,
        organizationId: orgId,
        date: r.date ?? DATE,
        age: 17,
        metric: r.metric ?? 'DASH_30YD',
        value: r.value.toFixed(3),
        units: 's',
        isVerified: true,
        calculationMetadata: r.runId ? { runId: r.runId } : null,
      })) as any
    );
  };

  beforeAll(async () => {
    const inserted = await db
      .insert(siteMetrics)
      .values(CODES.map((code, i) => ({ code, label: code, unit: 's', metricType: 'lower_is_better', displayOrder: 930 + i })) as any)
      .onConflictDoNothing()
      .returning({ code: siteMetrics.code });
    createdMetrics.push(...inserted.map((r) => r.code));

    const [org] = await db.insert(organizations).values({ name: `SameDayRuns ${suffix}` }).returning();
    orgId = org.id;
    const [team] = await db.insert(teams).values({ organizationId: orgId, name: `SameDayRuns Team ${suffix}` }).returning();
    const [athlete] = await db
      .insert(users)
      .values({
        username: `samedayruns_${suffix}`,
        emails: [`samedayruns_${suffix}@test.com`],
        firstName: 'Same',
        lastName: 'Day',
        fullName: 'Same Day',
        birthDate: '2009-01-01',
        birthYear: 2009,
      } as any)
      .returning();
    athleteId = athlete.id;
    await db.insert(userTeams).values({ userId: athleteId, teamId: team.id });
    await db.insert(userOrganizations).values({ userId: athleteId, organizationId: orgId, role: 'athlete' });

    for (const [code, config] of [
      [DERIVED_LATEST_BEFORE, { dateMatchStrategy: 'latest_before', missingSourceBehavior: 'skip' }],
      [DERIVED_LATEST_EVENT, { dateMatchStrategy: 'same_date', missingSourceBehavior: 'skip', sourceSelection: 'latest_event' }],
    ] as const) {
      await db.execute(sql`
        INSERT INTO site_metrics (code, label, category, unit, metric_type, is_system_default, is_active, display_order,
          decimal_precision, is_derived, formula, dependent_metrics, calculation_config)
        VALUES (${code}, ${code}, 'Speed', 's', 'lower_is_better', false, true, 940, 3,
          true, 'dash_30yd * 1', ARRAY['DASH_30YD'], ${JSON.stringify(config)}::jsonb)
      `);
      createdMetrics.push(code);
    }

    const [benchmark] = await db
      .insert(customBenchmarks)
      .values({ organizationId: orgId, metricCode: 'DASH_30YD', name: `Sub 4.10 ${suffix}`, benchmarkValue: '4.100', comparisonOperator: 'lte' })
      .returning();
    benchmarkId = benchmark.id;
    await db.insert(organizationBenchmarks).values({ organizationId: orgId, benchmarkId, benchmarkType: 'custom', isEnabled: true });
  });

  beforeEach(async () => {
    await db.delete(measurements).where(eq(measurements.userId, athleteId));
    await db.delete(sprintFvProfiles).where(eq(sprintFvProfiles.userId, athleteId));
  });

  afterAll(async () => {
    await db.delete(sprintFvProfiles).where(eq(sprintFvProfiles.userId, athleteId));
    await db.delete(organizationBenchmarks).where(eq(organizationBenchmarks.organizationId, orgId));
    await db.delete(customBenchmarks).where(eq(customBenchmarks.organizationId, orgId));
    await purgeTestRows({ userIds: [athleteId], orgIds: [orgId] });
    if (createdMetrics.length > 0) await db.delete(siteMetrics).where(inArray(siteMetrics.code, createdMetrics));
  });

  // The worse run is listed last; the same-day best is 4.08 either way.
  const sameDayRuns = () =>
    add([
      { value: 4.5, date: '2026-09-01' },
      { value: 4.08 },
      { value: 4.3 },
      { value: 4.25 },
    ]);

  it("peer comparison takes the day's best run as the athlete's own value", async () => {
    await sameDayRuns();
    const latest: Map<string, number> = await (peerComparisonService as any).getLatestMeasurements(athleteId, ['DASH_30YD']);
    expect(latest.get('DASH_30YD')).toBe(4.08);
  });

  it("benchmark aggregation and status count the day's best run", async () => {
    await sameDayRuns();
    const service = new BenchmarkAnalyticsService();
    const [aggregation] = await service.getTeamBenchmarkAggregation(orgId, { benchmarkIds: [benchmarkId] });
    expect(aggregation.athletesMet).toBe(1);
    expect(await service.getAthletesByBenchmarkStatus(orgId, benchmarkId, 'met')).toEqual([athleteId]);
  });

  it("most improved starts from the first day's best run", async () => {
    await add([
      { value: 4.5, date: '2026-09-01' },
      { value: 4.3, date: '2026-09-01' },
      { value: 4.08 },
    ]);
    const { improvements } = await new AnalyticsService().getMostImproved(orgId, 'DASH_30YD');
    expect(improvements).toHaveLength(1);
    expect(improvements[0].previousValue).toBe(4.3);
    expect(improvements[0].currentValue).toBe(4.08);
  });

  it('most improved does not count runs of a single day as improvement', async () => {
    await add([{ value: 4.3 }, { value: 4.08 }]);
    const { improvements } = await new AnalyticsService().getMostImproved(orgId, 'DASH_30YD');
    expect(improvements).toHaveLength(0);
  });

  it('decline trend uses one value (the best) per date', async () => {
    // Six dates at 4.00, plus two slower runs on the latest date: no decline once each date counts once
    await add([
      ...[1, 2, 3, 4, 5, 6].map((d) => ({ value: 4.0, date: `2026-10-0${d}` })),
      { value: 4.6, date: '2026-10-06' },
      { value: 4.6, date: '2026-10-06' },
    ]);
    const { declining } = await new AnalyticsService().getAtRiskAthletes(orgId);
    expect(declining.filter((d) => d.athleteId === athleteId && d.metric === 'DASH_30YD')).toEqual([]);
  });

  const derivedValue = async (code: string) => {
    await new DerivedMetricCalculator(db).recalculateForAthlete(athleteId, ['DASH_30YD'], DATE);
    const rows = await db
      .select()
      .from(measurements)
      .where(and(eq(measurements.userId, athleteId), eq(measurements.metric, code), eq(measurements.date, DATE)));
    return rows.map((r) => parseFloat(r.value));
  };

  it("derived latest_before takes the day's best run (already ordered date, then value)", async () => {
    await sameDayRuns();
    expect(await derivedValue(DERIVED_LATEST_BEFORE)).toEqual([4.08]);
  });

  it("derived latest_event takes the best of runs committed together", async () => {
    await add([{ value: 4.3 }, { value: 4.08 }, { value: 4.25 }]);
    expect(await derivedValue(DERIVED_LATEST_EVENT)).toEqual([4.08]);
  });

  it('Sprint F-V fits one run, never the fastest split of each run', async () => {
    // Run A: faster 30 yd; run B: faster 10 and 20 yd
    await add([
      { metric: 'DASH_10YD', value: 1.73, runId: 'run-a' },
      { metric: 'DASH_20YD', value: 2.95, runId: 'run-a' },
      { metric: 'DASH_30YD', value: 4.05, runId: 'run-a' },
      { metric: 'DASH_10YD', value: 1.69, runId: 'run-b' },
      { metric: 'DASH_20YD', value: 2.85, runId: 'run-b' },
      { metric: 'DASH_30YD', value: 4.15, runId: 'run-b' },
    ]);
    const profile = await new SprintFvService().generateProfile(athleteId, DATE, athleteId, { bodyMassLbsOverride: 160 });
    const sources = await db.select().from(measurements).where(inArray(measurements.id, profile.sourceMeasurementIds));
    expect(new Set(sources.map((s) => (s.calculationMetadata as any)?.runId)).size).toBe(1);
    expect(profile.splitTimesJson).toEqual({ '10': 1.69, '20': 2.85, '30': 4.15 });
  });

  it('Sprint F-V lists a session only when one run has enough splits', async () => {
    await add([
      { metric: 'DASH_10YD', value: 1.73, runId: 'run-a' },
      { metric: 'DASH_20YD', value: 2.95, runId: 'run-a' },
      { metric: 'DASH_30YD', value: 4.15, runId: 'run-b' },
    ]);
    expect(await new SprintFvService().findEligibleSessions(athleteId)).toEqual([]);
  });

  it('Sprint F-V keeps the pooled fastest split for rows without a run id', async () => {
    await add([
      { metric: 'DASH_10YD', value: 1.73 },
      { metric: 'DASH_20YD', value: 2.95 },
      { metric: 'DASH_30YD', value: 4.05 },
      { metric: 'DASH_10YD', value: 1.69 },
      { metric: 'DASH_20YD', value: 2.85 },
      { metric: 'DASH_30YD', value: 4.15 },
    ]);
    const profile = await new SprintFvService().generateProfile(athleteId, DATE, athleteId, { bodyMassLbsOverride: 160 });
    expect(profile.splitTimesJson).toEqual({ '10': 1.69, '20': 2.85, '30': 4.05 });
  });
});
