/**
 * Issue #539: the helper integration tests use to remove the rows they create.
 *
 * Deleting a user, team or organization is blocked by foreign keys without ON DELETE CASCADE
 * (user_teams, user_organizations, athlete_profiles, invitations and teams -> organizations), and several
 * afterAll blocks swallowed that error, so the rows stayed behind. purgeTestRows removes those dependents
 * first and then the users, teams and organizations, and reports a failure instead of swallowing it. measurements
 * carry no foreign keys, so nothing cascades to them; the helper deletes them by user and organization.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import { describe, it, expect, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { athleteProfiles, invitations, measurements, organizations, teams, userOrganizations, userTeams, users } from '@shared/schema';
import { purgeTestRows } from '../helpers/purge-test-rows';

describe('purgeTestRows (issue #539)', () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const mkUser = async (tag: string) =>
    (
      await db
        .insert(users)
        .values({
          username: `purge-${tag}-${suffix}`,
          emails: [`purge-${tag}-${suffix}@test.com`],
          password: 'x',
          firstName: 'Purge',
          lastName: tag,
          fullName: `Purge ${tag}`,
          birthDate: '2008-01-01',
          birthYear: 2008,
        })
        .returning()
    )[0];

  // Rows of an unrelated organization and user that a purge must never touch
  const keep: { userId?: string; orgId?: string } = {};

  afterAll(async () => {
    // plain cleanup of the bystander rows (no helper: this test's subject is the helper)
    if (keep.userId) {
      await db.delete(measurements).where(eq(measurements.userId, keep.userId));
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, keep.userId));
      await db.delete(users).where(eq(users.id, keep.userId));
    }
    if (keep.orgId) await db.delete(organizations).where(eq(organizations.id, keep.orgId));
  });

  it('removes users, teams and organizations together with the rows that block their deletion', async () => {
    const [org] = await db.insert(organizations).values({ name: `Purge Org ${suffix}` }).returning();
    const [team] = await db.insert(teams).values({ name: `Purge Team ${suffix}`, organizationId: org.id, level: 'College' }).returning();
    const inviter = await mkUser('inviter');
    const athlete = await mkUser('athlete');
    await db.insert(userOrganizations).values([
      { userId: inviter.id, organizationId: org.id, role: 'coach' },
      { userId: athlete.id, organizationId: org.id, role: 'athlete' },
    ]);
    await db.insert(userTeams).values({ userId: athlete.id, teamId: team.id, joinedAt: new Date('2020-01-01'), isActive: true });
    await db.insert(athleteProfiles).values({ userId: athlete.id } as any);
    await db.insert(invitations).values({
      organizationId: org.id,
      email: `purge-invitee-${suffix}@test.com`,
      role: 'athlete',
      invitedBy: inviter.id,
      token: `purge-token-${suffix}`,
      expiresAt: new Date(Date.now() + 86_400_000),
    } as any);

    await purgeTestRows({ usernameLike: [`purge-%-${suffix}`], orgNameLike: [`Purge Org ${suffix}`] });

    expect(await db.select().from(users).where(inArray(users.id, [inviter.id, athlete.id]))).toHaveLength(0);
    expect(await db.select().from(organizations).where(eq(organizations.id, org.id))).toHaveLength(0);
    expect(await db.select().from(teams).where(eq(teams.id, team.id))).toHaveLength(0);
    expect(await db.select().from(invitations).where(eq(invitations.organizationId, org.id))).toHaveLength(0);
    expect(await db.select().from(athleteProfiles).where(eq(athleteProfiles.userId, athlete.id))).toHaveLength(0);
  });

  it('also accepts explicit ids and leaves unrelated rows alone', async () => {
    const [org] = await db.insert(organizations).values({ name: `Purge Keep Org ${suffix}` }).returning();
    const bystander = await mkUser('bystander');
    keep.orgId = org.id;
    keep.userId = bystander.id;
    await db.insert(userOrganizations).values({ userId: bystander.id, organizationId: org.id, role: 'coach' });

    const [doomedOrg] = await db.insert(organizations).values({ name: `Purge Doomed Org ${suffix}` }).returning();
    const doomed = await mkUser('doomed');
    await db.insert(userOrganizations).values({ userId: doomed.id, organizationId: doomedOrg.id, role: 'athlete' });
    const mkMeasurement = (userId: string, organizationId: string) =>
      db.insert(measurements).values({
        userId, submittedBy: userId, organizationId, date: '2024-01-01', age: 16, metric: 'VERTICAL_JUMP', value: '30', units: 'in',
      });
    await mkMeasurement(doomed.id, doomedOrg.id);
    await mkMeasurement(bystander.id, org.id);

    await purgeTestRows({ userIds: [doomed.id], orgIds: [doomedOrg.id] });

    expect(await db.select().from(users).where(eq(users.id, doomed.id))).toHaveLength(0);
    expect(await db.select().from(organizations).where(eq(organizations.id, doomedOrg.id))).toHaveLength(0);
    expect(await db.select().from(measurements).where(eq(measurements.userId, doomed.id))).toHaveLength(0);
    expect(await db.select().from(measurements).where(eq(measurements.userId, bystander.id))).toHaveLength(1);
    expect(await db.select().from(users).where(eq(users.id, bystander.id))).toHaveLength(1);
    expect(await db.select().from(organizations).where(eq(organizations.id, org.id))).toHaveLength(1);
    expect(await db.select().from(userOrganizations).where(eq(userOrganizations.userId, bystander.id))).toHaveLength(1);
  });

  it('does nothing (and does not throw) when nothing matches', async () => {
    await expect(purgeTestRows({ usernameLike: [`no-such-user-${suffix}`], orgNameLike: [`no-such-org-${suffix}`] })).resolves.toBeUndefined();
    await expect(purgeTestRows({})).resolves.toBeUndefined();
  });

  it('rejects an empty pattern, which would match every row', async () => {
    await expect(purgeTestRows({ usernameLike: [''] })).rejects.toThrow(/pattern/i);
    await expect(purgeTestRows({ orgNameLike: ['%'] })).rejects.toThrow(/pattern/i);
  });
});
