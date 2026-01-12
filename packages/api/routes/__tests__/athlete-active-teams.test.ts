/**
 * Integration tests for GET /api/athletes/:id/active-teams endpoint
 *
 * Test coverage:
 * - Returns 401 if not authenticated
 * - Returns 400 if date parameter is missing or invalid
 * - Returns 404 if athlete not found
 * - Returns 403 if user doesn't have access to the athlete's organization
 * - Returns empty array if athlete has no active teams at the date
 * - Returns active teams array when athlete has teams
 * - Properly filters teams by date (joined before, not left yet)
 * - Correctly handles teams where athlete has left
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { storage } from "../../storage";
import { registerAthleteRoutes } from "../athlete-routes";
import { db } from "../../db";
import { userTeams } from "@shared/schema";

// Mock session data for testing
let mockSessionUser: any = null;

// Create test app with mocked session middleware
function createTestApp() {
  const app = express();
  app.use(express.json());

  // Mock session middleware for testing
  app.use((req: Request, res: Response, next: NextFunction) => {
    req.session = {
      user: mockSessionUser,
    } as any;
    next();
  });

  // Register routes
  registerAthleteRoutes(app);

  return app;
}

const app = createTestApp();

// Test data IDs (will be populated in beforeAll)
let testOrgId1: string;
let testOrgId2: string;
let testTeamId1: string;
let testTeamId2: string;
let testTeamId3: string;
let testCoachId: string;
let testOrgAdminId: string;
let testSiteAdminId: string;
let testAthleteId1: string; // Athlete with multiple teams
let testAthleteId2: string; // Athlete with no teams
let testAthleteId3: string; // Athlete from different org

describe("GET /api/athletes/:id/active-teams", () => {
  beforeAll(async () => {
    // Create test organizations with unique timestamp
    const timestamp = Date.now();

    const org1 = await storage.createOrganization({
      name: `Test Organization 1 for Active Teams ${timestamp}`,
      description: "Test org 1",
      benchmarksEnabled: false,
      allowCustomBenchmarks: false,
    });
    testOrgId1 = org1.id;

    const org2 = await storage.createOrganization({
      name: `Test Organization 2 for Active Teams ${timestamp}`,
      description: "Test org 2",
      benchmarksEnabled: false,
      allowCustomBenchmarks: false,
    });
    testOrgId2 = org2.id;

    // Create test teams
    const team1 = await storage.createTeam({
      name: `Test Team 1 Active Teams ${timestamp}`,
      organizationId: testOrgId1,
      level: "Club",
      season: "2024 Spring",
    });
    testTeamId1 = team1.id;

    const team2 = await storage.createTeam({
      name: `Test Team 2 Active Teams ${timestamp}`,
      organizationId: testOrgId1,
      level: "HS",
      season: "2024 Fall",
    });
    testTeamId2 = team2.id;

    const team3 = await storage.createTeam({
      name: `Test Team 3 Active Teams ${timestamp}`,
      organizationId: testOrgId2,
      level: "College",
      season: "2024-2025",
    });
    testTeamId3 = team3.id;

    // Create test users (coach, org admin)
    const coach = await storage.createUser({
      username: `testcoach_activeteams_${timestamp}`,
      password: "TestPassword123!",
      firstName: "Test",
      lastName: "Coach",
      emails: [`testcoach_activeteams_${timestamp}@example.com`],
      isSiteAdmin: false,
    });
    testCoachId = coach.id;
    await storage.addUserToOrganization(testCoachId, testOrgId1, "coach");

    const orgAdmin = await storage.createUser({
      username: `testorgadmin_activeteams_${timestamp}`,
      password: "TestPassword123!",
      firstName: "Test",
      lastName: "OrgAdmin",
      emails: [`testorgadmin_activeteams_${timestamp}@example.com`],
      isSiteAdmin: false,
    });
    testOrgAdminId = orgAdmin.id;
    await storage.addUserToOrganization(testOrgAdminId, testOrgId2, "org_admin");

    // Create site admin (no org membership needed - can access everything)
    const siteAdmin = await storage.createUser({
      username: `testsiteadmin_activeteams_${timestamp}`,
      password: "TestPassword123!",
      firstName: "Site",
      lastName: "Admin",
      emails: [`testsiteadmin_activeteams_${timestamp}@example.com`],
      isSiteAdmin: true,
    });
    testSiteAdminId = siteAdmin.id;

    // Create test athletes
    const athlete1 = await storage.createAthlete({
      firstName: "Athlete",
      lastName: "WithTeams",
      emails: [`athlete1_activeteams_${timestamp}@example.com`],
      birthDate: "2005-01-01",
      gender: "Male",
    });
    testAthleteId1 = athlete1.id;
    await storage.addUserToOrganization(testAthleteId1, testOrgId1, "athlete");

    // Add athlete1 to team1 (joined 2024-01-01, still active)
    await db.insert(userTeams).values({
      userId: testAthleteId1,
      teamId: testTeamId1,
      joinedAt: new Date("2024-01-01"),
      isActive: true,
    });

    // Add athlete1 to team2 (joined 2024-06-01, left 2024-08-15)
    await db.insert(userTeams).values({
      userId: testAthleteId1,
      teamId: testTeamId2,
      joinedAt: new Date("2024-06-01"),
      leftAt: new Date("2024-08-15"),
      isActive: true,
    });

    const athlete2 = await storage.createAthlete({
      firstName: "Athlete",
      lastName: "NoTeams",
      emails: [`athlete2_activeteams_${timestamp}@example.com`],
      birthDate: "2006-01-01",
      gender: "Female",
    });
    testAthleteId2 = athlete2.id;
    await storage.addUserToOrganization(testAthleteId2, testOrgId1, "athlete");
    // No team assignments for athlete2

    const athlete3 = await storage.createAthlete({
      firstName: "Athlete",
      lastName: "DifferentOrg",
      emails: [`athlete3_activeteams_${timestamp}@example.com`],
      birthDate: "2004-01-01",
      gender: "Male",
    });
    testAthleteId3 = athlete3.id;
    await storage.addUserToOrganization(testAthleteId3, testOrgId2, "athlete");
    await db.insert(userTeams).values({
      userId: testAthleteId3,
      teamId: testTeamId3,
      joinedAt: new Date("2024-01-01"),
      isActive: true,
    });
  });

  afterAll(async () => {
    // Cleanup test data
    try {
      // Delete users (athletes, coach, admins) - must be before orgs
      if (testAthleteId1) await storage.deleteUser(testAthleteId1).catch(e => console.error("Error deleting athlete1:", e));
      if (testAthleteId2) await storage.deleteUser(testAthleteId2).catch(e => console.error("Error deleting athlete2:", e));
      if (testAthleteId3) await storage.deleteUser(testAthleteId3).catch(e => console.error("Error deleting athlete3:", e));
      if (testCoachId) await storage.deleteUser(testCoachId).catch(e => console.error("Error deleting coach:", e));
      if (testOrgAdminId) await storage.deleteUser(testOrgAdminId).catch(e => console.error("Error deleting orgAdmin:", e));
      if (testSiteAdminId) await storage.deleteUser(testSiteAdminId).catch(e => console.error("Error deleting siteAdmin:", e));

      // Delete teams
      if (testTeamId1) await storage.deleteTeam(testTeamId1).catch(e => console.error("Error deleting team1:", e));
      if (testTeamId2) await storage.deleteTeam(testTeamId2).catch(e => console.error("Error deleting team2:", e));
      if (testTeamId3) await storage.deleteTeam(testTeamId3).catch(e => console.error("Error deleting team3:", e));

      // Delete organizations
      if (testOrgId1) await storage.deleteOrganization(testOrgId1).catch(e => console.error("Error deleting org1:", e));
      if (testOrgId2) await storage.deleteOrganization(testOrgId2).catch(e => console.error("Error deleting org2:", e));
    } catch (error) {
      console.error("Cleanup error:", error);
    }
  });

  describe("Authentication", () => {
    it("should return 401 if not authenticated", async () => {
      mockSessionUser = null; // No user logged in

      const response = await request(app)
        .get(`/api/athletes/${testAthleteId1}/active-teams`)
        .query({ date: "2024-07-01" });

      expect(response.status).toBe(401);
      expect(response.body.message).toMatch(/not authenticated/i);
    });
  });

  describe("Validation", () => {
    it("should return 400 if date parameter is missing", async () => {
      mockSessionUser = {
        id: testCoachId,
        role: 'coach',
        isSiteAdmin: false,
        primaryOrganizationId: testOrgId1
      };

      const response = await request(app)
        .get(`/api/athletes/${testAthleteId1}/active-teams`);

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/date.*required/i);
    });

    it("should return 400 if date parameter is invalid format", async () => {
      mockSessionUser = {
        id: testCoachId,
        role: 'coach',
        isSiteAdmin: false,
        primaryOrganizationId: testOrgId1
      };

      const response = await request(app)
        .get(`/api/athletes/${testAthleteId1}/active-teams`)
        .query({ date: "invalid-date" });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/date.*invalid/i);
    });
  });

  describe("Authorization", () => {
    it("should return 404 if athlete not found", async () => {
      mockSessionUser = {
        id: testCoachId,
        role: 'coach',
        isSiteAdmin: false,
        primaryOrganizationId: testOrgId1
      };

      const response = await request(app)
        .get(`/api/athletes/00000000-0000-0000-0000-000000000000/active-teams`)
        .query({ date: "2024-07-01" });

      expect(response.status).toBe(404);
      expect(response.body.message).toMatch(/athlete.*not found/i);
    });

    it("should return 403 if user doesn't have access to the athlete's organization", async () => {
      // Coach from org1 tries to access athlete from org2
      mockSessionUser = {
        id: testCoachId,
        role: 'coach',
        isSiteAdmin: false,
        primaryOrganizationId: testOrgId1
      };

      const response = await request(app)
        .get(`/api/athletes/${testAthleteId3}/active-teams`)
        .query({ date: "2024-07-01" });

      expect(response.status).toBe(403);
      expect(response.body.message).toMatch(/access denied|permission/i);
    });
  });

  describe("Active Teams Logic", () => {
    it("should return empty array if athlete has no active teams at the date", async () => {
      mockSessionUser = {
        id: testCoachId,
        role: 'coach',
        isSiteAdmin: false,
        primaryOrganizationId: testOrgId1
      };

      const response = await request(app)
        .get(`/api/athletes/${testAthleteId2}/active-teams`)
        .query({ date: "2024-07-01" });

      expect(response.status).toBe(200);
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body).toHaveLength(0);
    });

    it("should return active teams array when athlete has teams at the date", async () => {
      mockSessionUser = {
        id: testCoachId,
        role: 'coach',
        isSiteAdmin: false,
        primaryOrganizationId: testOrgId1
      };

      // Date: 2024-07-01 - athlete1 is on both team1 and team2
      const response = await request(app)
        .get(`/api/athletes/${testAthleteId1}/active-teams`)
        .query({ date: "2024-07-01" });

      expect(response.status).toBe(200);
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body).toHaveLength(2);

      // Verify response format
      const teams = response.body;
      expect(teams[0]).toHaveProperty('teamId');
      expect(teams[0]).toHaveProperty('teamName');
      expect(teams[0]).toHaveProperty('season');
      expect(teams[0]).toHaveProperty('organizationId');
      expect(teams[0]).toHaveProperty('organizationName');

      // Verify both teams are included
      const teamIds = teams.map((t: any) => t.teamId);
      expect(teamIds).toContain(testTeamId1);
      expect(teamIds).toContain(testTeamId2);
    });

    it("should only return teams athlete was on at the specified date (before joining)", async () => {
      mockSessionUser = {
        id: testCoachId,
        role: 'coach',
        isSiteAdmin: false,
        primaryOrganizationId: testOrgId1
      };

      // Date: 2024-05-01 - athlete1 joined team1 on 2024-01-01 (YES) but team2 on 2024-06-01 (NO)
      const response = await request(app)
        .get(`/api/athletes/${testAthleteId1}/active-teams`)
        .query({ date: "2024-05-01" });

      expect(response.status).toBe(200);
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body).toHaveLength(1);

      // Should only include team1
      expect(response.body[0].teamId).toBe(testTeamId1);
    });

    it("should not return teams athlete had left by the specified date", async () => {
      mockSessionUser = {
        id: testCoachId,
        role: 'coach',
        isSiteAdmin: false,
        primaryOrganizationId: testOrgId1
      };

      // Date: 2024-09-01 - athlete1 left team2 on 2024-08-15
      const response = await request(app)
        .get(`/api/athletes/${testAthleteId1}/active-teams`)
        .query({ date: "2024-09-01" });

      expect(response.status).toBe(200);
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body).toHaveLength(1);

      // Should only include team1 (still active)
      expect(response.body[0].teamId).toBe(testTeamId1);
    });

    it("should return teams athlete was on at their leaving date", async () => {
      mockSessionUser = {
        id: testCoachId,
        role: 'coach',
        isSiteAdmin: false,
        primaryOrganizationId: testOrgId1
      };

      // Date: 2024-08-15 - athlete1's last day on team2
      const response = await request(app)
        .get(`/api/athletes/${testAthleteId1}/active-teams`)
        .query({ date: "2024-08-15" });

      expect(response.status).toBe(200);
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body).toHaveLength(2);

      // Should include both teams (leaving date is inclusive)
      const teamIds = response.body.map((t: any) => t.teamId);
      expect(teamIds).toContain(testTeamId1);
      expect(teamIds).toContain(testTeamId2);
    });
  });

  describe("Organization Admin Access", () => {
    it("should allow org admin from athlete's organization to access active teams", async () => {
      // Org admin from org2 accesses athlete3 from org2
      mockSessionUser = {
        id: testOrgAdminId,
        role: 'org_admin',
        isSiteAdmin: false,
        primaryOrganizationId: testOrgId2
      };

      const response = await request(app)
        .get(`/api/athletes/${testAthleteId3}/active-teams`)
        .query({ date: "2024-07-01" });

      expect(response.status).toBe(200);
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].teamId).toBe(testTeamId3);
    });
  });

  describe("Site Admin Access", () => {
    it("should allow site admin to access any athlete's active teams regardless of organization", async () => {
      // Site admin (no org membership) accesses athlete from org2
      mockSessionUser = {
        id: testSiteAdminId,
        role: 'admin',
        isSiteAdmin: true,
        primaryOrganizationId: null
      };

      const response = await request(app)
        .get(`/api/athletes/${testAthleteId3}/active-teams`)
        .query({ date: "2024-07-01" });

      expect(response.status).toBe(200);
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].teamId).toBe(testTeamId3);
    });

    it("should allow site admin to access athlete from any organization", async () => {
      // Site admin accesses athlete1 from org1
      mockSessionUser = {
        id: testSiteAdminId,
        role: 'admin',
        isSiteAdmin: true,
        primaryOrganizationId: null
      };

      const response = await request(app)
        .get(`/api/athletes/${testAthleteId1}/active-teams`)
        .query({ date: "2024-07-01" });

      expect(response.status).toBe(200);
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body).toHaveLength(2);
    });
  });

  describe("Athlete Self-Access", () => {
    it("should allow athlete to access their own active teams", async () => {
      // Athlete1 accesses their own active teams
      mockSessionUser = {
        id: testAthleteId1,
        role: 'athlete',
        isSiteAdmin: false,
        primaryOrganizationId: testOrgId1
      };

      const response = await request(app)
        .get(`/api/athletes/${testAthleteId1}/active-teams`)
        .query({ date: "2024-07-01" });

      expect(response.status).toBe(200);
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body).toHaveLength(2);

      const teamIds = response.body.map((t: any) => t.teamId);
      expect(teamIds).toContain(testTeamId1);
      expect(teamIds).toContain(testTeamId2);
    });
  });
});
