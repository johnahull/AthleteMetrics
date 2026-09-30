/**
 * Unit tests for Global Athlete Manual Claim Features
 * Tests the ability for athletes to manually claim/link additional accounts
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { db } from "../db";
import {
  organizations, users, userOrganizations,
  globalAthletes, userGlobalAthleteLinks, globalAthleteAuditLog,
  globalAthleteClaims
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { hashToken } from '../lib/token-hash';
import { GlobalAthleteService } from "../services/global-athlete-service";
import { emailService } from "../services/email-service";

// Mock the email service
vi.mock("../services/email-service", () => ({
  emailService: {
    sendAccountLinkedNotification: vi.fn().mockResolvedValue(true),
    sendClaimVerificationEmail: vi.fn().mockResolvedValue(true),
  },
}));

describe("Global Athlete Claim Features", () => {
  const testSuffix = `_claim_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  let service: GlobalAthleteService;
  let originalBaseUrl: string | undefined;

  let testOrg1Id: string;
  let testOrg2Id: string;
  let testUser1Id: string;
  let testUser2Id: string;

  const TEST_ORG1_NAME = `Test Claim Org 1${testSuffix}`;
  const TEST_ORG2_NAME = `Test Claim Org 2${testSuffix}`;
  const TEST_USER1_USERNAME = `claimuser1${testSuffix}`;
  const TEST_USER2_USERNAME = `claimuser2${testSuffix}`;
  const TEST_EMAIL_1 = `claimtest1${testSuffix}@example.com`;
  const TEST_EMAIL_2 = `claimtest2${testSuffix}@example.com`;

  beforeAll(async () => {
    service = new GlobalAthleteService();

    // Set BASE_URL for tests (required for claim verification emails)
    originalBaseUrl = process.env.BASE_URL;
    process.env.BASE_URL = "https://test.athletemetrics.com";

    // Create test organizations
    const [org1] = await db.insert(organizations).values({
      name: TEST_ORG1_NAME,
      orgType: "club",
      isActive: true,
    }).returning();
    testOrg1Id = org1.id;

    const [org2] = await db.insert(organizations).values({
      name: TEST_ORG2_NAME,
      orgType: "college",
      isActive: true,
    }).returning();
    testOrg2Id = org2.id;

    // Create test users with different emails
    const [user1] = await db.insert(users).values({
      username: TEST_USER1_USERNAME,
      emails: [TEST_EMAIL_1],
      password: "hashedpassword",
      firstName: "ClaimTest",
      lastName: "User1",
      fullName: "ClaimTest User1",
      isEmailVerified: true,
    }).returning();
    testUser1Id = user1.id;

    const [user2] = await db.insert(users).values({
      username: TEST_USER2_USERNAME,
      emails: [TEST_EMAIL_2], // Different email
      password: "hashedpassword",
      firstName: "ClaimTest",
      lastName: "User2",
      fullName: "ClaimTest User2",
      isEmailVerified: true,
    }).returning();
    testUser2Id = user2.id;

    // Add users to organizations
    await db.insert(userOrganizations).values([
      { userId: testUser1Id, organizationId: testOrg1Id, role: "athlete" },
      { userId: testUser2Id, organizationId: testOrg2Id, role: "athlete" },
    ]);
  });

  afterAll(async () => {
    // Restore BASE_URL
    if (originalBaseUrl !== undefined) {
      process.env.BASE_URL = originalBaseUrl;
    } else {
      delete process.env.BASE_URL;
    }

    // Clean up in reverse order
    await db.delete(globalAthleteClaims);
    await db.delete(globalAthleteAuditLog);
    await db.delete(userGlobalAthleteLinks);
    await db.delete(globalAthletes);
    await db.delete(userOrganizations).where(
      inArray(userOrganizations.userId, [testUser1Id, testUser2Id])
    );
    await db.delete(users).where(
      inArray(users.id, [testUser1Id, testUser2Id])
    );
    await db.delete(organizations).where(
      inArray(organizations.id, [testOrg1Id, testOrg2Id])
    );
  });

  beforeEach(async () => {
    // Clean global athlete data
    await db.delete(globalAthleteClaims);
    await db.delete(globalAthleteAuditLog);
    await db.delete(userGlobalAthleteLinks);
    await db.delete(globalAthletes);

    // Clear mock calls
    vi.clearAllMocks();
  });

  describe("Initiate Claim Request", () => {
    it("should create a claim token for a new email", async () => {
      // User1 creates their global athlete first
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);

      // User1 initiates a claim for user2's email
      const result = await service.initiateClaimRequest(testUser1Id, TEST_EMAIL_2);

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.token.length).toBeGreaterThanOrEqual(32);

      // Should have created a claim record
      const [claim] = await db.select()
        .from(globalAthleteClaims)
        .where(eq(globalAthleteClaims.claimedEmail, TEST_EMAIL_2));

      expect(claim).toBeDefined();
      expect(claim.status).toBe("pending");
    });

    it("should send verification email when claim is initiated", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);
      await service.initiateClaimRequest(testUser1Id, TEST_EMAIL_2);

      expect(emailService.sendClaimVerificationEmail).toHaveBeenCalledTimes(1);
      expect(emailService.sendClaimVerificationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          email: TEST_EMAIL_2,
          userName: "ClaimTest User1",
          verificationLink: expect.stringContaining("verify-claim"),
        })
      );
    });

    it("should reject claim if user has no global athlete", async () => {
      // User1 has no global athlete yet
      await expect(
        service.initiateClaimRequest(testUser1Id, TEST_EMAIL_2)
      ).rejects.toThrow();
    });

    it("should reject duplicate pending claims for same email", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);
      await service.initiateClaimRequest(testUser1Id, TEST_EMAIL_2);

      // Try to claim same email again
      await expect(
        service.initiateClaimRequest(testUser1Id, TEST_EMAIL_2)
      ).rejects.toThrow(/already pending/);
    });

    it("should allow claim if global athlete with that email allows cross-org linking", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);
      await service.onEmailVerified(testUser2Id, TEST_EMAIL_2);

      // User1 tries to claim email that belongs to user2's global athlete
      const result = await service.initiateClaimRequest(testUser1Id, TEST_EMAIL_2);
      expect(result.success).toBe(true);
    });

    it("should reject claim if target global athlete has disabled cross-org linking", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);
      await service.onEmailVerified(testUser2Id, TEST_EMAIL_2);

      // Disable cross-org linking for user2's global athlete
      const user2Link = await service.getUserGlobalAthleteLink(testUser2Id);
      await service.updatePrivacySettings(user2Link!.globalAthleteId, testUser2Id, {
        allowCrossOrgLinking: false,
      });

      // User1 tries to claim - should fail
      await expect(
        service.initiateClaimRequest(testUser1Id, TEST_EMAIL_2)
      ).rejects.toThrow(/disabled cross-organization linking/);
    });

    it("should create audit log entry for claim request", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);
      await service.initiateClaimRequest(testUser1Id, TEST_EMAIL_2);

      const link = await service.getUserGlobalAthleteLink(testUser1Id);
      const logs = await db.select()
        .from(globalAthleteAuditLog)
        .where(eq(globalAthleteAuditLog.globalAthleteId, link!.globalAthleteId));

      expect(logs.some(l => l.action === "claim_initiated")).toBe(true);
    });
  });

  describe("Verify Claim Token", () => {
    it("should verify a valid claim token", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);
      const { token } = await service.initiateClaimRequest(testUser1Id, TEST_EMAIL_2);

      const result = await service.verifyClaim(token);

      expect(result.success).toBe(true);
      expect(result.message).toContain("successfully");
    });

    it("should add email to global athlete verified emails on verification", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);
      const { token } = await service.initiateClaimRequest(testUser1Id, TEST_EMAIL_2);

      await service.verifyClaim(token);

      const link = await service.getUserGlobalAthleteLink(testUser1Id);
      const [globalAthlete] = await db.select()
        .from(globalAthletes)
        .where(eq(globalAthletes.id, link!.globalAthleteId));

      expect(globalAthlete.verifiedEmails).toContain(TEST_EMAIL_2);
    });

    it("should reject expired token", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);
      const { token } = await service.initiateClaimRequest(testUser1Id, TEST_EMAIL_2);

      // Manually expire the token
      await db.update(globalAthleteClaims)
        .set({ expiresAt: new Date(Date.now() - 3600000) }) // 1 hour ago
        .where(eq(globalAthleteClaims.token, hashToken(token)));

      const result = await service.verifyClaim(token);

      expect(result.success).toBe(false);
      // Standardized error message to prevent token enumeration
      expect(result.message).toBe("Invalid or expired verification link");
    });

    it("should reject invalid token", async () => {
      const result = await service.verifyClaim("invalid-token-123");

      expect(result.success).toBe(false);
      // Standardized error message to prevent token enumeration
      expect(result.message).toBe("Invalid or expired verification link");
    });

    it("should prevent double verification", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);
      const { token } = await service.initiateClaimRequest(testUser1Id, TEST_EMAIL_2);

      await service.verifyClaim(token);
      const result = await service.verifyClaim(token);

      expect(result.success).toBe(false);
      // Standardized error message to prevent token enumeration
      expect(result.message).toBe("Invalid or expired verification link");
    });

    it("should update claim status to verified", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);
      const { token } = await service.initiateClaimRequest(testUser1Id, TEST_EMAIL_2);

      await service.verifyClaim(token);

      const [claim] = await db.select()
        .from(globalAthleteClaims)
        .where(eq(globalAthleteClaims.token, hashToken(token)));

      expect(claim.status).toBe("verified");
      expect(claim.verifiedAt).toBeDefined();
    });

    it("should create audit log entry for verification", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);
      const { token } = await service.initiateClaimRequest(testUser1Id, TEST_EMAIL_2);

      await service.verifyClaim(token);

      const link = await service.getUserGlobalAthleteLink(testUser1Id);
      const logs = await db.select()
        .from(globalAthleteAuditLog)
        .where(eq(globalAthleteAuditLog.globalAthleteId, link!.globalAthleteId));

      expect(logs.some(l => l.action === "claim_verified")).toBe(true);
    });
  });

  describe("Get Pending Claims", () => {
    it("should return pending claims for a user", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);
      await service.initiateClaimRequest(testUser1Id, TEST_EMAIL_2);

      const pendingClaims = await service.getPendingClaims(testUser1Id);

      expect(pendingClaims).toHaveLength(1);
      expect(pendingClaims[0].claimedEmail).toBe(TEST_EMAIL_2);
      expect(pendingClaims[0].status).toBe("pending");
    });

    it("should not return expired claims", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);
      const { token } = await service.initiateClaimRequest(testUser1Id, TEST_EMAIL_2);

      // Manually expire the claim
      await db.update(globalAthleteClaims)
        .set({ status: "expired" })
        .where(eq(globalAthleteClaims.token, hashToken(token)));

      const pendingClaims = await service.getPendingClaims(testUser1Id);

      expect(pendingClaims).toHaveLength(0);
    });

    it("should return empty array for user without global athlete", async () => {
      const pendingClaims = await service.getPendingClaims(testUser1Id);
      expect(pendingClaims).toEqual([]);
    });
  });

  describe("Cancel Claim", () => {
    it("should cancel a pending claim", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);
      const { token } = await service.initiateClaimRequest(testUser1Id, TEST_EMAIL_2);

      const [claim] = await db.select()
        .from(globalAthleteClaims)
        .where(eq(globalAthleteClaims.token, hashToken(token)));

      await service.cancelClaim(testUser1Id, claim.id);

      const [updatedClaim] = await db.select()
        .from(globalAthleteClaims)
        .where(eq(globalAthleteClaims.id, claim.id));

      expect(updatedClaim.status).toBe("cancelled");
    });

    it("should not allow cancelling another user's claim", async () => {
      await service.onEmailVerified(testUser1Id, TEST_EMAIL_1);
      const { token } = await service.initiateClaimRequest(testUser1Id, TEST_EMAIL_2);

      const [claim] = await db.select()
        .from(globalAthleteClaims)
        .where(eq(globalAthleteClaims.token, hashToken(token)));

      // User2 tries to cancel user1's claim
      await expect(
        service.cancelClaim(testUser2Id, claim.id)
      ).rejects.toThrow();
    });
  });

  describe("Security: Rate Limiting", () => {
    it("should have rate limiting applied to verify-claim endpoint (static verification)", async () => {
      // This test verifies that the route configuration includes rate limiting
      // by checking the route file for the appropriate rate limiter middleware
      const fs = await import("fs");
      const path = await import("path");

      const routesFilePath = path.join(__dirname, "../routes/global-athlete-routes.ts");
      const routesContent = fs.readFileSync(routesFilePath, "utf-8");

      // Verify rate limiter is imported
      expect(routesContent).toContain('import rateLimit from "express-rate-limit"');

      // Verify token verification rate limiter is defined (stricter than general limiter)
      expect(routesContent).toContain("tokenVerificationLimiter = rateLimit");

      // Verify stricter rate limiter is applied to verify-claim endpoint
      // (tokenVerificationLimiter has 10 requests/15min vs globalAthleteLimiter's 100)
      expect(routesContent).toMatch(/app\.get\s*\(\s*["']\/api\/verify-claim["']\s*,\s*tokenVerificationLimiter/);
    });
  });
});
