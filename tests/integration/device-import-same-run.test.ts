/**
 * Device import: a derived value built from split inputs must come from ONE run.
 *
 * A Dashr import writes the drill row and each split row as separate measurements; a 30 yd and a 40 yd
 * sprint both write DASH_10YD / DASH_20YD splits. The calculator used to take the best DASH_10YD and the
 * best DASH_20YD of the date independently, i.e. possibly from two different sprints. A derived metric
 * with calculationConfig.sameRunInputs now takes those inputs from the same run (calculationMetadata.runId).
 *
 * The derived metric here is a TST_ one (the CI database has no seeded DASH_* or COD metrics) with the
 * same_date + sameRunInputs config migration 0163 sets on AGILITY_COD_DEFICIT_M_INTERP.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { db } from '../../packages/api/db';
import { DeviceImportService } from '../../packages/api/services/device-import-service';
import { DerivedMetricCalculator } from '../../packages/api/services/derived-metric-calculator';
import { MeasurementService } from '../../packages/api/services/measurement-service';
import { importBatches, measurements, organizations, userOrganizations, users } from '@shared/schema';

const DERIVED = 'TST_SR_DASH_DIFF';
const SOURCES = ['DASH_10YD', 'DASH_20YD'];
const DATE = '2026-10-13';
const HEADER =
  'Date,First Name,Middle Name,Last Name,Type,Lane ID,Units,Start Distance,Split Time 1,Split Distance 1,Split Speed 1,Start Time 2,Split Distance 2,Split Speed 2,Start Time 3,Split Distance 3,Split Speed 3,Start Time 4,Split Distance 4,Split Speed 4,Start Time 5,Split Distance 5,Split Speed 5,Start Time 6,Split Distance 6,Split Speed 6,Final Time,Final Distance,Final Speed,Jump Distance,Reaction Time,Direction,Weight,Reps,1 RM,Lap Time 1,Lap Time 2,Lap Time 3,Lap Time 4,Lap Time 5,Lap Time 6,Lap Time 7,Lap Time 8,Lap Time 9,RAST Time 1,RAST Time 2,RAST Time 3,RAST Time 4,RAST Time 5,RAST Time 6,Average RSI,Max RSI,RSI,Speed Ratio,Symmetry Score,MultiPlanar Plyometric Index,Custom Event Results';

describe('device import: derived split inputs come from one run', () => {
  const importer = new DeviceImportService();
  const calculator = new DerivedMetricCalculator(db);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const lastName = `Ortiz${suffix.replace(/[^a-z0-9]/gi, '')}`;
  let orgId: string;
  let coachId: string;
  let athleteId: string;
  const createdMetrics: string[] = [];

  /** One Dash CSV row: `gates` are [time, distance] pairs, `final` the Final Time at `distance` yd. */
  const dash = (distance: number, final: number, gates: Array<[number, number]>) => {
    const cols = new Array(57).fill('');
    Object.assign(cols, { 0: '10/13/2026 17:27:42', 1: 'Lucy', 3: lastName, 4: 'Dash', 6: 'Imperial', 26: String(final), 27: String(distance) });
    gates.forEach(([t, d], i) => Object.assign(cols, { [8 + 3 * i]: String(t), [9 + 3 * i]: String(d) }));
    return cols.join(',');
  };
  const RUN_A = dash(30, 4.08, [[1.69, 10], [2.95, 20], [4.09, 30]]);
  // Run B's 20 yd gate is faster than A's, its 10 yd gate slower: the best 10 yd and the best 20 yd live in different runs
  const RUN_B = dash(40, 5.09, [[1.73, 10], [2.85, 20], [4.0, 30], [5.09, 40]]);

  const importFile = async (rows: string[], duplicateStrategy: 'skip' | 'replace' = 'replace') => {
    const file = Buffer.from([HEADER, ...rows].join('\n'));
    const parsed = await importer.parseAndMatch(file, 'run.csv', 'dashr', orgId, coachId, undefined, DATE);
    await importer.commitBatch({
      batchId: parsed.batchId,
      duplicateStrategy,
      addMissingEventMetrics: false,
      athletes: [{ csvName: `Lucy ${lastName}`, matchedAthleteId: athleteId, included: true }],
      committedBy: coachId,
      organizationId: orgId,
    });
    return parsed.batchId;
  };

  // The import only refreshes derived rows that already exist (it recalculates without a date), so a test
  // creates them the way the admin recalc / a source edit does: by recalculating the source date.
  const compute = () => calculator.recalculateForAthlete(athleteId, SOURCES, DATE);

  const derivedRows = async () => {
    const rows = await db
      .select()
      .from(measurements)
      .where(and(eq(measurements.userId, athleteId), eq(measurements.metric, DERIVED), eq(measurements.date, DATE)));
    return Promise.all(
      rows.map(async (d) => {
        const sources = d.calculatedFromMeasurementIds?.length
          ? await db.select().from(measurements).where(inArray(measurements.id, d.calculatedFromMeasurementIds))
          : [];
        return { value: parseFloat(d.value), sources };
      })
    );
  };
  const runIds = (sources: Array<{ calculationMetadata: any }>) => new Set(sources.map((s) => s.calculationMetadata?.runId));

  beforeAll(async () => {
    const inserted = await db.execute(sql`
      INSERT INTO site_metrics (code, label, category, unit, metric_type, is_system_default, is_active, display_order, decimal_precision)
      VALUES
        ('DASH_10YD', 'Test 10 yd', 'Speed', 's', 'lower_is_better', false, true, 920, 3),
        ('DASH_20YD', 'Test 20 yd', 'Speed', 's', 'lower_is_better', false, true, 921, 3)
      ON CONFLICT (code) DO NOTHING
      RETURNING code
    `);
    createdMetrics.push(...(Array.from(inserted) as unknown as Array<{ code: string }>).map((r) => r.code));
    await db.execute(sql`
      INSERT INTO site_metrics (
        code, label, category, unit, metric_type, is_system_default, is_active, display_order, decimal_precision,
        is_derived, formula, dependent_metrics, calculation_config
      ) VALUES (
        ${DERIVED}, ${DERIVED}, 'Speed', 's', 'tracking', false, true, 922, 3,
        true, 'dash_20yd - dash_10yd', ARRAY['DASH_10YD', 'DASH_20YD'],
        '{"dateMatchStrategy":"same_date","missingSourceBehavior":"skip","sameRunInputs":["DASH_10YD","DASH_20YD"]}'::jsonb
      )
      ON CONFLICT (code) DO UPDATE SET is_derived = true, is_active = true, formula = EXCLUDED.formula,
        dependent_metrics = EXCLUDED.dependent_metrics, calculation_config = EXCLUDED.calculation_config
    `);
    const [org] = await db.insert(organizations).values({ name: `SameRun Org ${suffix}` }).returning();
    orgId = org.id;
    const mk = async (name: string, extra: object = {}) =>
      (
        await db
          .insert(users)
          .values({
            username: `samerun-${name}-${suffix}`,
            emails: [`samerun-${name}-${suffix}@test.com`],
            password: 'x',
            firstName: name === 'athlete' ? 'Lucy' : 'Coach',
            lastName: name === 'athlete' ? lastName : `Coach${suffix}`,
            fullName: `${name} ${suffix}`,
            ...extra,
          } as any)
          .returning()
      )[0];
    athleteId = (await mk('athlete', { birthDate: '2008-01-01', birthYear: 2008 })).id;
    coachId = (await mk('coach')).id;
    await db.insert(userOrganizations).values([
      { userId: athleteId, organizationId: orgId, role: 'athlete' },
      { userId: coachId, organizationId: orgId, role: 'coach' },
    ]);
  });

  const clean = async () => {
    await db.delete(measurements).where(inArray(measurements.userId, [athleteId]));
  };
  beforeEach(clean);
  afterEach(clean);

  afterAll(async () => {
    await clean();
    await db.delete(importBatches).where(eq(importBatches.organizationId, orgId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, orgId));
    await db.delete(users).where(inArray(users.id, [athleteId, coachId]));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await db.execute(sql`DELETE FROM site_metrics WHERE code = ${DERIVED}`);
    if (createdMetrics.length > 0) {
      await db.execute(sql`DELETE FROM site_metrics WHERE code IN (${sql.join(createdMetrics.map((c) => sql`${c}`), sql`, `)})`);
    }
  });

  it('pairs the 10 yd and 20 yd inputs from one run when the best of each are in different runs', async () => {
    await importFile([RUN_A, RUN_B]);
    await compute();

    const rows = await derivedRows();
    expect(rows).toHaveLength(1);
    // Run A: 2.95 - 1.69. Independent bests would give 2.85 - 1.69 = 1.16 (A's 10 yd with B's 20 yd).
    expect(rows[0].value).toBeCloseTo(1.26, 3);
    expect(rows[0].sources).toHaveLength(2);
    expect(runIds(rows[0].sources).size).toBe(1);
  });

  it('computes nothing when no single run has both inputs', async () => {
    // A: 30 yd dash with only a 10 yd gate (DASH_10YD split + DASH_30YD). B: 20 yd dash, no gates (DASH_20YD only)
    await importFile([dash(30, 4.08, [[1.69, 10]]), dash(20, 2.9, [])]);
    await compute();

    expect(await derivedRows()).toHaveLength(0);
  });

  it('never mixes manual rows (no run id) with imported runs', async () => {
    await importFile([dash(30, 4.08, [[1.69, 10]]), dash(20, 2.9, [])]); // imported: 10 yd in one run, 20 yd in another
    await db.insert(measurements).values({
      userId: athleteId, submittedBy: coachId, metric: 'DASH_10YD', value: '1.8', date: DATE, age: 18, units: 's',
      organizationId: orgId, isVerified: true, isCalculated: false,
    } as any);
    // A manual 10 yd plus imported rows only: no complete run
    await compute();
    expect(await derivedRows()).toHaveLength(0);

    // Manual pair: computed from the manual rows alone
    await db.insert(measurements).values({
      userId: athleteId, submittedBy: coachId, metric: 'DASH_20YD', value: '3.1', date: DATE, age: 18, units: 's',
      organizationId: orgId, isVerified: true, isCalculated: false,
    } as any);
    await compute();
    const rows = await derivedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBeCloseTo(3.1 - 1.8, 3);
    expect(rows[0].sources.every((s) => s.importBatchId === null)).toBe(true);
  });

  it('keeps every run its own split rows on a replace re-import of the same file', async () => {
    await importFile([RUN_A, RUN_B]);
    await importFile([RUN_A, RUN_B]);
    await compute();

    const splits = await db
      .select()
      .from(measurements)
      .where(and(eq(measurements.userId, athleteId), eq(measurements.metric, 'DASH_10YD')));
    // One DASH_10YD split per run, both from the second batch, each with its own run id
    expect(splits).toHaveLength(2);
    expect(new Set(splits.map((s) => s.importBatchId)).size).toBe(1);
    expect(runIds(splits).size).toBe(2);
    const rows = await derivedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBeCloseTo(1.26, 3);
  });

  it('after a 2-run import, deleting the rows and re-importing 1 run leaves nothing of the first batch', async () => {
    const first = await importFile([RUN_A, RUN_B]);
    await compute();
    expect(await derivedRows()).toHaveLength(1);
    const ids = (await db.select({ id: measurements.id }).from(measurements).where(eq(measurements.userId, athleteId))).map((r) => r.id);
    const del = await new MeasurementService().bulkDelete(ids, orgId);
    expect(del.failed).toBe(0);

    // Re-import run B's gates only: slower 10 yd, faster 20 yd
    const second = await importFile([RUN_B]);
    await compute();

    const all = await db.select().from(measurements).where(eq(measurements.userId, athleteId));
    expect(all.filter((m) => m.importBatchId === first)).toEqual([]);
    const rows = await derivedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBeCloseTo(2.85 - 1.73, 3);
    expect(rows[0].sources.every((s) => s.importBatchId === second)).toBe(true);
    expect(runIds(rows[0].sources).size).toBe(1);
  });
});
