/**
 * AM-FEAT-015 Phase 0 spike + regression tests: MQI derived totals.
 *
 * Verifies how the derived-metric calculator treats MQI-style data
 * (8 same-date ordinal scores -> MQI_TOTAL) across insert, update, delete,
 * and partial sets, via the general MeasurementService path.
 *
 * Requires migration 0146 applied (MQI_TOTAL / MQ_* site_metrics rows).
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sql } from 'drizzle-orm';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi, onTestFinished } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { MeasurementService } from '../../packages/api/services/measurement-service';
import { DerivedMetricCalculator } from '../../packages/api/services/derived-metric-calculator';
import {
  events,
  measurements,
  organizations,
  teams,
  userTeams,
  users,
  userOrganizations,
  customOrgMetrics,
} from '@shared/schema';

const PATTERNS = [
  'MQ_LIN_ACCEL',
  'MQ_MAX_VELO',
  'MQ_DECEL',
  'MQ_SHUFFLE',
  'MQ_LATRUN',
  'MQ_HIPTURN',
  'MQ_BACKPEDAL',
  'MQ_JUMP',
];
const TRANSITIONS = [
  'MQ_TRANS_DECEL_CUT',
  'MQ_TRANS_GAS_BRAKE',
  'MQ_TRANS_BACKPEDAL_TURN',
  'MQ_TRANS_LAT_LINEAR',
];
const DATE = '2026-03-10';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The up-migration is idempotent (ON CONFLICT upserts). Re-apply it so these tests do not
// depend on suite ordering: other suites delete derived site_metrics rows from the shared DB.
const seedMqiMetrics = async () => {
  const upSql = fs.readFileSync(path.resolve(__dirname, '../../migrations/0146_seed_mqi_metrics.sql'), 'utf-8');
  await db.execute(sql.raw(upSql));
  // 0148 switches the two totals to latest-event source selection (decision 11)
  const p148 = path.resolve(__dirname, '../../migrations/0148_mqi_latest_event_selection.sql');
  if (fs.existsSync(p148)) await db.execute(sql.raw(fs.readFileSync(p148, 'utf-8')));
};

describe('MQI derived totals (calculator behavior)', () => {
  const service = new MeasurementService();

  beforeAll(seedMqiMetrics);
  let orgId: string;
  let teamId: string;
  let athleteId: string;
  let coachId: string;

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [org] = await db.insert(organizations).values({ name: `MQI Org ${suffix}` }).returning();
    orgId = org.id;
    const [team] = await db
      .insert(teams)
      .values({ name: 'MQI Team', organizationId: orgId, level: 'College' })
      .returning();
    teamId = team.id;
    const [athlete] = await db
      .insert(users)
      .values({
        username: `mqi-ath-${suffix}`,
        emails: [`mqi-ath-${suffix}@test.com`],
        password: 'x',
        firstName: 'Mqi',
        lastName: 'Athlete',
        fullName: 'Mqi Athlete',
        birthDate: '2008-01-01',
        birthYear: 2008,
      } as any)
      .returning();
    athleteId = athlete.id;
    const [coach] = await db
      .insert(users)
      .values({
        username: `mqi-coach-${suffix}`,
        emails: [`mqi-coach-${suffix}@test.com`],
        password: 'x',
        firstName: 'Mqi',
        lastName: 'Coach',
        fullName: 'Mqi Coach',
      } as any)
      .returning();
    coachId = coach.id;
    await db
      .insert(userOrganizations)
      .values({ userId: athleteId, organizationId: orgId, role: 'athlete' } as any);
    await db.insert(userTeams).values({
      userId: athleteId,
      teamId,
      joinedAt: new Date('2020-01-01'),
      isActive: true,
    });
  });

  afterEach(async () => {
    await db.delete(measurements).where(eq(measurements.userId, athleteId));
    await db.delete(events).where(eq(events.organizationId, orgId));
    await db.delete(userTeams).where(eq(userTeams.userId, athleteId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, orgId));
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, athleteId));
    await db.delete(teams).where(eq(teams.organizationId, orgId));
    await db.delete(users).where(inArray(users.id, [athleteId, coachId]));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  const score = (metric: string, value: number, date = DATE) =>
    service.createMeasurement({ userId: athleteId, metric, value, date } as any, coachId, 'coach');

  const totalsFor = async (metric: string, date = DATE) =>
    db
      .select()
      .from(measurements)
      .where(
        and(
          eq(measurements.userId, athleteId),
          eq(measurements.metric, metric),
          eq(measurements.date, date),
        ),
      );

  const scoreAllPatterns = async (value: number | ((i: number) => number), date = DATE) => {
    const rows = [];
    for (let i = 0; i < PATTERNS.length; i++) {
      rows.push(await score(PATTERNS[i], typeof value === 'function' ? value(i) : value, date));
    }
    return rows;
  };

  it('(a) creates MQI_TOTAL as the sum when all 8 same-date pattern scores exist', async () => {
    await scoreAllPatterns((i) => i % 4); // 0+1+2+3+0+1+2+3 = 12
    const [total] = await totalsFor('MQI_TOTAL');
    expect(total).toBeDefined();
    expect(Number(total.value)).toBe(12);
    expect(total.isCalculated).toBe(true);
    expect(total.units).toBe('score');
  });

  it('(a) includes a legitimate all-zero set (sum 0) only if zero scores can be stored', async () => {
    // Zero-valued scores are valid MQ data (0 = Absent). Source rows are inserted
    // directly here because the create path validation is covered by D3 tests.
    const calc = new DerivedMetricCalculator(db);
    let last: any;
    for (const metric of PATTERNS) {
      [last] = await db
        .insert(measurements)
        .values({
          userId: athleteId,
          submittedBy: coachId,
          metric,
          value: '0',
          units: 'score',
          date: DATE,
          age: 18,
          isVerified: true,
          organizationId: orgId,
        } as any)
        .returning();
    }
    await calc.processNewMeasurement(last);
    const [total] = await totalsFor('MQI_TOTAL');
    expect(total).toBeDefined();
    expect(Number(total.value)).toBe(0);
  });

  it('does not create MQI_TOTAL for 7 of 8 patterns', async () => {
    for (const metric of PATTERNS.slice(0, 7)) await score(metric, 2);
    expect(await totalsFor('MQI_TOTAL')).toHaveLength(0);
  });

  it('never includes transition scores in MQI_TOTAL, and transitions get their own total', async () => {
    for (const metric of TRANSITIONS) await score(metric, 3);
    expect(await totalsFor('MQI_TOTAL')).toHaveLength(0);
    const [transTotal] = await totalsFor('MQ_TRANSITION_TOTAL');
    expect(Number(transTotal.value)).toBe(12);

    await scoreAllPatterns(2);
    const [total] = await totalsFor('MQI_TOTAL');
    expect(Number(total.value)).toBe(16);
  });

  it('(b) recalculates MQI_TOTAL when a source score is updated', async () => {
    const rows = await scoreAllPatterns(2); // 16
    await service.updateMeasurement(rows[0].id, { value: 3 }, undefined, 'coach');
    const [total] = await totalsFor('MQI_TOTAL');
    expect(Number(total.value)).toBe(17);
  });

  it('(b) recalculation removes the calculated total when a direct total exists for the date', async () => {
    const rows = await scoreAllPatterns(2); // calculated total 16
    expect(await totalsFor('MQI_TOTAL')).toHaveLength(1);
    const [direct] = await db
      .insert(measurements)
      .values({
        userId: athleteId,
        submittedBy: coachId,
        metric: 'MQI_TOTAL',
        value: '20',
        units: 'score',
        date: DATE,
        age: 18,
        isVerified: true,
        organizationId: orgId,
      } as any)
      .returning();

    await service.updateMeasurement(rows[0].id, { value: 3 }, undefined, 'coach');

    // Direct measurements take priority: only the direct row remains, unchanged.
    const totals = await totalsFor('MQI_TOTAL');
    expect(totals).toHaveLength(1);
    expect(totals[0].id).toBe(direct.id);
    expect(totals[0].isCalculated).toBe(false);
    expect(Number(totals[0].value)).toBe(20);
  });

  it('(c) removes MQI_TOTAL when a source score is deleted (set becomes incomplete)', async () => {
    const rows = await scoreAllPatterns(2);
    expect(await totalsFor('MQI_TOTAL')).toHaveLength(1);
    await service.deleteMeasurement(rows[3].id);
    expect(await totalsFor('MQI_TOTAL')).toHaveLength(0);
  });

  it('(c) re-creates MQI_TOTAL when the missing score is added back (partial->complete->partial->complete)', async () => {
    const rows = await scoreAllPatterns(2);
    await service.deleteMeasurement(rows[7].id);
    expect(await totalsFor('MQI_TOTAL')).toHaveLength(0);
    await score('MQ_JUMP', 3);
    const [total] = await totalsFor('MQI_TOTAL');
    expect(Number(total.value)).toBe(17);
  });

  it('(c) leaves no stale total on the OLD date when a source score is moved to another date', async () => {
    const rows = await scoreAllPatterns(2);
    expect(await totalsFor('MQI_TOTAL')).toHaveLength(1);
    await service.updateMeasurement(rows[0].id, { date: '2026-03-11' } as any, undefined, 'coach');
    // Old date now has only 7 pattern scores: total must be gone.
    expect(await totalsFor('MQI_TOTAL', DATE)).toHaveLength(0);
  });

  it('(c) creates MQI_TOTAL on the NEW date when moving a score there completes the set', async () => {
    // 7 patterns on DATE, the 8th on DATE+1; moving it to DATE completes DATE's set.
    for (const metric of PATTERNS.slice(0, 7)) await score(metric, 2);
    const moved = await score('MQ_JUMP', 3, '2026-03-11');
    expect(await totalsFor('MQI_TOTAL')).toHaveLength(0);

    await service.updateMeasurement(moved.id, { date: DATE } as any, undefined, 'coach');

    const totals = await totalsFor('MQI_TOTAL');
    expect(totals).toHaveLength(1);
    expect(Number(totals[0].value)).toBe(17);
    expect(totals[0].isCalculated).toBe(true);
  });

  it('(c) creates MQI_TOTAL when a metric change completes the set', async () => {
    for (const metric of PATTERNS.slice(0, 7)) await score(metric, 1);
    const wrongMetric = await score('MQ_TRANS_DECEL_CUT', 3);
    expect(await totalsFor('MQI_TOTAL')).toHaveLength(0);

    await service.updateMeasurement(wrongMetric.id, { metric: 'MQ_JUMP' } as any, undefined, 'coach');

    const totals = await totalsFor('MQI_TOTAL');
    expect(totals).toHaveLength(1);
    expect(Number(totals[0].value)).toBe(10);
  });

  it('(c) restores the remaining complete set\'s total when another same-date set is cleared', async () => {
    // Set A: all 8 patterns. Set B (same date): 3 re-scores. Clearing B must leave A's total.
    await scoreAllPatterns(2); // A = 16
    const b = [];
    for (const metric of PATTERNS.slice(0, 3)) b.push(await score(metric, 3));
    for (const row of b) await service.deleteMeasurement(row.id);

    const totals = await totalsFor('MQI_TOTAL');
    expect(totals).toHaveLength(1);
    expect(Number(totals[0].value)).toBe(16);
  });

  it('(c) re-creates the total via recalculation when no calculated row exists yet', async () => {
    // Sources inserted directly (no trigger), then a recalculation for that date
    // must create the missing total rather than only updating/deleting existing ones.
    for (const metric of PATTERNS) {
      await db.insert(measurements).values({
        userId: athleteId,
        submittedBy: coachId,
        metric,
        value: '1',
        units: 'score',
        date: DATE,
        age: 18,
        isVerified: true,
        organizationId: orgId,
      } as any);
    }
    expect(await totalsFor('MQI_TOTAL')).toHaveLength(0);
    await new DerivedMetricCalculator(db).recalculateForAthlete(athleteId, 'MQ_JUMP', DATE);
    const totals = await totalsFor('MQI_TOTAL');
    expect(totals).toHaveLength(1);
    expect(Number(totals[0].value)).toBe(8);
    expect(totals[0].organizationId).toBe(orgId);
  });

  it('(c) recalculation only creates custom totals of the triggering measurement\'s org', async () => {
    // The athlete also belongs to org B, which has a custom derived metric on MQ_JUMP.
    const [orgB] = await db.insert(organizations).values({ name: `MQI Org B ${Date.now()}` }).returning();
    const customCode = `MQ2_B_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    await db.insert(userOrganizations).values({ userId: athleteId, organizationId: orgB.id, role: 'athlete' } as any);
    await db.insert(customOrgMetrics).values({
      organizationId: orgB.id,
      code: customCode,
      label: 'Org B jump x2',
      unit: 'score',
      metricType: 'higher_is_better',
      isDerived: true,
      formula: 'MQ_JUMP * 2',
      dependentMetrics: ['MQ_JUMP'],
      calculationConfig: { dateMatchStrategy: 'same_date', missingSourceBehavior: 'skip' },
    } as any);
    onTestFinished(async () => {
      await db.delete(measurements).where(eq(measurements.metric, customCode));
      await db.delete(customOrgMetrics).where(eq(customOrgMetrics.organizationId, orgB.id));
      await db.delete(organizations).where(eq(organizations.id, orgB.id));
    });

    // An org-A score moved onto DATE: its recalculation must not create org B's total.
    const moved = await score('MQ_JUMP', 3, '2026-03-11');
    expect(moved.organizationId).toBe(orgId);
    await service.updateMeasurement(moved.id, { date: DATE } as any, undefined, 'coach');

    expect(await totalsFor(customCode)).toHaveLength(0);
  });

  it('(c) never creates duplicate totals under concurrent calculation', async () => {
    let last: any;
    for (const metric of PATTERNS) {
      [last] = await db
        .insert(measurements)
        .values({
          userId: athleteId,
          submittedBy: coachId,
          metric,
          value: '2',
          units: 'score',
          date: DATE,
          age: 18,
          isVerified: true,
          organizationId: orgId,
        } as any)
        .returning();
    }
    await Promise.all(
      Array.from({ length: 8 }, () => new DerivedMetricCalculator(db).processNewMeasurement(last)),
    );
    const totals = await totalsFor('MQI_TOTAL');
    expect(totals).toHaveLength(1);
    expect(Number(totals[0].value)).toBe(16);
  });

  it('(c) concurrent updates of different scores leave the correct total', async () => {
    const rows = await scoreAllPatterns(1); // 8
    // Widen the read-then-write window so an unserialized recalculation that read the
    // sources before another update committed would write a stale total.
    const proto = DerivedMetricCalculator.prototype as any;
    const findSources = proto.findSourceMeasurementsImpl;
    const spy = vi.spyOn(proto, 'findSourceMeasurementsImpl').mockImplementation(async function (this: any, ...args: any[]) {
      const result = await findSources.apply(this, args);
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 30));
      return result;
    });
    onTestFinished(() => spy.mockRestore());
    for (let round = 0; round < 12; round++) {
      const values = rows.map((_, i) => (i + round) % 4);
      await Promise.all(
        rows.map(async (row, i) => {
          await new Promise((resolve) => setTimeout(resolve, Math.random() * 20));
          return service.updateMeasurement(row.id, { value: values[i] }, undefined, 'coach');
        }),
      );
      const totals = await totalsFor('MQI_TOTAL');
      expect(totals).toHaveLength(1);
      expect(Number(totals[0].value)).toBe(values.reduce((a, b) => a + b, 0));
    }
  });

  // AM-FEAT-015 decision 11: with calculationConfig.sourceSelection = 'latest_event' (migration
  // 0148) the totals use the single most recent event that has scores for the athlete that day.
  it('(e) same athlete, two events same day: latest event wins for totals', async () => {
    // Event 1 scores 8x3 earlier, event 2 scores 8x1 later. Spec decision 11:
    // the total must reflect the latest event (8), not a best-of mix (24).
    const calc = new DerivedMetricCalculator(db);
    const insertSet = async (eventId: string, value: number, createdAt: Date) => {
      let last: any;
      for (const metric of PATTERNS) {
        [last] = await db
          .insert(measurements)
          .values({
            userId: athleteId,
            submittedBy: coachId,
            metric,
            value: String(value),
            units: 'score',
            date: DATE,
            age: 18,
            isVerified: true,
            organizationId: orgId,
            eventId,
            createdAt,
          } as any)
          .returning();
      }
      await calc.processNewMeasurement(last);
    };
    await insertSet('event-one', 3, new Date('2026-03-10T09:00:00Z'));
    await insertSet('event-two', 1, new Date('2026-03-10T15:00:00Z'));
    const totals = await totalsFor('MQI_TOTAL');
    expect(totals).toHaveLength(1);
    expect(Number(totals[0].value)).toBe(8);
  });

  it('(e) two orgs score the athlete on one day: the total carries the latest event\'s org context', async () => {
    // Org A scores first; org B's later event completes and becomes the latest.
    const [orgB] = await db.insert(organizations).values({ name: `MQI Org B ${Date.now()}` }).returning();
    const [coachB] = await db
      .insert(users)
      .values({
        username: `mqi-coachb-${Date.now()}`,
        emails: [`mqi-coachb-${Date.now()}@test.com`],
        password: 'x',
        firstName: 'Mqi',
        lastName: 'CoachB',
        fullName: 'Mqi CoachB',
      } as any)
      .returning();
    onTestFinished(async () => {
      await db.delete(measurements).where(eq(measurements.userId, athleteId));
      await db.delete(users).where(eq(users.id, coachB.id));
      await db.delete(organizations).where(eq(organizations.id, orgB.id));
    });
    const calc = new DerivedMetricCalculator(db);
    const insertSet = async (organizationId: string, submittedBy: string, eventId: string, value: number, createdAt: Date) => {
      let last: any;
      for (const metric of PATTERNS) {
        [last] = await db
          .insert(measurements)
          .values({
            userId: athleteId, submittedBy, metric, value: String(value), units: 'score', date: DATE, age: 18,
            isVerified: true, organizationId, eventId, createdAt,
          } as any)
          .returning();
      }
      await calc.processNewMeasurement(last);
    };
    await insertSet(orgId, coachId, 'org-a-event', 3, new Date('2026-03-10T09:00:00Z'));
    const [first] = await totalsFor('MQI_TOTAL');
    expect(first.organizationId).toBe(orgId);

    await insertSet(orgB.id, coachB.id, 'org-b-event', 1, new Date('2026-03-10T15:00:00Z'));
    const totals = await totalsFor('MQI_TOTAL');
    expect(totals).toHaveLength(1);
    expect(Number(totals[0].value)).toBe(8);
    expect(totals[0].organizationId).toBe(orgB.id);
    expect(totals[0].submittedBy).toBe(coachB.id);
    expect(totals[0].teamId).toBeNull();
  });

  const insertEventSet = async (
    eventId: string,
    value: number,
    createdAt: Date,
    metrics = PATTERNS,
    eventDate?: string,
  ) => {
    const calc = new DerivedMetricCalculator(db);
    let last: any;
    for (const metric of metrics) {
      [last] = await db
        .insert(measurements)
        .values({
          userId: athleteId,
          submittedBy: coachId,
          metric,
          value: String(value),
          units: 'score',
          date: DATE,
          age: 18,
          isVerified: true,
          organizationId: orgId,
          eventId,
          eventDateSnapshot: eventDate ?? null,
          createdAt,
        } as any)
        .returning();
    }
    await calc.processNewMeasurement(last);
  };

  it('(f) latest event is chosen by event date snapshot before created_at', async () => {
    // Event "late" has the later event date but was entered FIRST (backfill order differs)
    await insertEventSet('ev-late', 1, new Date('2026-03-11T09:00:00Z'), PATTERNS, '2026-03-10');
    await insertEventSet('ev-early', 3, new Date('2026-03-11T15:00:00Z'), PATTERNS, '2026-03-09');
    const [total] = await totalsFor('MQI_TOTAL');
    expect(Number(total.value)).toBe(8);
  });

  it('(g) latest event incomplete: no total from an older complete event (a total needs all sources from one event)', async () => {
    await insertEventSet('ev-one', 3, new Date('2026-03-10T09:00:00Z'));
    expect(Number((await totalsFor('MQI_TOTAL'))[0].value)).toBe(24);
    await insertEventSet('ev-two', 1, new Date('2026-03-10T15:00:00Z'), PATTERNS.slice(0, 3));
    expect(await totalsFor('MQI_TOTAL')).toHaveLength(0);
  });

  it('(h) transition total also uses latest-event selection', async () => {
    await insertEventSet('ev-one', 3, new Date('2026-03-10T09:00:00Z'), TRANSITIONS);
    await insertEventSet('ev-two', 1, new Date('2026-03-10T15:00:00Z'), TRANSITIONS);
    const [total] = await totalsFor('MQ_TRANSITION_TOTAL');
    expect(Number(total.value)).toBe(4);
  });

  const mkRealEvent = async (start: string) => {
    const [e] = await db
      .insert(events)
      .values({ name: `MQI ev ${start}`, organizationId: orgId, startDate: new Date(start), createdBy: coachId } as any)
      .returning();
    return e.id as string;
  };

  it('(e2) real events: the later-starting event wins even when it was entered first', async () => {
    const morning = await mkRealEvent('2026-03-10T09:00:00Z');
    const afternoon = await mkRealEvent('2026-03-10T15:00:00Z');
    // Entered in reverse order: afternoon first (created earlier), morning second
    await insertEventSet(afternoon, 1, new Date('2026-03-11T08:00:00Z'), PATTERNS, '2026-03-10');
    await insertEventSet(morning, 3, new Date('2026-03-11T09:00:00Z'), PATTERNS, '2026-03-10');
    const totals = await totalsFor('MQI_TOTAL');
    expect(totals).toHaveLength(1);
    expect(Number(totals[0].value)).toBe(8);
  });

  it('(e3) an event always outranks non-event scores on the same date', async () => {
    const ev = await mkRealEvent('2026-03-10T09:00:00Z');
    await insertEventSet(ev, 1, new Date('2026-03-10T09:00:00Z'), PATTERNS, '2026-03-10');
    await scoreAllPatterns(3); // non-event scores entered later
    const totals = await totalsFor('MQI_TOTAL');
    expect(totals).toHaveLength(1);
    expect(Number(totals[0].value)).toBe(8);
  });

  it('(j) clearing the latest event restores the older complete event\'s total', async () => {
    const older = await mkRealEvent('2026-03-10T09:00:00Z');
    const newer = await mkRealEvent('2026-03-10T15:00:00Z');
    await insertEventSet(older, 2, new Date('2026-03-10T09:00:00Z'), PATTERNS, '2026-03-10'); // 16
    await insertEventSet(newer, 3, new Date('2026-03-10T15:00:00Z'), PATTERNS.slice(0, 3), '2026-03-10');
    expect(await totalsFor('MQI_TOTAL')).toHaveLength(0); // newest event incomplete

    const newerRows = await db.select().from(measurements).where(eq(measurements.eventId, newer));
    for (const row of newerRows) await service.deleteMeasurement(row.id);

    const totals = await totalsFor('MQI_TOTAL');
    expect(totals).toHaveLength(1);
    expect(Number(totals[0].value)).toBe(16);
  });

  it('(i) non-event scores (no eventId) still produce a total as before', async () => {
    await scoreAllPatterns(2);
    expect(Number((await totalsFor('MQI_TOTAL'))[0].value)).toBe(16);
  });
});
