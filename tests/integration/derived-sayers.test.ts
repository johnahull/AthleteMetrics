/**
 * AM-FEAT-021: Sayers peak power (PEAK_POWER_W, PEAK_POWER_REL) calculator behavior.
 *
 * Mirrors derived-momentum.test.ts. The tests seed their own metrics (TST_ prefix, CI has no
 * seeded metrics) with the configuration and formulas migration 0158 uses, with the source
 * codes swapped for test codes:
 *   calculationConfig {dateMatchStrategy:'closest', maxDateDifference:45, anchorMetric:<CMJ>}
 *   dependent_metrics [<CMJ>, <WEIGHT>]  (anchor first)
 * The migration's own formula strings are pinned in tests/migrations/0158-sayers-peak-power.test.ts.
 *
 * Run with TZ=UTC (see derived-momentum.test.ts).
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { sql, and, eq, inArray } from 'drizzle-orm';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { db } from '../../packages/api/db';
import { MeasurementService } from '../../packages/api/services/measurement-service';
import { DerivedMetricCalculator } from '../../packages/api/services/derived-metric-calculator';
import { measurements, organizations, teams, userTeams, users, userOrganizations } from '@shared/schema';

const PP_W = 'TST_PEAK_POWER_W';
const PP_REL = 'TST_PEAK_POWER_REL';
const CMJ = 'TST_CMJ_HOH';
const CMJ_L = 'TST_CMJ_SL_L';
const CMJ_R = 'TST_CMJ_SL_R';
const WEIGHT = 'TST_SAYERS_WT';

const W_EXPR = `60.7 * ${CMJ.toLowerCase()} * 2.54 + 45.3 * ${WEIGHT.toLowerCase()} * 0.45359237 - 2055`;
const W_FORMULA = W_EXPR;
const REL_FORMULA = `(${W_EXPR}) / (${WEIGHT.toLowerCase()} * 0.45359237)`;
const CONFIG = JSON.stringify({
  dateMatchStrategy: 'closest',
  maxDateDifference: 45,
  missingSourceBehavior: 'skip',
  anchorMetric: CMJ,
});

const expectedW = (inches: number, lb: number) => 60.7 * inches * 2.54 + 45.3 * lb * 0.45359237 - 2055;
const expectedRel = (inches: number, lb: number) => expectedW(inches, lb) / (lb * 0.45359237);

const seedMetrics = async () => {
  await db.execute(sql`
    INSERT INTO site_metrics (code, label, category, unit, metric_type, is_system_default, is_active, display_order, decimal_precision)
    VALUES
      (${CMJ}, 'Test CMJ HOH', 'Power', 'in', 'higher_is_better', false, true, 910, 1),
      (${CMJ_L}, 'Test CMJ SL L', 'Power', 'in', 'higher_is_better', false, true, 911, 1),
      (${CMJ_R}, 'Test CMJ SL R', 'Power', 'in', 'higher_is_better', false, true, 912, 1),
      (${WEIGHT}, 'Test weight', 'Physical', 'lbs', 'tracking', false, true, 913, 3)
    ON CONFLICT (code) DO NOTHING
  `);
  for (const [code, unit, formula, prec, order] of [
    [PP_W, 'W', W_FORMULA, 0, 914],
    [PP_REL, 'W/kg', REL_FORMULA, 1, 915],
  ] as const) {
    await db.execute(sql`
      INSERT INTO site_metrics (
        code, label, category, unit, metric_type, is_system_default, is_active, display_order, decimal_precision,
        is_derived, formula, dependent_metrics, calculation_config
      ) VALUES (
        ${code}, ${code}, 'Power', ${unit}, 'tracking', false, true, ${order}, ${prec},
        true, ${formula}, ARRAY[${CMJ}, ${WEIGHT}], ${CONFIG}::jsonb
      )
      ON CONFLICT (code) DO UPDATE SET
        is_derived = true, is_active = true, formula = EXCLUDED.formula,
        dependent_metrics = EXCLUDED.dependent_metrics, calculation_config = EXCLUDED.calculation_config
    `);
  }
};

describe('Sayers peak power (anchored on the restricted CMJ)', () => {
  const service = new MeasurementService();
  let orgId: string;
  let teamId: string;
  let athleteId: string;
  let coachId: string;

  beforeAll(seedMetrics);

  const createdUserIds: string[] = [];

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await db.delete(measurements).where(inArray(measurements.userId, createdUserIds));
    }
    await db.execute(sql`DELETE FROM site_metrics WHERE code IN (${PP_W}, ${PP_REL}, ${CMJ}, ${CMJ_L}, ${CMJ_R}, ${WEIGHT})`);
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [org] = await db.insert(organizations).values({ name: `Say Org ${suffix}` }).returning();
    orgId = org.id;
    const [team] = await db.insert(teams).values({ name: 'Say Team', organizationId: orgId, level: 'College' }).returning();
    teamId = team.id;
    const [athlete] = await db
      .insert(users)
      .values({
        username: `say-ath-${suffix}`,
        emails: [`say-ath-${suffix}@test.com`],
        password: 'x',
        firstName: 'Say',
        lastName: 'Athlete',
        fullName: 'Say Athlete',
        birthDate: '2008-01-01',
        birthYear: 2008,
      } as any)
      .returning();
    athleteId = athlete.id;
    createdUserIds.push(athleteId);
    const [coach] = await db
      .insert(users)
      .values({
        username: `say-coach-${suffix}`,
        emails: [`say-coach-${suffix}@test.com`],
        password: 'x',
        firstName: 'Say',
        lastName: 'Coach',
        fullName: 'Say Coach',
      } as any)
      .returning();
    coachId = coach.id;
    createdUserIds.push(coachId);
    await db.insert(userOrganizations).values({ userId: athleteId, organizationId: orgId, role: 'athlete' } as any);
    await db.insert(userTeams).values({ userId: athleteId, teamId, joinedAt: new Date('2020-01-01'), isActive: true });
  });

  afterEach(async () => {
    await db.delete(measurements).where(eq(measurements.userId, athleteId));
    await db.delete(userTeams).where(eq(userTeams.userId, athleteId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, orgId));
    await db.delete(teams).where(eq(teams.organizationId, orgId));
    await db.delete(users).where(inArray(users.id, [athleteId, coachId]));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  const add = (metric: string, value: number, date: string) =>
    service.createMeasurement({ userId: athleteId, metric, value, date } as any, coachId, 'coach');

  const rowsFor = async (code: string) =>
    db
      .select()
      .from(measurements)
      .where(and(eq(measurements.userId, athleteId), eq(measurements.metric, code)))
      .orderBy(measurements.date);

  const dates = async (code = PP_W) => (await rowsFor(code)).map((r) => r.date);

  it('reference vector: 150 lb and 20 in give 4110.72 W and 60.42 W/kg (68.0389 kg), both on the CMJ date', async () => {
    await add(WEIGHT, 150, '2026-03-01');
    await add(CMJ, 20, '2026-03-10');
    const [w] = await rowsFor(PP_W);
    const [rel] = await rowsFor(PP_REL);
    expect(w.date).toBe('2026-03-10');
    expect(rel.date).toBe('2026-03-10');
    expect(Number(w.value)).toBeCloseTo(4110.72, 1);
    expect(Number(rel.value)).toBeCloseTo(60.42, 1);
    expect(Number(w.value)).toBeCloseTo(expectedW(20, 150), 2);
    expect(Number(rel.value)).toBeCloseTo(expectedRel(20, 150), 2);
    expect(w.isCalculated).toBe(true);
    expect(w.units).toBe('W');
    expect(rel.units).toBe('W/kg');
    expect(w.organizationId).toBe(orgId);
  });

  it('weight entered after the CMJ creates the rows on the CMJ date only', async () => {
    await add(CMJ, 20, '2026-03-10');
    expect(await dates()).toEqual([]);
    await add(WEIGHT, 150, '2026-03-01');
    expect(await dates()).toEqual(['2026-03-10']);
    expect(await dates(PP_REL)).toEqual(['2026-03-10']);
  });

  it('one weight fans out to two CMJs in its window', async () => {
    await add(CMJ, 20, '2026-03-10');
    await add(CMJ, 22, '2026-04-05');
    await add(WEIGHT, 150, '2026-03-20');
    expect(await dates()).toEqual(['2026-03-10', '2026-04-05']);
    const rows = await rowsFor(PP_W);
    expect(Number(rows[0].value)).toBeCloseTo(expectedW(20, 150), 1);
    expect(Number(rows[1].value)).toBeCloseTo(expectedW(22, 150), 1);
  });

  it('two CMJs on the same day: one row per metric, from the highest jump', async () => {
    await add(WEIGHT, 150, '2026-03-01');
    await add(CMJ, 20, '2026-03-10');
    await add(CMJ, 24, '2026-03-10');
    const rows = await rowsFor(PP_W);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].value)).toBeCloseTo(expectedW(24, 150), 1);
    expect(await rowsFor(PP_REL)).toHaveLength(1);
  });

  it('two weights on the same day: the LOWEST weight is used (tracking metric, pinned)', async () => {
    await add(WEIGHT, 170, '2026-03-01');
    await add(WEIGHT, 150, '2026-03-01');
    await add(CMJ, 20, '2026-03-10');
    const [row] = await rowsFor(PP_W);
    expect(Number(row.value)).toBeCloseTo(expectedW(20, 150), 1);
  });

  it('a closer later weight beats an older earlier one', async () => {
    await add(WEIGHT, 150, '2026-02-10');
    await add(WEIGHT, 170, '2026-03-14');
    await add(CMJ, 20, '2026-03-10');
    const [row] = await rowsFor(PP_W);
    expect(Number(row.value)).toBeCloseTo(expectedW(20, 170), 1);
  });

  it('weight 60 days away (stale) gives no row', async () => {
    await add(WEIGHT, 150, '2026-01-09');
    await add(CMJ, 20, '2026-03-10');
    expect(await dates()).toEqual([]);
    expect(await dates(PP_REL)).toEqual([]);
  });

  it('a CMJ with no weight at all gives no row and no warning', async () => {
    const cmj = (await add(CMJ, 20, '2026-03-10')) as any;
    expect('warnings' in cmj).toBe(false);
    expect(await dates()).toEqual([]);
  });

  it('single-leg CMJs alone (no restricted CMJ) give no row', async () => {
    await add(WEIGHT, 150, '2026-03-01');
    await add(CMJ_L, 10, '2026-03-10');
    await add(CMJ_R, 10, '2026-03-10');
    expect(await dates()).toEqual([]);
    expect(await dates(PP_REL)).toEqual([]);
  });

  it('an unverified CMJ gives no row; verifying it creates them', async () => {
    await add(WEIGHT, 150, '2026-03-01');
    const [cmj] = await db
      .insert(measurements)
      .values({
        userId: athleteId,
        submittedBy: coachId,
        metric: CMJ,
        value: '20',
        units: 'in',
        date: '2026-03-10',
        age: 18,
        isVerified: false,
        organizationId: orgId,
      } as any)
      .returning();
    await new DerivedMetricCalculator(db).processNewMeasurement(cmj);
    expect(await dates()).toEqual([]);
    await service.verifyMeasurement(cmj.id, coachId);
    expect(await dates()).toEqual(['2026-03-10']);
  });

  it('a weight of 0 gives no relative row (no Infinity or NaN) but still the absolute peak power', async () => {
    await add(CMJ, 20, '2026-03-10');
    const [w0] = await db
      .insert(measurements)
      .values({
        userId: athleteId,
        submittedBy: coachId,
        metric: WEIGHT,
        value: '0',
        units: 'lbs',
        date: '2026-03-01',
        age: 18,
        isVerified: true,
        organizationId: orgId,
      } as any)
      .returning();
    await new DerivedMetricCalculator(db).processNewMeasurement(w0);
    expect(await dates(PP_REL)).toEqual([]);
    // 60.7 * 20 in * 2.54 - 2055 = 1028.56 W
    const [w] = await rowsFor(PP_W);
    expect(Number(w.value)).toBeCloseTo(1028.56, 1);
  });

  it('a negative result (tiny jump, low mass) is stored as computed', async () => {
    await add(WEIGHT, 50, '2026-03-01');
    await add(CMJ, 5, '2026-03-10');
    const [w] = await rowsFor(PP_W);
    expect(Number(w.value)).toBeLessThan(0);
    expect(Number(w.value)).toBeCloseTo(expectedW(5, 50), 1);
    const [rel] = await rowsFor(PP_REL);
    expect(Number(rel.value)).toBeCloseTo(expectedRel(5, 50), 1);
  });

  it('editing the CMJ recalculates; editing the weight recalculates', async () => {
    const weight = await add(WEIGHT, 150, '2026-03-01');
    const cmj = await add(CMJ, 20, '2026-03-10');
    await service.updateMeasurement(cmj.id, { value: 22 } as any, undefined, 'coach');
    expect(Number((await rowsFor(PP_W))[0].value)).toBeCloseTo(expectedW(22, 150), 1);
    await service.updateMeasurement(weight.id, { value: 160 } as any, undefined, 'coach');
    expect(Number((await rowsFor(PP_W))[0].value)).toBeCloseTo(expectedW(22, 160), 1);
    expect(Number((await rowsFor(PP_REL))[0].value)).toBeCloseTo(expectedRel(22, 160), 1);
  });

  it('deleting the weight removes the rows', async () => {
    const weight = await add(WEIGHT, 150, '2026-03-01');
    await add(CMJ, 20, '2026-03-10');
    await service.deleteMeasurement(weight.id);
    expect(await dates()).toEqual([]);
    expect(await dates(PP_REL)).toEqual([]);
  });

  it('deleting a CMJ removes its rows and keeps the other CMJ rows', async () => {
    await add(WEIGHT, 150, '2026-03-02');
    await add(CMJ, 20, '2026-03-10');
    const cmj2 = await add(CMJ, 21, '2026-03-12');
    expect(await dates()).toEqual(['2026-03-10', '2026-03-12']);
    await service.deleteMeasurement(cmj2.id);
    expect(await dates()).toEqual(['2026-03-10']);
    expect(await dates(PP_REL)).toEqual(['2026-03-10']);
  });

  it('backfill (createMissing) creates rows only on CMJ dates, not weight dates', async () => {
    const base = { userId: athleteId, submittedBy: coachId, age: 18, isVerified: true, organizationId: orgId };
    await db.insert(measurements).values([
      { ...base, metric: WEIGHT, value: '150', units: 'lbs', date: '2026-03-01' },
      { ...base, metric: CMJ, value: '20', units: 'in', date: '2026-03-10' },
      { ...base, metric: CMJ, value: '22', units: 'in', date: '2026-04-05' },
    ] as any);
    for (const code of [PP_W, PP_REL]) {
      const result = await new DerivedMetricCalculator(db).recalculateAllDerivedMetrics({
        metricCode: code,
        organizationId: orgId,
        createMissing: true,
      });
      expect(result.errors).toEqual([]);
      expect(await dates(code)).toEqual(['2026-03-10', '2026-04-05']);
    }
  });
  it('dry run and real run both report deleted:1 when a direct measurement coexists with the calculated row', async () => {
    const base = { userId: athleteId, submittedBy: coachId, age: 18, isVerified: true, organizationId: orgId, date: '2026-03-10' };
    await db.insert(measurements).values([
      { ...base, metric: WEIGHT, value: '150', units: 'lbs' },
      { ...base, metric: CMJ, value: '20', units: 'in' },
      { ...base, metric: PP_W, value: '4000', units: 'W', isCalculated: true },
      { ...base, metric: PP_W, value: '4100', units: 'W', isCalculated: false },
    ] as any);
    const run = (dryRun: boolean) =>
      new DerivedMetricCalculator(db).recalculateAllDerivedMetrics({
        metricCode: PP_W, organizationId: orgId, createMissing: false, dryRun,
      });
    const dry = await run(true);
    expect(dry.deleted).toBe(1);
    expect(dry.recalculated).toBe(0);
    const real = await run(false);
    expect(real.deleted).toBe(1);
    expect(real.recalculated).toBe(0);
  });
});
