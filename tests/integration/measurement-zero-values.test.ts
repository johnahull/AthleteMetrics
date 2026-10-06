/**
 * AM-FEAT-015 D3: zero scores are valid for metrics whose site_metrics
 * validation_min <= 0 (MQ ordinals); every other metric keeps positive() behavior.
 * Requires migration 0146 applied.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sql } from 'drizzle-orm';
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { MeasurementService } from '../../packages/api/services/measurement-service';
import { measurements, organizations, teams, userTeams, users, userOrganizations } from '@shared/schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The up-migration is idempotent (ON CONFLICT upserts). Re-apply it so these tests do not
// depend on suite ordering: other suites delete derived site_metrics rows from the shared DB.
const seedMqiMetrics = async () => {
  const upSql = fs.readFileSync(path.resolve(__dirname, '../../migrations/0146_seed_mqi_metrics.sql'), 'utf-8');
  await db.execute(sql.raw(upSql));
};

describe('MeasurementService zero / range validation', () => {
  const service = new MeasurementService();

  beforeAll(seedMqiMetrics);
  let orgId: string;
  let athleteId: string;
  let coachId: string;

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [org] = await db.insert(organizations).values({ name: `Zero Org ${suffix}` }).returning();
    orgId = org.id;
    const [team] = await db
      .insert(teams)
      .values({ name: 'Zero Team', organizationId: orgId, level: 'College' })
      .returning();
    const mk = async (tag: string) =>
      (
        await db
          .insert(users)
          .values({
            username: `zero-${tag}-${suffix}`,
            emails: [`zero-${tag}-${suffix}@test.com`],
            password: 'x',
            firstName: 'Z',
            lastName: tag,
            fullName: `Z ${tag}`,
            birthDate: '2008-01-01',
            birthYear: 2008,
          } as any)
          .returning()
      )[0].id;
    athleteId = await mk('ath');
    coachId = await mk('coach');
    await db.insert(userOrganizations).values({ userId: athleteId, organizationId: orgId, role: 'athlete' } as any);
    await db.insert(userTeams).values({ userId: athleteId, teamId: team.id, joinedAt: new Date('2020-01-01'), isActive: true });
  });

  afterEach(async () => {
    await db.delete(measurements).where(eq(measurements.userId, athleteId));
    await db.delete(userTeams).where(eq(userTeams.userId, athleteId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, orgId));
    await db.delete(teams).where(eq(teams.organizationId, orgId));
    await db.delete(users).where(inArray(users.id, [athleteId, coachId]));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  const create = (metric: string, value: number) =>
    service.createMeasurement({ userId: athleteId, metric, value, date: '2026-03-10' } as any, coachId, 'coach');

  it('stores a 0 score for an MQ metric', async () => {
    const m = await create('MQ_JUMP', 0);
    expect(Number(m.value)).toBe(0);
    expect(m.units).toBe('score');
  });

  it.each([4, -1, 1.5])('rejects MQ score %s', async (v) => {
    await expect(create('MQ_JUMP', v)).rejects.toThrow();
  });

  it('keeps rejecting 0 for a standard metric (FLY10_TIME)', async () => {
    await expect(create('FLY10_TIME', 0)).rejects.toThrow(/positive/i);
  });

  it('keeps rejecting 0 for an unknown metric code', async () => {
    await expect(create('NO_SUCH_METRIC', 0)).rejects.toThrow(/positive/i);
  });

  it('update: allows 0 on an MQ score, rejects 0 on a standard metric', async () => {
    const mq = await create('MQ_JUMP', 2);
    const updated = await service.updateMeasurement(mq.id, { value: 0 });
    expect(Number(updated.value)).toBe(0);
    await expect(service.updateMeasurement(mq.id, { value: 4 })).rejects.toThrow();

    const fly = await create('FLY10_TIME', 1.5);
    await expect(service.updateMeasurement(fly.id, { value: 0 })).rejects.toThrow(/positive/i);
  });
});
