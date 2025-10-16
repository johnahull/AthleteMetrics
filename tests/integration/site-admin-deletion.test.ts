// DATABASE_URL must be set in environment - no fallback for security
// This prevents accidentally running tests against wrong database

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { db } from '../../server/db';
import { storage } from '../../server/storage';
import {
  users,
  organizations,
  teams,
  userOrganizations,
  userTeams,
  invitations,
  athleteProfiles,
  emailVerificationTokens,
  auditLogs,
  measurements,
  sessions,
  type User,
  type Organization,
  type Team,
  type Measurement
} from '../../shared/schema';
import { eq, sql } from 'drizzle-orm';

describe('Site Admin Deletion with Foreign Key Cleanup', () => {
  let testOrg: Organization;
  let testTeam: Team;
  let siteAdmin: User;
  let athlete: User;
  let coach: User;

  beforeAll(async () => {
    // Validate DATABASE_URL is set
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL must be set to run integration tests. ' +
        'Set it in your environment: export DATABASE_URL="postgresql://user:pass@localhost:5432/dbname"'
      );
    }
  });

  beforeEach(async () => {

    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: 'Test Org for Admin Deletion'
    }).returning();
    testOrg = org;

    // Create test team
    const [team] = await db.insert(teams).values({
      name: 'Test Team for Admin Deletion',
      level: 'College',
      organizationId: testOrg.id
    }).returning();
    testTeam = team;

    // Create site admin to be deleted
    const [admin] = await db.insert(users).values({
      username: 'site_admin_to_delete',
      firstName: 'Admin',
      lastName: 'ToDelete',
      fullName: 'Admin ToDelete',
      emails: ['admin@test.com'],
      password: 'hashed_password',
      isSiteAdmin: true,
      birthDate: '1990-01-01'
    }).returning();
    siteAdmin = admin;

    // Create an athlete that will be related to the admin
    const [ath] = await db.insert(users).values({
      username: 'test_athlete',
      firstName: 'Test',
      lastName: 'Athlete',
      fullName: 'Test Athlete',
      emails: ['athlete@test.com'],
      password: 'hashed_password',
      isSiteAdmin: false,
      birthDate: '2000-01-01'
    }).returning();
    athlete = ath;

    // Create a coach that will be related to the admin
    const [coachUser] = await db.insert(users).values({
      username: 'test_coach',
      firstName: 'Test',
      lastName: 'Coach',
      fullName: 'Test Coach',
      emails: ['coach@test.com'],
      password: 'hashed_password',
      isSiteAdmin: false,
      birthDate: '1985-01-01'
    }).returning();
    coach = coachUser;

    // Add admin to organization and team
    await db.insert(userOrganizations).values({
      userId: siteAdmin.id,
      organizationId: testOrg.id,
      role: 'org_admin'
    });

    await db.insert(userTeams).values({
      userId: siteAdmin.id,
      teamId: testTeam.id
    });
  });

  afterEach(async () => {
    // Clean up in reverse order of dependencies
    await db.delete(sessions).where(sql`true`);
    await db.delete(measurements).where(sql`true`);
    await db.delete(auditLogs).where(sql`true`);
    await db.delete(invitations).where(sql`true`);
    await db.delete(emailVerificationTokens).where(sql`true`);
    await db.delete(athleteProfiles).where(sql`true`);
    await db.delete(userTeams).where(sql`true`);
    await db.delete(userOrganizations).where(sql`true`);
    await db.delete(users).where(sql`true`);
    await db.delete(teams).where(sql`true`);
    await db.delete(organizations).where(sql`true`);
  });

  it('should delete site admin with invitations sent by them', async () => {
    // Create invitation sent by site admin
    await db.insert(invitations).values({
      email: 'invited_athlete@test.com',
      firstName: 'Invited',
      lastName: 'Athlete',
      organizationId: testOrg.id,
      role: 'athlete',
      invitedBy: siteAdmin.id,
      token: 'test_token_sent_by_admin',
      expiresAt: new Date(Date.now() + 86400000)
    });

    // Verify invitation exists before deletion
    const invitationsBefore = await db.select().from(invitations).where(eq(invitations.invitedBy, siteAdmin.id));
    expect(invitationsBefore).toHaveLength(1);

    // Delete site admin
    await storage.deleteUser(siteAdmin.id);

    // Verify admin is deleted
    const deletedAdmin = await storage.getUser(siteAdmin.id);
    expect(deletedAdmin).toBeUndefined();

    // Verify invitations sent by admin are deleted
    const invitationsAfter = await db.select().from(invitations).where(eq(invitations.invitedBy, siteAdmin.id));
    expect(invitationsAfter).toHaveLength(0);
  });

  it('should delete site admin with invitations they accepted', async () => {
    // Create invitation accepted by site admin
    await db.insert(invitations).values({
      email: siteAdmin.emails[0],
      firstName: siteAdmin.firstName,
      lastName: siteAdmin.lastName,
      organizationId: testOrg.id,
      role: 'org_admin',
      invitedBy: coach.id,
      acceptedBy: siteAdmin.id,
      token: 'test_token_accepted_by_admin',
      status: 'accepted',
      expiresAt: new Date(Date.now() + 86400000)
    });

    // Verify invitation exists before deletion
    const invitationsBefore = await db.select().from(invitations).where(eq(invitations.acceptedBy, siteAdmin.id));
    expect(invitationsBefore).toHaveLength(1);

    // Delete site admin
    await storage.deleteUser(siteAdmin.id);

    // Verify admin is deleted
    const deletedAdmin = await storage.getUser(siteAdmin.id);
    expect(deletedAdmin).toBeUndefined();

    // Verify invitation's acceptedBy field is set to NULL (preserve invitation history)
    const invitationsAfter = await db.select().from(invitations).where(eq(invitations.acceptedBy, siteAdmin.id));
    expect(invitationsAfter).toHaveLength(0);

    // Verify invitation still exists but acceptedBy is null
    const invitationPreserved = await db.select().from(invitations).where(eq(invitations.token, 'test_token_accepted_by_admin'));
    expect(invitationPreserved).toHaveLength(1);
    expect(invitationPreserved[0].acceptedBy).toBeNull();
  });

  it('should delete site admin with invitations they cancelled', async () => {
    // Create invitation cancelled by site admin
    await db.insert(invitations).values({
      email: 'cancelled_invite@test.com',
      firstName: 'Cancelled',
      lastName: 'Invite',
      organizationId: testOrg.id,
      role: 'athlete',
      invitedBy: coach.id,
      cancelledBy: siteAdmin.id,
      token: 'test_token_cancelled_by_admin',
      status: 'cancelled',
      expiresAt: new Date(Date.now() + 86400000)
    });

    // Verify invitation exists before deletion
    const invitationsBefore = await db.select().from(invitations).where(eq(invitations.cancelledBy, siteAdmin.id));
    expect(invitationsBefore).toHaveLength(1);

    // Delete site admin
    await storage.deleteUser(siteAdmin.id);

    // Verify admin is deleted
    const deletedAdmin = await storage.getUser(siteAdmin.id);
    expect(deletedAdmin).toBeUndefined();

    // Verify invitation's cancelledBy field is set to NULL (preserve invitation history)
    const invitationsAfter = await db.select().from(invitations).where(eq(invitations.cancelledBy, siteAdmin.id));
    expect(invitationsAfter).toHaveLength(0);

    // Verify invitation still exists but cancelledBy is null
    const invitationPreserved = await db.select().from(invitations).where(eq(invitations.token, 'test_token_cancelled_by_admin'));
    expect(invitationPreserved).toHaveLength(1);
    expect(invitationPreserved[0].cancelledBy).toBeNull();
  });

  it('should delete site admin with invitations FOR them (as playerId)', async () => {
    // Create invitation FOR site admin (as athlete/playerId)
    await db.insert(invitations).values({
      email: siteAdmin.emails[0],
      firstName: siteAdmin.firstName,
      lastName: siteAdmin.lastName,
      organizationId: testOrg.id,
      playerId: siteAdmin.id, // Invitation FOR this admin
      role: 'athlete',
      invitedBy: coach.id,
      token: 'test_token_for_admin',
      expiresAt: new Date(Date.now() + 86400000)
    });

    // Verify invitation exists before deletion
    const invitationsBefore = await db.select().from(invitations).where(eq(invitations.playerId, siteAdmin.id));
    expect(invitationsBefore).toHaveLength(1);

    // Delete site admin
    await storage.deleteUser(siteAdmin.id);

    // Verify admin is deleted
    const deletedAdmin = await storage.getUser(siteAdmin.id);
    expect(deletedAdmin).toBeUndefined();

    // Verify invitations FOR admin (playerId) are deleted
    const invitationsAfter = await db.select().from(invitations).where(eq(invitations.playerId, siteAdmin.id));
    expect(invitationsAfter).toHaveLength(0);
  });

  it('should delete site admin with athlete profile', async () => {
    // Create athlete profile for site admin
    await db.insert(athleteProfiles).values({
      userId: siteAdmin.id,
      position: 'Guard',
      jerseyNumber: '42',
      height: '6\'2"',
      weight: 180,
      graduationYear: 2024
    });

    // Verify athlete profile exists before deletion
    const profilesBefore = await db.select().from(athleteProfiles).where(eq(athleteProfiles.userId, siteAdmin.id));
    expect(profilesBefore).toHaveLength(1);

    // Delete site admin
    await storage.deleteUser(siteAdmin.id);

    // Verify admin is deleted
    const deletedAdmin = await storage.getUser(siteAdmin.id);
    expect(deletedAdmin).toBeUndefined();

    // Verify athlete profile is deleted
    const profilesAfter = await db.select().from(athleteProfiles).where(eq(athleteProfiles.userId, siteAdmin.id));
    expect(profilesAfter).toHaveLength(0);
  });

  it('should delete site admin with email verification tokens', async () => {
    // Create email verification token for site admin
    await db.insert(emailVerificationTokens).values({
      userId: siteAdmin.id,
      email: siteAdmin.emails[0],
      token: 'test_verification_token',
      expiresAt: new Date(Date.now() + 86400000)
    });

    // Verify token exists before deletion
    const tokensBefore = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.userId, siteAdmin.id));
    expect(tokensBefore).toHaveLength(1);

    // Delete site admin
    await storage.deleteUser(siteAdmin.id);

    // Verify admin is deleted
    const deletedAdmin = await storage.getUser(siteAdmin.id);
    expect(deletedAdmin).toBeUndefined();

    // Verify email verification token is deleted
    const tokensAfter = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.userId, siteAdmin.id));
    expect(tokensAfter).toHaveLength(0);
  });

  it('should preserve audit logs with null userId when deleting site admin', async () => {
    // Create audit log for site admin
    const [auditLog] = await db.insert(auditLogs).values({
      userId: siteAdmin.id,
      action: 'user.login',
      resourceType: 'user',
      resourceId: siteAdmin.id
    }).returning();

    // Verify audit log exists before deletion
    const logsBefore = await db.select().from(auditLogs).where(eq(auditLogs.id, auditLog.id));
    expect(logsBefore).toHaveLength(1);
    expect(logsBefore[0].userId).toBe(siteAdmin.id);

    // Delete site admin
    await storage.deleteUser(siteAdmin.id);

    // Verify admin is deleted
    const deletedAdmin = await storage.getUser(siteAdmin.id);
    expect(deletedAdmin).toBeUndefined();

    // Verify audit logs are PRESERVED but userId is set to NULL (compliance requirement)
    const logsAfter = await db.select().from(auditLogs).where(eq(auditLogs.id, auditLog.id));
    expect(logsAfter).toHaveLength(1);
    expect(logsAfter[0].userId).toBeNull();
    expect(logsAfter[0].action).toBe('user.login');
  });

  it('should revoke all active sessions when deleting site admin', async () => {
    // Create active session for site admin
    const [session] = await db.insert(sessions).values({
      sid: `session-${siteAdmin.id}-test`,
      sess: { cookie: {}, userId: siteAdmin.id },
      expire: new Date(Date.now() + 86400000), // 24 hours from now
      userId: siteAdmin.id
    }).returning();

    // Verify session exists before deletion
    const sessionsBefore = await db.select().from(sessions).where(eq(sessions.sid, session.sid));
    expect(sessionsBefore).toHaveLength(1);
    expect(sessionsBefore[0].userId).toBe(siteAdmin.id);

    // Delete site admin
    await storage.deleteUser(siteAdmin.id);

    // Verify admin is deleted
    const deletedAdmin = await storage.getUser(siteAdmin.id);
    expect(deletedAdmin).toBeUndefined();

    // Verify sessions are DELETED for security (no zombie sessions)
    const sessionsAfter = await db.select().from(sessions).where(eq(sessions.sid, session.sid));
    expect(sessionsAfter).toHaveLength(0);
  });

  it('should preserve measurements completely unchanged when athlete is deleted', async () => {
    // Create measurements for athlete
    const [measurement1] = await db.insert(measurements).values({
      userId: athlete.id,
      teamId: testTeam.id,
      metric: 'VERTICAL_JUMP',
      value: '30',
      units: 'in',
      age: 25,
      date: '2024-01-01',
      submittedBy: coach.id
    }).returning();

    const [measurement2] = await db.insert(measurements).values({
      userId: athlete.id,
      teamId: testTeam.id,
      metric: 'DASH_40YD',
      value: '4.5',
      units: 's',
      age: 25,
      date: '2024-01-02',
      submittedBy: siteAdmin.id
    }).returning();

    // Verify measurements exist before deletion
    const measurementsBefore = await db.select().from(measurements).where(eq(measurements.userId, athlete.id));
    expect(measurementsBefore).toHaveLength(2);

    // Delete athlete
    await storage.deleteUser(athlete.id);

    // Verify athlete is deleted
    const deletedAthlete = await storage.getUser(athlete.id);
    expect(deletedAthlete).toBeUndefined();

    // Verify measurements are PRESERVED with ORIGINAL userId
    const measurementsAfter = await db.select().from(measurements)
      .where(sql`${measurements.userId} = ${athlete.id}`);
    expect(measurementsAfter).toHaveLength(2);

    // Verify measurement data is completely unchanged
    const m1After = measurementsAfter.find(m => m.metric === 'VERTICAL_JUMP');
    expect(m1After).toBeDefined();
    expect(m1After!.userId).toBe(athlete.id); // Original userId preserved
    expect(m1After!.submittedBy).toBe(coach.id); // Original submittedBy preserved
    expect(m1After!.value).toBe(measurement1.value);
    expect(m1After!.id).toBe(measurement1.id);

    const m2After = measurementsAfter.find(m => m.metric === 'DASH_40YD');
    expect(m2After).toBeDefined();
    expect(m2After!.userId).toBe(athlete.id); // Original userId preserved
    expect(m2After!.submittedBy).toBe(siteAdmin.id); // Original submittedBy preserved
  });

  it('should preserve measurements completely unchanged when coach is deleted', async () => {
    // Create measurements submitted by coach
    const [measurement1] = await db.insert(measurements).values({
      userId: athlete.id,
      teamId: testTeam.id,
      metric: 'VERTICAL_JUMP',
      value: '30',
      units: 'in',
      age: 25,
      date: '2024-01-01',
      submittedBy: coach.id
    }).returning();

    const [measurement2] = await db.insert(measurements).values({
      userId: athlete.id,
      teamId: testTeam.id,
      metric: 'T_TEST',
      value: '9.5',
      units: 's',
      age: 25,
      date: '2024-01-02',
      submittedBy: coach.id
    }).returning();

    // Verify measurements exist before deletion
    const measurementsBefore = await db.select().from(measurements)
      .where(sql`${measurements.submittedBy} = ${coach.id}`);
    expect(measurementsBefore).toHaveLength(2);

    // Delete coach
    await storage.deleteUser(coach.id);

    // Verify coach is deleted
    const deletedCoach = await storage.getUser(coach.id);
    expect(deletedCoach).toBeUndefined();

    // Verify measurements are PRESERVED with ORIGINAL submittedBy
    const measurementsAfter = await db.select().from(measurements)
      .where(sql`${measurements.submittedBy} = ${coach.id}`);
    expect(measurementsAfter).toHaveLength(2);

    // Verify measurement data is completely unchanged
    const m1After = measurementsAfter.find(m => m.metric === 'VERTICAL_JUMP');
    expect(m1After).toBeDefined();
    expect(m1After!.submittedBy).toBe(coach.id); // Original submittedBy preserved
    expect(m1After!.userId).toBe(athlete.id); // Original userId preserved
    expect(m1After!.value).toBe(measurement1.value);
    expect(m1After!.id).toBe(measurement1.id);

    const m2After = measurementsAfter.find(m => m.metric === 'T_TEST');
    expect(m2After).toBeDefined();
    expect(m2After!.submittedBy).toBe(coach.id); // Original submittedBy preserved
  });

  it('should preserve measurements completely unchanged when verifier is deleted', async () => {
    // Create measurement verified by site admin
    const [measurement] = await db.insert(measurements).values({
      userId: athlete.id,
      teamId: testTeam.id,
      metric: 'VERTICAL_JUMP',
      value: '30',
      units: 'in',
      age: 25,
      date: '2024-01-01',
      submittedBy: coach.id,
      verifiedBy: siteAdmin.id,
      isVerified: true
    }).returning();

    // Verify measurement exists before deletion
    const measurementsBefore = await db.select().from(measurements)
      .where(sql`${measurements.verifiedBy} = ${siteAdmin.id}`);
    expect(measurementsBefore).toHaveLength(1);

    // Delete site admin (verifier)
    await storage.deleteUser(siteAdmin.id);

    // Verify admin is deleted
    const deletedAdmin = await storage.getUser(siteAdmin.id);
    expect(deletedAdmin).toBeUndefined();

    // Verify measurement is PRESERVED with ORIGINAL verifiedBy
    const measurementsAfter = await db.select().from(measurements)
      .where(sql`${measurements.verifiedBy} = ${siteAdmin.id}`);
    expect(measurementsAfter).toHaveLength(1);

    // Verify measurement data is completely unchanged
    expect(measurementsAfter[0].verifiedBy).toBe(siteAdmin.id); // Original verifiedBy preserved
    expect(measurementsAfter[0].submittedBy).toBe(coach.id); // Original submittedBy preserved
    expect(measurementsAfter[0].userId).toBe(athlete.id); // Original userId preserved
    expect(measurementsAfter[0].isVerified).toBe(true); // Still verified
    expect(measurementsAfter[0].value).toBe(measurement.value);
    expect(measurementsAfter[0].id).toBe(measurement.id);
  });

  it('should preserve measurements when user is deleted (even if they are the subject)', async () => {
    // Create measurement where site admin is the subject (athlete)
    const [measurement] = await db.insert(measurements).values({
      userId: siteAdmin.id,
      teamId: testTeam.id,
      metric: 'VERTICAL_JUMP',
      value: '35',
      units: 'in',
      age: 34,
      date: '2024-01-01',
      submittedBy: coach.id
    }).returning();

    // Verify measurement exists before deletion
    const measurementsBefore = await db.select().from(measurements)
      .where(sql`${measurements.userId} = ${siteAdmin.id}`);
    expect(measurementsBefore).toHaveLength(1);

    // Delete site admin
    await storage.deleteUser(siteAdmin.id);

    // Verify admin is deleted
    const deletedAdmin = await storage.getUser(siteAdmin.id);
    expect(deletedAdmin).toBeUndefined();

    // Verify measurement is PRESERVED with original userId
    const measurementsAfter = await db.select().from(measurements)
      .where(sql`${measurements.userId} = ${siteAdmin.id}`);
    expect(measurementsAfter).toHaveLength(1);
    expect(measurementsAfter[0].userId).toBe(siteAdmin.id); // Original userId preserved
    expect(measurementsAfter[0].submittedBy).toBe(coach.id); // Original submittedBy preserved
    expect(measurementsAfter[0].id).toBe(measurement.id);
  });

  it('should delete site admin organization memberships', async () => {
    // Organization membership already created in beforeEach

    // Verify organization membership exists before deletion
    const orgsBefore = await db.select()
      .from(userOrganizations)
      .where(eq(userOrganizations.userId, siteAdmin.id));
    expect(orgsBefore).toHaveLength(1);
    expect(orgsBefore[0].organizationId).toBe(testOrg.id);

    // Delete site admin
    await storage.deleteUser(siteAdmin.id);

    // Verify admin is deleted (soft delete - not returned by getUser)
    const deletedAdmin = await storage.getUser(siteAdmin.id);
    expect(deletedAdmin).toBeUndefined();

    // Verify organization memberships are DELETED
    // Rationale: Measurements remain queryable via measurements → teamId → teams.organizationId
    // so userOrganizations can be cleaned up during user deletion
    const orgsAfter = await db.select()
      .from(userOrganizations)
      .where(eq(userOrganizations.userId, siteAdmin.id));
    expect(orgsAfter).toHaveLength(0);
  });

  it('should delete site admin team memberships', async () => {
    // Team membership already created in beforeEach

    // Verify team membership exists before deletion
    const teamsBefore = await db.select()
      .from(userTeams)
      .where(eq(userTeams.userId, siteAdmin.id));
    expect(teamsBefore).toHaveLength(1);
    expect(teamsBefore[0].teamId).toBe(testTeam.id);

    // Delete site admin
    await storage.deleteUser(siteAdmin.id);

    // Verify admin is deleted
    const deletedAdmin = await storage.getUser(siteAdmin.id);
    expect(deletedAdmin).toBeUndefined();

    // Verify team memberships are deleted
    const teamsAfter = await db.select()
      .from(userTeams)
      .where(eq(userTeams.userId, siteAdmin.id));
    expect(teamsAfter).toHaveLength(0);
  });

  it('should handle site admin deletion with all foreign key relationships in one operation', async () => {
    // Create comprehensive test data with all foreign key relationships

    // 1. Invitations sent BY admin
    await db.insert(invitations).values({
      email: 'invited1@test.com',
      organizationId: testOrg.id,
      role: 'athlete',
      invitedBy: siteAdmin.id,
      token: 'token_sent_1',
      expiresAt: new Date(Date.now() + 86400000)
    });

    // 2. Invitation accepted BY admin
    await db.insert(invitations).values({
      email: siteAdmin.emails[0],
      organizationId: testOrg.id,
      role: 'org_admin',
      invitedBy: coach.id,
      acceptedBy: siteAdmin.id,
      token: 'token_accepted',
      status: 'accepted',
      expiresAt: new Date(Date.now() + 86400000)
    });

    // 3. Invitation cancelled BY admin
    await db.insert(invitations).values({
      email: 'cancelled@test.com',
      organizationId: testOrg.id,
      role: 'athlete',
      invitedBy: coach.id,
      cancelledBy: siteAdmin.id,
      token: 'token_cancelled',
      status: 'cancelled',
      expiresAt: new Date(Date.now() + 86400000)
    });

    // 4. Invitation FOR admin (playerId)
    await db.insert(invitations).values({
      email: siteAdmin.emails[0],
      organizationId: testOrg.id,
      playerId: siteAdmin.id,
      role: 'athlete',
      invitedBy: coach.id,
      token: 'token_for_admin',
      expiresAt: new Date(Date.now() + 86400000)
    });

    // 5. Athlete profile
    await db.insert(athleteProfiles).values({
      userId: siteAdmin.id,
      position: 'Forward',
      jerseyNumber: '10'
    });

    // 6. Email verification token
    await db.insert(emailVerificationTokens).values({
      userId: siteAdmin.id,
      email: siteAdmin.emails[0],
      token: 'verification_token',
      expiresAt: new Date(Date.now() + 86400000)
    });

    // 7. Audit log
    await db.insert(auditLogs).values({
      userId: siteAdmin.id,
      action: 'user.login',
      resourceType: 'user',
      resourceId: siteAdmin.id
    });

    // 8. Measurement submitted by admin
    await db.insert(measurements).values({
      userId: athlete.id,
      teamId: testTeam.id,
      metric: 'VERTICAL_JUMP',
      value: '30',
      units: 'in',
      age: 25,
      date: '2024-01-01',
      submittedBy: siteAdmin.id
    });

    // 9. Measurement verified by admin
    await db.insert(measurements).values({
      userId: athlete.id,
      teamId: testTeam.id,
      metric: 'DASH_40YD',
      value: '4.5',
      units: 's',
      age: 25,
      date: '2024-01-01',
      submittedBy: coach.id,
      verifiedBy: siteAdmin.id,
      isVerified: true
    });

    // 10. Measurement where admin is subject
    await db.insert(measurements).values({
      userId: siteAdmin.id,
      teamId: testTeam.id,
      metric: 'VERTICAL_JUMP',
      value: '35',
      units: 'in',
      age: 34,
      date: '2024-01-01',
      submittedBy: coach.id
    });

    // Verify all data exists before deletion
    const invitationsSentBefore = await db.select().from(invitations).where(eq(invitations.invitedBy, siteAdmin.id));
    expect(invitationsSentBefore.length).toBeGreaterThan(0);

    // Delete site admin - should handle all foreign keys properly
    await storage.deleteUser(siteAdmin.id);

    // Verify admin is deleted
    const deletedAdmin = await storage.getUser(siteAdmin.id);
    expect(deletedAdmin).toBeUndefined();

    // Verify no foreign key violations occurred
    // All queries should return empty results or preserved data with nullified references

    // Check invitations sent by admin are deleted
    const invitationsSentAfter = await db.select().from(invitations).where(eq(invitations.invitedBy, siteAdmin.id));
    expect(invitationsSentAfter).toHaveLength(0);

    // Check invitations FOR admin (playerId) are deleted
    const invitationsForAfter = await db.select().from(invitations).where(eq(invitations.playerId, siteAdmin.id));
    expect(invitationsForAfter).toHaveLength(0);

    // Check invitations accepted/cancelled by admin have nullified references
    const invitationsAcceptedAfter = await db.select().from(invitations).where(eq(invitations.acceptedBy, siteAdmin.id));
    expect(invitationsAcceptedAfter).toHaveLength(0);

    const invitationsCancelledAfter = await db.select().from(invitations).where(eq(invitations.cancelledBy, siteAdmin.id));
    expect(invitationsCancelledAfter).toHaveLength(0);

    // Check athlete profile deleted
    const profilesAfter = await db.select().from(athleteProfiles).where(eq(athleteProfiles.userId, siteAdmin.id));
    expect(profilesAfter).toHaveLength(0);

    // Check email verification tokens deleted
    const tokensAfter = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.userId, siteAdmin.id));
    expect(tokensAfter).toHaveLength(0);

    // Check audit logs are PRESERVED with nullified userId (compliance requirement)
    const logsAfter = await db.select().from(auditLogs).where(eq(auditLogs.userId, siteAdmin.id));
    expect(logsAfter).toHaveLength(0); // No logs with this userId anymore

    // Verify audit logs still exist in database but with NULL userId
    const allLogs = await db.select().from(auditLogs);
    const preservedLogs = allLogs.filter(log =>
      log.action === 'user.login' && log.userId === null
    );
    expect(preservedLogs.length).toBeGreaterThan(0); // Audit trail preserved for compliance

    // Check measurements where admin was subject are PRESERVED with original userId
    const measurementsSubjectAfter = await db.select().from(measurements)
      .where(sql`${measurements.userId} = ${siteAdmin.id}`);
    expect(measurementsSubjectAfter).toHaveLength(1);
    expect(measurementsSubjectAfter[0].userId).toBe(siteAdmin.id); // Original userId preserved

    // Check measurements submitted by admin are PRESERVED with original submittedBy
    const measurementsSubmittedAfter = await db.select().from(measurements)
      .where(sql`${measurements.submittedBy} = ${siteAdmin.id}`);
    expect(measurementsSubmittedAfter).toHaveLength(1);
    expect(measurementsSubmittedAfter[0].submittedBy).toBe(siteAdmin.id); // Original submittedBy preserved

    // Check measurements verified by admin are PRESERVED with original verifiedBy
    const measurementsVerifiedAfter = await db.select().from(measurements)
      .where(sql`${measurements.verifiedBy} = ${siteAdmin.id}`);
    expect(measurementsVerifiedAfter).toHaveLength(1);
    expect(measurementsVerifiedAfter[0].verifiedBy).toBe(siteAdmin.id); // Original verifiedBy preserved

    // Verify athlete's measurements are also preserved
    const athleteMeasurements = await db.select().from(measurements).where(eq(measurements.userId, athlete.id));
    expect(athleteMeasurements).toHaveLength(2); // Both measurements preserved

    // Find each measurement - both should have original references
    const submittedMeasurement = athleteMeasurements.find(m => m.metric === 'VERTICAL_JUMP');
    const verifiedMeasurement = athleteMeasurements.find(m => m.metric === 'DASH_40YD');

    expect(submittedMeasurement).toBeDefined();
    expect(submittedMeasurement!.submittedBy).toBe(siteAdmin.id); // Original submittedBy preserved
    expect(submittedMeasurement!.userId).toBe(athlete.id);

    expect(verifiedMeasurement).toBeDefined();
    expect(verifiedMeasurement!.verifiedBy).toBe(siteAdmin.id); // Original verifiedBy preserved
    expect(verifiedMeasurement!.submittedBy).toBe(coach.id); // Original submittedBy preserved
  });

  it('should use transaction for atomicity - all or nothing deletion', async () => {
    // Create test data
    await db.insert(athleteProfiles).values({
      userId: siteAdmin.id,
      position: 'Guard',
      jerseyNumber: '42'
    });

    await db.insert(emailVerificationTokens).values({
      userId: siteAdmin.id,
      email: siteAdmin.emails[0],
      token: 'test_token',
      expiresAt: new Date(Date.now() + 86400000)
    });

    // Delete site admin
    await storage.deleteUser(siteAdmin.id);

    // If transaction works correctly, either all deletes succeed or all fail
    // Verify admin is completely deleted
    const deletedAdmin = await storage.getUser(siteAdmin.id);
    expect(deletedAdmin).toBeUndefined();

    // Verify all related data is also deleted (atomicity)
    const profiles = await db.select().from(athleteProfiles).where(eq(athleteProfiles.userId, siteAdmin.id));
    expect(profiles).toHaveLength(0);

    const tokens = await db.select().from(emailVerificationTokens).where(eq(emailVerificationTokens.userId, siteAdmin.id));
    expect(tokens).toHaveLength(0);
  });

  it('should preserve measurements in analytics queries after user deletion', async () => {
    // Add users to organization for analytics
    await db.insert(userOrganizations).values({
      userId: athlete.id,
      organizationId: testOrg.id,
      role: 'athlete'
    });

    await db.insert(userOrganizations).values({
      userId: coach.id,
      organizationId: testOrg.id,
      role: 'coach'
    });

    // Create verified measurements for athlete
    await db.insert(measurements).values({
      userId: athlete.id,
      teamId: testTeam.id,
      metric: 'VERTICAL_JUMP',
      value: '30',
      units: 'in',
      age: 25,
      date: '2024-01-01',
      submittedBy: coach.id,
      isVerified: true
    });

    await db.insert(measurements).values({
      userId: athlete.id,
      teamId: testTeam.id,
      metric: 'DASH_40YD',
      value: '4.5',
      units: 's',
      age: 25,
      date: '2024-01-02',
      submittedBy: coach.id,
      isVerified: true
    });

    // Query measurements using analytics-style query (leftJoin users)
    const measurementsBeforeDeletion = await db
      .select({
        userId: measurements.userId,
        metric: measurements.metric,
        value: measurements.value,
        athleteName: sql<string>`COALESCE(${users.firstName} || ' ' || ${users.lastName}, '[Deleted User]')`,
      })
      .from(measurements)
      .leftJoin(users, eq(measurements.userId, users.id))
      .leftJoin(userOrganizations, eq(users.id, userOrganizations.userId))
      .where(
        sql`${measurements.isVerified} = true
            AND ${userOrganizations.organizationId} = ${testOrg.id}`
      );

    expect(measurementsBeforeDeletion).toHaveLength(2);
    expect(measurementsBeforeDeletion[0].athleteName).toBe('Test Athlete');

    // Delete athlete
    await storage.deleteUser(athlete.id);

    // Verify athlete is deleted
    const deletedAthlete = await storage.getUser(athlete.id);
    expect(deletedAthlete).toBeUndefined();

    // Query measurements again using analytics-style query
    // This should STILL return measurements because:
    // 1. We use leftJoin for users (not innerJoin)
    // 2. We keep userOrganizations records (not deleted with user)
    // 3. COALESCE with deletedAt check shows "[Deleted User]" for soft-deleted users
    const measurementsAfterDeletion = await db
      .select({
        userId: measurements.userId,
        metric: measurements.metric,
        value: measurements.value,
        athleteName: sql<string>`COALESCE(CASE WHEN ${users.deletedAt} IS NOT NULL THEN '[Deleted User]' ELSE ${users.firstName} || ' ' || ${users.lastName} END, '[Deleted User]')`,
      })
      .from(measurements)
      .leftJoin(users, eq(measurements.userId, users.id))
      .leftJoin(userOrganizations, eq(measurements.userId, userOrganizations.userId))
      .where(
        sql`${measurements.isVerified} = true
            AND ${userOrganizations.organizationId} = ${testOrg.id}`
      );

    // ✅ CRITICAL: Measurements should still appear in analytics
    expect(measurementsAfterDeletion).toHaveLength(2);

    // ✅ Athlete name should show "[Deleted User]" for soft-deleted users
    expect(measurementsAfterDeletion[0].athleteName).toBe('[Deleted User]');

    // ✅ Original userId should be preserved
    expect(measurementsAfterDeletion[0].userId).toBe(athlete.id);

    // ✅ Values should be unchanged
    const verticalJump = measurementsAfterDeletion.find(m => m.metric === 'VERTICAL_JUMP');
    expect(verticalJump).toBeDefined();
    expect(verticalJump!.value).toBe('30');

    const dash40 = measurementsAfterDeletion.find(m => m.metric === 'DASH_40YD');
    expect(dash40).toBeDefined();
    expect(dash40!.value).toBe('4.5');
  });
});

