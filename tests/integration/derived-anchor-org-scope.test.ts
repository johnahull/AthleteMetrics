/**
 * Anchored derived metrics (MOMENTUM, Sayers peak power) must never mix organizations.
 *
 * Rule: the non-anchor sources of an anchored metric are the athlete's own rows that are in the
 * ANCHOR measurement's organization or personal (organization null), never another
 * organization's; the derived row always takes the ANCHOR measurement's organization, whichever
 * source was entered last.
 *
 * Run with TZ=UTC (see derived-momentum.test.ts).
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { sql, and, eq, inArray } from 'drizzle-orm';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../../packages/api/db';
import { DerivedMetricCalculator } from '../../packages/api/services/derived-metric-calculator';
import { MeasurementService } from '../../packages/api/services/measurement-service';
import { measurements, organizations, teams, users } from '@shared/schema';

const DERIVED = 'TST_OS_MOMENTUM';
const ANCHOR = 'TST_OS_FLY';
const WEIGHT = 'TST_OS_WT';

const seedMetrics = async () => {
  await db.execute(sql`
    INSERT INTO site_metrics (code, label, category, unit, metric_type, is_system_default, is_active, display_order, decimal_precision)
    VALUES
      (${ANCHOR}, 'Test fly', 'Speed', 's', 'lower_is_better', false, true, 920, 2),
      (${WEIGHT}, 'Test weight', 'Physical', 'lbs', 'tracking', false, true, 921, 1)
    ON CONFLICT (code) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO site_metrics (
      code, label, category, unit, metric_type, is_system_default, is_active, display_order, decimal_precision,
      is_derived, formula, dependent_metrics, calculation_config
    ) VALUES (
      ${DERIVED}, 'Test momentum', 'Power', 'kg*m/s', 'tracking', false, true, 922, 1,
      true,
      ${`${WEIGHT.toLowerCase()} * 0.45359237 * 9.144 / ${ANCHOR.toLowerCase()}`},
      ARRAY[${ANCHOR}, ${WEIGHT}],
      ${JSON.stringify({ dateMatchStrategy: 'closest', maxDateDifference: 45, missingSourceBehavior: 'skip', anchorMetric: ANCHOR })}::jsonb
    )
    ON CONFLICT (code) DO UPDATE SET
      is_derived = true, is_active = true, formula = EXCLUDED.formula,
      dependent_metrics = EXCLUDED.dependent_metrics, calculation_config = EXCLUDED.calculation_config
  `);
};

describe('Anchored derived metric: organization scoping', () => {
  let orgA: string;
  let orgB: string;
  let athleteId: string;
  let coachId: string;
  const createdUserIds: string[] = [];

  beforeAll(seedMetrics);

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await db.delete(measurements).where(inArray(measurements.userId, createdUserIds));
    }
    await db.execute(sql`DELETE FROM site_metrics WHERE code IN (${DERIVED}, ${ANCHOR}, ${WEIGHT})`);
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    [{ id: orgA }] = await db.insert(organizations).values({ name: `OS Org A ${suffix}` }).returning();
    [{ id: orgB }] = await db.insert(organizations).values({ name: `OS Org B ${suffix}` }).returning();
    const mk = async (tag: string) => {
      const [u] = await db
        .insert(users)
        .values({
          username: `os-${tag}-${suffix}`,
          emails: [`os-${tag}-${suffix}@test.com`],
          password: 'x',
          firstName: 'OS',
          lastName: tag,
          fullName: `OS ${tag}`,
          birthDate: '2008-01-01',
          birthYear: 2008,
        } as any)
        .returning();
      createdUserIds.push(u.id);
      return u.id;
    };
    athleteId = await mk('ath');
    coachId = await mk('coach');
  });

  afterEach(async () => {
    await db.delete(measurements).where(eq(measurements.userId, athleteId));
    await db.delete(users).where(inArray(users.id, [athleteId, coachId]));
    await db.delete(teams).where(inArray(teams.organizationId, [orgA, orgB]));
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
  });

  // Insert a verified direct row in `org` (null = personal) and run the post-insert calculation.
  const put = async (metric: string, value: number, date: string, org: string | null) => {
    const [row] = await db
      .insert(measurements)
      .values({
        userId: athleteId,
        submittedBy: coachId,
        metric,
        value: String(value),
        units: metric === ANCHOR ? 's' : 'lbs',
        date,
        age: 18,
        isVerified: true,
        organizationId: org,
      } as any)
      .returning();
    await new DerivedMetricCalculator(db).processNewMeasurement(row);
    return row;
  };

  const derived = async () =>
    db
      .select()
      .from(measurements)
      .where(and(eq(measurements.userId, athleteId), eq(measurements.metric, DERIVED)))
      .orderBy(measurements.date);

  const expected = (lb: number, fly: number) => (lb * 0.45359237 * 9.144) / fly;

  describe('org anchor + personal weight', () => {
    it('weight first: used, and the row takes the anchor organization', async () => {
      await put(WEIGHT, 150, '2026-03-01', null);
      await put(ANCHOR, 1.3, '2026-03-10', orgA);
      const rows = await derived();
      expect(rows.map((r) => r.date)).toEqual(['2026-03-10']);
      expect(rows[0].organizationId).toBe(orgA);
      expect(Number(rows[0].value)).toBeCloseTo(expected(150, 1.3), 2);
    });

    it('weight entered after the anchor: used, and the row takes the ANCHOR organization, not the weight (null)', async () => {
      await put(ANCHOR, 1.3, '2026-03-10', orgA);
      await put(WEIGHT, 150, '2026-03-01', null);
      const rows = await derived();
      expect(rows.map((r) => r.date)).toEqual(['2026-03-10']);
      expect(rows[0].organizationId).toBe(orgA);
    });
  });

  describe('org anchor + other-org weight', () => {
    it('weight first: ignored, no row', async () => {
      await put(WEIGHT, 150, '2026-03-01', orgB);
      await put(ANCHOR, 1.3, '2026-03-10', orgA);
      expect(await derived()).toEqual([]);
    });

    it('weight entered after the anchor (from another org): ignored, no row', async () => {
      await put(ANCHOR, 1.3, '2026-03-10', orgA);
      await put(WEIGHT, 150, '2026-03-01', orgB);
      expect(await derived()).toEqual([]);
    });

    it('a closer other-org weight does not displace the anchor organization weight', async () => {
      await put(WEIGHT, 150, '2026-03-01', orgA);
      await put(WEIGHT, 190, '2026-03-09', orgB);
      await put(ANCHOR, 1.3, '2026-03-10', orgA);
      const rows = await derived();
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].value)).toBeCloseTo(expected(150, 1.3), 2);
    });
  });

  describe('org anchor + same-org weight entered after the anchor', () => {
    it('row takes the anchor organization', async () => {
      await put(ANCHOR, 1.3, '2026-03-10', orgA);
      await put(WEIGHT, 150, '2026-03-01', orgA);
      const rows = await derived();
      expect(rows).toHaveLength(1);
      expect(rows[0].organizationId).toBe(orgA);
    });
  });

  describe('personal anchor', () => {
    it('uses a personal weight but never an organization weight', async () => {
      await put(WEIGHT, 150, '2026-03-01', orgA);
      await put(ANCHOR, 1.3, '2026-03-10', null);
      expect(await derived()).toEqual([]);
      await put(WEIGHT, 160, '2026-03-02', null);
      const rows = await derived();
      expect(rows).toHaveLength(1);
      expect(rows[0].organizationId).toBeNull();
      expect(Number(rows[0].value)).toBeCloseTo(expected(160, 1.3), 2);
    });
  });

  describe('backfill (createMissing)', () => {
    it('ignores an other-org weight and uses a personal one, with the anchor organization', async () => {
      const base = { userId: athleteId, submittedBy: coachId, age: 18, isVerified: true };
      await db.insert(measurements).values([
        { ...base, metric: WEIGHT, value: '190', units: 'lbs', date: '2026-03-09', organizationId: orgB },
        { ...base, metric: ANCHOR, value: '1.3', units: 's', date: '2026-03-10', organizationId: orgA },
      ] as any);
      const run = () =>
        new DerivedMetricCalculator(db).recalculateAllDerivedMetrics({
          metricCode: DERIVED,
          organizationId: orgA,
          createMissing: true,
        });
      expect((await run()).errors).toEqual([]);
      expect(await derived()).toEqual([]);

      await db.insert(measurements).values({
        ...base, metric: WEIGHT, value: '150', units: 'lbs', date: '2026-03-01', organizationId: null,
      } as any);
      expect((await run()).errors).toEqual([]);
      const rows = await derived();
      expect(rows).toHaveLength(1);
      expect(rows[0].organizationId).toBe(orgA);
      expect(Number(rows[0].value)).toBeCloseTo(expected(150, 1.3), 2);
    });
  });

  describe('existing derived row with another organization and team (stale context)', () => {
    // A derived row left by an older calculation / inherited from the weight: org B + team B.
    const seedStale = async () => {
      const [teamA] = await db.insert(teams).values({ name: 'OS Team A', organizationId: orgA, level: 'College' }).returning();
      const [teamB] = await db.insert(teams).values({ name: 'OS Team B', organizationId: orgB, level: 'College' }).returning();
      const base = { userId: athleteId, submittedBy: coachId, age: 18, isVerified: true };
      await db.insert(measurements).values([
        { ...base, metric: WEIGHT, value: '150', units: 'lbs', date: '2026-03-01', organizationId: null },
        {
          ...base, metric: ANCHOR, value: '1.3', units: 's', date: '2026-03-10', organizationId: orgA,
          teamId: teamA.id, teamNameSnapshot: 'OS Team A', season: '2026 Spring',
        },
        {
          ...base, metric: DERIVED, value: '1.000', units: 'kg*m/s', date: '2026-03-10', organizationId: orgB,
          teamId: teamB.id, teamNameSnapshot: 'OS Team B', season: '2025 Fall', isCalculated: true, calculatedFromMeasurementIds: [], calculationMetadata: {},
        },
      ] as any);
      return teamA.id;
    };

    it('recalculateForAthlete refreshes the whole context from the anchor row', async () => {
      const teamAId = await seedStale();
      await new DerivedMetricCalculator(db).recalculateForAthlete(athleteId, WEIGHT, '2026-03-01');
      const rows = await derived();
      expect(rows).toHaveLength(1);
      expect(rows[0].organizationId).toBe(orgA);
      expect(rows[0].teamId).toBe(teamAId);
      expect(rows[0].teamNameSnapshot).toBe('OS Team A');
      expect(rows[0].season).toBe('2026 Spring');
      expect(Number(rows[0].value)).toBeCloseTo(expected(150, 1.3), 2);
    });

    it('backfill without createMissing fixes value and organization of the anchor-org row', async () => {
      await seedStale();
      const res = await new DerivedMetricCalculator(db).recalculateAllDerivedMetrics({
        metricCode: DERIVED,
        createMissing: false,
      });
      expect(res.errors).toEqual([]);
      const rows = await derived();
      expect(rows).toHaveLength(1);
      expect(rows[0].organizationId).toBe(orgA);
      expect(Number(rows[0].value)).toBeCloseTo(expected(150, 1.3), 2);
    });

    it('backfill with createMissing does not add a duplicate in the anchor organization', async () => {
      await seedStale();
      const res = await new DerivedMetricCalculator(db).recalculateAllDerivedMetrics({
        metricCode: DERIVED,
        createMissing: true,
      });
      expect(res.errors).toEqual([]);
      const rows = await derived();
      expect(rows).toHaveLength(1);
      expect(rows[0].organizationId).toBe(orgA);
      expect(Number(rows[0].value)).toBeCloseTo(expected(150, 1.3), 2);
    });
  });

  describe('two same-day anchors in different organizations', () => {
    it('backfill creates one row, from the best anchor and its organization', async () => {
      const base = { userId: athleteId, submittedBy: coachId, age: 18, isVerified: true };
      await db.insert(measurements).values([
        { ...base, metric: WEIGHT, value: '150', units: 'lbs', date: '2026-03-01', organizationId: null },
        { ...base, metric: ANCHOR, value: '1.3', units: 's', date: '2026-03-10', organizationId: orgA },
        { ...base, metric: ANCHOR, value: '1.2', units: 's', date: '2026-03-10', organizationId: orgB },
      ] as any);
      const res = await new DerivedMetricCalculator(db).recalculateAllDerivedMetrics({
        metricCode: DERIVED,
        createMissing: true,
      });
      expect(res.errors).toEqual([]);
      expect(res.created).toBe(1);
      const rows = await derived();
      expect(rows).toHaveLength(1);
      expect(rows[0].organizationId).toBe(orgB);
      expect(Number(rows[0].value)).toBeCloseTo(expected(150, 1.2), 2);
    });
  });

  describe('equal-valued anchors on the same day', () => {
    it('the row is built from the same anchor row it takes its context from', async () => {
      await put(WEIGHT, 150, '2026-03-01', orgA);
      await put(ANCHOR, 1.3, '2026-03-10', orgA);
      const newest = await put(ANCHOR, 1.3, '2026-03-10', orgA);
      const [row] = await derived();
      expect(row.calculatedFromMeasurementIds).toContain(newest.id);
    });
  });

  describe('organization-scoped backfill', () => {
    it('does not create a row in another organization whose anchor is the best of the day', async () => {
      const base = { userId: athleteId, submittedBy: coachId, age: 18, isVerified: true };
      await db.insert(measurements).values([
        { ...base, metric: WEIGHT, value: '150', units: 'lbs', date: '2026-03-01', organizationId: null },
        { ...base, metric: ANCHOR, value: '1.3', units: 's', date: '2026-03-10', organizationId: orgA },
        { ...base, metric: ANCHOR, value: '1.2', units: 's', date: '2026-03-10', organizationId: orgB },
      ] as any);
      const res = await new DerivedMetricCalculator(db).recalculateAllDerivedMetrics({
        metricCode: DERIVED,
        organizationId: orgA,
        createMissing: true,
      });
      expect(res.errors).toEqual([]);
      expect(await derived()).toEqual([]);
    });
  });

  describe('best anchor is in an organization without usable sources', () => {
    // A: fly 1.30 + weight. B: better fly 1.25, no weight (and no personal weight).
    const seedAB = async () => {
      await put(WEIGHT, 150, '2026-03-01', orgA);
      await put(ANCHOR, 1.3, '2026-03-10', orgA);
      await put(ANCHOR, 1.25, '2026-03-10', orgB);
    };

    it('processNewMeasurement of the better anchor keeps the org A row', async () => {
      await seedAB();
      const rows = await derived();
      expect(rows).toHaveLength(1);
      expect(rows[0].organizationId).toBe(orgA);
      expect(Number(rows[0].value)).toBeCloseTo(expected(150, 1.3), 2);
    });

    it('backfill (update-only and createMissing) and recalculateForAthlete keep the org A row', async () => {
      await seedAB();
      for (const createMissing of [false, true]) {
        const res = await new DerivedMetricCalculator(db).recalculateAllDerivedMetrics({ metricCode: DERIVED, createMissing });
        expect(res.errors).toEqual([]);
        expect(res.deleted).toBe(0);
      }
      await new DerivedMetricCalculator(db).recalculateForAthlete(athleteId, WEIGHT, '2026-03-01');
      const rows = await derived();
      expect(rows).toHaveLength(1);
      expect(rows[0].organizationId).toBe(orgA);
      expect(Number(rows[0].value)).toBeCloseTo(expected(150, 1.3), 2);
      const anchorA = await db.select().from(measurements).where(and(eq(measurements.userId, athleteId), eq(measurements.metric, ANCHOR), eq(measurements.organizationId, orgA)));
      expect(rows[0].calculatedFromMeasurementIds).toContain(anchorA[0].id);
    });

    it('backfill creates the org A row when none exists yet', async () => {
      const base = { userId: athleteId, submittedBy: coachId, age: 18, isVerified: true };
      await db.insert(measurements).values([
        { ...base, metric: WEIGHT, value: '150', units: 'lbs', date: '2026-03-01', organizationId: orgA },
        { ...base, metric: ANCHOR, value: '1.3', units: 's', date: '2026-03-10', organizationId: orgA },
        { ...base, metric: ANCHOR, value: '1.25', units: 's', date: '2026-03-10', organizationId: orgB },
      ] as any);
      const res = await new DerivedMetricCalculator(db).recalculateAllDerivedMetrics({ metricCode: DERIVED, createMissing: true });
      expect(res.errors).toEqual([]);
      expect(res.created).toBe(1);
      const rows = await derived();
      expect(rows).toHaveLength(1);
      expect(rows[0].organizationId).toBe(orgA);
    });
  });

  describe('organization-scoped backfill, phase 1 (existing rows)', () => {
    it('does not move an org A row into org B, nor change it, when org B has the better anchor', async () => {
      const base = { userId: athleteId, submittedBy: coachId, age: 18, isVerified: true };
      await db.insert(measurements).values([
        { ...base, metric: WEIGHT, value: '150', units: 'lbs', date: '2026-03-01', organizationId: null },
        { ...base, metric: ANCHOR, value: '1.3', units: 's', date: '2026-03-10', organizationId: orgA },
        { ...base, metric: ANCHOR, value: '1.2', units: 's', date: '2026-03-10', organizationId: orgB },
        {
          ...base, metric: DERIVED, value: '1.000', units: 'kg*m/s', date: '2026-03-10', organizationId: orgA,
          isCalculated: true, calculatedFromMeasurementIds: [], calculationMetadata: {},
        },
      ] as any);
      const res = await new DerivedMetricCalculator(db).recalculateAllDerivedMetrics({
        metricCode: DERIVED, organizationId: orgA, createMissing: false,
      });
      expect(res.errors).toEqual([]);
      expect(res.recalculated).toBe(0);
      expect(res.skipped).toBe(1);
      const rows = await derived();
      expect(rows).toHaveLength(1);
      expect(rows[0].organizationId).toBe(orgA);
      expect(rows[0].value).toBe('1.000');
    });
  });

  describe('backfill result: deleted count', () => {
    const seedOrphan = async () => {
      const base = { userId: athleteId, submittedBy: coachId, age: 18 };
      await db.insert(measurements).values([
        { ...base, isVerified: true, metric: WEIGHT, value: '150', units: 'lbs', date: '2026-03-01', organizationId: orgA },
        // anchor no longer verified: the derived row is orphaned
        { ...base, isVerified: false, metric: ANCHOR, value: '1.3', units: 's', date: '2026-03-10', organizationId: orgA },
        {
          ...base, isVerified: true, metric: DERIVED, value: '1.000', units: 'kg*m/s', date: '2026-03-10', organizationId: orgA,
          isCalculated: true, calculatedFromMeasurementIds: [], calculationMetadata: {},
        },
      ] as any);
    };

    it('dry run counts the would-be delete as deleted and changes nothing', async () => {
      await seedOrphan();
      const res = await new DerivedMetricCalculator(db).recalculateAllDerivedMetrics({
        metricCode: DERIVED, createMissing: false, dryRun: true,
      });
      expect(res).toMatchObject({ deleted: 1, recalculated: 0, skipped: 0 });
      expect(await derived()).toHaveLength(1);
    });

    it('real run reports the delete as deleted, not skipped', async () => {
      await seedOrphan();
      const res = await new DerivedMetricCalculator(db).recalculateAllDerivedMetrics({
        metricCode: DERIVED, createMissing: false,
      });
      expect(res).toMatchObject({ deleted: 1, recalculated: 0, skipped: 0 });
      expect(await derived()).toEqual([]);
    });
  });

  describe('backfill failure isolation (anchored)', () => {
    it('one row failing at the SQL level does not fail the other rows', async () => {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const [other] = await db.insert(users).values({
        username: `os-oth-${suffix}`, emails: [`os-oth-${suffix}@test.com`], password: 'x',
        firstName: 'OS', lastName: 'oth', fullName: 'OS oth', birthDate: '2008-01-01', birthYear: 2008,
      } as any).returning();
      createdUserIds.push(other.id);
      try {
        const mkRows = (userId: string) => {
          const base = { userId, submittedBy: coachId, age: 18, isVerified: true };
          return [
            { ...base, metric: WEIGHT, value: '150', units: 'lbs', date: '2026-03-01', organizationId: orgA },
            { ...base, metric: ANCHOR, value: '1.3', units: 's', date: '2026-03-10', organizationId: orgA },
            {
              ...base, metric: DERIVED, value: '1.000', units: 'kg*m/s', date: '2026-03-10', organizationId: orgA,
              isCalculated: true, calculatedFromMeasurementIds: [], calculationMetadata: {},
            },
          ];
        };
        await db.insert(measurements).values([...mkRows(athleteId), ...mkRows(other.id)] as any);

        const original = (DerivedMetricCalculator.prototype as any).computeAndUpsertDerived;
        const spy = vi
          .spyOn(DerivedMetricCalculator.prototype as any, 'computeAndUpsertDerived')
          .mockImplementation(async function (this: any, tx: any, dm: any, userId: string, ...rest: any[]) {
            if (userId === athleteId) await tx.execute(sql`SELECT 1/0`);
            return original.call(this, tx, dm, userId, ...rest);
          });
        try {
          const res = await new DerivedMetricCalculator(db).recalculateAllDerivedMetrics({
            metricCode: DERIVED, createMissing: false,
          });
          expect(res.errors).toHaveLength(1);
          expect(res.recalculated).toBe(1);
        } finally {
          spy.mockRestore();
        }
        const [o] = await db.select().from(measurements).where(and(eq(measurements.userId, other.id), eq(measurements.metric, DERIVED)));
        expect(Number(o.value)).toBeCloseTo(expected(150, 1.3), 2);
      } finally {
        await db.delete(measurements).where(eq(measurements.userId, other.id));
        await db.delete(users).where(eq(users.id, other.id));
      }
    });
  });

  describe('deleting a weight across organizations', () => {
    it('another organization weight is irrelevant; the anchor organization weight removes the row', async () => {
      const service = new MeasurementService();
      const wA = await put(WEIGHT, 150, '2026-03-01', orgA);
      const wB = await put(WEIGHT, 190, '2026-03-09', orgB);
      await put(ANCHOR, 1.3, '2026-03-10', orgA);
      expect(await derived()).toHaveLength(1);

      await service.deleteMeasurement(wB.id);
      const rows = await derived();
      expect(rows).toHaveLength(1);
      expect(rows[0].organizationId).toBe(orgA);
      expect(Number(rows[0].value)).toBeCloseTo(expected(150, 1.3), 2);

      await service.deleteMeasurement(wA.id);
      expect(await derived()).toEqual([]);
    });
  });
});
