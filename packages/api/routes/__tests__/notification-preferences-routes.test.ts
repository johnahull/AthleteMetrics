/**
 * Integration tests for Notification Preferences API Routes
 *
 * Test coverage:
 * - GET /api/notifications/preferences - Returns user prefs (or defaults)
 * - PUT /api/notifications/preferences - Updates preferences
 * - PUT /api/notifications/preferences - Validates quiet hours format
 * - GET /api/notifications/history - Returns paginated history (desc order)
 * - GET /api/notifications/history?type=X - Filters by type
 * - POST /api/notifications/:id/clicked - Marks as clicked
 * - POST /api/notifications/:id/clicked - 404 if wrong user (security)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import type { Request, Response, NextFunction } from "express";

// Use vi.hoisted to ensure mockResults is available when vi.mock runs (which is hoisted)
const { mockResults, createChainableMock } = vi.hoisted(() => {
  // Mock result store
  const mockResults = {
    notificationPrefs: [] as any[],
    notificationHistory: [] as any[],
    insert: [] as any[],
    update: [] as any[],
  };

  // Create chainable mock that simulates Drizzle's query builder
  const createChainableMock = (getResult: () => any[]) => {
    const chain: any = {};

    // All chainable methods return the chain
    chain.where = () => chain;
    chain.orderBy = () => chain;
    chain.limit = () => chain;
    chain.offset = () => chain;
    chain.from = () => chain;

    // Make it thenable - reads result at call time
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
        // Debug: Log table structure to find the name property
        // Drizzle tables use Symbol-keyed properties for metadata
        // Try multiple approaches to get the table name
        const symbolName = Object.getOwnPropertySymbols(table)
          .map(sym => table[sym])
          .find(val => typeof val === 'string' && (val.includes('notification') || val.includes('preferences') || val.includes('history')));

        // Fallback: check for column properties unique to each table
        const hasPrefsColumns = table?.userId !== undefined && table?.pushEnabled !== undefined;
        const hasHistoryColumns = table?.userId !== undefined && table?.sentAt !== undefined;

        if (symbolName?.includes('notification_preferences') || hasPrefsColumns) {
          return createChainableMock(() => mockResults.notificationPrefs);
        }
        if (symbolName?.includes('notification_history') || hasHistoryColumns) {
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

// Mock rate limiting to avoid test interference
vi.mock("express-rate-limit", () => ({
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import { registerNotificationPreferencesRoutes } from "../notification-preferences-routes";

// Mock session data for testing
let mockSessionUser: any = null;

// Test user IDs (no real DB needed since routes are mocked)
const testUserId = "test-user-123";

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

  // Register notification preferences routes
  registerNotificationPreferencesRoutes(app);

  return app;
}

const app = createTestApp();

describe("Notification Preferences API Routes", () => {
  beforeEach(() => {
    // Reset mock session user before each test
    mockSessionUser = null;
    // Reset mock results
    mockResults.notificationPrefs = [];
    mockResults.notificationHistory = [];
    mockResults.insert = [];
    mockResults.update = [];
    // Reset all mocks
    vi.clearAllMocks();
  });

  describe("GET /api/notifications/preferences", () => {
    it("should return default preferences for new user", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "notiftest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      // Mock: no existing preferences found
      mockResults.notificationPrefs = [];

      const response = await request(app).get("/api/notifications/preferences");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("isDefault", true);
      expect(response.body).toHaveProperty("pushEnabled", true);
      expect(response.body).toHaveProperty("emailEnabled", true);
      expect(response.body).toHaveProperty("pushWellnessSurveys", true);
      expect(response.body).toHaveProperty("pushWellnessDigest", true);
      expect(response.body).toHaveProperty("pushNewMeasurements", true);
      expect(response.body).toHaveProperty("pushTeamAnnouncements", true);
      expect(response.body).toHaveProperty("quietHoursEnabled", false);
    });

    it("should return existing preferences", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "notiftest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      // Mock: existing preferences found
      mockResults.notificationPrefs = [{
        id: "pref-1",
        userId: testUserId,
        pushEnabled: false,
        emailEnabled: true,
        pushWellnessSurveys: false,
        pushWellnessDigest: true,
        pushNewMeasurements: true,
        pushTeamAnnouncements: false,
        quietHoursEnabled: true,
        quietHoursStart: "22:00:00",
        quietHoursEnd: "07:00:00",
        quietHoursTimezone: "America/New_York",
      }];

      const response = await request(app).get("/api/notifications/preferences");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("isDefault", false);
      expect(response.body).toHaveProperty("pushEnabled", false);
      expect(response.body).toHaveProperty("pushWellnessSurveys", false);
      expect(response.body).toHaveProperty("quietHoursEnabled", true);
    });

    it("should return 401 for unauthenticated requests", async () => {
      mockSessionUser = null;

      const response = await request(app).get("/api/notifications/preferences");

      expect(response.status).toBe(401);
    });
  });

  describe("PUT /api/notifications/preferences", () => {
    it("should create preferences for new user", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "notiftest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      // Mock: no existing preferences
      mockResults.notificationPrefs = [];

      // Mock: insert returns new preferences
      mockResults.insert = [{
        id: "new-pref-1",
        userId: testUserId,
        pushEnabled: true,
        emailEnabled: true,
        pushWellnessSurveys: false,
        pushWellnessDigest: true,
        pushNewMeasurements: true,
        pushTeamAnnouncements: true,
        emailWellnessSurveys: true,
        emailWellnessDigest: true,
        emailNewMeasurements: false,
        emailTeamAnnouncements: true,
        quietHoursEnabled: true,
        quietHoursStart: "22:00:00",
        quietHoursEnd: "07:00:00",
        quietHoursTimezone: "America/New_York",
        updatedAt: new Date(),
      }];

      const response = await request(app)
        .put("/api/notifications/preferences")
        .send({
          pushEnabled: true,
          pushWellnessSurveys: false,
          quietHoursEnabled: true,
          quietHoursStart: "22:00",
          quietHoursEnd: "07:00",
          quietHoursTimezone: "America/New_York",
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("pushEnabled", true);
      expect(response.body).toHaveProperty("pushWellnessSurveys", false);
      expect(response.body).toHaveProperty("quietHoursEnabled", true);
      expect(response.body).toHaveProperty("message", "Notification preferences updated successfully");
    });

    it("should update existing preferences", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "notiftest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      // Mock: existing preferences found
      mockResults.notificationPrefs = [{
        id: "existing-pref",
        userId: testUserId,
        pushEnabled: true,
        emailEnabled: true,
      }];

      // Mock: update returns updated preferences
      mockResults.update = [{
        id: "existing-pref",
        userId: testUserId,
        pushEnabled: true,
        emailEnabled: false,
        emailNewMeasurements: true,
        updatedAt: new Date(),
      }];

      const response = await request(app)
        .put("/api/notifications/preferences")
        .send({
          emailEnabled: false,
          emailNewMeasurements: true,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("emailEnabled", false);
      expect(response.body).toHaveProperty("emailNewMeasurements", true);
    });

    it("should validate quiet hours format - invalid time", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "notiftest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      const response = await request(app)
        .put("/api/notifications/preferences")
        .send({
          quietHoursStart: "invalid-time",
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("message", "Invalid preferences data");
      expect(response.body).toHaveProperty("errors");
    });

    it("should validate quiet hours format - out of range hour", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "notiftest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      const response = await request(app)
        .put("/api/notifications/preferences")
        .send({
          quietHoursStart: "25:00",
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("message", "Invalid preferences data");
    });

    it("should reject invalid boolean values", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "notiftest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      const response = await request(app)
        .put("/api/notifications/preferences")
        .send({
          pushEnabled: "not-a-boolean",
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("message", "Invalid preferences data");
    });

    it("should return 401 for unauthenticated requests", async () => {
      mockSessionUser = null;

      const response = await request(app)
        .put("/api/notifications/preferences")
        .send({ pushEnabled: false });

      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/notifications/history", () => {
    it("should return paginated history (desc order)", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "notiftest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      mockResults.notificationHistory = [
        {
          id: "notif-3",
          userId: testUserId,
          type: "wellness_digest",
          title: "Daily Summary",
          body: "3 athletes need attention",
          url: "/wellness-analytics",
          channels: ["push"],
          deliveryStatus: "sent",
          sentAt: new Date("2024-01-20"),
          deliveredAt: new Date("2024-01-20"),
          clickedAt: null,
        },
        {
          id: "notif-2",
          userId: testUserId,
          type: "team_announcement",
          title: "Team Meeting",
          body: "Practice at 3pm tomorrow",
          url: null,
          channels: ["push", "email"],
          deliveryStatus: "sent",
          sentAt: new Date("2024-01-15"),
          deliveredAt: null,
          clickedAt: null,
        },
        {
          id: "notif-1",
          userId: testUserId,
          type: "wellness_survey_request",
          title: "Wellness Check",
          body: "Please complete your wellness survey",
          url: "/wellness",
          channels: ["push"],
          deliveryStatus: "sent",
          sentAt: new Date("2024-01-10"),
          deliveredAt: new Date("2024-01-10"),
          clickedAt: null,
        },
      ];

      const response = await request(app).get("/api/notifications/history");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("notifications");
      expect(Array.isArray(response.body.notifications)).toBe(true);
      expect(response.body.notifications).toHaveLength(3);
      expect(response.body).toHaveProperty("pagination");
      expect(response.body.pagination).toHaveProperty("limit");
      expect(response.body.pagination).toHaveProperty("offset");
      expect(response.body.pagination).toHaveProperty("hasMore");

      // Verify data structure
      const first = response.body.notifications[0];
      expect(first).toHaveProperty("id", "notif-3");
      expect(first).toHaveProperty("type", "wellness_digest");
      expect(first).toHaveProperty("title", "Daily Summary");
    });

    it("should filter by notification type", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "notiftest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      // Mock returns all, filtering happens in-memory per the route
      mockResults.notificationHistory = [
        {
          id: "notif-1",
          userId: testUserId,
          type: "wellness_survey_request",
          title: "Wellness Check",
          body: "Please complete",
          channels: ["push"],
          deliveryStatus: "sent",
          sentAt: new Date(),
        },
        {
          id: "notif-2",
          userId: testUserId,
          type: "team_announcement",
          title: "Team Update",
          body: "Game moved",
          channels: ["push"],
          deliveryStatus: "sent",
          sentAt: new Date(),
        },
      ];

      const response = await request(app)
        .get("/api/notifications/history")
        .query({ type: "wellness_survey_request" });

      expect(response.status).toBe(200);
      expect(response.body.notifications.every((n: any) => n.type === "wellness_survey_request")).toBe(true);
    });

    it("should respect limit parameter", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "notiftest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      mockResults.notificationHistory = [{
        id: "notif-1",
        userId: testUserId,
        type: "team_announcement",
        title: "Test",
        body: "Test body",
        channels: ["push"],
        deliveryStatus: "sent",
        sentAt: new Date(),
      }];

      const response = await request(app)
        .get("/api/notifications/history")
        .query({ limit: 1 });

      expect(response.status).toBe(200);
      expect(response.body.notifications.length).toBeLessThanOrEqual(1);
    });

    it("should return empty array when no history exists", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "notiftest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      mockResults.notificationHistory = [];

      const response = await request(app).get("/api/notifications/history");

      expect(response.status).toBe(200);
      expect(response.body.notifications).toHaveLength(0);
    });

    it("should return 401 for unauthenticated requests", async () => {
      mockSessionUser = null;

      const response = await request(app).get("/api/notifications/history");

      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/notifications/:id/clicked", () => {
    it("should mark notification as clicked", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "notiftest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      // Mock: update succeeds and returns the updated record
      mockResults.update = [{
        id: "notif-1",
        userId: testUserId,
        clickedAt: new Date(),
      }];

      const response = await request(app)
        .post("/api/notifications/notif-1/clicked");

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Notification marked as clicked");
    });

    it("should return 404 when trying to mark another user's notification (security)", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "notiftest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      // Mock: update returns empty (no matching record for this user)
      mockResults.update = [];

      const response = await request(app)
        .post("/api/notifications/other-user-notif/clicked");

      expect(response.status).toBe(404);
      expect(response.body.message).toBe("Notification not found or access denied");
    });

    it("should return 404 for non-existent notification", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "notiftest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      // Mock: update returns empty
      mockResults.update = [];

      const response = await request(app)
        .post("/api/notifications/non-existent-id/clicked");

      expect(response.status).toBe(404);
    });

    it("should return 401 for unauthenticated requests", async () => {
      mockSessionUser = null;

      const response = await request(app)
        .post("/api/notifications/notif-1/clicked");

      expect(response.status).toBe(401);
    });
  });
});
