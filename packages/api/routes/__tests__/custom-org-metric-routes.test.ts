/**
 * Integration tests for custom organization metrics API routes
 *
 * Test coverage:
 * - GET /api/organizations/:orgId/custom-metrics - List custom metrics
 * - GET /api/organizations/:orgId/custom-metrics/:code - Get specific metric
 * - POST /api/organizations/:orgId/custom-metrics - Create custom metric
 * - PATCH /api/organizations/:orgId/custom-metrics/:code - Update custom metric
 * - POST /api/organizations/:orgId/custom-metrics/:code/archive - Archive metric
 * - POST /api/organizations/:orgId/custom-metrics/:code/restore - Restore metric
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { storage } from "../../storage";
import { registerCustomOrgMetricRoutes } from "../custom-org-metric-routes";
import { db } from "../../db";
import { customOrgMetrics, organizations, users, userOrganizations } from "@shared/schema";
import { eq, and } from "drizzle-orm";

// Mock session data
let mockSessionUser: any = null;

// Create test app with mocked session middleware
function createTestApp() {
  const app = express();
  app.use(express.json());

  // Mock session middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    req.session = {
      user: mockSessionUser,
    } as any;
    next();
  });

  // Register routes
  registerCustomOrgMetricRoutes(app);

  return app;
}

const app = createTestApp();

// Test data
let testOrgId: string;
let testOrgId2: string;
let orgAdminUserId: string;
let orgMemberUserId: string;
let otherOrgUserId: string;
let siteAdminUserId: string;
const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

describe("Custom Org Metrics API Routes", () => {
  beforeAll(async () => {
    // Safety check
    const dbUrl = process.env.DATABASE_URL || '';
    const allowTestDb = process.env.ALLOW_TEST_DATABASE === 'true';
    if (!dbUrl.includes('test') && !dbUrl.includes('localhost') && !allowTestDb) {
      throw new Error('DATABASE_URL must include "test" or "localhost". Set ALLOW_TEST_DATABASE=true for known testing databases.');
    }

    // Create test organizations
    const [org1] = await db.insert(organizations).values({
      name: `Test Org API ${uniqueSuffix}`,
      description: 'Test org for API tests',
      customMetricsEnabled: true,
    }).returning();
    testOrgId = org1.id;

    const [org2] = await db.insert(organizations).values({
      name: `Test Org 2 API ${uniqueSuffix}`,
      description: 'Second test org',
      customMetricsEnabled: true,
    }).returning();
    testOrgId2 = org2.id;

    // Create users
    const [siteAdmin] = await db.insert(users).values({
      username: `siteadmin-api-${uniqueSuffix}`,
      emails: ['siteadmin-api@test.com'],
      password: 'hashed',
      firstName: 'Site',
      lastName: 'Admin',
      fullName: 'Site Admin',
      isSiteAdmin: true,
    }).returning();
    siteAdminUserId = siteAdmin.id;

    const [orgAdmin] = await db.insert(users).values({
      username: `orgadmin-api-${uniqueSuffix}`,
      emails: ['orgadmin-api@test.com'],
      password: 'hashed',
      firstName: 'Org',
      lastName: 'Admin',
      fullName: 'Org Admin',
      isSiteAdmin: false,
    }).returning();
    orgAdminUserId = orgAdmin.id;

    await db.insert(userOrganizations).values({
      userId: orgAdminUserId,
      organizationId: testOrgId,
      role: 'org_admin',
    });

    const [orgMember] = await db.insert(users).values({
      username: `orgmember-api-${uniqueSuffix}`,
      emails: ['orgmember-api@test.com'],
      password: 'hashed',
      firstName: 'Org',
      lastName: 'Member',
      fullName: 'Org Member',
      isSiteAdmin: false,
    }).returning();
    orgMemberUserId = orgMember.id;

    await db.insert(userOrganizations).values({
      userId: orgMemberUserId,
      organizationId: testOrgId,
      role: 'athlete',
    });

    const [otherOrgUser] = await db.insert(users).values({
      username: `otherorg-api-${uniqueSuffix}`,
      emails: ['otherorg-api@test.com'],
      password: 'hashed',
      firstName: 'Other',
      lastName: 'Org',
      fullName: 'Other Org',
      isSiteAdmin: false,
    }).returning();
    otherOrgUserId = otherOrgUser.id;

    await db.insert(userOrganizations).values({
      userId: otherOrgUserId,
      organizationId: testOrgId2,
      role: 'org_admin',
    });
  });

  afterAll(async () => {
    // Cleanup
    await db.delete(customOrgMetrics).where(eq(customOrgMetrics.organizationId, testOrgId));
    await db.delete(customOrgMetrics).where(eq(customOrgMetrics.organizationId, testOrgId2));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId2));
    await db.delete(users).where(eq(users.id, siteAdminUserId));
    await db.delete(users).where(eq(users.id, orgAdminUserId));
    await db.delete(users).where(eq(users.id, orgMemberUserId));
    await db.delete(users).where(eq(users.id, otherOrgUserId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId2));
  });

  afterEach(async () => {
    // Clean up any metrics created during tests
    await db.delete(customOrgMetrics).where(eq(customOrgMetrics.organizationId, testOrgId));
    mockSessionUser = null;
  });

  // ========================================================================
  // AUTHENTICATION TESTS
  // ========================================================================

  describe("Authentication", () => {
    it("should return 401 when not authenticated", async () => {
      mockSessionUser = null;

      const res = await request(app)
        .get(`/api/organizations/${testOrgId}/custom-metrics`)
        .expect(401);

      // Middleware returns 'message', not 'error'
      expect(res.body.message || res.body.error).toBeDefined();
    });
  });

  // ========================================================================
  // LIST METRICS
  // ========================================================================

  describe("GET /api/organizations/:orgId/custom-metrics", () => {
    beforeEach(async () => {
      // Create test metrics
      await db.insert(customOrgMetrics).values([
        {
          organizationId: testOrgId,
          code: `ORG_${testOrgId.substring(0, 8).toUpperCase()}_METRIC_A`,
          label: 'Metric A',
          metricType: 'lower_is_better',
          unit: 's',
          category: 'speed',
          isActive: true,
          createdBy: orgAdminUserId,
        },
        {
          organizationId: testOrgId,
          code: `ORG_${testOrgId.substring(0, 8).toUpperCase()}_METRIC_B`,
          label: 'Metric B',
          metricType: 'higher_is_better',
          unit: 'lbs',
          category: 'power',
          isActive: true,
          createdBy: orgAdminUserId,
        },
        {
          organizationId: testOrgId,
          code: `ORG_${testOrgId.substring(0, 8).toUpperCase()}_ARCHIVED`,
          label: 'Archived Metric',
          metricType: 'tracking',
          unit: 'count',
          isActive: false,
          archivedAt: new Date(),
          createdBy: orgAdminUserId,
        },
      ]);
    });

    it("should return custom metrics for org admin", async () => {
      mockSessionUser = { id: orgAdminUserId, isSiteAdmin: false };

      const res = await request(app)
        .get(`/api/organizations/${testOrgId}/custom-metrics`)
        .expect(200);

      expect(res.body).toBeDefined();
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2); // Only active metrics
      expect(res.body.map((m: any) => m.label)).toContain('Metric A');
      expect(res.body.map((m: any) => m.label)).toContain('Metric B');
    });

    it("should return metrics for org member", async () => {
      mockSessionUser = { id: orgMemberUserId, isSiteAdmin: false };

      const res = await request(app)
        .get(`/api/organizations/${testOrgId}/custom-metrics`)
        .expect(200);

      expect(res.body.length).toBe(2);
    });

    it("should return metrics for site admin", async () => {
      mockSessionUser = { id: siteAdminUserId, isSiteAdmin: true };

      const res = await request(app)
        .get(`/api/organizations/${testOrgId}/custom-metrics`)
        .expect(200);

      expect(res.body.length).toBe(2);
    });

    it("should include archived metrics when requested", async () => {
      mockSessionUser = { id: orgAdminUserId, isSiteAdmin: false };

      const res = await request(app)
        .get(`/api/organizations/${testOrgId}/custom-metrics?includeArchived=true`)
        .expect(200);

      expect(res.body.length).toBe(3);
      expect(res.body.map((m: any) => m.label)).toContain('Archived Metric');
    });

    it("should reject access from user in different org", async () => {
      mockSessionUser = { id: otherOrgUserId, isSiteAdmin: false };

      await request(app)
        .get(`/api/organizations/${testOrgId}/custom-metrics`)
        .expect(403);
    });
  });

  // ========================================================================
  // GET SINGLE METRIC
  // ========================================================================

  describe("GET /api/organizations/:orgId/custom-metrics/:code", () => {
    let testMetricCode: string;

    beforeEach(async () => {
      testMetricCode = `ORG_${testOrgId.substring(0, 8).toUpperCase()}_SINGLE`;
      await db.insert(customOrgMetrics).values({
        organizationId: testOrgId,
        code: testMetricCode,
        label: 'Single Metric',
        metricType: 'tracking',
        unit: 'count',
        isActive: true,
        createdBy: orgAdminUserId,
      });
    });

    it("should return specific metric by code", async () => {
      mockSessionUser = { id: orgAdminUserId, isSiteAdmin: false };

      const res = await request(app)
        .get(`/api/organizations/${testOrgId}/custom-metrics/${testMetricCode}`)
        .expect(200);

      expect(res.body.code).toBe(testMetricCode);
      expect(res.body.label).toBe('Single Metric');
    });

    it("should return 404 for non-existent code", async () => {
      mockSessionUser = { id: orgAdminUserId, isSiteAdmin: false };

      await request(app)
        .get(`/api/organizations/${testOrgId}/custom-metrics/NON_EXISTENT`)
        .expect(404);
    });
  });

  // ========================================================================
  // CREATE METRIC
  // ========================================================================

  describe("POST /api/organizations/:orgId/custom-metrics", () => {
    it("should create metric as org admin", async () => {
      mockSessionUser = { id: orgAdminUserId, isSiteAdmin: false };

      const res = await request(app)
        .post(`/api/organizations/${testOrgId}/custom-metrics`)
        .send({
          label: 'New API Metric',
          metricType: 'lower_is_better',
          unit: 's',
          description: 'Created via API',
        })
        .expect(201);

      expect(res.body.label).toBe('New API Metric');
      expect(res.body.code).toMatch(/^ORG_[A-Z0-9]+_NEW_API_METRIC$/);
      expect(res.body.organizationId).toBe(testOrgId);
    });

    it("should create metric as site admin", async () => {
      mockSessionUser = { id: siteAdminUserId, isSiteAdmin: true };

      const res = await request(app)
        .post(`/api/organizations/${testOrgId}/custom-metrics`)
        .send({
          label: 'Site Admin Metric',
          metricType: 'higher_is_better',
          unit: 'count',
        })
        .expect(201);

      expect(res.body.label).toBe('Site Admin Metric');
    });

    it("should reject creation by org member", async () => {
      mockSessionUser = { id: orgMemberUserId, isSiteAdmin: false };

      await request(app)
        .post(`/api/organizations/${testOrgId}/custom-metrics`)
        .send({
          label: 'Unauthorized Metric',
          metricType: 'tracking',
        })
        .expect(403);
    });

    it("should validate required fields", async () => {
      mockSessionUser = { id: orgAdminUserId, isSiteAdmin: false };

      await request(app)
        .post(`/api/organizations/${testOrgId}/custom-metrics`)
        .send({
          // Missing label and metricType
        })
        .expect(400);
    });
  });

  // ========================================================================
  // UPDATE METRIC
  // ========================================================================

  describe("PATCH /api/organizations/:orgId/custom-metrics/:code", () => {
    let testMetricCode: string;

    beforeEach(async () => {
      testMetricCode = `ORG_${testOrgId.substring(0, 8).toUpperCase()}_UPDATE`;
      await db.insert(customOrgMetrics).values({
        organizationId: testOrgId,
        code: testMetricCode,
        label: 'Update Me',
        metricType: 'tracking',
        unit: 'count',
        isActive: true,
        createdBy: orgAdminUserId,
      });
    });

    it("should update metric as org admin", async () => {
      mockSessionUser = { id: orgAdminUserId, isSiteAdmin: false };

      const res = await request(app)
        .patch(`/api/organizations/${testOrgId}/custom-metrics/${testMetricCode}`)
        .send({
          label: 'Updated Label',
          category: 'agility',
        })
        .expect(200);

      expect(res.body.label).toBe('Updated Label');
      expect(res.body.category).toBe('agility');
    });

    it("should reject update by org member", async () => {
      mockSessionUser = { id: orgMemberUserId, isSiteAdmin: false };

      await request(app)
        .patch(`/api/organizations/${testOrgId}/custom-metrics/${testMetricCode}`)
        .send({ label: 'Unauthorized' })
        .expect(403);
    });
  });

  // ========================================================================
  // ARCHIVE/RESTORE
  // ========================================================================

  describe("POST /api/organizations/:orgId/custom-metrics/:code/archive", () => {
    let testMetricCode: string;

    beforeEach(async () => {
      testMetricCode = `ORG_${testOrgId.substring(0, 8).toUpperCase()}_ARCHIVE`;
      await db.insert(customOrgMetrics).values({
        organizationId: testOrgId,
        code: testMetricCode,
        label: 'Archive Me',
        metricType: 'tracking',
        unit: 'count',
        isActive: true,
        createdBy: orgAdminUserId,
      });
    });

    it("should archive metric as org admin", async () => {
      mockSessionUser = { id: orgAdminUserId, isSiteAdmin: false };

      const res = await request(app)
        .post(`/api/organizations/${testOrgId}/custom-metrics/${testMetricCode}/archive`)
        .expect(200);

      expect(res.body.isActive).toBe(false);
      expect(res.body.archivedAt).toBeDefined();
    });
  });

  describe("POST /api/organizations/:orgId/custom-metrics/:code/restore", () => {
    let testMetricCode: string;

    beforeEach(async () => {
      testMetricCode = `ORG_${testOrgId.substring(0, 8).toUpperCase()}_RESTORE`;
      await db.insert(customOrgMetrics).values({
        organizationId: testOrgId,
        code: testMetricCode,
        label: 'Restore Me',
        metricType: 'tracking',
        unit: 'count',
        isActive: false,
        archivedAt: new Date(),
        createdBy: orgAdminUserId,
      });
    });

    it("should restore archived metric as org admin", async () => {
      mockSessionUser = { id: orgAdminUserId, isSiteAdmin: false };

      const res = await request(app)
        .post(`/api/organizations/${testOrgId}/custom-metrics/${testMetricCode}/restore`)
        .expect(200);

      expect(res.body.isActive).toBe(true);
      expect(res.body.archivedAt).toBeNull();
    });
  });
});
