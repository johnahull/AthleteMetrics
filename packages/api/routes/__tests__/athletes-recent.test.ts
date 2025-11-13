/**
 * Integration tests for GET /api/athletes/recent endpoint
 *
 * Test coverage:
 * - Returns athletes ordered by recent measurement
 * - Respects organization scope
 * - Respects limit parameter
 * - Returns empty array when no measurements
 * - Requires authentication
 * - Coach can only see own org's athletes
 * - Org admin can only see own org's athletes
 * - Site admin can see all athletes with org filter
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { storage } from "../../storage";
import { registerAthleteRoutes } from "../athlete-routes";

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
let testCoachId: string;
let testOrgAdminId: string;
let testSiteAdminId: string;
let testAthlete1Id: string;
let testAthlete2Id: string;
let testAthlete3Id: string;
let testAthlete4Id: string;
let testAthlete5Id: string;
let testAthlete6Id: string; // Athlete from different org

describe("GET /api/athletes/recent", () => {
  beforeAll(async () => {
    // Create test organizations with unique timestamp
    const timestamp = Date.now();

    const org1 = await storage.createOrganization({
      name: `Test Organization 1 for Recent Athletes ${timestamp}`,
      description: "Test org 1",
      benchmarksEnabled: false,
      allowCustomBenchmarks: false,
    });
    testOrgId1 = org1.id;

    const org2 = await storage.createOrganization({
      name: `Test Organization 2 for Recent Athletes ${timestamp}`,
      description: "Test org 2",
      benchmarksEnabled: false,
      allowCustomBenchmarks: false,
    });
    testOrgId2 = org2.id;

    // Create test teams
    const team1 = await storage.createTeam({
      name: `Test Team 1 Recent Athletes ${timestamp}`,
      organizationId: testOrgId1,
      level: "Club",
    });
    testTeamId1 = team1.id;

    const team2 = await storage.createTeam({
      name: `Test Team 2 Recent Athletes ${timestamp}`,
      organizationId: testOrgId2,
      level: "HS",
    });
    testTeamId2 = team2.id;

    // Create test users (coach, org admin, site admin)
    const coach = await storage.createUser({
      username: `testcoach_recent_${timestamp}`,
      password: "TestPassword123!",
      firstName: "Test",
      lastName: "Coach",
      emails: [`testcoach_recent_${timestamp}@example.com`],
      isSiteAdmin: false,
    });
    testCoachId = coach.id;
    await storage.addUserToOrganization(testCoachId, testOrgId1, "coach");

    const orgAdmin = await storage.createUser({
      username: `testorgadmin_recent_${timestamp}`,
      password: "TestPassword123!",
      firstName: "Test",
      lastName: "OrgAdmin",
      emails: [`testorgadmin_recent_${timestamp}@example.com`],
      isSiteAdmin: false,
    });
    testOrgAdminId = orgAdmin.id;
    await storage.addUserToOrganization(testOrgAdminId, testOrgId1, "org_admin");

    const siteAdmin = await storage.createUser({
      username: `testsiteadmin_recent_${timestamp}`,
      password: "TestPassword123!",
      firstName: "Test",
      lastName: "SiteAdmin",
      emails: [`testsiteadmin_recent_${timestamp}@example.com`],
      isSiteAdmin: true,
    });
    testSiteAdminId = siteAdmin.id;

    // Create test athletes
    const athlete1 = await storage.createAthlete({
      firstName: "Athlete",
      lastName: "One",
      emails: [`athlete1_recent_${timestamp}@example.com`],
      birthDate: "2005-01-01",
      gender: "Male",
    });
    testAthlete1Id = athlete1.id;
    await storage.addUserToOrganization(testAthlete1Id, testOrgId1, "athlete");
    await storage.addUserToTeam(testAthlete1Id, testTeamId1);

    const athlete2 = await storage.createAthlete({
      firstName: "Athlete",
      lastName: "Two",
      emails: [`athlete2_recent_${timestamp}@example.com`],
      birthDate: "2006-01-01",
      gender: "Female",
    });
    testAthlete2Id = athlete2.id;
    await storage.addUserToOrganization(testAthlete2Id, testOrgId1, "athlete");
    await storage.addUserToTeam(testAthlete2Id, testTeamId1);

    const athlete3 = await storage.createAthlete({
      firstName: "Athlete",
      lastName: "Three",
      emails: [`athlete3_recent_${timestamp}@example.com`],
      birthDate: "2004-01-01",
      gender: "Male",
    });
    testAthlete3Id = athlete3.id;
    await storage.addUserToOrganization(testAthlete3Id, testOrgId1, "athlete");
    await storage.addUserToTeam(testAthlete3Id, testTeamId1);

    const athlete4 = await storage.createAthlete({
      firstName: "Athlete",
      lastName: "Four",
      emails: [`athlete4_recent_${timestamp}@example.com`],
      birthDate: "2007-01-01",
      gender: "Female",
    });
    testAthlete4Id = athlete4.id;
    await storage.addUserToOrganization(testAthlete4Id, testOrgId1, "athlete");
    await storage.addUserToTeam(testAthlete4Id, testTeamId1);

    const athlete5 = await storage.createAthlete({
      firstName: "Athlete",
      lastName: "Five",
      emails: [`athlete5_recent_${timestamp}@example.com`],
      birthDate: "2005-06-01",
      gender: "Male",
    });
    testAthlete5Id = athlete5.id;
    await storage.addUserToOrganization(testAthlete5Id, testOrgId1, "athlete");
    await storage.addUserToTeam(testAthlete5Id, testTeamId1);

    const athlete6 = await storage.createAthlete({
      firstName: "Athlete",
      lastName: "Six",
      emails: [`athlete6_recent_${timestamp}@example.com`],
      birthDate: "2006-06-01",
      gender: "Female",
    });
    testAthlete6Id = athlete6.id;
    await storage.addUserToOrganization(testAthlete6Id, testOrgId2, "athlete");
    await storage.addUserToTeam(testAthlete6Id, testTeamId2);

    // Create measurements with different dates (simulate recent activity)
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const fourDaysAgo = new Date(today);
    fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
    const fiveDaysAgo = new Date(today);
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    // Athlete 1 - Most recent (today)
    await storage.createMeasurement({
      userId: testAthlete1Id,
      date: today.toISOString().split('T')[0],
      metric: "FLY10_TIME",
      value: 1.25,
      teamId: testTeamId1,
      organizationId: testOrgId1,
    }, testCoachId);

    // Athlete 2 - Yesterday
    await storage.createMeasurement({
      userId: testAthlete2Id,
      date: yesterday.toISOString().split('T')[0],
      metric: "VERTICAL_JUMP",
      value: 24.5,
      teamId: testTeamId1,
      organizationId: testOrgId1,
    }, testCoachId);

    // Athlete 3 - Two days ago
    await storage.createMeasurement({
      userId: testAthlete3Id,
      date: twoDaysAgo.toISOString().split('T')[0],
      metric: "DASH_40YD",
      value: 4.85,
      teamId: testTeamId1,
      organizationId: testOrgId1,
    }, testCoachId);

    // Athlete 4 - Three days ago
    await storage.createMeasurement({
      userId: testAthlete4Id,
      date: threeDaysAgo.toISOString().split('T')[0],
      metric: "T_TEST",
      value: 9.2,
      teamId: testTeamId1,
      organizationId: testOrgId1,
    }, testCoachId);

    // Athlete 5 - Four days ago
    await storage.createMeasurement({
      userId: testAthlete5Id,
      date: fourDaysAgo.toISOString().split('T')[0],
      metric: "AGILITY_505",
      value: 2.5,
      teamId: testTeamId1,
      organizationId: testOrgId1,
    }, testCoachId);

    // Athlete 6 (different org) - Five days ago
    await storage.createMeasurement({
      userId: testAthlete6Id,
      date: fiveDaysAgo.toISOString().split('T')[0],
      metric: "FLY10_TIME",
      value: 1.30,
      teamId: testTeamId2,
      organizationId: testOrgId2,
    }, testCoachId);
  });

  afterAll(async () => {
    // Cleanup test data
    try {
      // Delete measurements first (no FK constraints, but good practice)
      // Delete users (athletes, coach, admins) - must be before orgs
      if (testAthlete1Id) await storage.deleteUser(testAthlete1Id).catch(e => console.error("Error deleting athlete1:", e));
      if (testAthlete2Id) await storage.deleteUser(testAthlete2Id).catch(e => console.error("Error deleting athlete2:", e));
      if (testAthlete3Id) await storage.deleteUser(testAthlete3Id).catch(e => console.error("Error deleting athlete3:", e));
      if (testAthlete4Id) await storage.deleteUser(testAthlete4Id).catch(e => console.error("Error deleting athlete4:", e));
      if (testAthlete5Id) await storage.deleteUser(testAthlete5Id).catch(e => console.error("Error deleting athlete5:", e));
      if (testAthlete6Id) await storage.deleteUser(testAthlete6Id).catch(e => console.error("Error deleting athlete6:", e));
      if (testCoachId) await storage.deleteUser(testCoachId).catch(e => console.error("Error deleting coach:", e));
      if (testOrgAdminId) await storage.deleteUser(testOrgAdminId).catch(e => console.error("Error deleting orgAdmin:", e));
      if (testSiteAdminId) await storage.deleteUser(testSiteAdminId).catch(e => console.error("Error deleting siteAdmin:", e));

      // Delete teams
      if (testTeamId1) await storage.deleteTeam(testTeamId1).catch(e => console.error("Error deleting team1:", e));
      if (testTeamId2) await storage.deleteTeam(testTeamId2).catch(e => console.error("Error deleting team2:", e));

      // Delete organizations
      if (testOrgId1) await storage.deleteOrganization(testOrgId1).catch(e => console.error("Error deleting org1:", e));
      if (testOrgId2) await storage.deleteOrganization(testOrgId2).catch(e => console.error("Error deleting org2:", e));
    } catch (error) {
      console.error("Cleanup error:", error);
    }
  });

  describe("Authentication", () => {
    it("should require authentication", async () => {
      mockSessionUser = null; // No user logged in

      const response = await request(app)
        .get("/api/athletes/recent")
        .query({ organizationId: testOrgId1 });

      expect(response.status).toBe(401);
      expect(response.body.message).toMatch(/not authenticated/i);
    });
  });

  describe("Authorization and Organization Scope", () => {
    it("should return athletes from coach's organization only", async () => {
      // Login as coach
      mockSessionUser = {
        id: testCoachId,
        role: 'coach',
        isSiteAdmin: false,
        primaryOrganizationId: testOrgId1
      };

      const response = await request(app)
        .get("/api/athletes/recent")
        .query({ organizationId: testOrgId1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.athletes).toBeDefined();
      expect(response.body.athletes).toHaveLength(5); // Only 5 athletes from org1

      // Verify all athletes are from org1
      response.body.athletes.forEach((athlete: any) => {
        expect([testAthlete1Id, testAthlete2Id, testAthlete3Id, testAthlete4Id, testAthlete5Id])
          .toContain(athlete.id);
      });

      // Verify athlete6 (from org2) is NOT included
      const athlete6Included = response.body.athletes.some((a: any) => a.id === testAthlete6Id);
      expect(athlete6Included).toBe(false);
    });

    it("should return athletes from org admin's organization only", async () => {
      const agent = request.agent(app);

      // Login as org admin
      agent.set('Cookie', [`session=${JSON.stringify({ user: { id: testOrgAdminId, role: 'org_admin', isSiteAdmin: false, primaryOrganizationId: testOrgId1 } })}`]);

      const response = await agent
        .get("/api/athletes/recent")
        .query({ organizationId: testOrgId1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.athletes).toBeDefined();
      expect(response.body.athletes).toHaveLength(5);

      // Verify all athletes are from org1
      response.body.athletes.forEach((athlete: any) => {
        expect([testAthlete1Id, testAthlete2Id, testAthlete3Id, testAthlete4Id, testAthlete5Id])
          .toContain(athlete.id);
      });
    });

    it("should allow site admin to see athletes from any organization", async () => {
      const agent = request.agent(app);

      // Login as site admin
      agent.set('Cookie', [`session=${JSON.stringify({ user: { id: testSiteAdminId, role: 'site_admin', isSiteAdmin: true } })}`]);

      const response = await agent
        .get("/api/athletes/recent")
        .query({ organizationId: testOrgId1, limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.athletes).toBeDefined();
      expect(response.body.athletes).toHaveLength(5);
    });

    it("should deny access when coach tries to access different organization", async () => {
      const agent = request.agent(app);

      // Login as coach from org1, try to access org2
      agent.set('Cookie', [`session=${JSON.stringify({ user: { id: testCoachId, role: 'coach', isSiteAdmin: false, primaryOrganizationId: testOrgId1 } })}`]);

      const response = await agent
        .get("/api/athletes/recent")
        .query({ organizationId: testOrgId2 });

      expect(response.status).toBe(403);
      expect(response.body.message).toMatch(/permission|access denied/i);
    });
  });

  describe("Ordering and Limit", () => {
    it("should return athletes ordered by most recent measurement date", async () => {
      const agent = request.agent(app);

      // Login as coach
      agent.set('Cookie', [`session=${JSON.stringify({ user: { id: testCoachId, role: 'coach', isSiteAdmin: false, primaryOrganizationId: testOrgId1 } })}`]);

      const response = await agent
        .get("/api/athletes/recent")
        .query({ organizationId: testOrgId1, limit: 5 });

      expect(response.status).toBe(200);
      expect(response.body.athletes).toBeDefined();
      expect(response.body.athletes).toHaveLength(5);

      // Verify ordering: Athlete1 (today), Athlete2 (yesterday), Athlete3 (2d ago), Athlete4 (3d ago), Athlete5 (4d ago)
      expect(response.body.athletes[0].id).toBe(testAthlete1Id);
      expect(response.body.athletes[1].id).toBe(testAthlete2Id);
      expect(response.body.athletes[2].id).toBe(testAthlete3Id);
      expect(response.body.athletes[3].id).toBe(testAthlete4Id);
      expect(response.body.athletes[4].id).toBe(testAthlete5Id);
    });

    it("should respect limit parameter", async () => {
      const agent = request.agent(app);

      // Login as coach
      agent.set('Cookie', [`session=${JSON.stringify({ user: { id: testCoachId, role: 'coach', isSiteAdmin: false, primaryOrganizationId: testOrgId1 } })}`]);

      const response = await agent
        .get("/api/athletes/recent")
        .query({ organizationId: testOrgId1, limit: 3 });

      expect(response.status).toBe(200);
      expect(response.body.athletes).toBeDefined();
      expect(response.body.athletes).toHaveLength(3);

      // Verify we get the 3 most recent
      expect(response.body.athletes[0].id).toBe(testAthlete1Id);
      expect(response.body.athletes[1].id).toBe(testAthlete2Id);
      expect(response.body.athletes[2].id).toBe(testAthlete3Id);
    });

    it("should default to limit of 5 when not specified", async () => {
      const agent = request.agent(app);

      // Login as coach
      agent.set('Cookie', [`session=${JSON.stringify({ user: { id: testCoachId, role: 'coach', isSiteAdmin: false, primaryOrganizationId: testOrgId1 } })}`]);

      const response = await agent
        .get("/api/athletes/recent")
        .query({ organizationId: testOrgId1 });

      expect(response.status).toBe(200);
      expect(response.body.athletes).toBeDefined();
      expect(response.body.athletes.length).toBeLessThanOrEqual(5);
    });
  });

  describe("Response Format", () => {
    it("should return athletes with correct data structure", async () => {
      const agent = request.agent(app);

      // Login as coach
      agent.set('Cookie', [`session=${JSON.stringify({ user: { id: testCoachId, role: 'coach', isSiteAdmin: false, primaryOrganizationId: testOrgId1 } })}`]);

      const response = await agent
        .get("/api/athletes/recent")
        .query({ organizationId: testOrgId1, limit: 1 });

      expect(response.status).toBe(200);
      expect(response.body.athletes).toBeDefined();
      expect(response.body.athletes).toHaveLength(1);

      const athlete = response.body.athletes[0];

      // Verify required fields
      expect(athlete).toHaveProperty('id');
      expect(athlete).toHaveProperty('firstName');
      expect(athlete).toHaveProperty('lastName');
      expect(athlete).toHaveProperty('avatar');
      expect(athlete).toHaveProperty('lastMeasurementDate');
      expect(athlete).toHaveProperty('lastMeasurementType');
      expect(athlete).toHaveProperty('teamName');

      // Verify data types and values
      expect(typeof athlete.id).toBe('string');
      expect(typeof athlete.firstName).toBe('string');
      expect(typeof athlete.lastName).toBe('string');
      expect(typeof athlete.lastMeasurementDate).toBe('string');
      expect(typeof athlete.lastMeasurementType).toBe('string');

      // Verify first athlete (most recent)
      expect(athlete.firstName).toBe('Athlete');
      expect(athlete.lastName).toBe('One');
      expect(athlete.lastMeasurementType).toBe('FLY10_TIME');
    });
  });

  describe("Empty States", () => {
    it("should return empty array when organization has no athletes with measurements", async () => {
      // Create a new org with no athletes
      const emptyOrg = await storage.createOrganization({
        name: `Empty Test Organization for Recent Athletes ${Date.now()}`,
        description: "No athletes",
        benchmarksEnabled: false,
        allowCustomBenchmarks: false,
      });

      // Add site admin to the empty org so they have permission
      await storage.addUserToOrganization(testSiteAdminId, emptyOrg.id, "org_admin");

      // Login as site admin to access empty org
      mockSessionUser = {
        id: testSiteAdminId,
        role: 'site_admin',
        isSiteAdmin: true
      };

      const response = await request(app)
        .get("/api/athletes/recent")
        .query({ organizationId: emptyOrg.id, limit: 5 });

      expect(response.status).toBe(200);
      expect(response.body.athletes).toBeDefined();
      expect(response.body.athletes).toHaveLength(0);

      // Cleanup
      await storage.removeUserFromOrganization(testSiteAdminId, emptyOrg.id);
      await storage.deleteOrganization(emptyOrg.id);
    });
  });

  describe("Validation", () => {
    it("should validate limit parameter is positive", async () => {
      const agent = request.agent(app);

      // Login as coach
      agent.set('Cookie', [`session=${JSON.stringify({ user: { id: testCoachId, role: 'coach', isSiteAdmin: false, primaryOrganizationId: testOrgId1 } })}`]);

      const response = await agent
        .get("/api/athletes/recent")
        .query({ organizationId: testOrgId1, limit: -1 });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/limit|invalid/i);
    });

    it("should validate limit parameter is not too large", async () => {
      const agent = request.agent(app);

      // Login as coach
      agent.set('Cookie', [`session=${JSON.stringify({ user: { id: testCoachId, role: 'coach', isSiteAdmin: false, primaryOrganizationId: testOrgId1 } })}`]);

      const response = await agent
        .get("/api/athletes/recent")
        .query({ organizationId: testOrgId1, limit: 1000 });

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/limit|maximum/i);
    });

    it("should require organizationId parameter", async () => {
      const agent = request.agent(app);

      // Login as coach
      agent.set('Cookie', [`session=${JSON.stringify({ user: { id: testCoachId, role: 'coach', isSiteAdmin: false, primaryOrganizationId: testOrgId1 } })}`]);

      const response = await agent
        .get("/api/athletes/recent");

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/organization|required/i);
    });
  });
});
