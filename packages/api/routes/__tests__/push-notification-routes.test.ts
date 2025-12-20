/**
 * Integration tests for Push Notification API Routes
 *
 * Test coverage:
 * - GET /api/push/vapid-public-key - Returns VAPID key for authenticated users
 * - POST /api/push/subscribe - Valid subscription saved
 * - POST /api/push/subscribe - Invalid endpoint rejected (400)
 * - POST /api/push/subscribe - Unauthenticated returns 401
 * - DELETE /api/push/unsubscribe - Removes subscription
 * - DELETE /api/push/unsubscribe - 404 if not found
 * - GET /api/push/subscriptions - Returns user's devices
 * - DELETE /api/push/subscriptions/:id - Removes specific device
 * - POST /api/push/test - Sends test notification
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { storage } from "../../storage";

// Mock the push notification service
const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();
const mockGetUserSubscriptions = vi.fn();
const mockGetVapidPublicKey = vi.fn();
const mockSendToUser = vi.fn();

vi.mock("../../services/push-notification-service", () => ({
  getPushNotificationService: () => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
    getUserSubscriptions: mockGetUserSubscriptions,
    getVapidPublicKey: mockGetVapidPublicKey,
    sendToUser: mockSendToUser,
  }),
}));

// Mock rate limiting to avoid test interference
vi.mock("express-rate-limit", () => ({
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import { registerPushNotificationRoutes } from "../push-notification-routes";

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

  // Register push notification routes
  registerPushNotificationRoutes(app);

  return app;
}

const app = createTestApp();

// Test data IDs
let testUserId: string;
let testOrgId: string;

describe("Push Notification API Routes", () => {
  beforeAll(async () => {
    const timestamp = Date.now();

    // Create test organization
    const org = await storage.createOrganization({
      name: `Push Test Org ${timestamp}`,
      description: "Test org for push notifications",
      benchmarksEnabled: false,
      allowCustomBenchmarks: false,
    });
    testOrgId = org.id;

    // Create test user
    const user = await storage.createUser({
      username: `pushtest-${timestamp}`,
      email: `pushtest-${timestamp}@test.com`,
      hashedPassword: "hashed",
      role: "athlete",
      isSiteAdmin: false,
      firstName: "Push",
      lastName: "Tester",
    });
    testUserId = user.id;

    // Link user to organization
    await storage.addUserToOrganization(testUserId, testOrgId, "athlete");
  });

  afterAll(async () => {
    // Clean up test data in reverse dependency order
    try {
      // First remove user from org, then delete user, then delete org
      if (testUserId && testOrgId) {
        await storage.removeUserFromOrganization(testUserId, testOrgId);
      }
      if (testUserId) await storage.deleteUser(testUserId);
      if (testOrgId) await storage.deleteOrganization(testOrgId);
    } catch (error) {
      console.error("Cleanup error in push-notification-routes.test.ts:", error);
    }
  });

  beforeEach(() => {
    // Reset mock session user before each test
    mockSessionUser = null;
    // Reset all mocks
    vi.clearAllMocks();
  });

  describe("GET /api/push/vapid-public-key", () => {
    it("should return VAPID public key for authenticated user", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "pushtest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      mockGetVapidPublicKey.mockReturnValue("BLongBase64EncodedVapidPublicKey123456");

      const response = await request(app).get("/api/push/vapid-public-key");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("publicKey");
      expect(response.body.publicKey).toBe("BLongBase64EncodedVapidPublicKey123456");
    });

    it("should return 503 when VAPID is not configured", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "pushtest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      mockGetVapidPublicKey.mockReturnValue(null);

      const response = await request(app).get("/api/push/vapid-public-key");

      expect(response.status).toBe(503);
      expect(response.body.message).toBe("Push notifications are not configured on this server");
    });

    it("should return 401 for unauthenticated requests", async () => {
      mockSessionUser = null;

      const response = await request(app).get("/api/push/vapid-public-key");

      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/push/subscribe", () => {
    const validSubscription = {
      subscription: {
        endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
        keys: {
          p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
          auth: "tBHItJI5svbpez7KI4CCXg",
        },
      },
      deviceName: "Chrome Desktop",
    };

    it("should register a valid subscription", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "pushtest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      mockSubscribe.mockResolvedValue({
        id: "sub-123",
        endpoint: validSubscription.subscription.endpoint,
        deviceName: validSubscription.deviceName,
      });

      const response = await request(app)
        .post("/api/push/subscribe")
        .send(validSubscription);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("id", "sub-123");
      expect(response.body).toHaveProperty("endpoint", validSubscription.subscription.endpoint);
      expect(response.body).toHaveProperty("deviceName", "Chrome Desktop");
      expect(response.body).toHaveProperty("message", "Push subscription registered successfully");
      expect(mockSubscribe).toHaveBeenCalledWith(
        testUserId,
        validSubscription.subscription,
        validSubscription.deviceName,
        undefined // user-agent header
      );
    });

    it("should reject invalid endpoint (400)", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "pushtest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      const invalidSubscription = {
        subscription: {
          endpoint: "not-a-valid-url",
          keys: {
            p256dh: "valid",
            auth: "valid",
          },
        },
      };

      const response = await request(app)
        .post("/api/push/subscribe")
        .send(invalidSubscription);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("message", "Invalid subscription data");
      expect(response.body).toHaveProperty("errors");
    });

    it("should reject missing keys (400)", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "pushtest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      const incompleteSubscription = {
        subscription: {
          endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
          // Missing keys
        },
      };

      const response = await request(app)
        .post("/api/push/subscribe")
        .send(incompleteSubscription);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("message", "Invalid subscription data");
    });

    it("should return 401 for unauthenticated requests", async () => {
      mockSessionUser = null;

      const response = await request(app)
        .post("/api/push/subscribe")
        .send(validSubscription);

      expect(response.status).toBe(401);
    });

    it("should handle service error for invalid endpoint", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "pushtest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      mockSubscribe.mockRejectedValue(new Error("Invalid push subscription endpoint"));

      const response = await request(app)
        .post("/api/push/subscribe")
        .send(validSubscription);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Invalid push subscription endpoint");
    });
  });

  describe("DELETE /api/push/unsubscribe", () => {
    it("should remove a subscription", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "pushtest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      mockUnsubscribe.mockResolvedValue(true);

      const response = await request(app)
        .delete("/api/push/unsubscribe")
        .send({ endpoint: "https://fcm.googleapis.com/fcm/send/abc123" });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Push subscription removed successfully");
      expect(mockUnsubscribe).toHaveBeenCalledWith(testUserId, "https://fcm.googleapis.com/fcm/send/abc123");
    });

    it("should return 404 if subscription not found", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "pushtest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      mockUnsubscribe.mockResolvedValue(false);

      const response = await request(app)
        .delete("/api/push/unsubscribe")
        .send({ endpoint: "https://fcm.googleapis.com/fcm/send/nonexistent" });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe("Subscription not found");
    });

    it("should reject invalid endpoint format", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "pushtest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      const response = await request(app)
        .delete("/api/push/unsubscribe")
        .send({ endpoint: "not-a-url" });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("message", "Invalid request");
    });

    it("should return 401 for unauthenticated requests", async () => {
      mockSessionUser = null;

      const response = await request(app)
        .delete("/api/push/unsubscribe")
        .send({ endpoint: "https://fcm.googleapis.com/fcm/send/abc123" });

      expect(response.status).toBe(401);
    });
  });

  describe("GET /api/push/subscriptions", () => {
    it("should return user's subscriptions", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "pushtest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      const mockSubscriptions = [
        {
          id: "sub-1",
          endpoint: "https://fcm.googleapis.com/fcm/send/device1",
          deviceName: "Chrome Desktop",
          createdAt: new Date("2024-01-01"),
          lastUsedAt: new Date("2024-01-15"),
        },
        {
          id: "sub-2",
          endpoint: "https://fcm.googleapis.com/fcm/send/device2",
          deviceName: "iPhone Safari",
          createdAt: new Date("2024-01-10"),
          lastUsedAt: null,
        },
      ];

      mockGetUserSubscriptions.mockResolvedValue(mockSubscriptions);

      const response = await request(app).get("/api/push/subscriptions");

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("subscriptions");
      expect(response.body.subscriptions).toHaveLength(2);
      expect(response.body.subscriptions[0]).toHaveProperty("id", "sub-1");
      expect(response.body.subscriptions[0]).toHaveProperty("deviceName", "Chrome Desktop");
      expect(response.body.subscriptions[1]).toHaveProperty("id", "sub-2");
    });

    it("should return empty array when no subscriptions exist", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "pushtest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      mockGetUserSubscriptions.mockResolvedValue([]);

      const response = await request(app).get("/api/push/subscriptions");

      expect(response.status).toBe(200);
      expect(response.body.subscriptions).toHaveLength(0);
    });

    it("should return 401 for unauthenticated requests", async () => {
      mockSessionUser = null;

      const response = await request(app).get("/api/push/subscriptions");

      expect(response.status).toBe(401);
    });
  });

  describe("DELETE /api/push/subscriptions/:id", () => {
    it("should remove a specific subscription by ID", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "pushtest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      const mockSubscriptions = [
        {
          id: "sub-to-delete",
          endpoint: "https://fcm.googleapis.com/fcm/send/device1",
          deviceName: "Chrome Desktop",
        },
      ];

      mockGetUserSubscriptions.mockResolvedValue(mockSubscriptions);
      mockUnsubscribe.mockResolvedValue(true);

      const response = await request(app)
        .delete("/api/push/subscriptions/sub-to-delete");

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Push subscription removed successfully");
      expect(mockUnsubscribe).toHaveBeenCalledWith(testUserId, "https://fcm.googleapis.com/fcm/send/device1");
    });

    it("should return 404 if subscription not found (wrong user)", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "pushtest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      // User doesn't own this subscription
      mockGetUserSubscriptions.mockResolvedValue([]);

      const response = await request(app)
        .delete("/api/push/subscriptions/sub-not-owned");

      expect(response.status).toBe(404);
      expect(response.body.message).toBe("Subscription not found");
    });

    it("should return 401 for unauthenticated requests", async () => {
      mockSessionUser = null;

      const response = await request(app)
        .delete("/api/push/subscriptions/sub-123");

      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/push/test", () => {
    it("should send a test notification", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "pushtest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      mockSendToUser.mockResolvedValue({
        successful: 1,
        failed: 0,
        noSubscription: false,
        skipped: false,
      });

      const response = await request(app)
        .post("/api/push/test");

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Test notification sent");
      expect(response.body.successful).toBe(1);
      expect(response.body.failed).toBe(0);
    });

    it("should return 400 when no subscription found", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "pushtest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      mockSendToUser.mockResolvedValue({
        noSubscription: true,
        successful: 0,
        failed: 0,
      });

      const response = await request(app)
        .post("/api/push/test");

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("No push subscriptions found. Please enable push notifications first.");
    });

    it("should return 400 when notification is skipped", async () => {
      mockSessionUser = {
        id: testUserId,
        email: "pushtest@test.com",
        role: "athlete",
        isSiteAdmin: false,
      };

      mockSendToUser.mockResolvedValue({
        skipped: true,
        reason: "quiet_hours",
        successful: 0,
        failed: 0,
      });

      const response = await request(app)
        .post("/api/push/test");

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Notification skipped: quiet_hours");
    });

    it("should return 401 for unauthenticated requests", async () => {
      mockSessionUser = null;

      const response = await request(app)
        .post("/api/push/test");

      expect(response.status).toBe(401);
    });
  });
});
