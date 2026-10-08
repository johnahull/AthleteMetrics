/**
 * AM-FEAT-017: the code is authoritative for a fly's run-in. A flyInDistance
 * that disagrees is rejected (field-level) in storage (CSV / OCR / review
 * imports) and in MeasurementService (single + batch). Legacy FLY10_TIME rows
 * carrying 10 stay editable. Re-applies migration 0150 in beforeAll.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { storage } from '../../packages/api/storage';
import { MeasurementService } from '../../packages/api/services/measurement-service';
import { MeasurementValueValidationError } from '../../packages/shared/measurement-value-validation';
import { measurements, users } from '@shared/schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const service = new MeasurementService();

describe('flyInDistance must match the fly code run-in', () => {
  let athleteId: string;
  let coachId: string;

  beforeAll(async () => {
    const upSql = fs.readFileSync(path.resolve(__dirname, '../../migrations/0150_add_fly10_run_in_variants.sql'), 'utf-8');
    await db.execute(sql.raw(upSql));
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const mk = async (tag: string) =>
      (
        await db
          .insert(users)
          .values({
            username: `fly-${tag}-${suffix}`,
            emails: [`fly-${tag}-${suffix}@test.com`],
            password: 'x',
            firstName: 'Fly',
            lastName: tag,
            fullName: `Fly ${tag}`,
            birthDate: '2008-01-01',
          } as any)
          .returning()
      )[0].id;
    athleteId = await mk('ath');
    coachId = await mk('coach');
  });

  afterEach(async () => {
    await db.delete(measurements).where(eq(measurements.userId, athleteId));
    await db.delete(users).where(inArray(users.id, [athleteId, coachId]));
  });

  const input = (metric: string, flyInDistance?: number | null, value = 1.5) =>
    ({ userId: athleteId, metric, value, date: '2026-03-10', flyInDistance } as any);

  describe('storage.createMeasurement (CSV / OCR / import-review path)', () => {
    it('rejects a mismatch with field flyInDistance and writes nothing', async () => {
      const err = await storage.createMeasurement(input('FLY10_TIME_RI10', 20), coachId).catch((e) => e);
      expect(err).toBeInstanceOf(MeasurementValueValidationError);
      expect(err.field).toBe('flyInDistance');
      expect(await db.select().from(measurements).where(eq(measurements.userId, athleteId))).toHaveLength(0);
    });

    it('accepts a matching or null flyInDistance, and anything on FLY10M_TIME', async () => {
      await storage.createMeasurement(input('FLY10_TIME_RI10', 10), coachId);
      await storage.createMeasurement(input('FLY10_TIME_RI5', null), coachId);
      await storage.createMeasurement(input('FLY10M_TIME', 10), coachId);
      expect(await db.select().from(measurements).where(eq(measurements.userId, athleteId))).toHaveLength(3);
    });
  });

  describe('storage.updateMeasurement', () => {
    it('allows a value edit on a legacy FLY10_TIME row that stores 10', async () => {
      const [row] = await db
        .insert(measurements)
        .values({ userId: athleteId, submittedBy: coachId, date: '2026-03-10', age: 18, metric: 'FLY10_TIME', value: '1.5', units: 's', flyInDistance: '10' } as any)
        .returning();
      const updated = await storage.updateMeasurement(row.id, { value: 1.4 } as any);
      expect(Number(updated.value)).toBe(1.4);
    });

    it('rejects changing flyInDistance to a mismatch, or the metric to one disagreeing with the stored value', async () => {
      const [row] = await db
        .insert(measurements)
        .values({ userId: athleteId, submittedBy: coachId, date: '2026-03-10', age: 18, metric: 'FLY10_TIME', value: '1.5', units: 's', flyInDistance: '10' } as any)
        .returning();
      await expect(storage.updateMeasurement(row.id, { flyInDistance: 15 } as any)).rejects.toMatchObject({ field: 'flyInDistance' });
      await expect(storage.updateMeasurement(row.id, { metric: 'FLY10_TIME_RI5' } as any)).rejects.toMatchObject({ field: 'flyInDistance' });
    });
  });

  describe('MeasurementService', () => {
    it('create rejects a mismatch', async () => {
      await expect(service.createMeasurement(input('FLY10_TIME', 10), coachId, 'coach')).rejects.toMatchObject({ field: 'flyInDistance' });
    });

    it('create accepts a match', async () => {
      const m = await service.createMeasurement(input('FLY10_TIME_RI15', 15), coachId, 'coach');
      expect(m.metric).toBe('FLY10_TIME_RI15');
    });

    it('update: legacy value edit passes; changed mismatch is rejected', async () => {
      const [row] = await db
        .insert(measurements)
        .values({ userId: athleteId, submittedBy: coachId, date: '2026-03-10', age: 18, metric: 'FLY10_TIME', value: '1.5', units: 's', flyInDistance: '10' } as any)
        .returning();
      const ok = await service.updateMeasurement(row.id, { value: 1.45 } as any, undefined, 'coach');
      expect(Number(ok.value)).toBe(1.45);
      await expect(service.updateMeasurement(row.id, { flyInDistance: 15 } as any, undefined, 'coach')).rejects.toMatchObject({ field: 'flyInDistance' });
    });

    it('batch: only the mismatching row fails', async () => {
      const res = await service.createMeasurementsBatch(
        [input('FLY10_TIME_RI10', 10), input('FLY10_TIME_RI10', 20), input('FLY10_TIME_RI30', null)],
        { id: coachId, role: 'coach' },
        true,
      );
      expect(res.created).toBe(2);
      expect(res.failed).toBe(1);
      expect(res.errors[0].index).toBe(1);
    });
  });
});
