/**
 * Issue #526: when post-commit derived-total recalculation fails, the source write
 * still succeeds but the response carries a machine-readable DERIVED_TOTAL_STALE warning.
 *
 * Failure is injected two ways:
 *  - computeAndUpsertDerived throws: the calculator logs and swallows it per derived
 *    metric (the realistic path) and records it via getFailures()
 *  - recalculateForAthlete / processNewMeasurement reject: caught by the service
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';

vi.mock('../../packages/api/services/measurement-notification-service', () => ({
  notifyNewMeasurement: vi.fn().mockResolvedValue(undefined),
}));

import { db } from '../../packages/api/db';
import { storage } from '../../packages/api/storage';
import { MeasurementService } from '../../packages/api/services/measurement-service';
import { EventMeasurementsService } from '../../packages/api/services/event-measurements-service';
import { DerivedMetricCalculator } from '../../packages/api/services/derived-metric-calculator';
import { events, measurements, organizations, userOrganizations, users } from '@shared/schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATE = '2026-04-14';
const warn = (metric: string, date: string, userId: string) => ({ code: 'DERIVED_TOTAL_STALE', metric, date, userId });

describe('DERIVED_TOTAL_STALE warnings', () => {
  const service = new MeasurementService();
  let orgId: string;
  let athleteId: string;
  let coachId: string;
  let eventId: string;

  beforeAll(async () => {
    const up = fs.readFileSync(path.resolve(__dirname, '../../migrations/0146_seed_mqi_metrics.sql'), 'utf-8');
    await db.execute(sql.raw(up));
    const p148 = path.resolve(__dirname, '../../migrations/0148_mqi_latest_event_selection.sql');
    await db.execute(sql.raw(fs.readFileSync(p148, 'utf-8')));
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [org] = await db.insert(organizations).values({ name: `Warn Org ${suffix}` }).returning();
    orgId = org.id;
    const mk = async (tag: string) =>
      (
        await db
          .insert(users)
          .values({
            username: `warn-${tag}-${suffix}`,
            emails: [`warn-${tag}-${suffix}@test.com`],
            password: 'x',
            firstName: tag,
            lastName: 'Warn',
            fullName: `${tag} Warn`,
            birthDate: '2008-01-01',
            birthYear: 2008,
          } as any)
          .returning()
      )[0];
    athleteId = (await mk('ath')).id;
    coachId = (await mk('coach')).id;
    await db.insert(userOrganizations).values([
      { userId: athleteId, organizationId: orgId, role: 'athlete' },
      { userId: coachId, organizationId: orgId, role: 'coach' },
    ] as any);
    const [ev] = await db
      .insert(events)
      .values({
        name: `Warn Event ${suffix}`,
        organizationId: orgId,
        startDate: new Date(`${DATE}T10:00:00Z`),
        createdBy: coachId,
      } as any)
      .returning();
    eventId = ev.id;
  });

  afterEach(async () => {
    spies.splice(0).forEach((s) => s.mockRestore());
    await db.delete(measurements).where(eq(measurements.userId, athleteId));
    await db.delete(events).where(eq(events.organizationId, orgId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, orgId));
    await db.delete(users).where(inArray(users.id, [athleteId, coachId]));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  const spies: Array<{ mockRestore: () => void }> = [];
  const track = <T extends { mockRestore: () => void }>(s: T) => (spies.push(s), s);
  const failComputation = () => track(
    vi.spyOn(DerivedMetricCalculator.prototype as any, 'computeAndUpsertDerived').mockRejectedValue(new Error("deadlock detected")));

  const create = (metric = 'MQ_JUMP', value = 2) =>
    service.createMeasurement({ userId: athleteId, metric, value, date: DATE } as any, coachId, 'coach');

  it('create: no warnings field when recalculation succeeds', async () => {
    const m = await create();
    expect('warnings' in m).toBe(false);
  });

  it('create: persists the measurement and warns when the derived calculation fails', async () => {
    failComputation();
    const m = (await create()) as any;
    expect(m.id).toBeTruthy();
    expect(m.warnings).toEqual([warn('MQI_TOTAL', DATE, athleteId)]);
    const rows = await db.select().from(measurements).where(eq(measurements.id, m.id));
    expect(rows).toHaveLength(1);
  });

  it('create: warns when processNewMeasurement itself rejects', async () => {
    track(vi.spyOn(DerivedMetricCalculator.prototype, 'processNewMeasurement').mockRejectedValue(new Error('timeout')));
    const m = (await create()) as any;
    expect(m.warnings).toEqual([warn('MQ_JUMP', DATE, athleteId)]);
  });

  it('update: warns when recalculation fails and the update still applies', async () => {
    const m = await create();
    failComputation();
    const updated = (await service.updateMeasurement(m.id, { value: 3 } as any, undefined, 'coach')) as any;
    expect(Number(updated.value)).toBe(3);
    expect(updated.warnings).toEqual([warn('MQI_TOTAL', DATE, athleteId)]);
  });

  it('update: warns when recalculateForAthlete rejects', async () => {
    const m = await create();
    track(vi.spyOn(DerivedMetricCalculator.prototype, 'recalculateForAthlete').mockRejectedValue(new Error('boom')));
    const updated = (await service.updateMeasurement(m.id, { value: 1 } as any, undefined, 'coach')) as any;
    expect(updated.warnings).toEqual([warn('MQ_JUMP', DATE, athleteId)]);
  });

  it('delete: still deletes and returns warnings when recalculation fails', async () => {
    const m = await create();
    failComputation();
    const result = await service.deleteMeasurement(m.id);
    expect(result.warnings).toEqual([warn('MQI_TOTAL', DATE, athleteId)]);
    expect(await db.select().from(measurements).where(eq(measurements.id, m.id))).toHaveLength(0);
  });

  it('delete: returns no warnings on success', async () => {
    const m = await create();
    const result = await service.deleteMeasurement(m.id);
    expect(result.warnings).toEqual([]);
  });

  it('bulkDelete: reports deduplicated warnings for failed recalculations', async () => {
    const a = await create('MQ_JUMP');
    const b = await create('MQ_DECEL');
    failComputation();
    const result = await service.bulkDelete([a.id, b.id]);
    expect(result.deleted).toBe(2);
    expect(result.warnings).toEqual([warn('MQI_TOTAL', DATE, athleteId)]);
  });

  it('bulkDelete: warnings is empty on success', async () => {
    const a = await create('MQ_JUMP');
    const result = await service.bulkDelete([a.id]);
    expect(result.warnings).toEqual([]);
  });

  it('Movement Quality save: saves scores and returns warnings when recalculation fails', async () => {
    failComputation();
    const mq = new EventMeasurementsService(storage);
    const result = (await mq.saveMovementQuality(
      eventId,
      athleteId,
      { upserts: [{ metric: 'MQ_JUMP', value: 2 }], deletes: [] },
      coachId,
      'coach'
    )) as any;
    expect(result.saved).toHaveLength(1);
    expect(result.warnings).toEqual([warn('MQI_TOTAL', DATE, athleteId)]);
  });

  it('update that moves the date: each recalculation is attempted and warned on its own', async () => {
    const m = await create();
    const NEW_DATE = '2026-04-15';
    const spy = track(
      vi.spyOn(DerivedMetricCalculator.prototype, 'recalculateForAthlete').mockRejectedValue(new Error('boom'))
    );
    const updated = (await service.updateMeasurement(m.id, { date: NEW_DATE } as any, undefined, 'coach')) as any;
    expect(spy).toHaveBeenCalledTimes(2);
    expect(updated.warnings).toEqual([warn('MQ_JUMP', NEW_DATE, athleteId), warn('MQ_JUMP', DATE, athleteId)]);
  });

  it('update that moves the date: previous-date recalculation still runs when the first fails', async () => {
    const m = await create();
    const NEW_DATE = '2026-04-15';
    const spy = track(
      vi
        .spyOn(DerivedMetricCalculator.prototype, 'recalculateForAthlete')
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValue(undefined)
    );
    const updated = (await service.updateMeasurement(m.id, { date: NEW_DATE } as any, undefined, 'coach')) as any;
    expect(spy).toHaveBeenCalledTimes(2);
    expect(updated.warnings).toEqual([warn('MQ_JUMP', NEW_DATE, athleteId)]);
  });

  it('bulkDelete over two athletes on the same date yields one warning per athlete', async () => {
    const suffix = `${Date.now()}-b`;
    const [other] = await db
      .insert(users)
      .values({
        username: `warn-other-${suffix}`,
        emails: [`warn-other-${suffix}@test.com`],
        password: 'x',
        firstName: 'Other',
        lastName: 'Warn',
        fullName: 'Other Warn',
        birthDate: '2008-01-01',
        birthYear: 2008,
      } as any)
      .returning();
    try {
      const a = await create();
      const b = await service.createMeasurement(
        { userId: other.id, metric: 'MQ_JUMP', value: 2, date: DATE } as any,
        coachId,
        'coach'
      );
      failComputation();
      const result = await service.bulkDelete([a.id, b.id]);
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings.map((w) => w.userId).sort()).toEqual([athleteId, other.id].sort());
    } finally {
      await db.delete(measurements).where(eq(measurements.userId, other.id));
      await db.delete(users).where(eq(users.id, other.id));
    }
  });

  it('Movement Quality save: response is unchanged (no warnings key) on success', async () => {
    const mq = new EventMeasurementsService(storage);
    const result = await mq.saveMovementQuality(
      eventId,
      athleteId,
      { upserts: [{ metric: 'MQ_JUMP', value: 2 }], deletes: [] },
      coachId,
      'coach'
    );
    expect('warnings' in result).toBe(false);
    expect(
      await db
        .select()
        .from(measurements)
        .where(and(eq(measurements.userId, athleteId), eq(measurements.metric, 'MQ_JUMP')))
    ).toHaveLength(1);
  });
});
