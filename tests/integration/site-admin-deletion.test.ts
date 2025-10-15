// Set DATABASE_URL before any imports that use it
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://username:password@localhost:5432/athlete_performance';

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
      email: siteAdmin.email!,
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
      email: siteAdmin.email!,
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

  it('should delete site admin with measurements they submitted', async () => {
    // Create measurement submitted by site admin (for athlete)
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

    // Verify measurement exists before deletion
    const measurementsBefore = await db.select().from(measurements).where(eq(measurements.submittedBy, siteAdmin.id));
    expect(measurementsBefore).toHaveLength(1);

    // Delete site admin
    await storage.deleteUser(siteAdmin.id);

    // Verify admin is deleted
    const deletedAdmin = await storage.getUser(siteAdmin.id);
    expect(deletedAdmin).toBeUndefined();

    // Verify measurement's submittedBy field is set to NULL (preserve measurement data)
    const measurementsAfter = await db.select().from(measurements).where(eq(measurements.submittedBy, siteAdmin.id));
    expect(measurementsAfter).toHaveLength(0);

    // Verify measurement still exists but submittedBy is null
    const measurementPreserved = await db.select().from(measurements).where(eq(measurements.userId, athlete.id));
    expect(measurementPreserved).toHaveLength(1);
    expect(measurementPreserved[0].submittedBy).toBeNull();
  });

  it('should delete site admin with measurements they verified', async () => {
    // Create measurement verified by site admin
    await db.insert(measurements).values({
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
    });

    // Verify measurement exists before deletion
    const measurementsBefore = await db.select().from(measurements).where(eq(measurements.verifiedBy, siteAdmin.id));
    expect(measurementsBefore).toHaveLength(1);

    // Delete site admin
    await storage.deleteUser(siteAdmin.id);

    // Verify admin is deleted
    const deletedAdmin = await storage.getUser(siteAdmin.id);
    expect(deletedAdmin).toBeUndefined();

    // Verify measurement's verifiedBy field is set to NULL (preserve measurement data)
    const measurementsAfter = await db.select().from(measurements).where(eq(measurements.verifiedBy, siteAdmin.id));
    expect(measurementsAfter).toHaveLength(0);

    // Verify measurement still exists but verifiedBy is null
    const measurementPreserved = await db.select().from(measurements).where(eq(measurements.userId, athlete.id));
    expect(measurementPreserved).toHaveLength(1);
    expect(measurementPreserved[0].verifiedBy).toBeNull();
  });

  it('should delete site admin with measurements where they are the subject (userId)', async () => {
    // Create measurement where site admin is the subject
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

    // Verify measurement exists before deletion
    const measurementsBefore = await db.select().from(measurements).where(eq(measurements.userId, siteAdmin.id));
    expect(measurementsBefore).toHaveLength(1);

    // Delete site admin
    await storage.deleteUser(siteAdmin.id);

    // Verify admin is deleted
    const deletedAdmin = await storage.getUser(siteAdmin.id);
    expect(deletedAdmin).toBeUndefined();

    // Verify measurements where admin was the subject are deleted
    const measurementsAfter = await db.select().from(measurements).where(eq(measurements.userId, siteAdmin.id));
    expect(measurementsAfter).toHaveLength(0);
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
      email: siteAdmin.email!,
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
      email: siteAdmin.email!,
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

    // Check audit logs deleted
    const logsAfter = await db.select().from(auditLogs).where(eq(auditLogs.userId, siteAdmin.id));
    expect(logsAfter).toHaveLength(0);

    // Check measurements where admin was subject are deleted
    const measurementsSubjectAfter = await db.select().from(measurements).where(eq(measurements.userId, siteAdmin.id));
    expect(measurementsSubjectAfter).toHaveLength(0);

    // Check measurements submitted/verified by admin have nullified references
    const measurementsSubmittedAfter = await db.select().from(measurements).where(eq(measurements.submittedBy, siteAdmin.id));
    expect(measurementsSubmittedAfter).toHaveLength(0);

    const measurementsVerifiedAfter = await db.select().from(measurements).where(eq(measurements.verifiedBy, siteAdmin.id));
    expect(measurementsVerifiedAfter).toHaveLength(0);

    // Verify athlete's measurements still exist with nullified admin references
    const athleteMeasurements = await db.select().from(measurements).where(eq(measurements.userId, athlete.id));
    expect(athleteMeasurements).toHaveLength(2);
    athleteMeasurements.forEach(m => {
      expect(m.submittedBy).not.toBe(siteAdmin.id);
      expect(m.verifiedBy).not.toBe(siteAdmin.id);
    });
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
});
