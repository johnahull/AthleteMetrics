/**
 * Device import keeps every run of a drill; readers pick the best per metric.
 *
 * Real case: run A had the faster 30 yd, run B the faster 10 / 20 yd splits. The import used to keep only the run
 * with the fastest Final Time, so B's splits were lost. Now both runs (drill row + split rows, tied by
 * calculationMetadata.runId) are stored, and the duplicate unit on re-import is one run: (athlete, date, event, parent
 * drill, run time): a 20 yd import never touches the DASH_10YD / DASH_20YD splits of an earlier 30 yd run, and an
 * afternoon file never touches the morning runs.
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
    // Runs = the 2 dashes; the derived flies and the split rows are not runs
    expect(result.runsCreated).toBe(2);
    expect((await importer.getBatches(orgId)).find((b) => b.id === batchId)?.runsImported).toBe(2);

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

  // RUN_A's derived FLY10_TIME_RI10 is 3.1 - 1.8 = 1.3 s. A 20 yd run of 3.15 s with a 1.75 s gate gives 1.4 s (slower).
  const SLOW_20 = dash('09:30:00', 20, 3.15, [[1.75, 10]]);
  describe.each(['skip', 'replace'] as const)('a 20 yd import after a 30 yd import (%s)', (strategy) => {
    it("stores the 20 yd run and leaves the 30 yd run's splits alone", async () => {
      await importFile([RUN_A]);
      const before = await dashRows();
      expect(before).toHaveLength(3);

      const { result } = await importFile([SLOW_20], strategy);
      // DASH_20YD drill + its DASH_10YD split are new. The derived FLY10_TIME_RI10 (one per day) is a duplicate;
      // under replace the earlier, faster one is kept
      expect(result).toMatchObject({ measurementsCreated: 2, measurementsSkipped: 1, measurementsReplaced: 0 });

      const after = await dashRows();
      expect(after).toHaveLength(5);
      // Every 30 yd row is still there, unchanged
      for (const r of before) expect(after.find((a) => a.id === r.id)?.value).toBe(r.value);
      const drill20 = after.find((r) => r.metric === 'DASH_20YD' && !(r.calculationMetadata as any)?.parentMetric)!;
      expect(Number(drill20.value)).toBe(3.15);
      const split10 = after.filter((r) => r.metric === 'DASH_10YD' && (r.calculationMetadata as any)?.parentMetric === 'DASH_20YD');
      expect(split10.map((r) => Number(r.value))).toEqual([1.75]);
      expect((await rows('FLY10_TIME_RI10')).map((r) => Number(r.value))).toEqual([1.3]);
    });
  });

  it('replace swaps a derived fly only when the new one is faster', async () => {
    await importFile([RUN_A]);
    // 2.95 - 1.75 = 1.2 s, faster than RUN_A's 1.3 s
    const { result } = await importFile([dash('09:30:00', 20, 2.95, [[1.75, 10]])], 'replace');
    expect(result).toMatchObject({ measurementsCreated: 3, measurementsSkipped: 0, measurementsReplaced: 1 });
    expect((await rows('FLY10_TIME_RI10')).map((r) => Number(r.value))).toEqual([1.2]);
  });

  it('groups old split rows without parentMetric by their "Split from X" notes', async () => {
    const old = (metric: string, value: number, notes: string) => ({
      userId: athleteId, submittedBy: coachId, date: DATE, age: 16, metric, value: String(value), units: 's',
      isVerified: true, organizationId: orgId, importSource: 'dashr_csv', notes,
    });
    // Legacy rows (no runAt) with RUN_A's value: the same session, so the old group rule applies
    const [drill30, split10] = await db.insert(measurements).values([
      old('DASH_30YD', 4.4, 'Imported from old.csv'),
      old('DASH_10YD', 1.9, 'Split from DASH_30YD \u2014 imported from old.csv'),
    ] as any).returning();

    // A 20 yd replace import leaves the old 30 yd run (and its split) alone
    await importFile([SLOW_20], 'replace');
    const ids = (await rows()).map((r) => r.id);
    expect(ids).toContain(drill30.id);
    expect(ids).toContain(split10.id);

    // A 30 yd replace import removes both old rows
    const { result } = await importFile([RUN_A], 'replace');
    expect(result.measurementsReplaced).toBeGreaterThanOrEqual(2);
    const after = (await rows()).map((r) => r.id);
    expect(after).not.toContain(drill30.id);
    expect(after).not.toContain(split10.id);
  });

  it('skip skips the whole run even when only some rows of the run exist, and adds the runs of other times', async () => {
    await importFile([RUN_A]);
    // Keep only the DASH_30YD drill row of the earlier run
    await db.delete(measurements).where(and(eq(measurements.userId, athleteId), inArray(measurements.metric, ['DASH_10YD', 'DASH_20YD'])));
    const { result } = await importFile([RUN_A, RUN_B], 'skip');
    // RUN_A (09:05) is skipped with its splits; RUN_B (09:00) is a new run time and is added with its splits.
    // The derived flies of the file are not faster than the stored ones, so they are skipped too.
    expect(result).toMatchObject({ measurementsCreated: 3, runsCreated: 1, measurementsSkipped: 5 });
    const after = await dashRows();
    expect(after.filter((r) => (r.calculationMetadata as any)?.runAt === '2026-10-20T09:05:00').map((r) => r.metric)).toEqual(['DASH_30YD']);
    expect(after.filter((r) => (r.calculationMetadata as any)?.runAt === '2026-10-20T09:00:00')).toHaveLength(3);
  });

  it('an import linked to an event and one without an event on the same date stay separate', async () => {
    await importFile([RUN_A, RUN_B]);
    const { result } = await importFile([RUN_A, RUN_B], 'skip', true);
    expect(result).toMatchObject({ measurementsCreated: 8, measurementsSkipped: 0 });
    const replaced = await importFile([RUN_A, RUN_B], 'replace', true);
    expect(replaced.result.measurementsReplaced).toBe(8);
    expect((await rows()).filter((r) => r.eventId === null)).toHaveLength(8);
  });

  it('a replace re-import of a file with a 20 and a 30 yd dash keeps each run its own splits', async () => {
    const file = [RUN_A, dash('09:30:00', 20, 3.05, [[1.75, 10]])];
    await importFile(file);
    const { batchId } = await importFile(file, 'replace');
    const split10 = await rows('DASH_10YD');
    expect(split10.map((r) => (r.calculationMetadata as any).parentMetric).sort()).toEqual(['DASH_20YD', 'DASH_30YD']);
    expect(split10.every((r) => r.importBatchId === batchId)).toBe(true);
    expect(await dashRows()).toHaveLength(5);
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
    // Nothing left to count: the history hides it
    expect((await importer.getBatches(orgId)).find((b) => b.id === batchId)?.runsImported).toBeNull();
  });

  // A batch committed before every run was kept: drill rows without runAt, a derived fly without derivedFrom
  const legacyBatch = async (rows: Array<[string, number]>) => {
    const [b] = await db.insert(importBatches).values({
      organizationId: orgId, source: 'dashr_csv', fileName: 'legacy.csv', sessionDate: DATE, status: 'completed',
      createdBy: coachId, committedBy: coachId, committedAt: new Date(), measurementsCreated: rows.length,
      athletesImported: 1, expiresAt: new Date(),
    }).returning();
    await db.insert(measurements).values(rows.map(([metric, value]) => ({
      userId: athleteId, submittedBy: coachId, date: DATE, age: 16, metric, value: String(value), units: 's',
      isVerified: true, organizationId: orgId, importSource: 'dashr_csv', importBatchId: b.id,
      notes: 'Imported from legacy.csv',
      calculationMetadata: { formula: 'direct_import', runId: `legacy-${metric}`, sourceValues: {}, calculatedAt: new Date().toISOString() },
    })) as any);
    return b.id;
  };

  it('does not count runs for a batch imported before runs were recorded', async () => {
    const legacy = await legacyBatch([['DASH_30YD', 4.6], ['FLY10_TIME', 1.25]]);
    // At the event, so the legacy rows (no event) are not duplicates of it
    const { batchId } = await importFile([RUN_A, RUN_B], 'skip', true);
    const batches = await importer.getBatches(orgId);
    // The legacy batch cannot tell a derived fly from a run: unknown, not 2
    expect(batches.find((b) => b.id === legacy)?.runsImported).toBeNull();
    expect(batches.find((b) => b.id === batchId)?.runsImported).toBe(2);
  });

  it('replace keeps a faster legacy fly (no derivedFrom) over a slower new derived one', async () => {
    await legacyBatch([['FLY10_TIME', 1.25]]);
    // RUN_A's derived FLY10_TIME is 4.4 - 3.1 = 1.3 s, slower
    const { result } = await importFile([RUN_A], 'replace');
    expect(result.measurementsSkipped).toBe(1);
    expect((await rows('FLY10_TIME')).map((r) => Number(r.value))).toEqual([1.25]);
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

  describe('a run is identified by its time', () => {
    // A 30 yd dash with only a 10 yd gate: drill row + 1 split, no derived fly
    const run = (time: string, final: number) => dash(time, 30, final, [[1.8, 10]]);
    const MORNING = [run('09:00:00', 4.5), run('09:10:00', 4.6)];
    const AFTERNOON = [run('14:00:00', 4.4), run('14:05:00', 4.7)];
    const drillRows = async () => (await rows('DASH_30YD')).filter((r) => !(r.calculationMetadata as any)?.parentMetric);
    const runTimes = async () => (await drillRows()).map((r) => (r.calculationMetadata as any)?.runAt ?? null).sort();
    const legacy = (metric: string, value: number, notes = 'Imported from old.csv') => ({
      userId: athleteId, submittedBy: coachId, date: DATE, age: 16, metric, value: String(value), units: 's',
      isVerified: true, organizationId: orgId, importSource: 'dashr_csv', notes,
    });
    /** Same dash row with an RSI value (column 52) */
    const withRsi = (row: string, rsi: number) => row.split(',').map((c, i) => (i === 52 ? String(rsi) : c)).join(',');

    it('skip: an afternoon file after a morning file adds every afternoon run', async () => {
      await importFile(MORNING);
      const { result } = await importFile(AFTERNOON, 'skip');
      expect(result).toMatchObject({ measurementsCreated: 4, runsCreated: 2, measurementsSkipped: 0, measurementsReplaced: 0 });
      expect(await runTimes()).toEqual(['09:00', '09:10', '14:00', '14:05'].map((t) => `2026-10-20T${t}:00`));
      expect(await rows('DASH_10YD')).toHaveLength(4);
    });

    it('replace: an afternoon file after a morning file keeps the morning runs and their splits', async () => {
      await importFile(MORNING);
      const before = (await rows()).map((r) => r.id).sort();
      const { result } = await importFile(AFTERNOON, 'replace');
      expect(result).toMatchObject({ measurementsCreated: 4, measurementsSkipped: 0, measurementsReplaced: 0 });
      const after = (await rows()).map((r) => r.id);
      for (const id of before) expect(after).toContain(id);
      expect(await runTimes()).toHaveLength(4);
    });

    it('replace: the same file twice keeps the count stable', async () => {
      await importFile(MORNING);
      const { result } = await importFile(MORNING, 'replace');
      expect(result).toMatchObject({ measurementsCreated: 4, measurementsReplaced: 4 });
      expect(await rows()).toHaveLength(4);
    });

    describe.each(['skip', 'replace'] as const)('an overlapping export (%s)', (strategy) => {
      it('the shared run is a duplicate, the new run is added, the earlier run stays', async () => {
        const first = await importFile(MORNING);
        const run0900 = (await drillRows()).find((r) => (r.calculationMetadata as any).runAt === '2026-10-20T09:00:00')!;
        const { batchId, result } = await importFile([run('09:10:00', 4.6), run('14:00:00', 4.4)], strategy);
        expect(result).toMatchObject(
          strategy === 'skip'
            ? { measurementsCreated: 2, measurementsSkipped: 2, measurementsReplaced: 0 }
            : { measurementsCreated: 4, measurementsSkipped: 0, measurementsReplaced: 2 },
        );
        expect(await runTimes()).toEqual(['09:00', '09:10', '14:00'].map((t) => `2026-10-20T${t}:00`));
        expect((await drillRows()).find((r) => r.id === run0900.id)).toBeTruthy();
        const run0910 = (await drillRows()).find((r) => (r.calculationMetadata as any).runAt === '2026-10-20T09:10:00')!;
        expect(run0910.importBatchId).toBe(strategy === 'skip' ? first.batchId : batchId);
      });
    });

    it('rollback of the second batch removes only its runs', async () => {
      await importFile(MORNING);
      const second = await importFile([run('09:10:00', 4.6), run('14:00:00', 4.4)], 'skip');
      await importer.rollbackBatch(second.batchId, coachId, orgId);
      expect(await runTimes()).toEqual(['09:00', '09:10'].map((t) => `2026-10-20T${t}:00`));
    });

    it('rollback of the first batch after an overlapping second batch removes the shared run from both', async () => {
      const first = await importFile(MORNING);
      await importFile([run('09:10:00', 4.6), run('14:00:00', 4.4)], 'skip');
      await importer.rollbackBatch(first.batchId, coachId, orgId);
      // The second batch skipped 09:10 because the first batch had it; rolling the first back leaves only 14:00
      expect(await runTimes()).toEqual(['2026-10-20T14:00:00']);
    });

    it('two runs with the same time in one file are both stored and stay two on re-import', async () => {
      const pair = [run('09:00:00', 4.5), run('09:00:00', 4.6)];
      expect((await importFile(pair)).result).toMatchObject({ measurementsCreated: 4, runsCreated: 2 });
      expect((await importFile(pair, 'skip')).result).toMatchObject({ measurementsCreated: 0, measurementsSkipped: 4 });
      const replaced = await importFile(pair, 'replace');
      expect(replaced.result).toMatchObject({ measurementsCreated: 4, measurementsReplaced: 4 });
      expect(await rows()).toHaveLength(4);
      expect((await rows()).every((r) => r.importBatchId === replaced.batchId)).toBe(true);
    });

    it('a manual (non-import) row of the same drill and date is never touched', async () => {
      const [manual] = await db.insert(measurements).values({ ...legacy('DASH_30YD', 4.5), importSource: null, notes: null } as any).returning();
      await importFile(MORNING, 'replace');
      expect((await importFile(MORNING, 'replace')).result.measurementsReplaced).toBe(4);
      expect((await rows()).find((r) => r.id === manual.id)?.value).toBe(manual.value);
    });

    describe('legacy rows (no run time, imported before every run was kept)', () => {
      it('with the same value: skip skips the run, replace replaces the legacy group', async () => {
        const [drill, split] = await db.insert(measurements).values([
          legacy('DASH_30YD', 4.5), legacy('DASH_10YD', 1.9, 'Split from DASH_30YD — imported from old.csv'),
        ] as any).returning();
        expect((await importFile([run('09:00:00', 4.5)], 'skip')).result).toMatchObject({ measurementsCreated: 0, measurementsSkipped: 2 });

        // Replace with several runs: the matching run deletes the legacy group once, the others are added
        const { result } = await importFile([run('09:00:00', 4.5), run('09:10:00', 4.6)], 'replace');
        expect(result).toMatchObject({ measurementsCreated: 4, measurementsReplaced: 2 });
        const ids = (await rows()).map((r) => r.id);
        expect(ids).not.toContain(drill.id);
        expect(ids).not.toContain(split.id);
      });

      describe.each(['skip', 'replace'] as const)('with a different value (%s)', (strategy) => {
        it('another session: the legacy rows survive and the run is added', async () => {
          const [drill, split] = await db.insert(measurements).values([
            legacy('DASH_30YD', 4.9), legacy('DASH_10YD', 2.0, 'Split from DASH_30YD — imported from old.csv'),
          ] as any).returning();
          const { result } = await importFile([run('14:00:00', 4.4)], strategy);
          expect(result).toMatchObject({ measurementsCreated: 2, measurementsSkipped: 0, measurementsReplaced: 0 });
          const ids = (await rows()).map((r) => r.id);
          expect(ids).toContain(drill.id);
          expect(ids).toContain(split.id);
        });
      });

      it('next to timestamped rows: a timestamped run matches only its own time, an unmatched run the legacy value', async () => {
        const [old] = await db.insert(measurements).values(legacy('DASH_30YD', 4.8) as any).returning();
        await importFile(MORNING);
        // Re-import of 09:00 replaces only that run; the legacy row stays
        expect((await importFile([run('09:00:00', 4.5)], 'replace')).result).toMatchObject({ measurementsReplaced: 2 });
        expect((await rows()).find((r) => r.id === old.id)).toBeTruthy();
        // A new time with the legacy value is a duplicate of the legacy row
        expect((await importFile([run('14:00:00', 4.8)], 'skip')).result).toMatchObject({ measurementsCreated: 0, measurementsSkipped: 2 });
        expect(await runTimes()).toEqual(['2026-10-20T09:00:00', '2026-10-20T09:10:00', null]);
      });
    });

    it('a run without a time never matches timestamped runs; it uses the legacy value rule', async () => {
      await importFile([run('09:00:00', 4.5)]);
      // Date without a time of day: the run has no runAt
      const untimed = dash('', 30, 4.5, [[1.8, 10]]);
      expect((await importFile([untimed], 'replace')).result).toMatchObject({ measurementsCreated: 2, measurementsReplaced: 0 });
      expect(await runTimes()).toEqual(['2026-10-20T09:00:00', null]);
      // The untimed run is now a legacy row with the same value: skip skips it, replace replaces only it
      expect((await importFile([untimed], 'skip')).result).toMatchObject({ measurementsCreated: 0, measurementsSkipped: 2 });
      expect((await importFile([untimed], 'replace')).result).toMatchObject({ measurementsCreated: 2, measurementsReplaced: 2 });
      expect(await runTimes()).toEqual(['2026-10-20T09:00:00', null]);
    });

    describe('one value per day (derived fly, RSI)', () => {
      // RUN_A's derived FLY10_TIME_RI10 is 1.3 s; FAST_20's is 2.95 - 1.75 = 1.2 s; SLOW_20's is 1.4 s
      const FAST_20 = dash('14:00:00', 20, 2.95, [[1.75, 10]]);
      const fly = async () => (await rows('FLY10_TIME_RI10')).map((r) => Number(r.value)).sort();

      it('skip adds a faster derived fly next to the earlier one', async () => {
        await importFile([RUN_A]);
        const { result } = await importFile([FAST_20], 'skip');
        expect(result).toMatchObject({ measurementsCreated: 3, measurementsSkipped: 0, measurementsReplaced: 0 });
        expect(await fly()).toEqual([1.2, 1.3]);
        expect(await best('FLY10_TIME_RI10')).toBeCloseTo(1.2, 3);
      });

      it('skip does not add a slower derived fly', async () => {
        await importFile([RUN_A]);
        expect((await importFile([SLOW_20], 'skip')).result).toMatchObject({ measurementsSkipped: 1 });
        expect(await fly()).toEqual([1.3]);
      });

      it('replace across two files replaces every earlier derived fly of the code', async () => {
        await importFile([RUN_A]);
        await importFile([FAST_20], 'skip'); // 1.3 and 1.2 stored
        const { result } = await importFile([dash('15:00:00', 20, 2.85, [[1.75, 10]])], 'replace'); // 1.1
        expect(result).toMatchObject({ measurementsReplaced: 2 });
        expect(await fly()).toEqual([1.1]);
      });

      it('RSI across two files: skip adds only a higher RSI, replace keeps the higher one', async () => {
        await importFile([withRsi(run('09:00:00', 4.5), 2.0)]);
        const rsi = async () => (await rows('RSI')).map((r) => Number(r.value)).sort();

        expect((await importFile([withRsi(run('14:00:00', 4.4), 1.5)], 'skip')).result).toMatchObject({ measurementsSkipped: 1 });
        expect(await rsi()).toEqual([2.0]);
        expect((await importFile([withRsi(run('14:05:00', 4.7), 2.5)], 'skip')).result).toMatchObject({ measurementsSkipped: 0 });
        expect(await rsi()).toEqual([2.0, 2.5]);

        // Replace: a lower RSI is skipped, the earlier higher one kept
        expect((await importFile([withRsi(run('15:00:00', 4.6), 1.0)], 'replace')).result).toMatchObject({ measurementsSkipped: 1, measurementsReplaced: 0 });
        expect(await rsi()).toEqual([2.0, 2.5]);
        // A higher one replaces every earlier RSI of the day
        expect((await importFile([withRsi(run('15:05:00', 4.6), 3.0)], 'replace')).result).toMatchObject({ measurementsReplaced: 2 });
        expect(await rsi()).toEqual([3.0]);
      });
    });
  });
});
