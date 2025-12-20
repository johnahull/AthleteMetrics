/**
 * Integration tests for Admin Notification Routes
 *
 * Test coverage:
 * - GET /api/admin/notifications/settings - Site admin can read
 * - GET /api/admin/notifications/settings - Non-admin gets 403
 * - PUT /api/admin/notifications/settings - Updates global settings
 * - PUT /api/admin/notifications/settings - Toggle kill switch
 * - GET /api/admin/notifications/analytics - Returns platform stats
 * - GET /api/admin/notifications/analytics - Non-admin gets 403
 * - POST /api/admin/notifications/broadcast - Sends to all users
 * - POST /api/admin/notifications/broadcast - Validates payload
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import type { Request, Response, NextFunction } from "express";

// Mock push notification service
const mockSendToUser = vi.fn();

vi.mock("../../services/push-notification-service", () => ({
  getPushNotificationService: () => ({
    sendToUser: mockSendToUser,
  }),
}));

// Use vi.hoisted to ensure mockResults is available when vi.mock runs
const { mockResults, createChainableMock } = vi.hoisted(() => {
  const mockResults = {
    siteSettings: [] as any[],
    notificationHistory: [] as any[],
    pushSubscriptions: [] as any[],
    notificationPreferences: [] as any[],
    orgNotificationSettings: [] as any[],
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
    chain.groupBy = () => chain;

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
    select: (fields?: any) => ({
      from: (table: any) => {
        const symbolName = Object.getOwnPropertySymbols(table)
          .map((sym) => table[sym])
          .find(
            (val) =>
              typeof val === "string" &&
              (val.includes("site_settings") ||
                val.includes("notification") ||
                val.includes("push_subscriptions"))
          );

        // Check column properties as fallback
        const hasSiteSettingsColumns = table?.wellnessModuleEnabled !== undefined;
        const hasPushSubscriptionsColumns = table?.endpoint !== undefined;
        const hasHistoryColumns = table?.sentAt !== undefined && table?.deliveryStatus !== undefined;
        const hasPreferencesColumns = table?.pushEnabled !== undefined && table?.emailEnabled !== undefined;
        const hasOrgSettingsColumns = table?.digestTime !== undefined;

        if (symbolName?.includes("site_settings") || hasSiteSettingsColumns) {
          return createChainableMock(() => mockResults.siteSettings);
        }
        if (symbolName?.includes("push_subscriptions") || hasPushSubscriptionsColumns) {
          return createChainableMock(() => mockResults.pushSubscriptions);
        }
        if (symbolName?.includes("notification_history") || hasHistoryColumns) {
          return createChainableMock(() => mockResults.notificationHistory);
        }
        if (symbolName?.includes("notification_preferences") || hasPreferencesColumns) {
          return createChainableMock(() => mockResults.notificationPreferences);
        }
        if (symbolName?.includes("org_notification") || hasOrgSettingsColumns) {
          return createChainableMock(() => mockResults.orgNotificationSettings);
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

// Mock rate limiting to avoid test interference
vi.mock("express-rate-limit", () => ({
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import { registerAdminNotificationRoutes } from "../admin-notification-routes";

// Mock session data for testing
let mockSessionUser: any = null;

// Test IDs
const testUserId = "test-admin-123";

// Create test app with mocked session middleware
function createTestApp() {
  const app = express();
  app.use(express.json());

  // Mock session middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    req.session = {
      user: mockSessionUser,
    } as any;
    // Also set req.user for the route (requireSiteAdmin expects this)
    req.user = mockSessionUser;
    next();
  });

  // Mock authentication middleware (requireAuth)
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (!mockSessionUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  });

  // Mock site admin middleware (requireSiteAdmin)
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Only enforce for /api/admin paths
    if (req.path.startsWith("/api/admin") && !mockSessionUser?.isSiteAdmin) {
      return res.status(403).json({ message: "Forbidden: Site admin access required" });
    }
    next();
  });

  registerAdminNotificationRoutes(app);

  return app;
}

const app = createTestApp();

describe("Admin Notification Routes", () => {
  beforeEach(() => {
    mockSessionUser = null;
    mockResults.siteSettings = [];
    mockResults.notificationHistory = [];
    mockResults.pushSubscriptions = [];
    mockResults.notificationPreferences = [];
    mockResults.orgNotificationSettings = [];
    mockResults.insert = [];
    mockResults.update = [];
    vi.clearAllMocks();
  });

  describe("GET /api/admin/notifications/settings", () => {
    it("should return settings for site admin", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "admin@test.com",
        role: "site_admin",
        isSiteAdmin: true,
      };

      mockResults.siteSettings = [
        {
          id: "settings-1",
          pushNotificationsEnabled: true,
          pushDefaultOrgSettings: { pushEnabled: true },
        },
      ];

      const response = await request(app).get("/api/admin/notifications/settings");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("pushNotificationsEnabled", true);
      expect(response.body).toHaveProperty("pushDefaultOrgSettings");
    });

    it("should return defaults when no settings exist", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "admin@test.com",
        role: "site_admin",
        isSiteAdmin: true,
      };

      mockResults.siteSettings = [];

      const response = await request(app).get("/api/admin/notifications/settings");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("pushNotificationsEnabled", true);
      expect(response.body).toHaveProperty("pushDefaultOrgSettings", null);
    });

    it("should return 403 for non-site-admin", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "orgadmin@test.com",
        role: "org_admin",
        isSiteAdmin: false,
      };

      const response = await request(app).get("/api/admin/notifications/settings");

      expect(response.status).toBe(403);
    });

    it("should return 401 for unauthenticated requests", async () => {
      mockSessionUser = null;

      const response = await request(app).get("/api/admin/notifications/settings");

      expect(response.status).toBe(401);
    });
  });

  describe("PUT /api/admin/notifications/settings", () => {
    it("should update settings for site admin", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "admin@test.com",
        role: "site_admin",
        isSiteAdmin: true,
      };

      mockResults.siteSettings = [
        {
          id: "settings-1",
          pushNotificationsEnabled: true,
          pushDefaultOrgSettings: null,
        },
      ];

      mockResults.update = [
        {
          id: "settings-1",
          pushNotificationsEnabled: false,
          pushDefaultOrgSettings: null,
          updatedAt: new Date(),
        },
      ];

      const response = await request(app)
        .put("/api/admin/notifications/settings")
        .send({
          pushNotificationsEnabled: false,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("pushNotificationsEnabled", false);
    });

    it("should toggle kill switch (disable push notifications)", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "admin@test.com",
        role: "site_admin",
        isSiteAdmin: true,
      };

      mockResults.siteSettings = [
        {
          id: "settings-1",
          pushNotificationsEnabled: true,
          pushDefaultOrgSettings: { pushEnabled: true },
        },
      ];

      mockResults.update = [
        {
          id: "settings-1",
          pushNotificationsEnabled: false,
          pushDefaultOrgSettings: { pushEnabled: true },
        },
      ];

      const response = await request(app)
        .put("/api/admin/notifications/settings")
        .send({
          pushNotificationsEnabled: false,
        });

      expect(response.status).toBe(200);
      expect(response.body.pushNotificationsEnabled).toBe(false);
    });

    it("should create settings if none exist", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "admin@test.com",
        role: "site_admin",
        isSiteAdmin: true,
      };

      mockResults.siteSettings = [];

      mockResults.insert = [
        {
          id: "new-settings-1",
          pushNotificationsEnabled: true,
          pushDefaultOrgSettings: { wellnessSurveysEnabled: false },
        },
      ];

      const response = await request(app)
        .put("/api/admin/notifications/settings")
        .send({
          pushDefaultOrgSettings: { wellnessSurveysEnabled: false },
        });

      expect(response.status).toBe(200);
    });

    it("should validate request body", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "admin@test.com",
        role: "site_admin",
        isSiteAdmin: true,
      };

      const response = await request(app)
        .put("/api/admin/notifications/settings")
        .send({
          pushNotificationsEnabled: "not-a-boolean",
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("message", "Invalid settings data");
    });

    it("should return 403 for non-site-admin", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "coach@test.com",
        role: "coach",
        isSiteAdmin: false,
      };

      const response = await request(app)
        .put("/api/admin/notifications/settings")
        .send({
          pushNotificationsEnabled: false,
        });

      expect(response.status).toBe(403);
    });
  });

  describe("GET /api/admin/notifications/analytics", () => {
    it("should return analytics for site admin", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "admin@test.com",
        role: "site_admin",
        isSiteAdmin: true,
      };

      mockResults.pushSubscriptions = [{ count: 10 }];
      mockResults.notificationPreferences = [{ count: 5 }];
      mockResults.orgNotificationSettings = [{ count: 3 }];
      mockResults.notificationHistory = [
        { status: "delivered", count: 100 },
        { status: "failed", count: 5 },
      ];

      const response = await request(app).get("/api/admin/notifications/analytics");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("summary");
      expect(response.body).toHaveProperty("last30Days");
      expect(response.body).toHaveProperty("recentNotifications");
    });

    it("should return empty analytics when no data exists", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "admin@test.com",
        role: "site_admin",
        isSiteAdmin: true,
      };

      mockResults.pushSubscriptions = [{ count: 0 }];
      mockResults.notificationPreferences = [{ count: 0 }];
      mockResults.orgNotificationSettings = [{ count: 0 }];
      mockResults.notificationHistory = [];

      const response = await request(app).get("/api/admin/notifications/analytics");

      expect(response.status).toBe(200);
      expect(response.body.summary.totalSubscriptions).toBe(0);
    });

    it("should return 403 for non-site-admin", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "coach@test.com",
        role: "coach",
        isSiteAdmin: false,
      };

      const response = await request(app).get("/api/admin/notifications/analytics");

      expect(response.status).toBe(403);
    });
  });

  describe("POST /api/admin/notifications/broadcast", () => {
    it("should send broadcast for site admin", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "admin@test.com",
        role: "site_admin",
        isSiteAdmin: true,
      };

      mockResults.pushSubscriptions = [
        { userId: "user-1" },
        { userId: "user-2" },
        { userId: "user-1" }, // Duplicate should be filtered
      ];

      mockSendToUser.mockResolvedValue({
        successful: 1,
        failed: 0,
        noSubscription: false,
      });

      const response = await request(app)
        .post("/api/admin/notifications/broadcast")
        .send({
          title: "Important Announcement",
          body: "System maintenance scheduled for tonight.",
          url: "/announcements",
          urgent: true,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("message", "Broadcast sent");
      expect(response.body).toHaveProperty("results");
      expect(response.body.results).toHaveProperty("totalTargeted", 2); // Deduplicated
      expect(response.body.results).toHaveProperty("successful", 2);
      expect(mockSendToUser).toHaveBeenCalledTimes(2);
    });

    it("should handle mixed success/failure in broadcast", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "admin@test.com",
        role: "site_admin",
        isSiteAdmin: true,
      };

      mockResults.pushSubscriptions = [
        { userId: "user-1" },
        { userId: "user-2" },
        { userId: "user-3" },
      ];

      mockSendToUser
        .mockResolvedValueOnce({ successful: 1, failed: 0, noSubscription: false })
        .mockResolvedValueOnce({ successful: 0, failed: 1, noSubscription: false })
        .mockResolvedValueOnce({ successful: 0, failed: 0, noSubscription: true });

      const response = await request(app)
        .post("/api/admin/notifications/broadcast")
        .send({
          title: "Test Broadcast",
          body: "Testing notification system.",
        });

      expect(response.status).toBe(200);
      expect(response.body.results.successful).toBe(1);
      expect(response.body.results.failed).toBe(1);
      expect(response.body.results.noSubscription).toBe(1);
    });

    it("should validate broadcast payload - missing title", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "admin@test.com",
        role: "site_admin",
        isSiteAdmin: true,
      };

      const response = await request(app)
        .post("/api/admin/notifications/broadcast")
        .send({
          body: "Missing title field",
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("message", "Invalid broadcast data");
    });

    it("should validate broadcast payload - empty title", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "admin@test.com",
        role: "site_admin",
        isSiteAdmin: true,
      };

      const response = await request(app)
        .post("/api/admin/notifications/broadcast")
        .send({
          title: "",
          body: "Body content",
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("message", "Invalid broadcast data");
    });

    it("should validate broadcast payload - title too long", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "admin@test.com",
        role: "site_admin",
        isSiteAdmin: true,
      };

      const response = await request(app)
        .post("/api/admin/notifications/broadcast")
        .send({
          title: "x".repeat(101), // Max 100 chars
          body: "Body content",
        });

      expect(response.status).toBe(400);
    });

    it("should return 403 for non-site-admin", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "orgadmin@test.com",
        role: "org_admin",
        isSiteAdmin: false,
      };

      const response = await request(app)
        .post("/api/admin/notifications/broadcast")
        .send({
          title: "Unauthorized Broadcast",
          body: "Should not be allowed.",
        });

      expect(response.status).toBe(403);
    });

    it("should return 401 for unauthenticated requests", async () => {
      mockSessionUser = null;

      const response = await request(app)
        .post("/api/admin/notifications/broadcast")
        .send({
          title: "Test",
          body: "Test body",
        });

      expect(response.status).toBe(401);
    });
  });
});
