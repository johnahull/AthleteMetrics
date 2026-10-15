/**
 * An athlete added to a team today must get that team (and its organization) on a measurement dated today.
 * user_teams.joined_at is the moment of the add, while a measurement date is a calendar day, so comparing the
 * two timestamps dropped a same-day measurement to organization_id = NULL. resolveMeasurementOrganization and
 * createMeasurement must agree, and a measurement dated well before the join must still not get the team.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { MeasurementService } from '../../packages/api/services/measurement-service';
import { measurements, organizations, teams, userOrganizations, userTeams, users } from '@shared/schema';

describe('Measurement team context for an athlete who joined the team today', () => {
  const service = new MeasurementService();
  let orgId: string;
  let teamId: string;
  let otherTeamId: string;
  let athleteId: string;
  let coachId: string;

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [org] = await db.insert(organizations).values({ name: `Joined Org ${suffix}` }).returning();
    orgId = org.id;
    const [team, other] = await db
      .insert(teams)
      .values([
        { name: 'Joined Team', organizationId: orgId, level: 'College' },
        { name: 'Other Team', organizationId: orgId, level: 'College' },
      ])
      .returning();
    teamId = team.id;
    otherTeamId = other.id;
    const mk = async (tag: string) =>
      (
        await db
          .insert(users)
          .values({
            username: `joined-${tag}-${suffix}`,
            emails: [`joined-${tag}-${suffix}@test.com`],
            password: 'x',
            firstName: 'J',
            lastName: tag,
            fullName: `J ${tag}`,
            birthDate: '2008-01-01',
            birthYear: 2008,
          } as any)
          .returning()
      )[0].id;
    athleteId = await mk('ath');
    coachId = await mk('coach');
    await db.insert(userOrganizations).values({ userId: athleteId, organizationId: orgId, role: 'athlete' } as any);
  });

  afterEach(async () => {
    await db.delete(measurements).where(eq(measurements.userId, athleteId));
    await db.delete(userTeams).where(eq(userTeams.userId, athleteId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, orgId));
    await db.delete(teams).where(eq(teams.organizationId, orgId));
    await db.delete(users).where(inArray(users.id, [athleteId, coachId]));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  const join = (joinedAt: Date, team = teamId) =>
    db.insert(userTeams).values({ userId: athleteId, teamId: team, joinedAt, isActive: true });

  // Resolves the organization AND creates the row, so every case checks that the two agree.
  const resolveAndCreate = async (date: string) => {
    const resolved = await service.resolveMeasurementOrganization({ userId: athleteId, date, teamId: undefined });
    const created = await service.createMeasurement(
      { userId: athleteId, metric: 'FLY10_TIME', value: 1.5, date } as any,
      coachId,
      'coach'
    );
    expect(created.organizationId ?? null).toBe(resolved.organizationId);
    return { resolved, created };
  };

  // One fixed day per test (never the real clock), so no case flips at UTC midnight.
  const D = '2026-06-15';

  it('joined at noon UTC, measured that day: team and organization are resolved', async () => {
    await join(new Date(`${D}T12:00:00Z`));
    const { resolved, created } = await resolveAndCreate(D);
    expect(resolved).toEqual({ organizationId: orgId, ambiguous: false });
    expect(created.teamId).toBe(teamId);
  });

  it('joined at noon UTC, measured that day given as a client local midnight (05:00Z): resolved', async () => {
    await join(new Date(`${D}T12:00:00Z`));
    const resolved = await service.resolveMeasurementOrganization({
      userId: athleteId,
      date: `${D}T05:00:00.000Z`,
      teamId: undefined,
    });
    expect(resolved).toEqual({ organizationId: orgId, ambiguous: false });
  });

  it('joined at noon UTC, endpoint list of active teams for that day includes the team', async () => {
    await join(new Date(`${D}T12:00:00Z`));
    const active = await service.getAthleteActiveTeamsAtDate(athleteId, new Date(D));
    expect(active.map((t) => t.teamId)).toEqual([teamId]);
  });

  it('joined the day before, measured that day: resolved', async () => {
    await join(new Date('2026-06-14T12:00:00Z'));
    const { resolved, created } = await resolveAndCreate(D);
    expect(resolved).toEqual({ organizationId: orgId, ambiguous: false });
    expect(created.teamId).toBe(teamId);
  });

  it('added on a west-of-UTC evening (03:00Z next UTC day), measured the local day: resolved', async () => {
    await join(new Date('2026-06-16T03:00:00Z'));
    const { resolved, created } = await resolveAndCreate(D);
    expect(resolved).toEqual({ organizationId: orgId, ambiguous: false });
    expect(created.teamId).toBe(teamId);
  });

  it('joined 2 days after the measurement date (outside the one-day tolerance): no team', async () => {
    await join(new Date('2026-06-17T03:00:00Z'));
    const { resolved, created } = await resolveAndCreate(D);
    expect(resolved).toEqual({ organizationId: null, ambiguous: false });
    expect(created.teamId ?? null).toBeNull();
  });

  it('left the team before the measurement date (row still isActive): no team', async () => {
    await db
      .insert(userTeams)
      .values({ userId: athleteId, teamId, joinedAt: new Date('2020-01-01'), leftAt: new Date('2026-06-01T12:00:00Z'), isActive: true });
    const { resolved, created } = await resolveAndCreate(D);
    expect(resolved).toEqual({ organizationId: null, ambiguous: false });
    expect(created.teamId ?? null).toBeNull();
  });

  it('on two teams (one joined that day): ambiguous, no team auto-assigned', async () => {
    await join(new Date(`${D}T12:00:00Z`));
    await join(new Date('2020-01-01'), otherTeamId);
    const { resolved, created } = await resolveAndCreate(D);
    expect(resolved).toEqual({ organizationId: null, ambiguous: true });
    expect(created.teamId ?? null).toBeNull();
  });
});
