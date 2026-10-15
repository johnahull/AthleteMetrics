/**
 * Global search must only return measurements of the searched organization.
 * Joining the athlete's org membership alone leaked a teammate's personal
 * (organization_id IS NULL) and other-organization rows to any org member.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { GlobalSearchService } from '../../packages/api/services/global-search-service';
import { measurements, organizations, userOrganizations, users } from '@shared/schema';

describe('GlobalSearchService measurement scope', () => {
  const service = new GlobalSearchService();
  const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const athleteName = `Gsearch Scope${suffix}`;
  let orgA: string;
  let orgB: string;
  let athleteId: string;
  const rowIds: Record<string, string> = {};

  beforeAll(async () => {
    [{ id: orgA }] = await db.insert(organizations).values({ name: `GS A ${suffix}` }).returning();
    [{ id: orgB }] = await db.insert(organizations).values({ name: `GS B ${suffix}` }).returning();
    [{ id: athleteId }] = await db
      .insert(users)
      .values({
        username: `gs-${suffix}`,
        emails: [`gs-${suffix}@test.com`],
        password: 'x',
        firstName: 'Gsearch',
        lastName: `Scope${suffix}`,
        fullName: athleteName,
      } as any)
      .returning();
    await db.insert(userOrganizations).values([
      { userId: athleteId, organizationId: orgA, role: 'athlete' },
      { userId: athleteId, organizationId: orgB, role: 'athlete' },
    ] as any);
    for (const [key, organizationId] of [['a', orgA], ['b', orgB], ['personal', null]] as const) {
      const [row] = await db
        .insert(measurements)
        .values({
          userId: athleteId,
          submittedBy: athleteId,
          date: '2026-02-01',
          metric: 'VERTICAL_JUMP',
          value: '30',
          units: 'in',
          age: 18,
          isVerified: true,
          organizationId,
        } as any)
        .returning();
      rowIds[key] = row.id;
    }
  });

  afterAll(async () => {
    await db.delete(measurements).where(eq(measurements.userId, athleteId));
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, athleteId));
    await db.delete(users).where(eq(users.id, athleteId));
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
  });

  it("returns only the searched organization's measurements", async () => {
    const result = await service.globalSearch(athleteName, athleteId, orgA, {
      includeAthletes: false,
      includeTeams: false,
    });
    expect(result.results.measurements.map((m) => m.id)).toEqual([rowIds.a]);
  });
});
