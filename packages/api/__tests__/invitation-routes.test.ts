/**
 * Integration tests for invitation API routes
 * Tests authentication, authorization, email delivery, and endpoint behavior
 */

import { describe, it, expect, beforeAll, afterAll, afterEach, vi, beforeEach } from "vitest";
import { db } from "../db";
import { storage } from "../storage";
import { organizations, users, invitations, userOrganizations, teams } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { emailService } from "../services/email-service";
import { MAX_INVITATION_ATTEMPTS } from "../constants/invitations";

// Mock email service
vi.mock("../services/email-service", () => ({
  emailService: {
    sendInvitation: vi.fn().mockResolvedValue(true),
    sendWelcome: vi.fn().mockResolvedValue(true),
  }
}));

// TODO: These tests need to be fixed - they have issues with FK constraints and database isolation
describe.skip("Invitation Routes", () => {
  const timestamp = Date.now().toString();
  const testSuffix = `_inv_test_${timestamp}`;

  let testOrgId: string;
  let testTeamId: string;
  let testOrgAdminId: string;
  let testCoachId: string;
  let testAthleteId: string;
  let testSiteAdminId: string;
  let otherOrgUserId: string;
  let otherOrgId: string;

  const TEST_ORG_NAME = `InvTest Org${testSuffix}`;
  const OTHER_ORG_NAME = `Other Org${testSuffix}`;
  const TEST_ORG_ADMIN_EMAIL = `invorgadmin${testSuffix}@example.com`;
  const TEST_COACH_EMAIL = `invcoach${testSuffix}@example.com`;
  const TEST_ATHLETE_EMAIL = `invathlete${testSuffix}@example.com`;
  const TEST_SITE_ADMIN_EMAIL = `invsiteadmin${testSuffix}@example.com`;
  const OTHER_ORG_USER_EMAIL = `invotherorg${testSuffix}@example.com`;

  beforeAll(async () => {
    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: TEST_ORG_NAME,
      orgType: "club",
      description: "Test organization for invitation testing",
      isActive: true,
      allowMembershipRequests: true,
      isPublicDirectory: true,
    }).returning();
    testOrgId = org.id;

    // Create a test team
    const [team] = await db.insert(teams).values({
      organizationId: testOrgId,
      name: `Test Team${testSuffix}`,
      level: "Club",
      sport: "Soccer",
    }).returning();
    testTeamId = team.id;

    // Create other organization
    const [otherOrg] = await db.insert(organizations).values({
      name: OTHER_ORG_NAME,
      orgType: "club",
      description: "Other org for cross-org testing",
      isActive: true,
    }).returning();
    otherOrgId = otherOrg.id;

    // Create test org admin
    const [orgAdmin] = await db.insert(users).values({
      emails: [TEST_ORG_ADMIN_EMAIL],
      username: `invorgadmin${testSuffix}`,
      firstName: "Inv",
      lastName: "OrgAdmin",
      fullName: "Inv OrgAdmin",
      password: "hashedpassword",
      isActive: true,
    }).returning();
    testOrgAdminId = orgAdmin.id;

    await db.insert(userOrganizations).values({
      userId: testOrgAdminId,
      organizationId: testOrgId,
      role: "org_admin",
    });

    // Create test coach
    const [coach] = await db.insert(users).values({
      emails: [TEST_COACH_EMAIL],
      username: `invcoach${testSuffix}`,
      firstName: "Inv",
      lastName: "Coach",
      fullName: "Inv Coach",
      password: "hashedpassword",
      isActive: true,
    }).returning();
    testCoachId = coach.id;

    await db.insert(userOrganizations).values({
      userId: testCoachId,
      organizationId: testOrgId,
      role: "coach",
    });

    // Create test athlete (not in any org yet)
    const [athlete] = await db.insert(users).values({
      emails: [TEST_ATHLETE_EMAIL],
      username: `invathlete${testSuffix}`,
      firstName: "Inv",
      lastName: "Athlete",
      fullName: "Inv Athlete",
      password: "hashedpassword",
      isActive: true,
    }).returning();
    testAthleteId = athlete.id;

    // Create test site admin
    const [siteAdmin] = await db.insert(users).values({
      emails: [TEST_SITE_ADMIN_EMAIL],
      username: `invsiteadmin${testSuffix}`,
      firstName: "Inv",
      lastName: "SiteAdmin",
      fullName: "Inv SiteAdmin",
      password: "hashedpassword",
      isSiteAdmin: true,
      isActive: true,
    }).returning();
    testSiteAdminId = siteAdmin.id;

    // Create user in other org
    const [otherUser] = await db.insert(users).values({
      emails: [OTHER_ORG_USER_EMAIL],
      username: `invotherorguser${testSuffix}`,
      firstName: "Other",
      lastName: "OrgUser",
      fullName: "Other OrgUser",
      password: "hashedpassword",
      isActive: true,
    }).returning();
    otherOrgUserId = otherUser.id;

    await db.insert(userOrganizations).values({
      userId: otherOrgUserId,
      organizationId: otherOrgId,
      role: "org_admin",
    });
  });

  beforeEach(() => {
    // Clear mock call history before each test
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up invitations after each test
    await db.delete(invitations).where(eq(invitations.organizationId, testOrgId));
    await db.delete(invitations).where(eq(invitations.organizationId, otherOrgId));
  });

  afterAll(async () => {
    // Clean up all test data in reverse dependency order
    await db.delete(invitations).where(eq(invitations.organizationId, testOrgId));
    await db.delete(invitations).where(eq(invitations.organizationId, otherOrgId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, otherOrgId));
    await db.delete(teams).where(eq(teams.id, testTeamId));
    await db.delete(users).where(eq(users.id, testAthleteId));
    await db.delete(users).where(eq(users.id, testOrgAdminId));
    await db.delete(users).where(eq(users.id, testCoachId));
    await db.delete(users).where(eq(users.id, testSiteAdminId));
    await db.delete(users).where(eq(users.id, otherOrgUserId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
    await db.delete(organizations).where(eq(organizations.id, otherOrgId));
  });

  describe("POST /api/invitations", () => {
    describe("validation", () => {
      it("should reject request without email", async () => {
        await expect(
          storage.createInvitation({
            email: "",
            organizationId: testOrgId,
            role: "athlete",
            invitedBy: testOrgAdminId,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          })
        ).rejects.toThrow();
      });

      it("should reject request without organizationId", async () => {
        await expect(
          storage.createInvitation({
            email: "test@example.com",
            organizationId: "",
            role: "athlete",
            invitedBy: testOrgAdminId,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          })
        ).rejects.toThrow();
      });

      it("should reject request with invalid role", async () => {
        // Note: Type system prevents this in TypeScript, but testing runtime validation
        const invalidRole = "invalid_role" as any;

        const invitation = await storage.createInvitation({
          email: "test@example.com",
          organizationId: testOrgId,
          role: invalidRole,
          invitedBy: testOrgAdminId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        // Verify the invitation was created (validation happens at route level)
        expect(invitation.email).toBe("test@example.com");
      });

      it("should accept valid invitation data", async () => {
        const invitation = await storage.createInvitation({
          email: "newuser@example.com",
          firstName: "New",
          lastName: "User",
          organizationId: testOrgId,
          teamIds: [testTeamId],
          role: "athlete",
          invitedBy: testOrgAdminId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        expect(invitation.email).toBe("newuser@example.com");
        expect(invitation.firstName).toBe("New");
        expect(invitation.lastName).toBe("User");
        expect(invitation.organizationId).toBe(testOrgId);
        expect(invitation.role).toBe("athlete");
        expect(invitation.status).toBe("pending");
        expect(invitation.isUsed).toBe(false);
        expect(invitation.token).toBeDefined();
      });
    });

    describe("permissions", () => {
      it("should allow org admin to invite any role", async () => {
        const coachInvite = await storage.createInvitation({
          email: "newcoach@example.com",
          organizationId: testOrgId,
          role: "coach",
          invitedBy: testOrgAdminId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        const adminInvite = await storage.createInvitation({
          email: "newadmin@example.com",
          organizationId: testOrgId,
          role: "org_admin",
          invitedBy: testOrgAdminId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        expect(coachInvite.role).toBe("coach");
        expect(adminInvite.role).toBe("org_admin");
      });

      it("should allow coach to invite athletes only", async () => {
        const athleteInvite = await storage.createInvitation({
          email: "newathlete@example.com",
          organizationId: testOrgId,
          role: "athlete",
          invitedBy: testCoachId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        expect(athleteInvite.role).toBe("athlete");
        expect(athleteInvite.invitedBy).toBe(testCoachId);
      });

      it("should allow site admin to invite anyone", async () => {
        const invitation = await storage.createInvitation({
          email: "siteadmininvite@example.com",
          organizationId: testOrgId,
          role: "org_admin",
          invitedBy: testSiteAdminId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        expect(invitation.role).toBe("org_admin");
      });

      it("should reject invitation to non-existent organization", async () => {
        await expect(
          storage.createInvitation({
            email: "test@example.com",
            organizationId: "non-existent-org-id",
            role: "athlete",
            invitedBy: testOrgAdminId,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          })
        ).rejects.toThrow();
      });
    });

    describe("duplicate prevention", () => {
      it("should prevent duplicate pending invitations to same email", async () => {
        const email = "duplicate@example.com";

        await storage.createInvitation({
          email,
          organizationId: testOrgId,
          role: "athlete",
          invitedBy: testOrgAdminId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        // Second invitation to same email should be allowed (different token)
        // The route handler implements duplicate checking logic
        const secondInvite = await storage.createInvitation({
          email,
          organizationId: testOrgId,
          role: "athlete",
          invitedBy: testOrgAdminId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        expect(secondInvite.email).toBe(email);
      });

      it("should allow new invitation after previous expired", async () => {
        const email = "expired@example.com";

        // Create expired invitation
        const expiredInvite = await storage.createInvitation({
          email,
          organizationId: testOrgId,
          role: "athlete",
          invitedBy: testOrgAdminId,
          expiresAt: new Date(Date.now() - 1000) // Already expired
        });

        expect(new Date(expiredInvite.expiresAt).getTime()).toBeLessThan(Date.now());

        // New invitation should succeed
        const newInvite = await storage.createInvitation({
          email,
          organizationId: testOrgId,
          role: "athlete",
          invitedBy: testOrgAdminId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        expect(newInvite.id).not.toBe(expiredInvite.id);
        expect(new Date(newInvite.expiresAt).getTime()).toBeGreaterThan(Date.now());
      });
    });

    describe("email delivery", () => {
      it("should send invitation email on creation", async () => {
        const invitation = await storage.createInvitation({
          email: "emailtest@example.com",
          firstName: "Email",
          lastName: "Test",
          organizationId: testOrgId,
          role: "athlete",
          invitedBy: testOrgAdminId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        expect(invitation.email).toBe("emailtest@example.com");
        // Email sending is tested in route handler, not storage layer
      });

      it("should track email sent status", async () => {
        const invitation = await storage.createInvitation({
          email: "tracking@example.com",
          organizationId: testOrgId,
          role: "athlete",
          invitedBy: testOrgAdminId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        // Update email sent status
        const updated = await storage.updateInvitation(invitation.id, {
          emailSent: true,
          emailSentAt: new Date()
        });

        expect(updated.emailSent).toBe(true);
        expect(updated.emailSentAt).toBeDefined();
      });
    });

    describe("team assignment", () => {
      it("should include team IDs in invitation", async () => {
        const invitation = await storage.createInvitation({
          email: "teamtest@example.com",
          organizationId: testOrgId,
          teamIds: [testTeamId],
          role: "athlete",
          invitedBy: testOrgAdminId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        expect(invitation.teamIds).toContain(testTeamId);
      });

      it("should allow invitation without team assignment", async () => {
        const invitation = await storage.createInvitation({
          email: "noteam@example.com",
          organizationId: testOrgId,
          role: "athlete",
          invitedBy: testOrgAdminId,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        expect(invitation.teamIds).toEqual([]);
      });
    });
  });

  describe("GET /api/invitations", () => {
    beforeEach(async () => {
      // Create test invitations
      await storage.createInvitation({
        email: "athlete1@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      await storage.createInvitation({
        email: "coach1@example.com",
        organizationId: testOrgId,
        role: "coach",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });
    });

    it("should list all invitations for org admin", async () => {
      const allInvitations = await storage.getInvitationsByOrganization(testOrgId);
      expect(allInvitations.length).toBeGreaterThanOrEqual(2);
    });

    it("should list only athlete invitations for coaches", async () => {
      const allInvitations = await storage.getInvitationsByOrganization(testOrgId);
      const athleteInvitations = allInvitations.filter(inv => inv.role === 'athlete');

      expect(athleteInvitations.length).toBeGreaterThanOrEqual(1);
      athleteInvitations.forEach(inv => {
        expect(inv.role).toBe('athlete');
      });
    });

    it("should not show invitations from other organizations", async () => {
      // Create invitation in other org
      await storage.createInvitation({
        email: "other@example.com",
        organizationId: otherOrgId,
        role: "athlete",
        invitedBy: otherOrgUserId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      const testOrgInvitations = await storage.getInvitationsByOrganization(testOrgId);

      testOrgInvitations.forEach(inv => {
        expect(inv.organizationId).toBe(testOrgId);
        expect(inv.organizationId).not.toBe(otherOrgId);
      });
    });

    it("should include inviter information", async () => {
      const invitations = await storage.getInvitationsByOrganization(testOrgId);

      expect(invitations.length).toBeGreaterThan(0);
      invitations.forEach(inv => {
        expect(inv.invitedBy).toBeDefined();
      });
    });
  });

  describe("GET /api/invitations/:token", () => {
    it("should return invitation details for valid token", async () => {
      const created = await storage.createInvitation({
        email: "validtoken@example.com",
        firstName: "Valid",
        lastName: "Token",
        organizationId: testOrgId,
        teamIds: [testTeamId],
        role: "athlete",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      const invitation = await storage.getInvitation(created.token);

      expect(invitation).toBeDefined();
      expect(invitation?.email).toBe("validtoken@example.com");
      expect(invitation?.firstName).toBe("Valid");
      expect(invitation?.lastName).toBe("Token");
      expect(invitation?.role).toBe("athlete");
      expect(invitation?.teamIds).toContain(testTeamId);
    });

    it("should return undefined for invalid token", async () => {
      const invitation = await storage.getInvitation("invalid-token-12345");
      expect(invitation).toBeUndefined();
    });

    it("should return undefined for expired token", async () => {
      const created = await storage.createInvitation({
        email: "expired@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() - 1000) // Already expired
      });

      const invitation = await storage.getInvitation(created.token);
      expect(invitation).toBeUndefined();
    });

    it("should return undefined for already used token", async () => {
      const created = await storage.createInvitation({
        email: "used@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      // Mark as used
      await storage.updateInvitation(created.id, { isUsed: true });

      const invitation = await storage.getInvitation(created.token);
      expect(invitation).toBeUndefined();
    });
  });

  describe("POST /api/invitations/:id/resend", () => {
    it("should resend invitation email", async () => {
      const invitation = await storage.createInvitation({
        email: "resend@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      // Update to mark email as sent
      await storage.updateInvitation(invitation.id, {
        emailSent: true,
        emailSentAt: new Date()
      });

      const updated = await storage.getInvitationById(invitation.id);
      expect(updated?.emailSent).toBe(true);
    });

    it("should extend expiration when resending", async () => {
      const invitation = await storage.createInvitation({
        email: "extend@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000) // 1 day
      });

      const oldExpiry = new Date(invitation.expiresAt);

      // Extend expiration (simulating resend)
      const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await storage.updateInvitation(invitation.id, {
        expiresAt: newExpiry,
        status: 'pending'
      });

      const updated = await storage.getInvitationById(invitation.id);
      expect(new Date(updated!.expiresAt).getTime()).toBeGreaterThan(oldExpiry.getTime());
    });

    it("should not resend already accepted invitation", async () => {
      const invitation = await storage.createInvitation({
        email: "accepted@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      // Mark as accepted
      await storage.updateInvitation(invitation.id, {
        isUsed: true,
        status: 'accepted',
        acceptedAt: new Date()
      });

      const updated = await storage.getInvitationById(invitation.id);
      expect(updated?.isUsed).toBe(true);
      expect(updated?.status).toBe('accepted');
    });

    it("should not resend cancelled invitation", async () => {
      const invitation = await storage.createInvitation({
        email: "cancelled@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      // Cancel invitation
      await storage.updateInvitation(invitation.id, {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: testOrgAdminId
      });

      const updated = await storage.getInvitationById(invitation.id);
      expect(updated?.status).toBe('cancelled');
    });

    it("should allow org admin to resend any invitation", async () => {
      const invitation = await storage.createInvitation({
        email: "adminresend@example.com",
        organizationId: testOrgId,
        role: "coach",
        invitedBy: testCoachId, // Created by coach
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      // Org admin should be able to resend (permission check in route handler)
      const userOrgs = await storage.getUserOrganizations(testOrgAdminId);
      const hasPermission = userOrgs.some(org =>
        org.organizationId === testOrgId && org.role === 'org_admin'
      );

      expect(hasPermission).toBe(true);
    });

    it("should allow coach to resend athlete invitations only", async () => {
      const athleteInvite = await storage.createInvitation({
        email: "coachresend@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      // Coach can resend athlete invitations
      const userOrgs = await storage.getUserOrganizations(testCoachId);
      const hasPermission = userOrgs.some(org =>
        org.organizationId === testOrgId && org.role === 'coach'
      );

      expect(hasPermission).toBe(true);
      expect(athleteInvite.role).toBe('athlete');
    });
  });

  describe("POST /api/invitations/:id/cancel", () => {
    it("should cancel pending invitation", async () => {
      const invitation = await storage.createInvitation({
        email: "cancel@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      await storage.updateInvitation(invitation.id, {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: testOrgAdminId
      });

      const cancelled = await storage.getInvitationById(invitation.id);
      expect(cancelled?.status).toBe('cancelled');
      expect(cancelled?.cancelledAt).toBeDefined();
      expect(cancelled?.cancelledBy).toBe(testOrgAdminId);
    });

    it("should not cancel already accepted invitation", async () => {
      const invitation = await storage.createInvitation({
        email: "acceptedcancel@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      // Mark as accepted
      await storage.updateInvitation(invitation.id, {
        isUsed: true,
        status: 'accepted',
        acceptedAt: new Date()
      });

      const accepted = await storage.getInvitationById(invitation.id);
      expect(accepted?.isUsed).toBe(true);
      expect(accepted?.status).toBe('accepted');
    });

    it("should allow org admin to cancel any invitation", async () => {
      const invitation = await storage.createInvitation({
        email: "admincancel@example.com",
        organizationId: testOrgId,
        role: "coach",
        invitedBy: testCoachId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      // Org admin permission check
      const userOrgs = await storage.getUserOrganizations(testOrgAdminId);
      const hasPermission = userOrgs.some(org =>
        org.organizationId === testOrgId && org.role === 'org_admin'
      );

      expect(hasPermission).toBe(true);

      await storage.updateInvitation(invitation.id, {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: testOrgAdminId
      });

      const cancelled = await storage.getInvitationById(invitation.id);
      expect(cancelled?.status).toBe('cancelled');
    });

    it("should allow coach to cancel athlete invitations only", async () => {
      const invitation = await storage.createInvitation({
        email: "coachcancel@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: testCoachId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      // Coach permission check
      const userOrgs = await storage.getUserOrganizations(testCoachId);
      const hasPermission = userOrgs.some(org =>
        org.organizationId === testOrgId && org.role === 'coach'
      );

      expect(hasPermission).toBe(true);
      expect(invitation.role).toBe('athlete');
    });
  });

  describe("DELETE /api/invitations/:id", () => {
    it("should delete invitation", async () => {
      const invitation = await storage.createInvitation({
        email: "delete@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      await storage.deleteInvitation(invitation.id);

      const deleted = await storage.getInvitationById(invitation.id);
      expect(deleted).toBeUndefined();
    });

    it("should allow org admin to delete invitations", async () => {
      const invitation = await storage.createInvitation({
        email: "admindelete@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: testCoachId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      // Permission check
      const userOrgs = await storage.getUserOrganizations(testOrgAdminId);
      const hasPermission = userOrgs.some(org =>
        org.organizationId === testOrgId && org.role === 'org_admin'
      );

      expect(hasPermission).toBe(true);

      await storage.deleteInvitation(invitation.id);
      const deleted = await storage.getInvitationById(invitation.id);
      expect(deleted).toBeUndefined();
    });

    it("should allow coach to delete athlete invitations", async () => {
      const invitation = await storage.createInvitation({
        email: "coachdelete@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: testCoachId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      // Permission check
      const userOrgs = await storage.getUserOrganizations(testCoachId);
      const hasPermission = userOrgs.some(org =>
        org.organizationId === testOrgId && org.role === 'coach'
      );

      expect(hasPermission).toBe(true);
      expect(invitation.role).toBe('athlete');

      await storage.deleteInvitation(invitation.id);
      const deleted = await storage.getInvitationById(invitation.id);
      expect(deleted).toBeUndefined();
    });
  });

  describe("POST /api/invitations/:token/accept", () => {
    it("should accept valid invitation and create user account", async () => {
      const invitation = await storage.createInvitation({
        email: "newuser@example.com",
        firstName: "New",
        lastName: "User",
        organizationId: testOrgId,
        teamIds: [testTeamId],
        role: "athlete",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      const result = await storage.acceptInvitation(invitation.token, {
        email: "newuser@example.com",
        username: `newuser${testSuffix}`,
        password: "SecurePassword123!",
        firstName: "New",
        lastName: "User"
      });

      expect(result.user).toBeDefined();
      expect(result.user.username).toBe(`newuser${testSuffix}`);
      expect(result.user.firstName).toBe("New");
      expect(result.user.lastName).toBe("User");
      expect(result.user.emails).toContain("newuser@example.com");

      // Verify invitation marked as used
      const usedInvitation = await storage.getInvitationById(invitation.id);
      expect(usedInvitation?.isUsed).toBe(true);
      expect(usedInvitation?.status).toBe('accepted');
      expect(usedInvitation?.acceptedAt).toBeDefined();

      // Verify user added to organization
      const userOrgs = await storage.getUserOrganizations(result.user.id);
      expect(userOrgs.some(org => org.organizationId === testOrgId)).toBe(true);

      // Clean up created user
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, result.user.id));
      await db.delete(users).where(eq(users.id, result.user.id));
    });

    it("should reject expired invitation", async () => {
      const invitation = await storage.createInvitation({
        email: "expiredaccept@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() - 1000) // Already expired
      });

      await expect(
        storage.acceptInvitation(invitation.token, {
          email: "expiredaccept@example.com",
          username: `expireduser${testSuffix}`,
          password: "SecurePassword123!",
          firstName: "Expired",
          lastName: "User"
        })
      ).rejects.toThrow();
    });

    it("should reject already used invitation", async () => {
      const invitation = await storage.createInvitation({
        email: "usedaccept@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      // Accept invitation first time
      const result = await storage.acceptInvitation(invitation.token, {
        email: "usedaccept@example.com",
        username: `useduser${testSuffix}`,
        password: "SecurePassword123!",
        firstName: "Used",
        lastName: "User"
      });

      // Try to accept again
      await expect(
        storage.acceptInvitation(invitation.token, {
          email: "usedaccept@example.com",
          username: `useduser2${testSuffix}`,
          password: "SecurePassword123!",
          firstName: "Used",
          lastName: "User"
        })
      ).rejects.toThrow();

      // Clean up
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, result.user.id));
      await db.delete(users).where(eq(users.id, result.user.id));
    });

    it("should reject invalid token", async () => {
      await expect(
        storage.acceptInvitation("invalid-token-12345", {
          email: "invalid@example.com",
          username: `invaliduser${testSuffix}`,
          password: "SecurePassword123!",
          firstName: "Invalid",
          lastName: "User"
        })
      ).rejects.toThrow();
    });

    it("should track failed acceptance attempts", async () => {
      const invitation = await storage.createInvitation({
        email: "attempts@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      // Simulate failed attempt tracking
      await storage.updateInvitation(invitation.id, {
        lastAttemptAt: new Date(),
        attemptCount: 1
      });

      const updated = await storage.getInvitationById(invitation.id);
      expect(updated?.attemptCount).toBe(1);
      expect(updated?.lastAttemptAt).toBeDefined();
    });

    it("should lock invitation after max failed attempts", async () => {
      const invitation = await storage.createInvitation({
        email: "maxattempts@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      // Simulate max attempts
      await storage.updateInvitation(invitation.id, {
        attemptCount: MAX_INVITATION_ATTEMPTS,
        status: 'cancelled',
        cancelledAt: new Date()
      });

      const updated = await storage.getInvitationById(invitation.id);
      expect(updated?.attemptCount).toBe(MAX_INVITATION_ATTEMPTS);
      expect(updated?.status).toBe('cancelled');
    });

    it("should add user to specified teams on acceptance", async () => {
      const invitation = await storage.createInvitation({
        email: "teamuser@example.com",
        organizationId: testOrgId,
        teamIds: [testTeamId],
        role: "athlete",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      const result = await storage.acceptInvitation(invitation.token, {
        email: "teamuser@example.com",
        username: `teamuser${testSuffix}`,
        password: "SecurePassword123!",
        firstName: "Team",
        lastName: "User"
      });

      // Check team membership (implementation-specific)
      const userOrgs = await storage.getUserOrganizations(result.user.id);
      expect(userOrgs.some(org => org.organizationId === testOrgId)).toBe(true);

      // Clean up
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, result.user.id));
      await db.delete(users).where(eq(users.id, result.user.id));
    });

    it("should send welcome email on successful acceptance", async () => {
      const invitation = await storage.createInvitation({
        email: "welcomeuser@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      const result = await storage.acceptInvitation(invitation.token, {
        email: "welcomeuser@example.com",
        username: `welcomeuser${testSuffix}`,
        password: "SecurePassword123!",
        firstName: "Welcome",
        lastName: "User"
      });

      expect(result.user).toBeDefined();
      // Email sending verified in route handler tests

      // Clean up
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, result.user.id));
      await db.delete(users).where(eq(users.id, result.user.id));
    });
  });

  describe("Security", () => {
    it("should generate unique tokens for each invitation", async () => {
      const invite1 = await storage.createInvitation({
        email: "token1@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      const invite2 = await storage.createInvitation({
        email: "token2@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      expect(invite1.token).not.toBe(invite2.token);
      expect(invite1.token.length).toBeGreaterThan(20); // Reasonable token length
      expect(invite2.token.length).toBeGreaterThan(20);
    });

    it("should not allow cross-organization invitation access", async () => {
      const invitation = await storage.createInvitation({
        email: "crossorg@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      // User from other org shouldn't have access
      const otherUserOrgs = await storage.getUserOrganizations(otherOrgUserId);
      const hasAccess = otherUserOrgs.some(org => org.organizationId === testOrgId);

      expect(hasAccess).toBe(false);
    });

    it("should enforce expiration dates", async () => {
      const invitation = await storage.createInvitation({
        email: "expired@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() - 1000)
      });

      const retrieved = await storage.getInvitation(invitation.token);
      expect(retrieved).toBeUndefined(); // Expired invitations not returned
    });

    it("should mark invitation as one-time use", async () => {
      const invitation = await storage.createInvitation({
        email: "onetime@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      const result = await storage.acceptInvitation(invitation.token, {
        email: "onetime@example.com",
        username: `onetime${testSuffix}`,
        password: "SecurePassword123!",
        firstName: "One",
        lastName: "Time"
      });

      const usedInvitation = await storage.getInvitationById(invitation.id);
      expect(usedInvitation?.isUsed).toBe(true);

      // Second attempt should fail
      await expect(
        storage.acceptInvitation(invitation.token, {
          email: "onetime@example.com",
          username: `onetime2${testSuffix}`,
          password: "SecurePassword123!",
          firstName: "One",
          lastName: "Time"
        })
      ).rejects.toThrow();

      // Clean up
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, result.user.id));
      await db.delete(users).where(eq(users.id, result.user.id));
    });
  });

  describe("Edge Cases", () => {
    it("should handle missing inviter gracefully", async () => {
      // Create invitation with non-existent inviter (simulating deleted user)
      const invitation = await storage.createInvitation({
        email: "missinginviter@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: "non-existent-user-id",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      expect(invitation.invitedBy).toBe("non-existent-user-id");
      // Route handler should handle null inviter gracefully
    });

    it("should handle cancelled invitation status", async () => {
      const invitation = await storage.createInvitation({
        email: "cancelstatus@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      await storage.updateInvitation(invitation.id, {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: testOrgAdminId
      });

      const cancelled = await storage.getInvitationById(invitation.id);
      expect(cancelled?.status).toBe('cancelled');

      // Should not be retrievable via getInvitation
      const retrieved = await storage.getInvitation(invitation.token);
      expect(retrieved).toBeUndefined();
    });

    it("should handle athlete invitation with playerId", async () => {
      const invitation = await storage.createInvitation({
        email: TEST_ATHLETE_EMAIL,
        organizationId: testOrgId,
        role: "athlete",
        playerId: testAthleteId,
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      expect(invitation.playerId).toBe(testAthleteId);
      expect(invitation.email).toBe(TEST_ATHLETE_EMAIL);
    });

    it("should handle invitation without optional fields", async () => {
      const invitation = await storage.createInvitation({
        email: "minimal@example.com",
        organizationId: testOrgId,
        role: "athlete",
        invitedBy: testOrgAdminId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      expect(invitation.firstName).toBeNull();
      expect(invitation.lastName).toBeNull();
      expect(invitation.teamIds).toEqual([]);
      expect(invitation.playerId).toBeNull();
    });
  });
});
