/**
 * Device import keeps every run of a drill; readers pick the best per metric.
 *
 * Real case: run A had the faster 30 yd, run B the faster 10 / 20 yd splits. The import used to keep only the run
 * with the fastest Final Time, so B's splits were lost. Now both runs (drill row + split rows, tied by
 * calculationMetadata.runId) are stored, and the duplicate unit on re-import is (athlete, date, event, parent drill):
 * a 20 yd import never touches the DASH_10YD / DASH_20YD splits of an earlier 30 yd run.
 *
 * The CI database has no DASH_* metrics, so this file creates the site_metrics rows it needs.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { and, eq, inArray } from 'drizzle-orm';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../../packages/api/db';
import { DeviceImportService } from '../../packages/api/services/device-import-service';
import { AnalyticsService } from '../../packages/api/services/analytics-service';
import { assembleEvalReportModel, loadEvalReportInputs } from '../../packages/api/services/eval-report-service';
import { events, importBatches, measurements, organizations, siteMetrics, teams, userOrganizations, userTeams, users } from '@shared/schema';
import { purgeTestRows } from '../helpers/purge-test-rows';

vi.mock('../../packages/api/services/same-run-sources', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/api/services/same-run-sources')>();
  return { ...actual, selectSameRunSources: vi.fn(actual.selectSameRunSources) };
});
import { selectSameRunSources } from '../../packages/api/services/same-run-sources';

const DATE = '2026-10-20';
const METRICS = ['DASH_30YD', 'DASH_20YD', 'DASH_10YD', 'RSI', 'AGILITY_505_M_L', 'AGILITY_505_M_R', 'AGILITY_COD_DEFICIT_M_INTERP'];
const HEADER =
  'Date,First Name,Middle Name,Last Name,Type,Lane ID,Units,Start Distance,Split Time 1,Split Distance 1,Split Speed 1,Start Time 2,Split Distance 2,Split Speed 2,Start Time 3,Split Distance 3,Split Speed 3,Start Time 4,Split Distance 4,Split Speed 4,Start Time 5,Split Distance 5,Split Speed 5,Start Time 6,Split Distance 6,Split Speed 6,Final Time,Final Distance,Final Speed,Jump Distance,Reaction Time,Direction,Weight,Reps,1 RM,Lap Time 1,Lap Time 2,Lap Time 3,Lap Time 4,Lap Time 5,Lap Time 6,Lap Time 7,Lap Time 8,Lap Time 9,RAST Time 1,RAST Time 2,RAST Time 3,RAST Time 4,RAST Time 5,RAST Time 6,Average RSI,Max RSI,RSI,Speed Ratio,Symmetry Score,MultiPlanar Plyometric Index,Custom Event Results';

describe('device import keeps every run', () => {
  const importer = new DeviceImportService();
  const analytics = new AnalyticsService();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const lastName = `Runs${suffix.replace(/[^a-z0-9]/gi, '')}`;
  const createdMetrics: string[] = [];
  let orgId: string;
  let coachId: string;
  let athleteId: string;
  let eventId: string;

  /** One Dash CSV row at `time`: `gates` are [time, distance] pairs, `final` the Final Time at `distance` yd. */
  const dash = (time: string, distance: number, final: number, gates: Array<[number, number]>) => {
    const cols = new Array(57).fill('');
    Object.assign(cols, { 0: `10/20/2026 ${time}`, 1: 'Ana', 3: lastName, 4: 'Dash', 6: 'Imperial', 26: String(final), 27: String(distance) });
    gates.forEach(([t, d], i) => Object.assign(cols, { [8 + 3 * i]: String(t), [9 + 3 * i]: String(d) }));
    return cols.join(',');
  };
  // A: faster 30 yd (4.40). B: faster 10 yd (1.70) and 20 yd (3.00) gates.
  // Each import of A/B also writes one derived FLY10_TIME and one FLY10_TIME_RI10 row (fastest of the runs): 6 + 2 rows.
  const RUN_A = dash('09:05:00', 30, 4.4, [[1.8, 10], [3.1, 20]]);
  const RUN_B = dash('09:00:00', 30, 4.5, [[1.7, 10], [3.0, 20]]);

  const importFile = async (rows: string[], duplicateStrategy: 'skip' | 'replace' = 'skip', withEvent = false) => {
    const file = Buffer.from([HEADER, ...rows].join('\n'));
    const parsed = await importer.parseAndMatch(file, 'runs.csv', 'dashr', orgId, coachId, withEvent ? eventId : undefined, DATE);
    const result = await importer.commitBatch({
      batchId: parsed.batchId,
      duplicateStrategy,
      addMissingEventMetrics: false,
      athletes: [{ csvName: `Ana ${lastName}`, matchedAthleteId: athleteId, included: true }],
      committedBy: coachId,
      organizationId: orgId,
    });
    return { batchId: parsed.batchId, result };
  };

  const rows = (metric?: string) =>
    db.select().from(measurements).where(and(eq(measurements.userId, athleteId), ...(metric ? [eq(measurements.metric, metric)] : [])));
  const dashRows = async () => (await rows()).filter((r) => r.metric.startsWith('DASH_'));

  const best = async (metric: string) =>
    (await analytics.getLeaderboard(orgId, metric)).rankings.find((r: any) => r.athleteId === athleteId)?.value;

  beforeAll(async () => {
    for (const code of METRICS) {
      const inserted = await db
        .insert(siteMetrics)
        .values({ code, label: code, category: 'Speed', unit: code === 'RSI' ? '' : 's', metricType: code === 'RSI' ? 'higher_is_better' : 'lower_is_better' } as any)
        .onConflictDoNothing()
        .returning({ code: siteMetrics.code });
      if (inserted.length > 0) createdMetrics.push(code);
    }
    [{ id: orgId }] = await db.insert(organizations).values({ name: `AllRuns Org ${suffix}` }).returning();
    const mk = async (name: string, extra: object = {}) =>
      (
        await db
          .insert(users)
          .values({
            username: `allruns-${name}-${suffix}`,
            emails: [`allruns-${name}-${suffix}@test.com`],
            password: 'x',
            firstName: name === 'athlete' ? 'Ana' : 'Coach',
            lastName: name === 'athlete' ? lastName : `Coach${suffix}`,
            fullName: name === 'athlete' ? `Ana ${lastName}` : `Coach ${suffix}`,
            ...extra,
          } as any)
          .returning()
      )[0];
    athleteId = (await mk('athlete', { birthDate: '2010-01-01', birthYear: 2010 })).id;
    coachId = (await mk('coach')).id;
    await db.insert(userOrganizations).values([
      { userId: athleteId, organizationId: orgId, role: 'athlete' },
      { userId: coachId, organizationId: orgId, role: 'coach' },
    ]);
    const [team] = await db.insert(teams).values({ organizationId: orgId, name: `AllRuns Team ${suffix}` } as any).returning();
    await db.insert(userTeams).values({ userId: athleteId, teamId: team.id } as any);
    [{ id: eventId }] = await db
      .insert(events)
      .values({ organizationId: orgId, name: `AllRuns ${suffix}`, startDate: new Date(`${DATE}T10:00:00Z`) } as any)
      .returning({ id: events.id });
  });

  const clean = async () => {
    await db.delete(measurements).where(eq(measurements.userId, athleteId));
  };
  beforeEach(clean);
  afterEach(clean);

  afterAll(async () => {
    await clean();
    await db.delete(importBatches).where(eq(importBatches.organizationId, orgId));
    await db.delete(events).where(eq(events.id, eventId));
    await purgeTestRows({ userIds: [athleteId, coachId], orgIds: [orgId] });
    if (createdMetrics.length > 0) await db.delete(siteMetrics).where(inArray(siteMetrics.code, createdMetrics));
  });

  it('stores both runs, each with its own splits; best 30 yd is from A, best 10 / 20 yd from B', async () => {
    const { batchId, result } = await importFile([RUN_A, RUN_B]);
    expect(result.measurementsCreated).toBe(8);
    // Runs = drill results (2 dashes + 2 derived flies); the rest are split rows
    expect(result.runsCreated).toBe(4);
    expect((await importer.getBatches(orgId)).find((b) => b.id === batchId)?.runsImported).toBe(4);

    const drills = await rows('DASH_30YD');
    expect(drills.map((d) => Number(d.value)).sort()).toEqual([4.4, 4.5]);
    for (const d of drills) {
      const meta = d.calculationMetadata as any;
      const splits = (await rows()).filter((r) => (r.calculationMetadata as any)?.runId === meta.runId && r.id !== d.id);
      expect(splits.map((s) => s.metric).sort()).toEqual(['DASH_10YD', 'DASH_20YD']);
      expect(splits.every((s) => (s.calculationMetadata as any).runIndex === meta.runIndex)).toBe(true);
    }
    const metaB = drills.find((d) => Number(d.value) === 4.5)!.calculationMetadata as any;
    expect(metaB.runIndex).toBe(0);
    expect(metaB.runAt).toBe('2026-10-20T09:00:00');

    expect(await best('DASH_30YD')).toBeCloseTo(4.4, 3);
    expect(await best('DASH_20YD')).toBeCloseTo(3.0, 3);
    expect(await best('DASH_10YD')).toBeCloseTo(1.7, 3);
  });

  describe.each(['skip', 'replace'] as const)('a 20 yd import after a 30 yd import (%s)', (strategy) => {
    it("stores the 20 yd run and leaves the 30 yd run's splits alone", async () => {
      await importFile([RUN_A]);
      const before = await dashRows();
      expect(before).toHaveLength(3);

      const { result } = await importFile([dash('09:30:00', 20, 3.05, [[1.75, 10]])], strategy);
      // DASH_20YD drill + its DASH_10YD split are new; only the derived FLY10_TIME_RI10 (one per day) is a duplicate
      expect(result).toMatchObject(
        strategy === 'skip'
          ? { measurementsCreated: 2, measurementsSkipped: 1, measurementsReplaced: 0 }
          : { measurementsCreated: 3, measurementsSkipped: 0, measurementsReplaced: 1 },
      );

      const after = await dashRows();
      expect(after).toHaveLength(5);
      // Every 30 yd row is still there, unchanged
      for (const r of before) expect(after.find((a) => a.id === r.id)?.value).toBe(r.value);
      const drill20 = after.find((r) => r.metric === 'DASH_20YD' && !(r.calculationMetadata as any)?.parentMetric)!;
      expect(Number(drill20.value)).toBe(3.05);
      const split10 = after.filter((r) => r.metric === 'DASH_10YD' && (r.calculationMetadata as any)?.parentMetric === 'DASH_20YD');
      expect(split10.map((r) => Number(r.value))).toEqual([1.75]);
    });
  });

  it('re-importing the same file with skip skips every run, drill and splits', async () => {
    await importFile([RUN_A, RUN_B]);
    const before = (await rows()).map((r) => r.id).sort();
    const { result } = await importFile([RUN_A, RUN_B], 'skip');
    expect(result.measurementsCreated).toBe(0);
    expect(result.measurementsSkipped).toBe(8);
    expect((await rows()).map((r) => r.id).sort()).toEqual(before);
  });

  it('re-importing the same file with replace swaps every run', async () => {
    const first = await importFile([RUN_A, RUN_B]);
    const { batchId, result } = await importFile([RUN_A, RUN_B], 'replace');
    expect(result.measurementsReplaced).toBe(8);
    expect(result.measurementsCreated).toBe(8);
    const after = await rows();
    expect(after).toHaveLength(8);
    expect(after.every((r) => r.importBatchId === batchId)).toBe(true);
    expect(after.some((r) => r.importBatchId === first.batchId)).toBe(false);
  });

  it('rollback removes every run of the batch', async () => {
    const { batchId } = await importFile([RUN_A, RUN_B]);
    expect(await rows()).toHaveLength(8);
    await importer.rollbackBatch(batchId, coachId, orgId);
    expect(await rows()).toHaveLength(0);
  });

  it('an eval report on A/B data takes the 10 / 20 yd pair from one run', async () => {
    await importFile([RUN_A, RUN_B], 'skip', true);
    const leg = (metric: string, value: number) => ({
      userId: athleteId, submittedBy: coachId, date: DATE, age: 16, metric, value: String(value), units: 's',
      isVerified: true, eventId, organizationId: orgId,
    });
    await db.insert(measurements).values([leg('AGILITY_505_M_L', 2.6), leg('AGILITY_505_M_R', 2.7)] as any);

    const [event] = await db.select().from(events).where(eq(events.id, eventId));
    const inputs = await loadEvalReportInputs(db, { event, athleteId });
    vi.mocked(selectSameRunSources).mockClear();
    const model = assembleEvalReportModel({ ...inputs, selection: {}, load: null, coachNote: null, overrides: {} });

    const pair = vi.mocked(selectSameRunSources).mock.results.map((r) => r.value).find((v) => v);
    expect(pair).toBeTruthy();
    const runId10 = (pair.get('DASH_10YD').calculationMetadata as any).runId;
    expect(runId10).toBeTruthy();
    expect((pair.get('DASH_20YD').calculationMetadata as any).runId).toBe(runId10);
    expect(model.metrics.length).toBeGreaterThan(0);
  });
});
