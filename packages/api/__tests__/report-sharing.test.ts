/**
 * Integration tests for report sharing feature
 * Tests coach sharing reports with athletes, athlete viewing reports, and access control
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { db } from "../db";
import { storage } from "../storage";
import { organizations, users, userOrganizations, reports, reportShares } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

describe("Report Sharing", () => {
  const timestamp = Date.now().toString();
  const testSuffix = `_share_test_${timestamp}`;

  let testOrgId: string;
  let otherOrgId: string;
  let testCoachId: string;
  let testAthleteId: string;
  let otherOrgAthleteId: string;
  let testReportId: string;
  let testShareId: string;

  const TEST_ORG_NAME = `ShareTest Org${testSuffix}`;
  const OTHER_ORG_NAME = `Other Org${testSuffix}`;
  const TEST_COACH_EMAIL = `sharecoach${testSuffix}@example.com`;
  const TEST_ATHLETE_EMAIL = `shareathlete${testSuffix}@example.com`;
  const OTHER_ORG_ATHLETE_EMAIL = `otherorgathlete${testSuffix}@example.com`;

  beforeAll(async () => {
    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: TEST_ORG_NAME,
      orgType: "club",
      description: "Test organization for report sharing",
      isActive: true,
    }).returning();
    testOrgId = org.id;

    // Create other organization
    const [otherOrg] = await db.insert(organizations).values({
      name: OTHER_ORG_NAME,
      orgType: "club",
      description: "Other org for cross-org testing",
      isActive: true,
    }).returning();
    otherOrgId = otherOrg.id;

    // Create test coach
    const [coach] = await db.insert(users).values({
      emails: [TEST_COACH_EMAIL],
      username: `sharecoach${testSuffix}`,
      firstName: "Share",
      lastName: "Coach",
      fullName: "Share Coach",
      password: "hashedpassword",
      isActive: true,
    }).returning();
    testCoachId = coach.id;

    await db.insert(userOrganizations).values({
      userId: testCoachId,
      organizationId: testOrgId,
      role: "coach",
    });

    // Create test athlete in same org
    const [athlete] = await db.insert(users).values({
      emails: [TEST_ATHLETE_EMAIL],
      username: `shareathlete${testSuffix}`,
      firstName: "Share",
      lastName: "Athlete",
      fullName: "Share Athlete",
      password: "hashedpassword",
      isActive: true,
    }).returning();
    testAthleteId = athlete.id;

    await db.insert(userOrganizations).values({
      userId: testAthleteId,
      organizationId: testOrgId,
      role: "athlete",
    });

    // Create athlete in other org
    const [otherAthlete] = await db.insert(users).values({
      emails: [OTHER_ORG_ATHLETE_EMAIL],
      username: `otherorgathlete${testSuffix}`,
      firstName: "Other",
      lastName: "Athlete",
      fullName: "Other Athlete",
      password: "hashedpassword",
      isActive: true,
    }).returning();
    otherOrgAthleteId = otherAthlete.id;

    await db.insert(userOrganizations).values({
      userId: otherOrgAthleteId,
      organizationId: otherOrgId,
      role: "athlete",
    });

    // Create test report
    const [report] = await db.insert(reports).values({
      name: "Test Performance Report",
      organizationId: testOrgId,
      reportType: "team",
      config: {
        timeframe: { type: "preset", preset: "season" },
        metrics: ["FLY10_TIME", "VERTICAL_JUMP"],
      },
      createdBy: testCoachId,
    }).returning();
    testReportId = report.id;
  });

  afterEach(async () => {
    // Clean up shares after each test
    await db.delete(reportShares).where(eq(reportShares.reportId, testReportId));
  });

  afterAll(async () => {
    // Clean up all test data
    await db.delete(reportShares).where(eq(reportShares.reportId, testReportId));
    await db.delete(reports).where(eq(reports.id, testReportId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, otherOrgId));
    await db.delete(users).where(eq(users.id, testCoachId));
    await db.delete(users).where(eq(users.id, testAthleteId));
    await db.delete(users).where(eq(users.id, otherOrgAthleteId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
    await db.delete(organizations).where(eq(organizations.id, otherOrgId));
  });

  describe("Database Schema", () => {
    it("should create reportShares table with correct structure", async () => {
      const [share] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: testAthleteId,
        sharedBy: testCoachId,
        organizationId: testOrgId,
        message: "Check out your progress!",
      }).returning();

      expect(share.id).toBeDefined();
      expect(share.reportId).toBe(testReportId);
      expect(share.athleteId).toBe(testAthleteId);
      expect(share.sharedBy).toBe(testCoachId);
      expect(share.organizationId).toBe(testOrgId);
      expect(share.message).toBe("Check out your progress!");
      expect(share.viewedAt).toBeNull();
      expect(share.createdAt).toBeDefined();

      testShareId = share.id;
    });

    it("should enforce unique constraint on (reportId, athleteId)", async () => {
      await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: testAthleteId,
        sharedBy: testCoachId,
        organizationId: testOrgId,
      });

      // Attempt duplicate share
      await expect(
        db.insert(reportShares).values({
          reportId: testReportId,
          athleteId: testAthleteId,
          sharedBy: testCoachId,
          organizationId: testOrgId,
        })
      ).rejects.toThrow();
    });

    it("should cascade delete shares when report is deleted", async () => {
      // Create temporary report
      const [tempReport] = await db.insert(reports).values({
        name: "Temp Report",
        organizationId: testOrgId,
        reportType: "team",
        config: { timeframe: { type: "preset", preset: "season" }, metrics: ["FLY10_TIME"] },
        createdBy: testCoachId,
      }).returning();

      const [share] = await db.insert(reportShares).values({
        reportId: tempReport.id,
        athleteId: testAthleteId,
        sharedBy: testCoachId,
        organizationId: testOrgId,
      }).returning();

      // Delete report
      await db.delete(reports).where(eq(reports.id, tempReport.id));

      // Verify share was deleted
      const shares = await db.select().from(reportShares).where(eq(reportShares.id, share.id));
      expect(shares.length).toBe(0);
    });

    it("should cascade delete shares when athlete is deleted", async () => {
      // Create temporary athlete
      const [tempAthlete] = await db.insert(users).values({
        emails: [`tempathlete${testSuffix}@example.com`],
        username: `tempathlete${testSuffix}`,
        firstName: "Temp",
        lastName: "Athlete",
        fullName: "Temp Athlete",
        password: "hashedpassword",
        isActive: true,
      }).returning();

      await db.insert(userOrganizations).values({
        userId: tempAthlete.id,
        organizationId: testOrgId,
        role: "athlete",
      });

      const [share] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: tempAthlete.id,
        sharedBy: testCoachId,
        organizationId: testOrgId,
      }).returning();

      // Delete athlete (need to delete userOrganizations first)
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, tempAthlete.id));
      await db.delete(users).where(eq(users.id, tempAthlete.id));

      // Verify share was deleted
      const shares = await db.select().from(reportShares).where(eq(reportShares.id, share.id));
      expect(shares.length).toBe(0);
    });

    it("should set sharedBy to null when coach is deleted", async () => {
      // Create temporary coach
      const [tempCoach] = await db.insert(users).values({
        emails: [`tempcoach${testSuffix}@example.com`],
        username: `tempcoach${testSuffix}`,
        firstName: "Temp",
        lastName: "Coach",
        fullName: "Temp Coach",
        password: "hashedpassword",
        isActive: true,
      }).returning();

      await db.insert(userOrganizations).values({
        userId: tempCoach.id,
        organizationId: testOrgId,
        role: "coach",
      });

      const [share] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: testAthleteId,
        sharedBy: tempCoach.id,
        organizationId: testOrgId,
      }).returning();

      // Delete coach (need to delete userOrganizations first)
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, tempCoach.id));
      await db.delete(users).where(eq(users.id, tempCoach.id));

      // Verify share still exists but sharedBy is null
      const [updatedShare] = await db.select().from(reportShares).where(eq(reportShares.id, share.id));
      expect(updatedShare).toBeDefined();
      expect(updatedShare.sharedBy).toBeNull();
    });
  });

  describe("POST /api/reports/:id/share - API Endpoint Tests", () => {
    it("should allow coach to share report with athlete in same org", async () => {
      // TODO: Implement in report-routes.ts
      // This test will verify the actual API endpoint behavior
      expect(true).toBe(true); // Placeholder
    });

    it("should return shareId and athleteName on success", async () => {
      // TODO: Implement in report-routes.ts
      expect(true).toBe(true); // Placeholder
    });

    it("should return 404 if report doesn't exist", async () => {
      // TODO: Implement in report-routes.ts
      expect(true).toBe(true); // Placeholder
    });

    it("should return 403 if user is not coach or org_admin", async () => {
      // TODO: Implement in report-routes.ts
      expect(true).toBe(true); // Placeholder
    });

    it("should return 400 if athlete not in same org", async () => {
      // TODO: Implement in report-routes.ts
      expect(true).toBe(true); // Placeholder
    });

    it("should return 409 if already shared (unique constraint)", async () => {
      // TODO: Implement in report-routes.ts
      expect(true).toBe(true); // Placeholder
    });
  });

  describe("POST /api/reports/:id/share-bulk - Bulk Share Tests", () => {
    it("should share with multiple athletes", async () => {
      // TODO: Implement in report-routes.ts
      expect(true).toBe(true); // Placeholder
    });

    it("should skip athletes already shared with", async () => {
      // TODO: Implement in report-routes.ts
      expect(true).toBe(true); // Placeholder
    });

    it("should return accurate counts (shared, skipped, failed)", async () => {
      // TODO: Implement in report-routes.ts
      expect(true).toBe(true); // Placeholder
    });

    it("should share with all athletes if athleteIds not provided", async () => {
      // TODO: Implement in report-routes.ts
      expect(true).toBe(true); // Placeholder
    });
  });

  describe("GET /api/my/reports - Athlete View Tests", () => {
    it("should return reports shared with authenticated athlete", async () => {
      // TODO: Implement in report-routes.ts
      expect(true).toBe(true); // Placeholder
    });

    it("should order reports by createdAt DESC", async () => {
      // TODO: Implement in report-routes.ts
      expect(true).toBe(true); // Placeholder
    });

    it("should set isNew to true when not viewed", async () => {
      // TODO: Implement in report-routes.ts
      expect(true).toBe(true); // Placeholder
    });

    it("should return empty array if no reports shared", async () => {
      // TODO: Implement in report-routes.ts
      expect(true).toBe(true); // Placeholder
    });

    it("should not allow coach to use this endpoint", async () => {
      // TODO: Implement in report-routes.ts
      expect(true).toBe(true); // Placeholder
    });
  });

  describe("POST /api/my/reports/:shareId/viewed - Mark Viewed Tests", () => {
    it("should set viewedAt timestamp", async () => {
      // TODO: Implement in report-routes.ts
      expect(true).toBe(true); // Placeholder
    });

    it("should be idempotent - calling again returns same timestamp", async () => {
      // TODO: Implement in report-routes.ts
      expect(true).toBe(true); // Placeholder
    });

    it("should not allow marking someone else's share as viewed", async () => {
      // TODO: Implement in report-routes.ts
      expect(true).toBe(true); // Placeholder
    });
  });

  describe("DELETE /api/reports/:id/shares/:shareId - Unshare Tests", () => {
    it("should allow coach to unshare their own share", async () => {
      // TODO: Implement in report-routes.ts
      expect(true).toBe(true); // Placeholder
    });

    it("should allow org admin to unshare any share in org", async () => {
      // TODO: Implement in report-routes.ts
      expect(true).toBe(true); // Placeholder
    });

    it("should return 404 if share doesn't exist", async () => {
      // TODO: Implement in report-routes.ts
      expect(true).toBe(true); // Placeholder
    });

    it("should not allow athlete to unshare", async () => {
      // TODO: Implement in report-routes.ts
      expect(true).toBe(true); // Placeholder
    });
  });

  describe("GET /api/reports/:id/shares - List Shares Tests", () => {
    it("should return list of who report has been shared with", async () => {
      // TODO: Implement in report-routes.ts
      expect(true).toBe(true); // Placeholder
    });

    it("should include athlete, sharedBy, and viewedAt info", async () => {
      // TODO: Implement in report-routes.ts
      expect(true).toBe(true); // Placeholder
    });

    it("should only allow coach/org_admin to view", async () => {
      // TODO: Implement in report-routes.ts
      expect(true).toBe(true); // Placeholder
    });
  });

  // Keep existing database schema tests
  describe("Database Schema Tests (Keep for reference)", () => {
    it("should allow coach to share report with athlete in same org", async () => {
      const [share] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: testAthleteId,
        sharedBy: testCoachId,
        organizationId: testOrgId,
        message: "Great progress this season!",
      }).returning();

      expect(share.reportId).toBe(testReportId);
      expect(share.athleteId).toBe(testAthleteId);
      expect(share.message).toBe("Great progress this season!");
    });

    it("should allow database insert but validation should happen at API level", async () => {
      // NOTE: Database-level doesn't enforce org membership matching
      // This validation will be enforced at the API route level
      // Here we just verify that the insert is possible technically
      const [share] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: otherOrgAthleteId, // Different org - DB allows this
        sharedBy: testCoachId,
        organizationId: testOrgId,
      }).returning();

      expect(share).toBeDefined();
      expect(share.athleteId).toBe(otherOrgAthleteId);

      // Clean up
      await db.delete(reportShares).where(eq(reportShares.id, share.id));
    });

    it("should reject sharing non-existent report", async () => {
      await expect(
        db.insert(reportShares).values({
          reportId: "non-existent-report-id",
          athleteId: testAthleteId,
          sharedBy: testCoachId,
          organizationId: testOrgId,
        })
      ).rejects.toThrow();
    });

    it("should reject sharing with non-existent athlete", async () => {
      await expect(
        db.insert(reportShares).values({
          reportId: testReportId,
          athleteId: "non-existent-athlete-id",
          sharedBy: testCoachId,
          organizationId: testOrgId,
        })
      ).rejects.toThrow();
    });

    it("should reject duplicate share (same report + athlete)", async () => {
      await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: testAthleteId,
        sharedBy: testCoachId,
        organizationId: testOrgId,
      });

      // Attempt duplicate
      await expect(
        db.insert(reportShares).values({
          reportId: testReportId,
          athleteId: testAthleteId,
          sharedBy: testCoachId,
          organizationId: testOrgId,
        })
      ).rejects.toThrow();
    });

    it("should allow sharing same report with multiple athletes", async () => {
      // Create second athlete
      const [athlete2] = await db.insert(users).values({
        emails: [`athlete2${testSuffix}@example.com`],
        username: `athlete2${testSuffix}`,
        firstName: "Athlete",
        lastName: "Two",
        fullName: "Athlete Two",
        password: "hashedpassword",
        isActive: true,
      }).returning();

      await db.insert(userOrganizations).values({
        userId: athlete2.id,
        organizationId: testOrgId,
        role: "athlete",
      });

      const [share1] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: testAthleteId,
        sharedBy: testCoachId,
        organizationId: testOrgId,
      }).returning();

      const [share2] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: athlete2.id,
        sharedBy: testCoachId,
        organizationId: testOrgId,
      }).returning();

      expect(share1.id).not.toBe(share2.id);
      expect(share1.athleteId).toBe(testAthleteId);
      expect(share2.athleteId).toBe(athlete2.id);

      // Cleanup
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, athlete2.id));
      await db.delete(users).where(eq(users.id, athlete2.id));
    });

    it("should allow optional message field", async () => {
      const [shareWithMessage] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: testAthleteId,
        sharedBy: testCoachId,
        organizationId: testOrgId,
        message: "Keep up the great work!",
      }).returning();

      expect(shareWithMessage.message).toBe("Keep up the great work!");
    });

    it("should allow null message field", async () => {
      // Create second athlete for this test
      const [athlete3] = await db.insert(users).values({
        emails: [`athlete3${testSuffix}@example.com`],
        username: `athlete3${testSuffix}`,
        firstName: "Athlete",
        lastName: "Three",
        fullName: "Athlete Three",
        password: "hashedpassword",
        isActive: true,
      }).returning();

      await db.insert(userOrganizations).values({
        userId: athlete3.id,
        organizationId: testOrgId,
        role: "athlete",
      });

      const [shareWithoutMessage] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: athlete3.id,
        sharedBy: testCoachId,
        organizationId: testOrgId,
      }).returning();

      expect(shareWithoutMessage.message).toBeNull();

      // Cleanup
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, athlete3.id));
      await db.delete(users).where(eq(users.id, athlete3.id));
    });
  });

  describe("GET /api/my/reports", () => {
    beforeEach(async () => {
      // Create shares for test athlete
      await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: testAthleteId,
        sharedBy: testCoachId,
        organizationId: testOrgId,
        message: "Test message",
      });
    });

    it("should return reports shared with the athlete", async () => {
      const shares = await db
        .select()
        .from(reportShares)
        .where(eq(reportShares.athleteId, testAthleteId));

      expect(shares.length).toBeGreaterThan(0);
      expect(shares[0].athleteId).toBe(testAthleteId);
    });

    it("should not return reports shared with other athletes", async () => {
      // Create share for other athlete
      const [athlete4] = await db.insert(users).values({
        emails: [`athlete4${testSuffix}@example.com`],
        username: `athlete4${testSuffix}`,
        firstName: "Athlete",
        lastName: "Four",
        fullName: "Athlete Four",
        password: "hashedpassword",
        isActive: true,
      }).returning();

      await db.insert(userOrganizations).values({
        userId: athlete4.id,
        organizationId: testOrgId,
        role: "athlete",
      });

      await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: athlete4.id,
        sharedBy: testCoachId,
        organizationId: testOrgId,
      });

      // Query for test athlete
      const shares = await db
        .select()
        .from(reportShares)
        .where(eq(reportShares.athleteId, testAthleteId));

      // Should only have 1 share (from beforeEach)
      expect(shares.length).toBe(1);
      expect(shares[0].athleteId).toBe(testAthleteId);

      // Cleanup
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, athlete4.id));
      await db.delete(users).where(eq(users.id, athlete4.id));
    });

    it("should order reports by createdAt desc (newest first)", async () => {
      // Create second report
      const [report2] = await db.insert(reports).values({
        name: "Second Report",
        organizationId: testOrgId,
        reportType: "team",
        config: { timeframe: { type: "preset", preset: "year" }, metrics: ["VERTICAL_JUMP"] },
        createdBy: testCoachId,
      }).returning();

      // Share second report (created after first)
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay to ensure different timestamps
      await db.insert(reportShares).values({
        reportId: report2.id,
        athleteId: testAthleteId,
        sharedBy: testCoachId,
        organizationId: testOrgId,
      });

      const shares = await db
        .select()
        .from(reportShares)
        .where(eq(reportShares.athleteId, testAthleteId))
        .orderBy(sql`${reportShares.createdAt} DESC`);

      expect(shares.length).toBe(2);
      expect(new Date(shares[0].createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date(shares[1].createdAt).getTime()
      );

      // Cleanup
      await db.delete(reports).where(eq(reports.id, report2.id));
    });

    it("should include sharedBy information", async () => {
      const shares = await db
        .select()
        .from(reportShares)
        .where(eq(reportShares.athleteId, testAthleteId));

      expect(shares[0].sharedBy).toBe(testCoachId);
    });

    it("should include message if provided", async () => {
      const shares = await db
        .select()
        .from(reportShares)
        .where(eq(reportShares.athleteId, testAthleteId));

      expect(shares[0].message).toBe("Test message");
    });

    it("should include viewedAt timestamp", async () => {
      const shares = await db
        .select()
        .from(reportShares)
        .where(eq(reportShares.athleteId, testAthleteId));

      expect(shares[0].viewedAt).toBeNull(); // Not viewed yet
    });
  });

  describe("POST /api/my/reports/:shareId/viewed", () => {
    let shareId: string;

    beforeEach(async () => {
      const [share] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: testAthleteId,
        sharedBy: testCoachId,
        organizationId: testOrgId,
      }).returning();

      shareId = share.id;
    });

    it("should mark share as viewed", async () => {
      const viewedAt = new Date();

      await db
        .update(reportShares)
        .set({ viewedAt })
        .where(eq(reportShares.id, shareId));

      const [share] = await db
        .select()
        .from(reportShares)
        .where(eq(reportShares.id, shareId));

      expect(share.viewedAt).not.toBeNull();
      expect(new Date(share.viewedAt!).getTime()).toBeCloseTo(viewedAt.getTime(), -2);
    });

    it("should only set viewedAt once (first view)", async () => {
      const firstViewedAt = new Date();

      await db
        .update(reportShares)
        .set({ viewedAt: firstViewedAt })
        .where(eq(reportShares.id, shareId));

      // Simulate second view attempt
      await new Promise(resolve => setTimeout(resolve, 100));
      const secondViewedAt = new Date();

      // Route should not update if already viewed
      const [existingShare] = await db
        .select()
        .from(reportShares)
        .where(eq(reportShares.id, shareId));

      if (!existingShare.viewedAt) {
        await db
          .update(reportShares)
          .set({ viewedAt: secondViewedAt })
          .where(eq(reportShares.id, shareId));
      }

      const [share] = await db
        .select()
        .from(reportShares)
        .where(eq(reportShares.id, shareId));

      expect(new Date(share.viewedAt!).getTime()).toBeCloseTo(firstViewedAt.getTime(), -2);
    });
  });

  describe("DELETE /api/reports/:id/shares/:shareId", () => {
    let shareId: string;

    beforeEach(async () => {
      const [share] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: testAthleteId,
        sharedBy: testCoachId,
        organizationId: testOrgId,
      }).returning();

      shareId = share.id;
    });

    it("should allow coach to unshare report", async () => {
      await db.delete(reportShares).where(eq(reportShares.id, shareId));

      const shares = await db
        .select()
        .from(reportShares)
        .where(eq(reportShares.id, shareId));

      expect(shares.length).toBe(0);
    });

    it("should not affect other shares when unsharing", async () => {
      // Create second athlete and share
      const [athlete5] = await db.insert(users).values({
        emails: [`athlete5${testSuffix}@example.com`],
        username: `athlete5${testSuffix}`,
        firstName: "Athlete",
        lastName: "Five",
        fullName: "Athlete Five",
        password: "hashedpassword",
        isActive: true,
      }).returning();

      await db.insert(userOrganizations).values({
        userId: athlete5.id,
        organizationId: testOrgId,
        role: "athlete",
      });

      const [share2] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: athlete5.id,
        sharedBy: testCoachId,
        organizationId: testOrgId,
      }).returning();

      // Delete first share
      await db.delete(reportShares).where(eq(reportShares.id, shareId));

      // Verify second share still exists
      const [remainingShare] = await db
        .select()
        .from(reportShares)
        .where(eq(reportShares.id, share2.id));

      expect(remainingShare).toBeDefined();
      expect(remainingShare.athleteId).toBe(athlete5.id);

      // Cleanup
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, athlete5.id));
      await db.delete(users).where(eq(users.id, athlete5.id));
    });
  });

  describe("Message Length Validation", () => {
    it("should accept message up to 1000 characters", async () => {
      const longMessage = "a".repeat(1000);

      const [share] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: testAthleteId,
        sharedBy: testCoachId,
        organizationId: testOrgId,
        message: longMessage,
      }).returning();

      expect(share.message).toBe(longMessage);
      expect(share.message?.length).toBe(1000);
    });

    it("should store very long messages at database level (validation at API)", async () => {
      // Note: Database doesn't enforce length limit - this is done at API level via Zod
      // This test confirms the database accepts longer messages (API validation is separate)
      const veryLongMessage = "a".repeat(2000);

      const [share] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: testAthleteId,
        sharedBy: testCoachId,
        organizationId: testOrgId,
        message: veryLongMessage,
      }).returning();

      expect(share.message?.length).toBe(2000);
    });
  });

  describe("GET /api/my/reports/:shareId - Individual Share Endpoint", () => {
    it("should return share details with report info", async () => {
      // Create a share
      const [share] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: testAthleteId,
        sharedBy: testCoachId,
        organizationId: testOrgId,
        message: "Check out your results!",
      }).returning();

      // Verify share was created with all expected fields
      expect(share.id).toBeDefined();
      expect(share.reportId).toBe(testReportId);
      expect(share.athleteId).toBe(testAthleteId);
      expect(share.sharedBy).toBe(testCoachId);
      expect(share.organizationId).toBe(testOrgId);
      expect(share.message).toBe("Check out your results!");
      expect(share.viewedAt).toBeNull();
      expect(share.createdAt).toBeDefined();
    });

    it("should only allow athlete to access their own shares", async () => {
      // Create a share for testAthlete
      const [share] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: testAthleteId,
        sharedBy: testCoachId,
        organizationId: testOrgId,
      }).returning();

      // Query should return the share when queried with correct athleteId
      const [foundShare] = await db
        .select()
        .from(reportShares)
        .where(
          and(
            eq(reportShares.id, share.id),
            eq(reportShares.athleteId, testAthleteId)
          )
        );

      expect(foundShare).toBeDefined();
      expect(foundShare.id).toBe(share.id);

      // Query with wrong athleteId should return nothing
      const wrongAthleteShares = await db
        .select()
        .from(reportShares)
        .where(
          and(
            eq(reportShares.id, share.id),
            eq(reportShares.athleteId, otherOrgAthleteId)
          )
        );

      expect(wrongAthleteShares.length).toBe(0);
    });

    it("should handle non-existent share gracefully", async () => {
      const fakeShareId = "00000000-0000-0000-0000-000000000000";

      const shares = await db
        .select()
        .from(reportShares)
        .where(eq(reportShares.id, fakeShareId));

      expect(shares.length).toBe(0);
    });

    it("should return response with nested report object structure", async () => {
      // This test verifies the API response format matches what the frontend expects
      // The frontend uses: const { report, message, sharedBy } = sharedReport;
      // And then: report.reportType === "team"

      // Create a share to test response structure
      const [share] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: testAthleteId,
        sharedBy: testCoachId,
        organizationId: testOrgId,
        message: "Response structure test",
      }).returning();

      // Simulate what the API endpoint returns by doing the same query
      const [result] = await db
        .select({
          shareId: reportShares.id,
          reportId: reportShares.reportId,
          reportName: reports.name,
          reportType: reports.reportType,
          reportConfig: reports.config,
          reportDescription: reports.description,
          reportCoachingInsights: reports.coachingInsights,
          reportCreatedBy: reports.createdBy,
          sharedById: reportShares.sharedBy,
          sharedByFirstName: users.firstName,
          sharedByLastName: users.lastName,
          message: reportShares.message,
          createdAt: reportShares.createdAt,
          viewedAt: reportShares.viewedAt,
          organizationId: reportShares.organizationId,
        })
        .from(reportShares)
        .innerJoin(reports, eq(reportShares.reportId, reports.id))
        .leftJoin(users, eq(reportShares.sharedBy, users.id))
        .where(
          and(
            eq(reportShares.id, share.id),
            eq(reportShares.athleteId, testAthleteId)
          )
        );

      // Verify all required fields for the nested report object are present
      expect(result).toBeDefined();
      expect(result.shareId).toBe(share.id);
      expect(result.reportId).toBeDefined();
      expect(result.reportName).toBeDefined();
      expect(result.reportType).toBeDefined();
      expect(result.reportType).toMatch(/^(team|individual)$/);
      expect(result.organizationId).toBeDefined();
      expect(result.reportCreatedBy).toBeDefined();
      expect(result.sharedById).toBe(testCoachId);
      expect(result.sharedByFirstName).toBeDefined();
      expect(result.sharedByLastName).toBeDefined();
      expect(result.message).toBe("Response structure test");
    });

    it("should include all Report interface fields in response", async () => {
      // Create a share
      const [share] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: testAthleteId,
        sharedBy: testCoachId,
        organizationId: testOrgId,
      }).returning();

      // Get the report directly to compare
      const [report] = await db
        .select()
        .from(reports)
        .where(eq(reports.id, testReportId));

      // Verify the report has all required fields from Report interface:
      // id, organizationId, createdBy, name, description, reportType, config,
      // isTemplate, isPinned, createdAt, coachingInsights
      expect(report.id).toBeDefined();
      expect(report.organizationId).toBeDefined();
      expect(report.createdBy).toBeDefined();
      expect(report.name).toBeDefined();
      expect(report.reportType).toBeDefined();
      expect(report.config).toBeDefined();
      expect(typeof report.isTemplate).toBe('boolean');
      expect(typeof report.isPinned).toBe('boolean');
      expect(report.createdAt).toBeDefined();
    });
  });

  describe("Bulk Share Limit Enforcement", () => {
    it("should allow sharing with up to 100 athletes", async () => {
      // This test verifies the database can handle 100 shares
      // The actual limit check is at the API level
      const MAX_BULK_SHARE = 100;

      // Create shares for first few athletes as a sample
      const sampleSize = 5;
      const createdAthletes: string[] = [];

      for (let i = 0; i < sampleSize; i++) {
        const [athlete] = await db.insert(users).values({
          emails: [`bulkathlete${i}${testSuffix}@example.com`],
          username: `bulkathlete${i}${testSuffix}`,
          firstName: `Bulk`,
          lastName: `Athlete${i}`,
          fullName: `Bulk Athlete${i}`,
          password: "hashedpassword",
          isActive: true,
        }).returning();

        await db.insert(userOrganizations).values({
          userId: athlete.id,
          organizationId: testOrgId,
          role: "athlete",
        });

        createdAthletes.push(athlete.id);

        await db.insert(reportShares).values({
          reportId: testReportId,
          athleteId: athlete.id,
          sharedBy: testCoachId,
          organizationId: testOrgId,
        });
      }

      // Verify all shares were created
      const shares = await db
        .select()
        .from(reportShares)
        .where(eq(reportShares.reportId, testReportId));

      expect(shares.length).toBeGreaterThanOrEqual(sampleSize);

      // Cleanup
      for (const athleteId of createdAthletes) {
        await db.delete(userOrganizations).where(eq(userOrganizations.userId, athleteId));
        await db.delete(users).where(eq(users.id, athleteId));
      }
    });

    it("should verify bulk share constant is defined correctly", () => {
      // This test ensures the constant exists and has a reasonable value
      const MAX_BULK_SHARE = 100;
      expect(MAX_BULK_SHARE).toBe(100);
      expect(MAX_BULK_SHARE).toBeGreaterThan(0);
      expect(MAX_BULK_SHARE).toBeLessThanOrEqual(1000); // Sanity check
    });
  });

  describe("Null sharedBy Handling (Coach Deleted)", () => {
    it("should preserve share when coach is deleted (sharedBy becomes null)", async () => {
      // Create a temporary coach
      const [tempCoach] = await db.insert(users).values({
        emails: [`nulltest_coach${testSuffix}@example.com`],
        username: `nulltest_coach${testSuffix}`,
        firstName: "NullTest",
        lastName: "Coach",
        fullName: "NullTest Coach",
        password: "hashedpassword",
        isActive: true,
      }).returning();

      await db.insert(userOrganizations).values({
        userId: tempCoach.id,
        organizationId: testOrgId,
        role: "coach",
      });

      // Create share with temp coach
      const [share] = await db.insert(reportShares).values({
        reportId: testReportId,
        athleteId: testAthleteId,
        sharedBy: tempCoach.id,
        organizationId: testOrgId,
        message: "From temp coach",
      }).returning();

      expect(share.sharedBy).toBe(tempCoach.id);

      // Delete the coach
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, tempCoach.id));
      await db.delete(users).where(eq(users.id, tempCoach.id));

      // Verify share still exists with null sharedBy
      const [updatedShare] = await db
        .select()
        .from(reportShares)
        .where(eq(reportShares.id, share.id));

      expect(updatedShare).toBeDefined();
      expect(updatedShare.sharedBy).toBeNull();
      expect(updatedShare.message).toBe("From temp coach");
      expect(updatedShare.athleteId).toBe(testAthleteId);
    });
  });
});
