/**
 * AM-FEAT-018 Phases 0+2: anchored derived metric (MOMENTUM-like) calculator behavior.
 *
 * The real MOMENTUM migration is not part of this change, so the tests seed their own
 * derived metric (TST_MOMENTUM) and weight metric (TST_BODY_WT) with the configuration
 * the migration will use:
 *   calculationConfig {dateMatchStrategy:'closest', maxDateDifference:45, anchorMetric:'FLY10_TIME'}
 *   dependent_metrics ['FLY10_TIME', 'TST_BODY_WT']
 *
 * Run with TZ=UTC (the 'closest' window arithmetic is local-time based).
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { sql, and, eq, inArray } from 'drizzle-orm';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../../packages/api/db';
import { MeasurementService } from '../../packages/api/services/measurement-service';
import { DerivedMetricCalculator } from '../../packages/api/services/derived-metric-calculator';
import { reconcileDerivedTotals } from '../../packages/api/services/derived-total-reconciliation';
import {
  measurements,
  organizations,
  teams,
  userTeams,
  users,
  userOrganizations,
} from '@shared/schema';

const DERIVED = 'TST_MOMENTUM';
const WEIGHT = 'TST_BODY_WT';
const FLY = 'FLY10_TIME';
const FLY_RI = 'FLY10_TIME_RI10';

const seedMetrics = async () => {
  await db.execute(sql`
    INSERT INTO site_metrics (code, label, category, unit, metric_type, is_system_default, is_active, display_order, decimal_precision)
    VALUES
      (${WEIGHT}, 'Test body weight', 'Anthropometrics', 'lb', 'tracking', false, true, 900, 1),
      (${FLY_RI}, 'Test fly run-in 10', 'Speed', 's', 'lower_is_better', false, true, 901, 2)
    ON CONFLICT (code) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO site_metrics (
      code, label, category, unit, metric_type, is_system_default, is_active, display_order, decimal_precision,
      is_derived, formula, dependent_metrics, calculation_config
    ) VALUES (
      ${DERIVED}, 'Test momentum', 'Power', 'kg*m/s', 'tracking', false, true, 902, 1,
      true,
      ${`${WEIGHT.toLowerCase()} * 0.45359237 * 9.144 / fly10_time`},
      ARRAY[${FLY}, ${WEIGHT}],
      '{"dateMatchStrategy":"closest","maxDateDifference":45,"missingSourceBehavior":"skip","anchorMetric":"FLY10_TIME"}'::jsonb
    )
    ON CONFLICT (code) DO UPDATE SET
      is_derived = true, is_active = true, formula = EXCLUDED.formula,
      dependent_metrics = EXCLUDED.dependent_metrics, calculation_config = EXCLUDED.calculation_config
  `);
};

describe('Anchored derived metric (MOMENTUM-like)', () => {
  const service = new MeasurementService();
  let orgId: string;
  let teamId: string;
  let athleteId: string;
  let coachId: string;

  beforeAll(seedMetrics);

  afterAll(async () => {
    await db.execute(sql`DELETE FROM measurements WHERE metric IN (${DERIVED}, ${WEIGHT}, ${FLY_RI})`);
    await db.execute(sql`DELETE FROM site_metrics WHERE code IN (${DERIVED}, ${WEIGHT}, ${FLY_RI})`);
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [org] = await db.insert(organizations).values({ name: `Mom Org ${suffix}` }).returning();
    orgId = org.id;
    const [team] = await db
      .insert(teams)
      .values({ name: 'Mom Team', organizationId: orgId, level: 'College' })
      .returning();
    teamId = team.id;
    const [athlete] = await db
      .insert(users)
      .values({
        username: `mom-ath-${suffix}`,
        emails: [`mom-ath-${suffix}@test.com`],
        password: 'x',
        firstName: 'Mom',
        lastName: 'Athlete',
        fullName: 'Mom Athlete',
        birthDate: '2008-01-01',
        birthYear: 2008,
      } as any)
      .returning();
    athleteId = athlete.id;
    const [coach] = await db
      .insert(users)
      .values({
        username: `mom-coach-${suffix}`,
        emails: [`mom-coach-${suffix}@test.com`],
        password: 'x',
        firstName: 'Mom',
        lastName: 'Coach',
        fullName: 'Mom Coach',
      } as any)
      .returning();
    coachId = coach.id;
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

  const derivedRows = async () =>
    db
      .select()
      .from(measurements)
      .where(and(eq(measurements.userId, athleteId), eq(measurements.metric, DERIVED)))
      .orderBy(measurements.date);

  const derivedDates = async () => (await derivedRows()).map((r) => r.date);

  const expected = (lb: number, fly: number) => (lb * 0.45359237 * 9.144) / fly;

  it('fly then weight: derived exists on the fly date and NONE on the weight date', async () => {
    await add(FLY, 1.3, '2026-03-10');
    expect(await derivedDates()).toEqual([]);
    await add(WEIGHT, 150, '2026-03-01');
    expect(await derivedDates()).toEqual(['2026-03-10']);
  });

  it('weight then fly: derived on the fly date only', async () => {
    await add(WEIGHT, 150, '2026-03-01');
    expect(await derivedDates()).toEqual([]);
    await add(FLY, 1.3, '2026-03-10');
    expect(await derivedDates()).toEqual(['2026-03-10']);
  });

  it('formula: 150 lb and 1.30 s gives 478.6 kg*m/s', async () => {
    await add(WEIGHT, 150, '2026-03-01');
    await add(FLY, 1.3, '2026-03-10');
    const [row] = await derivedRows();
    expect(Math.abs(Number(row.value) - 478.6)).toBeLessThanOrEqual(0.1);
    expect(Number(row.value)).toBeCloseTo(expected(150, 1.3), 2);
    expect(row.isCalculated).toBe(true);
    expect(row.units).toBe('kg*m/s');
  });

  it('two flies within 45 days of one weight both get a derived value, none on the weight date', async () => {
    await add(WEIGHT, 150, '2026-03-01');
    await add(FLY, 1.3, '2026-03-10');
    await add(FLY, 1.25, '2026-04-05');
    expect(await derivedDates()).toEqual(['2026-03-10', '2026-04-05']);
  });

  it('a weight added later fans out to every fly in its window', async () => {
    await add(FLY, 1.3, '2026-03-10');
    await add(FLY, 1.25, '2026-04-05');
    await add(WEIGHT, 150, '2026-03-20');
    expect(await derivedDates()).toEqual(['2026-03-10', '2026-04-05']);
  });

  it('weight 10 days before the fly is used', async () => {
    await add(WEIGHT, 150, '2026-02-28');
    await add(FLY, 1.3, '2026-03-10');
    expect(await derivedDates()).toEqual(['2026-03-10']);
  });

  it('weight 60 days before the fly (outside the window) gives no derived value', async () => {
    await add(WEIGHT, 150, '2026-01-09');
    await add(FLY, 1.3, '2026-03-10');
    expect(await derivedDates()).toEqual([]);
  });

  it('a closer later weight beats an older earlier one', async () => {
    await add(WEIGHT, 150, '2026-02-10'); // 28 days before
    await add(WEIGHT, 170, '2026-03-14'); // 4 days after
    await add(FLY, 1.3, '2026-03-10');
    const [row] = await derivedRows();
    expect(Number(row.value)).toBeCloseTo(expected(170, 1.3), 2);
  });

  it('deleting a fly removes its derived row but keeps the other fly derived row', async () => {
    await add(WEIGHT, 150, '2026-03-01');
    const fly1 = await add(FLY, 1.3, '2026-03-10');
    await add(FLY, 1.25, '2026-04-05');
    expect(await derivedDates()).toEqual(['2026-03-10', '2026-04-05']);
    await service.deleteMeasurement(fly1.id);
    expect(await derivedDates()).toEqual(['2026-04-05']);
  });

  it('moving the weight out of the window removes the derived value', async () => {
    const weight = await add(WEIGHT, 150, '2026-03-01');
    await add(FLY, 1.3, '2026-03-10');
    expect(await derivedDates()).toEqual(['2026-03-10']);
    await service.updateMeasurement(weight.id, { date: '2025-12-01' } as any, undefined, 'coach');
    expect(await derivedDates()).toEqual([]);
  });

  it('moving a fly to another date moves the derived row', async () => {
    await add(WEIGHT, 150, '2026-03-01');
    const fly = await add(FLY, 1.3, '2026-03-10');
    await service.updateMeasurement(fly.id, { date: '2026-03-12' } as any, undefined, 'coach');
    expect(await derivedDates()).toEqual(['2026-03-12']);
  });

  it('deleting the weight removes derived values on all flies in its window', async () => {
    const weight = await add(WEIGHT, 150, '2026-03-01');
    await add(FLY, 1.3, '2026-03-10');
    await add(FLY, 1.25, '2026-04-05');
    await service.deleteMeasurement(weight.id);
    expect(await derivedDates()).toEqual([]);
  });

  it('an unverified fly yields no derived value on that date', async () => {
    await add(WEIGHT, 150, '2026-03-01');
    const [unverified] = await db
      .insert(measurements)
      .values({
        userId: athleteId,
        submittedBy: coachId,
        metric: FLY,
        value: '1.3',
        units: 's',
        date: '2026-03-10',
        age: 18,
        isVerified: false,
        organizationId: orgId,
      } as any)
      .returning();
    await new DerivedMetricCalculator(db).processNewMeasurement(unverified);
    expect(await derivedDates()).toEqual([]);
  });

  it('a FLY10_TIME_RI* fly alone yields no derived value', async () => {
    await add(WEIGHT, 150, '2026-03-01');
    await add(FLY_RI, 1.3, '2026-03-10');
    expect(await derivedDates()).toEqual([]);
  });

  it('backfill (createMissing) creates rows only on fly dates, not weight dates', async () => {
    const base = {
      userId: athleteId,
      submittedBy: coachId,
      age: 18,
      isVerified: true,
      organizationId: orgId,
    };
    await db.insert(measurements).values([
      { ...base, metric: WEIGHT, value: '150', units: 'lb', date: '2026-03-01' },
      { ...base, metric: FLY, value: '1.3', units: 's', date: '2026-03-10' },
      { ...base, metric: FLY, value: '1.25', units: 's', date: '2026-04-05' },
    ] as any);
    const result = await new DerivedMetricCalculator(db).recalculateAllDerivedMetrics({
      metricCode: DERIVED,
      organizationId: orgId,
      createMissing: true,
    });
    expect(result.errors).toEqual([]);
    expect(await derivedDates()).toEqual(['2026-03-10', '2026-04-05']);
  });
  it('a failing anchored post-commit recalculation surfaces as a DERIVED_TOTAL_STALE warning (#526)', async () => {
    await add(FLY, 1.3, '2026-03-10');
    const spy = vi
      .spyOn(DerivedMetricCalculator.prototype as any, 'computeAndUpsertDerived')
      .mockRejectedValue(new Error('deadlock detected'));
    try {
      const w = (await add(WEIGHT, 150, '2026-03-01')) as any;
      expect(w.id).toBeTruthy();
      // The stale total is the one on the fly date, not the weight date
      expect(w.warnings).toEqual([
        { code: 'DERIVED_TOTAL_STALE', metric: DERIVED, date: '2026-03-10', userId: athleteId },
      ]);
    } finally {
      spy.mockRestore();
    }
  });

  it('getFailures() records an anchored recalculation failure', async () => {
    // Fixture first, without the spy, so only the deferred weight recalculation can fail
    await add(FLY, 1.3, '2026-03-10');
    const weight = await add(WEIGHT, 150, '2026-03-01');
    const calc = new DerivedMetricCalculator(db);
    const spy = vi
      .spyOn(DerivedMetricCalculator.prototype as any, 'computeAndUpsertDerived')
      .mockRejectedValue(new Error('boom'));
    try {
      await calc.processNewMeasurement(weight as any);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(calc.getFailures()).toEqual([{ metric: DERIVED, date: '2026-03-10', userId: athleteId }]);
    } finally {
      spy.mockRestore();
    }
  });

  it('reconcileDerivedTotals skips a closest-strategy anchored metric', async () => {
    const result = await reconcileDerivedTotals(db, { dryRun: true });
    expect(result.skippedMetrics).toContain(DERIVED);
    expect(result.metricsChecked).not.toContain(DERIVED);
  });
  it('a failure on the first fly date does not skip the later fly dates; only the failed date is recorded', async () => {
    await add(FLY, 1.3, '2026-03-10');
    await add(FLY, 1.25, '2026-04-05');
    const original = (DerivedMetricCalculator.prototype as any).computeAndUpsertDerived;
    const spy = vi
      .spyOn(DerivedMetricCalculator.prototype as any, 'computeAndUpsertDerived')
      .mockImplementation(function (this: any, ...args: any[]) {
        if (args[3] === '2026-03-10') return Promise.reject(new Error('deadlock detected'));
        return original.apply(this, args);
      });
    try {
      const w = (await add(WEIGHT, 150, '2026-03-20')) as any;
      expect(w.warnings).toEqual([
        { code: 'DERIVED_TOTAL_STALE', metric: DERIVED, date: '2026-03-10', userId: athleteId },
      ]);
    } finally {
      spy.mockRestore();
    }
    expect(await derivedDates()).toEqual(['2026-04-05']);
  });
  it('a fly value edit updates the derived value', async () => {
    await add(WEIGHT, 150, '2026-03-01');
    const fly = await add(FLY, 1.3, '2026-03-10');
    await service.updateMeasurement(fly.id, { value: 1.2 } as any, undefined, 'coach');
    const rows = await derivedRows();
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].value)).toBeCloseTo(expected(150, 1.2), 1);
  });

  it('formula: 180 lb and 1.15 s gives 649.2 kg*m/s', async () => {
    await add(WEIGHT, 180, '2026-03-01');
    await add(FLY, 1.15, '2026-03-10');
    const [row] = await derivedRows();
    expect(Math.abs(Number(row.value) - 649.2)).toBeLessThanOrEqual(0.1);
    expect(Number(row.value)).toBeCloseTo(expected(180, 1.15), 1);
  });

  it('a fly with no weight at all is skipped without an error or warning', async () => {
    const fly = (await add(FLY, 1.3, '2026-03-10')) as any;
    expect(fly.id).toBeTruthy();
    expect('warnings' in fly).toBe(false);
    expect(await derivedDates()).toEqual([]);
  });

  it('backfill with dependentMetrics ordered [weight, fly] still creates rows on fly dates only', async () => {
    const DERIVED_B = 'TST_MOMENTUM_B';
    await db.execute(sql`
      INSERT INTO site_metrics (
        code, label, category, unit, metric_type, is_system_default, is_active, display_order, decimal_precision,
        is_derived, formula, dependent_metrics, calculation_config
      ) VALUES (
        ${DERIVED_B}, 'Test momentum B', 'Power', 'kg*m/s', 'tracking', false, true, 903, 1,
        true, ${`${WEIGHT.toLowerCase()} * 0.45359237 * 9.144 / fly10_time`},
        ARRAY[${WEIGHT}, ${FLY}],
        '{"dateMatchStrategy":"closest","maxDateDifference":45,"missingSourceBehavior":"skip","anchorMetric":"FLY10_TIME"}'::jsonb
      )
      ON CONFLICT (code) DO UPDATE SET is_derived = true, is_active = true, dependent_metrics = EXCLUDED.dependent_metrics, calculation_config = EXCLUDED.calculation_config
    `);
    try {
      const base = { userId: athleteId, submittedBy: coachId, age: 18, isVerified: true, organizationId: orgId };
      await db.insert(measurements).values([
        { ...base, metric: WEIGHT, value: '150', units: 'lb', date: '2026-03-01' },
        { ...base, metric: FLY, value: '1.3', units: 's', date: '2026-03-10' },
      ] as any);
      const result = await new DerivedMetricCalculator(db).recalculateAllDerivedMetrics({
        metricCode: DERIVED_B,
        organizationId: orgId,
        createMissing: true,
      });
      expect(result.errors).toEqual([]);
      const rows = await db
        .select()
        .from(measurements)
        .where(and(eq(measurements.userId, athleteId), eq(measurements.metric, DERIVED_B)));
      expect(rows.map((r) => r.date)).toEqual(['2026-03-10']);
    } finally {
      await db.execute(sql`DELETE FROM measurements WHERE metric = ${DERIVED_B}`);
      await db.execute(sql`DELETE FROM site_metrics WHERE code = ${DERIVED_B}`);
    }
  });
  it('recalculation triggered with [fly, weight] and one date refreshes the derived value on OTHER fly dates in the window', async () => {
    const base = { userId: athleteId, submittedBy: coachId, age: 18, isVerified: true, organizationId: orgId };
    await db.insert(measurements).values([
      { ...base, metric: FLY, value: '1.3', units: 's', date: '2026-03-10' },
      { ...base, metric: FLY, value: '1.25', units: 's', date: '2026-04-05' },
      { ...base, metric: WEIGHT, value: '150', units: 'lb', date: '2026-03-20' },
    ] as any);
    await new DerivedMetricCalculator(db).recalculateForAthlete(athleteId, [FLY, WEIGHT], '2026-03-20');
    expect(await derivedDates()).toEqual(['2026-03-10', '2026-04-05']);
  });

  it('the deferred post-commit pass does not re-run anchored metrics whose anchor is the inserted metric', async () => {
    const ALT = 'TST_MOMENTUM_ALT';
    await db.execute(sql`
      INSERT INTO site_metrics (
        code, label, category, unit, metric_type, is_system_default, is_active, display_order, decimal_precision,
        is_derived, formula, dependent_metrics, calculation_config
      ) VALUES (
        ${ALT}, 'Test momentum alt', 'Power', 'kg*m/s', 'tracking', false, true, 904, 1,
        true, ${`${WEIGHT.toLowerCase()} * 0.45359237 * 9.144 / fly10_time`},
        ARRAY[${WEIGHT}, ${FLY}],
        '{"dateMatchStrategy":"closest","maxDateDifference":45,"missingSourceBehavior":"skip","anchorMetric":"TST_BODY_WT"}'::jsonb
      )
      ON CONFLICT (code) DO UPDATE SET is_derived = true, is_active = true, dependent_metrics = EXCLUDED.dependent_metrics, calculation_config = EXCLUDED.calculation_config
    `);
    const original = (DerivedMetricCalculator.prototype as any).computeAndUpsertDerived;
    const calls: Array<[string, string]> = [];
    const spy = vi
      .spyOn(DerivedMetricCalculator.prototype as any, 'computeAndUpsertDerived')
      .mockImplementation(function (this: any, ...args: any[]) {
        calls.push([args[1].code, args[3]]);
        return original.apply(this, args);
      });
    try {
      await add(WEIGHT, 150, '2026-03-01');
      calls.length = 0;
      await add(FLY, 1.3, '2026-03-10');
      // DERIVED (anchor = fly) is computed once, inside the transaction; ALT (anchor = weight) is deferred
      expect(calls.filter(([c]) => c === DERIVED)).toEqual([[DERIVED, '2026-03-10']]);
      expect(calls.filter(([c]) => c === ALT).length).toBeGreaterThan(0);
    } finally {
      spy.mockRestore();
      await db.execute(sql`DELETE FROM measurements WHERE metric = ${ALT}`);
      await db.execute(sql`DELETE FROM site_metrics WHERE code = ${ALT}`);
    }
  });
  it('a fly delete recalculated together with the weight (multi-metric trigger) removes the derived row on the fly date', async () => {
    await add(WEIGHT, 150, '2026-03-01');
    const fly = await add(FLY, 1.3, '2026-03-10');
    expect(await derivedDates()).toEqual(['2026-03-10']);
    await db.delete(measurements).where(eq(measurements.id, fly.id));
    await new DerivedMetricCalculator(db).recalculateForAthlete(athleteId, [FLY, WEIGHT], '2026-03-10');
    expect(await derivedDates()).toEqual([]);
  });
});
