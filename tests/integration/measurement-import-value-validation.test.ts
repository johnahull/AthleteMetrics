/**
 * AM-FEAT-015: the CSV / OCR / review-decision import paths write through
 * storage.createMeasurement, which must apply the same metric-aware value
 * validation as MeasurementService (0-3 for MQ scores, positive elsewhere).
 * Re-applies migration 0146 in beforeAll.
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
import { measurements, users } from '@shared/schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('storage.createMeasurement value validation (import paths)', () => {
  let athleteId: string;
  let coachId: string;

  beforeAll(async () => {
    const upSql = fs.readFileSync(path.resolve(__dirname, '../../migrations/0146_seed_mqi_metrics.sql'), 'utf-8');
    await db.execute(sql.raw(upSql));
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const mk = async (tag: string) =>
      (
        await db
          .insert(users)
          .values({
            username: `imp-${tag}-${suffix}`,
            emails: [`imp-${tag}-${suffix}@test.com`],
            password: 'x',
            firstName: 'Imp',
            lastName: tag,
            fullName: `Imp ${tag}`,
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

  const create = (metric: string, value: number) =>
    storage.createMeasurement({ userId: athleteId, metric, value, date: '2026-03-10' } as any, coachId);

  it('accepts a 0 MQ score', async () => {
    const m = await create('MQ_JUMP', 0);
    expect(Number(m.value)).toBe(0);
  });

  it.each([
    [4, /at most 3/],
    [-1, /at least 0/],
    [2.5, /whole number/],
  ])('rejects MQ score %s', async (value, message) => {
    await expect(create('MQ_JUMP', value)).rejects.toThrow(message);
    const rows = await db.select().from(measurements).where(eq(measurements.userId, athleteId));
    expect(rows).toHaveLength(0);
  });

  it('rejects NaN (unparseable CSV value)', async () => {
    await expect(create('FLY10_TIME', NaN)).rejects.toThrow(/finite number/);
  });

  // The storage path validated nothing before AM-FEAT-015: the range/zero rule is
  // scoped to MQ metrics so standard metrics behave exactly as on develop.
  it('stores 0 and negative values for a standard metric as before (no range rule outside MQ)', async () => {
    expect(Number((await create('FLY10_TIME', 0)).value)).toBe(0);
    expect(Number((await create('RSI_ASYM', -5)).value)).toBe(-5);
  });

  it('rejects a manual MQ total (MQI_TOTAL / MQ_TRANSITION_TOTAL) and writes nothing', async () => {
    await expect(create('MQI_TOTAL', 12)).rejects.toThrow(/calculated automatically/);
    await expect(create('MQ_TRANSITION_TOTAL', 6)).rejects.toThrow(/calculated automatically/);
    const rows = await db.select().from(measurements).where(eq(measurements.userId, athleteId));
    expect(rows).toHaveLength(0);
  });

  it("stores an MQ score with the metric's configured unit", async () => {
    const m = await create('MQ_JUMP', 2);
    expect(m.units).toBe('score');
  });

  // Review-queue approval fills a missing unit with getDefaultUnit(metric) = 's';
  // an MQ score keeps 'score', while a standard metric honors the caller's unit.
  it("keeps 'score' for an MQ score even when the caller supplies another unit", async () => {
    const mq = await storage.createMeasurement(
      { userId: athleteId, metric: 'MQ_JUMP', value: 2, units: 's', date: '2026-03-10' },
      coachId,
    );
    expect(mq.units).toBe('score');
    const std = await storage.createMeasurement(
      { userId: athleteId, metric: 'FLY10_TIME', value: 1.5, units: 'ms', date: '2026-03-10' },
      coachId,
    );
    expect(std.units).toBe('ms');
  });

  it('accepts a positive standard value', async () => {
    const m = await create('FLY10_TIME', 1.52);
    expect(Number(m.value)).toBe(1.52);
  });
});
