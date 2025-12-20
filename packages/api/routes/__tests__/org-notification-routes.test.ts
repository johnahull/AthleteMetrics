/**
 * Integration tests for Organization Notification Settings Routes
 *
 * Test coverage:
 * - GET /api/organizations/:orgId/notifications/settings - Org admin can read
 * - GET /api/organizations/:orgId/notifications/settings - Site admin can read
 * - GET /api/organizations/:orgId/notifications/settings - Non-admin gets 403
 * - GET /api/organizations/:orgId/notifications/settings - Returns defaults when none exist
 * - PUT /api/organizations/:orgId/notifications/settings - Updates org settings
 * - PUT /api/organizations/:orgId/notifications/settings - Validates digest time
 * - GET /api/organizations/:orgId/notifications/analytics - Returns analytics
 * - GET /api/organizations/:orgId/notifications/analytics - Non-admin gets 403
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import type { Request, Response, NextFunction } from "express";

// Use vi.hoisted to ensure mockResults is available when vi.mock runs
const { mockResults, createChainableMock } = vi.hoisted(() => {
  const mockResults = {
    userOrganizations: [] as any[],
    orgNotificationSettings: [] as any[],
    notificationHistory: [] as any[],
    insert: [] as any[],
    update: [] as any[],
  };

  const createChainableMock = (getResult: () => any[]) => {
    const chain: any = {};
    chain.where = () => chain;
    chain.orderBy = () => chain;
    chain.limit = () => chain;
    chain.offset = () => chain;
    chain.from = () => chain;

    chain.then = (resolve: Function, reject?: Function) => {
      try {
        resolve(getResult());
      } catch (e) {
        if (reject) reject(e);
      }
    };

    return chain;
  };

  return { mockResults, createChainableMock };
});

vi.mock("../../db", () => ({
  db: {
    select: () => ({
      from: (table: any) => {
        // Use Symbol-keyed properties to identify tables
        const symbolName = Object.getOwnPropertySymbols(table)
          .map((sym) => table[sym])
          .find(
            (val) =>
              typeof val === "string" &&
              (val.includes("user_organizations") ||
                val.includes("org_notification") ||
                val.includes("notification_history"))
          );

        // Check column properties as fallback
        const hasUserOrgColumns = table?.role !== undefined && table?.organizationId !== undefined;
        const hasOrgSettingsColumns = table?.orgId !== undefined && table?.digestTime !== undefined;
        const hasHistoryColumns = table?.sentAt !== undefined && table?.deliveryStatus !== undefined;

        if (symbolName?.includes("user_organizations") || hasUserOrgColumns) {
          return createChainableMock(() => mockResults.userOrganizations);
        }
        if (symbolName?.includes("org_notification") || hasOrgSettingsColumns) {
          return createChainableMock(() => mockResults.orgNotificationSettings);
        }
        if (symbolName?.includes("notification_history") || hasHistoryColumns) {
          return createChainableMock(() => mockResults.notificationHistory);
        }
        return createChainableMock(() => []);
      },
    }),
    insert: () => ({
      values: () => ({
        returning: () => Promise.resolve(mockResults.insert),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve(mockResults.update),
        }),
      }),
    }),
  },
}));

import { registerOrgNotificationRoutes } from "../org-notification-routes";

// Mock session data for testing
let mockSessionUser: any = null;

// Test IDs
const testUserId = "test-user-123";
const testOrgId = "test-org-456";

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

  // Mock authentication middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!mockSessionUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  });

  registerOrgNotificationRoutes(app);

  return app;
}

const app = createTestApp();

describe("Organization Notification Settings Routes", () => {
  beforeEach(() => {
    mockSessionUser = null;
    mockResults.userOrganizations = [];
    mockResults.orgNotificationSettings = [];
    mockResults.notificationHistory = [];
    mockResults.insert = [];
    mockResults.update = [];
    vi.clearAllMocks();
  });

  describe("GET /api/organizations/:orgId/notifications/settings", () => {
    it("should allow org admin to read settings", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "orgadmin@test.com",
        role: "org_admin",
        isSiteAdmin: false,
      };

      // Mock: user is org_admin for this org
      mockResults.userOrganizations = [
        {
          userId: testUserId,
          organizationId: testOrgId,
          role: "org_admin",
        },
      ];

      // Mock: existing settings
      mockResults.orgNotificationSettings = [
        {
          id: "settings-1",
          orgId: testOrgId,
          pushEnabled: true,
          wellnessSurveysEnabled: true,
          wellnessDigestEnabled: true,
          digestTime: "08:00",
          digestTimezone: "America/Los_Angeles",
        },
      ];

      const response = await request(app).get(
        `/api/organizations/${testOrgId}/notifications/settings`
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("pushEnabled", true);
      expect(response.body).toHaveProperty("digestTime", "08:00");
      expect(response.body).toHaveProperty("isDefault", false);
    });

    it("should allow site admin to read any org settings", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "siteadmin@test.com",
        role: "athlete",
        isSiteAdmin: true,
      };

      // Mock: user is NOT in this org at all
      mockResults.userOrganizations = [];

      // Mock: org has settings
      mockResults.orgNotificationSettings = [
        {
          id: "settings-1",
          orgId: testOrgId,
          pushEnabled: false,
          digestTime: "09:00",
        },
      ];

      const response = await request(app).get(
        `/api/organizations/${testOrgId}/notifications/settings`
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("pushEnabled", false);
    });

    it("should return 403 for non-admin users", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "athlete@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      // Mock: user is an athlete in this org (not admin)
      mockResults.userOrganizations = [
        {
          userId: testUserId,
          organizationId: testOrgId,
          role: "athlete",
        },
      ];

      const response = await request(app).get(
        `/api/organizations/${testOrgId}/notifications/settings`
      );

      expect(response.status).toBe(403);
      expect(response.body.message).toBe("Access denied");
    });

    it("should return 403 for coach (not org_admin)", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "coach@test.com",
        role: "coach",
        isSiteAdmin: false,
      };

      // Mock: user is a coach (not org_admin)
      mockResults.userOrganizations = [
        {
          userId: testUserId,
          organizationId: testOrgId,
          role: "coach",
        },
      ];

      const response = await request(app).get(
        `/api/organizations/${testOrgId}/notifications/settings`
      );

      expect(response.status).toBe(403);
    });

    it("should return default settings when none exist", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "orgadmin@test.com",
        role: "org_admin",
        isSiteAdmin: false,
      };

      mockResults.userOrganizations = [
        {
          userId: testUserId,
          organizationId: testOrgId,
          role: "org_admin",
        },
      ];

      // Mock: no settings exist
      mockResults.orgNotificationSettings = [];

      const response = await request(app).get(
        `/api/organizations/${testOrgId}/notifications/settings`
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("isDefault", true);
      expect(response.body).toHaveProperty("pushEnabled", true);
      expect(response.body).toHaveProperty("digestTime", "07:00");
      expect(response.body).toHaveProperty("digestTimezone", "America/New_York");
      expect(response.body).toHaveProperty("wellnessDigestEnabled", true);
    });

    it("should return 401 for unauthenticated requests", async () => {
      mockSessionUser = null;

      const response = await request(app).get(
        `/api/organizations/${testOrgId}/notifications/settings`
      );

      expect(response.status).toBe(401);
    });
  });

  describe("PUT /api/organizations/:orgId/notifications/settings", () => {
    it("should update org settings for org admin", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "orgadmin@test.com",
        role: "org_admin",
        isSiteAdmin: false,
      };

      mockResults.userOrganizations = [
        {
          userId: testUserId,
          organizationId: testOrgId,
          role: "org_admin",
        },
      ];

      // Mock: existing settings
      mockResults.orgNotificationSettings = [
        {
          id: "settings-1",
          orgId: testOrgId,
          pushEnabled: true,
        },
      ];

      // Mock: update returns updated settings
      mockResults.update = [
        {
          id: "settings-1",
          orgId: testOrgId,
          pushEnabled: false,
          digestTime: "08:30",
          updatedAt: new Date(),
        },
      ];

      const response = await request(app)
        .put(`/api/organizations/${testOrgId}/notifications/settings`)
        .send({
          pushEnabled: false,
          digestTime: "08:30",
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("pushEnabled", false);
      expect(response.body).toHaveProperty("digestTime", "08:30");
      expect(response.body).toHaveProperty(
        "message",
        "Organization notification settings updated successfully"
      );
    });

    it("should create settings when none exist", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "orgadmin@test.com",
        role: "org_admin",
        isSiteAdmin: false,
      };

      mockResults.userOrganizations = [
        {
          userId: testUserId,
          organizationId: testOrgId,
          role: "org_admin",
        },
      ];

      // Mock: no existing settings
      mockResults.orgNotificationSettings = [];

      // Mock: insert returns new settings
      mockResults.insert = [
        {
          id: "new-settings-1",
          orgId: testOrgId,
          pushEnabled: true,
          wellnessSurveysEnabled: false,
          digestTime: "07:00",
          updatedAt: new Date(),
        },
      ];

      const response = await request(app)
        .put(`/api/organizations/${testOrgId}/notifications/settings`)
        .send({
          wellnessSurveysEnabled: false,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("wellnessSurveysEnabled", false);
    });

    it("should validate digest time format", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "orgadmin@test.com",
        role: "org_admin",
        isSiteAdmin: false,
      };

      mockResults.userOrganizations = [
        {
          userId: testUserId,
          organizationId: testOrgId,
          role: "org_admin",
        },
      ];

      const response = await request(app)
        .put(`/api/organizations/${testOrgId}/notifications/settings`)
        .send({
          digestTime: "invalid-time",
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("message", "Invalid settings data");
      expect(response.body).toHaveProperty("errors");
    });

    it("should reject out-of-range digest time", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "orgadmin@test.com",
        role: "org_admin",
        isSiteAdmin: false,
      };

      mockResults.userOrganizations = [
        {
          userId: testUserId,
          organizationId: testOrgId,
          role: "org_admin",
        },
      ];

      const response = await request(app)
        .put(`/api/organizations/${testOrgId}/notifications/settings`)
        .send({
          digestTime: "25:00",
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("message", "Invalid settings data");
    });

    it("should return 403 for non-admin users", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "athlete@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      mockResults.userOrganizations = [
        {
          userId: testUserId,
          organizationId: testOrgId,
          role: "athlete",
        },
      ];

      const response = await request(app)
        .put(`/api/organizations/${testOrgId}/notifications/settings`)
        .send({
          pushEnabled: false,
        });

      expect(response.status).toBe(403);
    });

    it("should return 401 for unauthenticated requests", async () => {
      mockSessionUser = null;

      const response = await request(app)
        .put(`/api/organizations/${testOrgId}/notifications/settings`)
        .send({
          pushEnabled: false,
        });

      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/organizations/:orgId/notifications/analytics", () => {
    it("should return analytics for org admin", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "orgadmin@test.com",
        role: "org_admin",
        isSiteAdmin: false,
      };

      mockResults.userOrganizations = [
        {
          userId: testUserId,
          organizationId: testOrgId,
          role: "org_admin",
        },
      ];

      // Mock: notification history
      const now = new Date();
      mockResults.notificationHistory = [
        {
          id: "notif-1",
          orgId: testOrgId,
          type: "wellness_survey_request",
          deliveryStatus: "delivered",
          sentAt: now,
          clickedAt: now,
        },
        {
          id: "notif-2",
          orgId: testOrgId,
          type: "wellness_survey_request",
          deliveryStatus: "delivered",
          sentAt: now,
          clickedAt: null,
        },
        {
          id: "notif-3",
          orgId: testOrgId,
          type: "team_announcement",
          deliveryStatus: "failed",
          sentAt: now,
          clickedAt: null,
        },
      ];

      const response = await request(app).get(
        `/api/organizations/${testOrgId}/notifications/analytics`
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("period");
      expect(response.body.period).toHaveProperty("days", 30);
      expect(response.body).toHaveProperty("summary");
      expect(response.body.summary).toHaveProperty("totalSent", 3);
      expect(response.body.summary).toHaveProperty("delivered", 2);
      expect(response.body.summary).toHaveProperty("failed", 1);
      expect(response.body.summary).toHaveProperty("clicked", 1);
      expect(response.body).toHaveProperty("byType");
      expect(response.body.byType).toHaveProperty("wellness_survey_request");
    });

    it("should support custom date range", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "orgadmin@test.com",
        role: "org_admin",
        isSiteAdmin: false,
      };

      mockResults.userOrganizations = [
        {
          userId: testUserId,
          organizationId: testOrgId,
          role: "org_admin",
        },
      ];

      mockResults.notificationHistory = [];

      const response = await request(app)
        .get(`/api/organizations/${testOrgId}/notifications/analytics`)
        .query({ days: 7 });

      expect(response.status).toBe(200);
      expect(response.body.period.days).toBe(7);
    });

    it("should return 403 for non-admin users", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "athlete@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      mockResults.userOrganizations = [
        {
          userId: testUserId,
          organizationId: testOrgId,
          role: "athlete",
        },
      ];

      const response = await request(app).get(
        `/api/organizations/${testOrgId}/notifications/analytics`
      );

      expect(response.status).toBe(403);
    });

    it("should allow site admin to access any org analytics", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "siteadmin@test.com",
        role: "athlete",
        isSiteAdmin: true,
      };

      mockResults.userOrganizations = [];
      mockResults.notificationHistory = [];

      const response = await request(app).get(
        `/api/organizations/${testOrgId}/notifications/analytics`
      );

      expect(response.status).toBe(200);
      expect(response.body.summary.totalSent).toBe(0);
    });

    it("should return 401 for unauthenticated requests", async () => {
      mockSessionUser = null;

      const response = await request(app).get(
        `/api/organizations/${testOrgId}/notifications/analytics`
      );

      expect(response.status).toBe(401);
    });
  });
});
