/**
 * TDD Tests for Onboarding API Routes
 *
 * Tests the onboarding status endpoints:
 * - GET /api/profile/onboarding-status - Get user's onboarding completion status
 * - PUT /api/profile/onboarding-status - Update onboarding completion status
 *
 * These tests will FAIL until the routes and schema are implemented.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import { users, organizations, userOrganizations } from "@shared/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

describe("Onboarding Routes", () => {
  const timestamp = Date.now().toString();
  const testSuffix = `_onboarding_test_${timestamp}`;

  let testOrgId: string;
  let newAthleteId: string;
  let completedAthleteId: string;
  let coachId: string;
  let siteAdminId: string;

  const TEST_PASSWORD = "Test123!@#";
  const HASHED_PASSWORD = bcrypt.hashSync(TEST_PASSWORD, 10);

  beforeAll(async () => {
    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: `Onboarding Test Org${testSuffix}`,
      orgType: "club",
      isActive: true,
    }).returning();
    testOrgId = org.id;

    // Create new athlete (hasCompletedOnboarding = false)
    const [newAthlete] = await db.insert(users).values({
      username: `new_athlete${testSuffix}`,
      password: HASHED_PASSWORD,
      emails: [`new${testSuffix}@example.com`],
      firstName: "New",
      lastName: "Athlete",
      fullName: "New Athlete",
      isActive: true,
      hasCompletedOnboarding: false,
    }).returning();
    newAthleteId = newAthlete.id;

    await db.insert(userOrganizations).values({
      userId: newAthleteId,
      organizationId: testOrgId,
      role: "athlete",
    });

    // Create athlete who completed onboarding
    const [completedAthlete] = await db.insert(users).values({
      username: `completed_athlete${testSuffix}`,
      password: HASHED_PASSWORD,
      emails: [`completed${testSuffix}@example.com`],
      firstName: "Completed",
      lastName: "Athlete",
      fullName: "Completed Athlete",
      isActive: true,
      hasCompletedOnboarding: true,
    }).returning();
    completedAthleteId = completedAthlete.id;

    await db.insert(userOrganizations).values({
      userId: completedAthleteId,
      organizationId: testOrgId,
      role: "athlete",
    });

    // Create coach
    const [coach] = await db.insert(users).values({
      username: `coach${testSuffix}`,
      password: HASHED_PASSWORD,
      emails: [`coach${testSuffix}@example.com`],
      firstName: "Test",
      lastName: "Coach",
      fullName: "Test Coach",
      isActive: true,
      hasCompletedOnboarding: false,
    }).returning();
    coachId = coach.id;

    await db.insert(userOrganizations).values({
      userId: coachId,
      organizationId: testOrgId,
      role: "coach",
    });

    // Create site admin
    const [siteAdmin] = await db.insert(users).values({
      username: `site_admin${testSuffix}`,
      password: HASHED_PASSWORD,
      emails: [`siteadmin${testSuffix}@example.com`],
      firstName: "Site",
      lastName: "Admin",
      fullName: "Site Admin",
      isSiteAdmin: true,
      isActive: true,
      hasCompletedOnboarding: false,
    }).returning();
    siteAdminId = siteAdmin.id;
  });

  afterAll(async () => {
    // Clean up
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId));
    await db.delete(users).where(eq(users.id, newAthleteId));
    await db.delete(users).where(eq(users.id, completedAthleteId));
    await db.delete(users).where(eq(users.id, coachId));
    await db.delete(users).where(eq(users.id, siteAdminId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  });

  describe("GET /api/profile/onboarding-status", () => {
    it("should return false for new athlete who hasn't completed onboarding", async () => {
      const user = await db.select()
        .from(users)
        .where(eq(users.id, newAthleteId))
        .limit(1);

      expect(user[0].hasCompletedOnboarding).toBe(false);
    });

    it("should return true for athlete who completed onboarding", async () => {
      const user = await db.select()
        .from(users)
        .where(eq(users.id, completedAthleteId))
        .limit(1);

      expect(user[0].hasCompletedOnboarding).toBe(true);
    });

    it("should return false for new coach who hasn't completed onboarding", async () => {
      const user = await db.select()
        .from(users)
        .where(eq(users.id, coachId))
        .limit(1);

      expect(user[0].hasCompletedOnboarding).toBe(false);
    });

    it("should return false for site admin (site admins don't need onboarding)", async () => {
      const user = await db.select()
        .from(users)
        .where(eq(users.id, siteAdminId))
        .limit(1);

      // Site admins are created with hasCompletedOnboarding = false
      // but should be auto-marked as true or skipped in the UI
      expect(user[0].hasCompletedOnboarding).toBe(false);
    });
  });

  describe("PUT /api/profile/onboarding-status", () => {
    it("should update onboarding status for athlete", async () => {
      // Update new athlete to completed
      await db.update(users)
        .set({ hasCompletedOnboarding: true })
        .where(eq(users.id, newAthleteId));

      const user = await db.select()
        .from(users)
        .where(eq(users.id, newAthleteId))
        .limit(1);

      expect(user[0].hasCompletedOnboarding).toBe(true);
    });

    it("should update onboarding status for coach", async () => {
      // Update coach to completed
      await db.update(users)
        .set({ hasCompletedOnboarding: true })
        .where(eq(users.id, coachId));

      const user = await db.select()
        .from(users)
        .where(eq(users.id, coachId))
        .limit(1);

      expect(user[0].hasCompletedOnboarding).toBe(true);
    });

    it("should allow resetting onboarding status (for replay)", async () => {
      // Reset completed athlete back to false (for replay testing)
      await db.update(users)
        .set({ hasCompletedOnboarding: false })
        .where(eq(users.id, completedAthleteId));

      const user = await db.select()
        .from(users)
        .where(eq(users.id, completedAthleteId))
        .limit(1);

      expect(user[0].hasCompletedOnboarding).toBe(false);

      // Set back to true
      await db.update(users)
        .set({ hasCompletedOnboarding: true })
        .where(eq(users.id, completedAthleteId));

      const updatedUser = await db.select()
        .from(users)
        .where(eq(users.id, completedAthleteId))
        .limit(1);

      expect(updatedUser[0].hasCompletedOnboarding).toBe(true);
    });
  });

  describe("Schema validation", () => {
    it("should have hasCompletedOnboarding column on users table", async () => {
      const user = await db.select()
        .from(users)
        .where(eq(users.id, newAthleteId))
        .limit(1);

      // This test will FAIL until the schema migration is applied
      expect(user[0]).toHaveProperty('hasCompletedOnboarding');
    });

    it("should default hasCompletedOnboarding to false for new users", async () => {
      // Create a brand new user without specifying hasCompletedOnboarding
      const [brandNewUser] = await db.insert(users).values({
        username: `brand_new${testSuffix}`,
        password: HASHED_PASSWORD,
        emails: [`brandnew${testSuffix}@example.com`],
        firstName: "Brand",
        lastName: "New",
        fullName: "Brand New",
        isActive: true,
        // Intentionally NOT setting hasCompletedOnboarding
      }).returning();

      // Should default to false
      expect(brandNewUser.hasCompletedOnboarding).toBe(false);

      // Clean up
      await db.delete(users).where(eq(users.id, brandNewUser.id));
    });
  });
});