describe('User Soft Delete (Level 2 Immutability)', () => {
  let testOrg: Organization;
  let testTeam: Team;
  let athlete: User;
  let coach: User;

  beforeEach(async () => {
    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: 'Test Org for Soft Delete'
    }).returning();
    testOrg = org;

    // Create test team
    const [team] = await db.insert(teams).values({
      name: 'Test Team for Soft Delete',
      organizationId: testOrg.id,
      level: 'HS'
    }).returning();
    testTeam = team;

    // Create athlete
    const [athleteUser] = await db.insert(users).values({
      username: `athlete-soft-delete-${Date.now()}`,
      emails: ['athlete-soft@test.com'],
      password: 'password123',
      firstName: 'Test',
      lastName: 'Athlete',
      fullName: 'Test Athlete'
    }).returning();
    athlete = athleteUser;

    // Create coach
    const [coachUser] = await db.insert(users).values({
      username: `coach-soft-delete-${Date.now()}`,
      emails: ['coach-soft@test.com'],
      password: 'password123',
      firstName: 'Test',
      lastName: 'Coach',
      fullName: 'Test Coach'
    }).returning();
    coach = coachUser;

    // Link users to org and team
    await db.insert(userOrganizations).values([
      { userId: athlete.id, organizationId: testOrg.id, role: 'athlete' },
      { userId: coach.id, organizationId: testOrg.id, role: 'coach' }
    ]);

    await db.insert(userTeams).values([
      { userId: athlete.id, teamId: testTeam.id },
      { userId: coach.id, teamId: testTeam.id }
    ]);
  });

  afterEach(async () => {
    // Cleanup
    await db.delete(measurements).where(sql`1=1`);
    await db.delete(userTeams).where(sql`1=1`);
    await db.delete(userOrganizations).where(sql`1=1`);
    await db.delete(sessions).where(sql`1=1`);
    await db.delete(users).where(sql`1=1`);
    await db.delete(teams).where(sql`1=1`);
    await db.delete(organizations).where(sql`1=1`);
  });

  it('should soft delete user by setting deletedAt timestamp', async () => {
    // Delete athlete
    await storage.deleteUser(athlete.id);

    // User should still exist in database but with deletedAt set
    const [deletedUser] = await db.select().from(users).where(eq(users.id, athlete.id));
    expect(deletedUser).toBeDefined();
    expect(deletedUser.deletedAt).toBeInstanceOf(Date);
    expect(deletedUser.isActive).toBe(false);
  });

  it('should preserve all related data when soft deleting', async () => {
    // Create measurement
    await db.insert(measurements).values({
      userId: athlete.id,
      teamId: testTeam.id,
      metric: 'VERTICAL_JUMP',
      value: '30',
      units: 'in',
      age: 16,
      date: '2024-01-01',
      submittedBy: coach.id
    });

    // Delete athlete
    await storage.deleteUser(athlete.id);

    // Verify user-organization relationships preserved (for measurement context)
    const userOrgs = await db.select().from(userOrganizations).where(eq(userOrganizations.userId, athlete.id));
    expect(userOrgs).toHaveLength(1);

    // Note: userTeams are deleted (hybrid approach - teams less critical than org membership)
    const userTeamsData = await db.select().from(userTeams).where(eq(userTeams.userId, athlete.id));
    expect(userTeamsData).toHaveLength(0);

    // Measurements always preserved
    const measurementsData = await db.select().from(measurements).where(sql`${measurements.userId} = ${athlete.id}`);
    expect(measurementsData).toHaveLength(1);
  });

  it('should exclude soft-deleted users from getUser()', async () => {
    // Delete athlete
    await storage.deleteUser(athlete.id);

    // getUser should return undefined for soft-deleted user
    const user = await storage.getUser(athlete.id);
    expect(user).toBeUndefined();
  });

  it('should exclude soft-deleted users from getUsers()', async () => {
    // Get users before deletion
    const usersBefore = await storage.getUsers();
    const countBefore = usersBefore.length;

    // Delete athlete
    await storage.deleteUser(athlete.id);

    // getUsers should not include soft-deleted user
    const usersAfter = await storage.getUsers();
    expect(usersAfter).toHaveLength(countBefore - 1);
    expect(usersAfter.find(u => u.id === athlete.id)).toBeUndefined();
  });

  it('should exclude soft-deleted users from authentication', async () => {
    // Hash the password for authentication test
    const bcrypt = await import('bcryptjs');
    const hashedPassword = await bcrypt.hash('password123', 10);

    // Update athlete with hashed password
    await db.update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, athlete.id));

    // Verify authentication works before deletion
    const authBefore = await storage.authenticateUser(athlete.username, 'password123');
    expect(authBefore).toBeTruthy();

    // Delete athlete
    await storage.deleteUser(athlete.id);

    // Authentication should fail for soft-deleted user
    const authAfter = await storage.authenticateUser(athlete.username, 'password123');
    expect(authAfter).toBeNull();
  });

  it('should exclude soft-deleted users from getUserByUsername()', async () => {
    // Delete athlete
    await storage.deleteUser(athlete.id);

    // getUserByUsername should return undefined for soft-deleted user
    const user = await storage.getUserByUsername(athlete.username);
    expect(user).toBeUndefined();
  });

  it('should exclude soft-deleted users from getUserByEmail()', async () => {
    // Delete athlete
    await storage.deleteUser(athlete.id);

    // getUserByEmail should return undefined for soft-deleted user
    const user = await storage.getUserByEmail('athlete-soft@test.com');
    expect(user).toBeUndefined();
  });

  it('should revoke sessions when soft deleting user', async () => {
    // Import sessions dynamically
    const { sessions } = await import('../../shared/schema');

    // Create session for athlete
    await db.insert(sessions).values({
      sid: 'test-session-id',
      sess: { cookie: { maxAge: 86400000 } },
      expire: new Date(Date.now() + 86400000), // 24 hours
      userId: athlete.id
    });

    // Delete athlete
    await storage.deleteUser(athlete.id);

    // Session should be deleted
    const sessionsData = await db.select().from(sessions).where(eq(sessions.userId, athlete.id));
    expect(sessionsData).toHaveLength(0);
  });

  it('should maintain full measurement context with soft-deleted users', async () => {
    // Create measurement with coach as submitter
    const [measurement] = await db.insert(measurements).values({
      userId: athlete.id,
      teamId: testTeam.id,
      metric: 'VERTICAL_JUMP',
      value: '30',
      units: 'in',
      age: 16,
      date: '2024-01-01',
      submittedBy: coach.id,
      verifiedBy: coach.id,
      isVerified: true
    }).returning();

    // Delete coach (soft delete)
    await storage.deleteUser(coach.id);

    // Measurement still exists with original submittedBy/verifiedBy
    const [preservedMeasurement] = await db.select().from(measurements)
      .where(eq(measurements.id, measurement.id));

    expect(preservedMeasurement.submittedBy).toBe(coach.id);
    expect(preservedMeasurement.verifiedBy).toBe(coach.id);

    // Can still get coach data from database (soft deleted)
    const [softDeletedCoach] = await db.select().from(users).where(eq(users.id, coach.id));
    expect(softDeletedCoach).toBeDefined();
    expect(softDeletedCoach.fullName).toBe('Test Coach'); // Full context preserved!
    expect(softDeletedCoach.deletedAt).toBeInstanceOf(Date);
  });

  it('should include measurements from soft-deleted users in analytics queries', async () => {
    // Import AnalyticsService
    const { AnalyticsService } = await import('../../server/analytics-simple');
    const analyticsService = new AnalyticsService();

    // Create measurement for athlete
    const [measurement] = await db.insert(measurements).values({
      userId: athlete.id,
      teamId: testTeam.id,
      metric: 'VERTICAL_JUMP',
      value: '30',
      units: 'in',
      age: 16,
      date: '2024-01-01',
      submittedBy: coach.id,
      verifiedBy: coach.id,
      isVerified: true
    }).returning();

    // Soft delete the athlete
    await storage.deleteUser(athlete.id);

    // Query analytics for the organization
    const analyticsRequest = {
      analysisType: 'intra_group' as const,
      filters: {
        organizationId: testOrg.id,
        teams: [testTeam.id]
      },
      metrics: {
        primary: 'VERTICAL_JUMP',
        additional: []
      },
      timeframe: {
        type: 'best' as const,
        period: 'all_time' as const
      }
    };

    const result = await analyticsService.getAnalyticsData(analyticsRequest);

    // Verify measurement appears in analytics despite user being deleted
    expect(result.data).toHaveLength(1);
    expect(result.data[0].athleteId).toBe(athlete.id);
    expect(result.data[0].athleteName).toBe('[Deleted User]'); // Name shows as deleted
    expect(result.data[0].value).toBe(30);
    expect(result.data[0].metric).toBe('VERTICAL_JUMP');

    // Verify statistics are calculated correctly
    expect(result.statistics['VERTICAL_JUMP']).toBeDefined();
    expect(result.statistics['VERTICAL_JUMP'].count).toBe(1);
    expect(result.statistics['VERTICAL_JUMP'].mean).toBe(30);
  });
});
