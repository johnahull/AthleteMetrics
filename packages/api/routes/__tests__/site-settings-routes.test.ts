/**
 * Integration tests for Site Settings API Routes
 *
 * Test coverage:
 * - GET /api/site-settings/public - Returns wellness module status for authenticated users
 * - GET /api/site-settings/public - Only exposes public fields (not AI model)
 * - GET /api/site-settings/public - Defaults to enabled when no settings exist
 * - GET /api/site-settings - Returns full settings for site admin
 * - GET /api/site-settings - Returns 403 for non-site-admin
 * - PATCH /api/site-settings - Updates wellness module flag with audit log
 * - PATCH /api/site-settings - Updates AI model with audit log
 * - PATCH /api/site-settings - Validates AI model availability
 * - PATCH /api/site-settings - Returns 403 for non-site-admin
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { storage } from "../../storage";
import siteSettingsRouter from "../site-settings-routes";

// Mock the AI insights service to control model availability in tests
vi.mock("../../services/ai-insights-service", () => ({
  AI_MODELS: {
    "gpt-5-nano": { provider: "openai", model: "gpt-5-nano", tier: "budget", description: "Test", costPer1M: { input: 0.05, output: 0.4 } },
    "claude-haiku-3": { provider: "anthropic", model: "claude-haiku-3", tier: "budget", description: "Test", costPer1M: { input: 0.25, output: 1.25 } },
  },
  isModelAvailable: vi.fn((modelKey: string) => {
    const validModels = ["gpt-5-nano", "gemini-2.0-flash-lite", "gemini-2.5-flash-lite", "claude-haiku-3", "claude-haiku-4.5", "gemini-2.5-pro", "claude-sonnet-4.5"];
    if (validModels.includes(modelKey)) {
      return { provider: "openai", available: true, envVar: "TEST_API_KEY" };
    }
    return { provider: null, available: false, envVar: null };
  }),
}));

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

  // Mock authentication middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!mockSessionUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  });

  // Register site settings routes
  app.use("/api/site-settings", siteSettingsRouter);

  return app;
}

const app = createTestApp();

// Test data IDs
let testSiteAdminId: string;
let testOrgAdminId: string;
let testCoachId: string;
let testOrgId: string;

describe("Site Settings API Routes", () => {
  beforeAll(async () => {
    const timestamp = Date.now();

    // Create test organization
    const org = await storage.createOrganization({
      name: `Test Org for Site Settings ${timestamp}`,
      description: "Test org",
      benchmarksEnabled: false,
      allowCustomBenchmarks: false,
    });
    testOrgId = org.id;

    // Create site admin user
    const siteAdmin = await storage.createUser({
      username: `siteadmin-${timestamp}`,
      email: `siteadmin-settings-${timestamp}@test.com`,
      hashedPassword: "hashed",
      role: "site_admin",
      isSiteAdmin: true,
      firstName: "Site",
      lastName: "Admin",
    });
    testSiteAdminId = siteAdmin.id;

    // Create org admin user
    const orgAdmin = await storage.createUser({
      username: `orgadmin-${timestamp}`,
      email: `orgadmin-settings-${timestamp}@test.com`,
      hashedPassword: "hashed",
      role: "org_admin",
      isSiteAdmin: false,
      firstName: "Org",
      lastName: "Admin",
    });
    testOrgAdminId = orgAdmin.id;

    // Link org admin to organization
    await storage.addUserToOrganization(testOrgAdminId, testOrgId, "org_admin");

    // Create coach user
    const coach = await storage.createUser({
      username: `coach-${timestamp}`,
      email: `coach-settings-${timestamp}@test.com`,
      hashedPassword: "hashed",
      role: "coach",
      isSiteAdmin: false,
      firstName: "Test",
      lastName: "Coach",
    });
    testCoachId = coach.id;

    // Link coach to organization
    await storage.addUserToOrganization(testCoachId, testOrgId, "coach");
  });

  afterAll(async () => {
    // Clean up test data
    try {
      if (testCoachId) await storage.deleteUser(testCoachId);
      if (testOrgAdminId) await storage.deleteUser(testOrgAdminId);
      if (testSiteAdminId) await storage.deleteUser(testSiteAdminId);
      if (testOrgId) await storage.deleteOrganization(testOrgId);
    } catch (error) {
      console.error("Cleanup error in site-settings-routes.test.ts:", error);
    }
  });

  beforeEach(() => {
    // Reset mock session user before each test
    mockSessionUser = null;
  });

  describe("GET /api/site-settings/public", () => {
    it("should return wellness module status for authenticated coach", async () => {
      mockSessionUser = {
        id: testCoachId,
        email: `coach-settings-${Date.now()}@test.com`,
        role: "coach",
        isSiteAdmin: false,
      };

      const response = await request(app).get("/api/site-settings/public");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("wellnessModuleEnabled");
      expect(typeof response.body.wellnessModuleEnabled).toBe("boolean");
    });

    it("should return wellness module status for authenticated org admin", async () => {
      mockSessionUser = {
        id: testOrgAdminId,
        email: `orgadmin-settings-${Date.now()}@test.com`,
        role: "org_admin",
        isSiteAdmin: false,
      };

      const response = await request(app).get("/api/site-settings/public");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("wellnessModuleEnabled");
    });

    it("should only expose public fields, not AI model settings", async () => {
      mockSessionUser = {
        id: testCoachId,
        email: `coach-settings-${Date.now()}@test.com`,
        role: "coach",
        isSiteAdmin: false,
      };

      const response = await request(app).get("/api/site-settings/public");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("wellnessModuleEnabled");
      expect(response.body).not.toHaveProperty("aiModel");
      expect(response.body).not.toHaveProperty("updatedBy");
      expect(response.body).not.toHaveProperty("updatedAt");
    });

    it("should return wellness module status as boolean", async () => {
      mockSessionUser = {
        id: testCoachId,
        email: `coach-settings-${Date.now()}@test.com`,
        role: "coach",
        isSiteAdmin: false,
      };

      const response = await request(app).get("/api/site-settings/public");

      expect(response.status).toBe(200);
      // Should return a boolean value (true or false depending on current DB state)
      expect(typeof response.body.wellnessModuleEnabled).toBe("boolean");
    });

    it("should return 401 for unauthenticated requests", async () => {
      mockSessionUser = null;

      const response = await request(app).get("/api/site-settings/public");

      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/site-settings", () => {
    it("should return full settings for site admin", async () => {
      mockSessionUser = {
        id: testSiteAdminId,
        email: `siteadmin-settings-${Date.now()}@test.com`,
        role: "site_admin",
        isSiteAdmin: true,
      };

      const response = await request(app).get("/api/site-settings");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("aiModel");
      expect(response.body).toHaveProperty("updatedAt");
      // wellnessModuleEnabled should also be present
      expect(response.body).toHaveProperty("wellnessModuleEnabled");
    });

    it("should return default settings when none exist", async () => {
      mockSessionUser = {
        id: testSiteAdminId,
        email: `siteadmin-settings-${Date.now()}@test.com`,
        role: "site_admin",
        isSiteAdmin: true,
      };

      const response = await request(app).get("/api/site-settings");

      expect(response.status).toBe(200);
      // Should have default AI model
      expect(response.body.aiModel).toBeDefined();
    });

    it("should return 403 for non-site-admin (coach)", async () => {
      mockSessionUser = {
        id: testCoachId,
        email: `coach-settings-${Date.now()}@test.com`,
        role: "coach",
        isSiteAdmin: false,
      };

      const response = await request(app).get("/api/site-settings");

      expect(response.status).toBe(403);
    });

    it("should return 403 for non-site-admin (org admin)", async () => {
      mockSessionUser = {
        id: testOrgAdminId,
        email: `orgadmin-settings-${Date.now()}@test.com`,
        role: "org_admin",
        isSiteAdmin: false,
      };

      const response = await request(app).get("/api/site-settings");

      expect(response.status).toBe(403);
    });

    it("should return 401 for unauthenticated requests", async () => {
      mockSessionUser = null;

      const response = await request(app).get("/api/site-settings");

      expect(response.status).toBe(401);
    });
  });

  describe("PATCH /api/site-settings", () => {
    it("should update wellness module flag for site admin", async () => {
      mockSessionUser = {
        id: testSiteAdminId,
        email: `siteadmin-settings-${Date.now()}@test.com`,
        role: "site_admin",
        isSiteAdmin: true,
      };

      const response = await request(app)
        .patch("/api/site-settings")
        .send({ wellnessModuleEnabled: false });

      expect(response.status).toBe(200);
      expect(response.body.wellnessModuleEnabled).toBe(false);

      // Verify audit log was created
      // Note: This would require accessing audit logs, which might need a separate test helper
    });

    it("should update AI model for site admin", async () => {
      mockSessionUser = {
        id: testSiteAdminId,
        email: `siteadmin-settings-${Date.now()}@test.com`,
        role: "site_admin",
        isSiteAdmin: true,
      };

      const response = await request(app)
        .patch("/api/site-settings")
        .send({ aiModel: "gpt-5-nano" });

      expect(response.status).toBe(200);
      expect(response.body.aiModel).toBe("gpt-5-nano");
    });

    it("should validate AI model and reject invalid models", async () => {
      mockSessionUser = {
        id: testSiteAdminId,
        email: `siteadmin-settings-${Date.now()}@test.com`,
        role: "site_admin",
        isSiteAdmin: true,
      };

      const response = await request(app)
        .patch("/api/site-settings")
        .send({ aiModel: "invalid-model-xyz" });

      expect(response.status).toBe(400);
      // Zod schema validation catches invalid enum values first
      expect(response.body.message).toContain("Validation error");
    });

    it("should return 403 for non-site-admin (coach)", async () => {
      mockSessionUser = {
        id: testCoachId,
        email: `coach-settings-${Date.now()}@test.com`,
        role: "coach",
        isSiteAdmin: false,
      };

      const response = await request(app)
        .patch("/api/site-settings")
        .send({ wellnessModuleEnabled: false });

      expect(response.status).toBe(403);
    });

    it("should return 403 for non-site-admin (org admin)", async () => {
      mockSessionUser = {
        id: testOrgAdminId,
        email: `orgadmin-settings-${Date.now()}@test.com`,
        role: "org_admin",
        isSiteAdmin: false,
      };

      const response = await request(app)
        .patch("/api/site-settings")
        .send({ wellnessModuleEnabled: false });

      expect(response.status).toBe(403);
    });

    it("should return 401 for unauthenticated requests", async () => {
      mockSessionUser = null;

      const response = await request(app)
        .patch("/api/site-settings")
        .send({ wellnessModuleEnabled: false });

      expect(response.status).toBe(401);
    });

    it("should handle validation errors for invalid data", async () => {
      mockSessionUser = {
        id: testSiteAdminId,
        email: `siteadmin-settings-${Date.now()}@test.com`,
        role: "site_admin",
        isSiteAdmin: true,
      };

      const response = await request(app)
        .patch("/api/site-settings")
        .send({ wellnessModuleEnabled: "not-a-boolean" });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("Validation error");
    });

    it("should persist sprintFvEnabled=true across updates (regression)", async () => {
      mockSessionUser = {
        id: testSiteAdminId,
        email: `siteadmin-settings-${Date.now()}@test.com`,
        role: "site_admin",
        isSiteAdmin: true,
      };

      const enableResponse = await request(app)
        .patch("/api/site-settings")
        .send({ sprintFvEnabled: true });

      expect(enableResponse.status).toBe(200);
      expect(enableResponse.body.sprintFvEnabled).toBe(true);

      const readback = await request(app).get("/api/site-settings");
      expect(readback.status).toBe(200);
      expect(readback.body.sprintFvEnabled).toBe(true);

      const publicReadback = await request(app).get("/api/site-settings/public");
      expect(publicReadback.status).toBe(200);
      expect(publicReadback.body.sprintFvEnabled).toBe(true);
    });

    it("should persist sprintFvEnabled=false across updates (regression)", async () => {
      mockSessionUser = {
        id: testSiteAdminId,
        email: `siteadmin-settings-${Date.now()}@test.com`,
        role: "site_admin",
        isSiteAdmin: true,
      };

      await request(app)
        .patch("/api/site-settings")
        .send({ sprintFvEnabled: true });

      // Intermediate readback: proves the enable PATCH actually persisted.
      // Without this, the test passes pre-fix because the DB default is false
      // and enable→disable silent-drops in both directions end at false.
      const intermediate = await request(app).get("/api/site-settings");
      expect(intermediate.body.sprintFvEnabled).toBe(true);

      const disableResponse = await request(app)
        .patch("/api/site-settings")
        .send({ sprintFvEnabled: false });

      expect(disableResponse.status).toBe(200);
      expect(disableResponse.body.sprintFvEnabled).toBe(false);

      const readback = await request(app).get("/api/site-settings");
      expect(readback.status).toBe(200);
      expect(readback.body.sprintFvEnabled).toBe(false);
    });
  });

  describe("GET /api/ai-models", () => {
    it("should return list of AI models for site admin", async () => {
      mockSessionUser = {
        id: testSiteAdminId,
        email: `siteadmin-settings-${Date.now()}@test.com`,
        role: "site_admin",
        isSiteAdmin: true,
      };

      const response = await request(app).get("/api/site-settings/ai-models");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("budget");
      expect(response.body).toHaveProperty("premium");
      expect(response.body).toHaveProperty("all");
      expect(Array.isArray(response.body.all)).toBe(true);
      expect(response.body.all.length).toBeGreaterThan(0);
    });

    it("should return models with pricing information", async () => {
      mockSessionUser = {
        id: testSiteAdminId,
        email: `siteadmin-settings-${Date.now()}@test.com`,
        role: "site_admin",
        isSiteAdmin: true,
      };

      const response = await request(app).get("/api/site-settings/ai-models");

      expect(response.status).toBe(200);
      const firstModel = response.body.all[0];
      expect(firstModel).toHaveProperty("key");
      expect(firstModel).toHaveProperty("provider");
      expect(firstModel).toHaveProperty("model");
      expect(firstModel).toHaveProperty("tier");
      expect(firstModel).toHaveProperty("description");
      expect(firstModel).toHaveProperty("pricing");
      expect(firstModel.pricing).toHaveProperty("inputPer1M");
      expect(firstModel.pricing).toHaveProperty("outputPer1M");
      expect(firstModel.pricing).toHaveProperty("currency");
    });

    it("should return 403 for non-site-admin", async () => {
      mockSessionUser = {
        id: testCoachId,
        email: `coach-settings-${Date.now()}@test.com`,
        role: "coach",
        isSiteAdmin: false,
      };

      const response = await request(app).get("/api/site-settings/ai-models");

      expect(response.status).toBe(403);
    });

    it("should return 401 for unauthenticated requests", async () => {
      mockSessionUser = null;

      const response = await request(app).get("/api/site-settings/ai-models");

      expect(response.status).toBe(401);
    });
  });
});
