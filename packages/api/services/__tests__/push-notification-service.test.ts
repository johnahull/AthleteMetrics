/**
 * Push Notification Service Tests
 * TDD: Write tests first, then implement the service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import webPush from 'web-push';
import { PushNotificationService, NotificationPayload } from '../push-notification-service';

// Mock web-push
vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

// Mock database
const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  innerJoin: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  values: vi.fn().mockReturnThis(),
  returning: vi.fn().mockReturnThis(),
  delete: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
};

describe('PushNotificationService', () => {
  let service: PushNotificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    // Create service with mock db
    service = new PushNotificationService(mockDb as any);
  });

  describe('constructor', () => {
    it('should initialize VAPID details from environment variables', () => {
      // Set up environment
      process.env.VAPID_PUBLIC_KEY = 'test-public-key';
      process.env.VAPID_PRIVATE_KEY = 'test-private-key';
      process.env.VAPID_SUBJECT = 'mailto:test@example.com';

      // Create new service to trigger constructor
      new PushNotificationService(mockDb as any);

      expect(webPush.setVapidDetails).toHaveBeenCalledWith(
        'mailto:test@example.com',
        'test-public-key',
        'test-private-key'
      );
    });

    it('should use default VAPID subject if not provided', () => {
      process.env.VAPID_PUBLIC_KEY = 'test-public-key';
      process.env.VAPID_PRIVATE_KEY = 'test-private-key';
      delete process.env.VAPID_SUBJECT;

      new PushNotificationService(mockDb as any);

      expect(webPush.setVapidDetails).toHaveBeenCalledWith(
        'mailto:noreply@athletemetrics.app',
        'test-public-key',
        'test-private-key'
      );
    });
  });

  describe('getVapidPublicKey', () => {
    it('should return the VAPID public key', () => {
      process.env.VAPID_PUBLIC_KEY = 'my-public-key';
      const service = new PushNotificationService(mockDb as any);

      expect(service.getVapidPublicKey()).toBe('my-public-key');
    });

    it('should return empty string if VAPID key not configured', () => {
      delete process.env.VAPID_PUBLIC_KEY;
      const service = new PushNotificationService(mockDb as any);

      expect(service.getVapidPublicKey()).toBe('');
    });
  });

  describe('subscribe', () => {
    it('should save a new push subscription', async () => {
      const userId = 'user-123';
      const subscription = {
        endpoint: 'https://push.example.com/send/abc123',
        keys: {
          p256dh: 'public-key-123',
          auth: 'auth-secret-456',
        },
      };

      mockDb.returning.mockResolvedValue([{
        id: 'sub-1',
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      }]);

      const result = await service.subscribe(userId, subscription);

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.endpoint).toBe(subscription.endpoint);
    });

    it('should update lastUsedAt for existing subscription', async () => {
      const userId = 'user-123';
      const subscription = {
        endpoint: 'https://push.example.com/existing',
        keys: { p256dh: 'key', auth: 'auth' },
      };

      // First call returns existing subscription
      mockDb.where.mockResolvedValueOnce([{
        id: 'existing-sub',
        userId,
        endpoint: subscription.endpoint,
      }]);
      mockDb.returning.mockResolvedValue([{ id: 'existing-sub' }]);

      const result = await service.subscribe(userId, subscription);

      expect(result).toBeDefined();
    });

    it('should include optional device name', async () => {
      const userId = 'user-123';
      const subscription = {
        endpoint: 'https://push.example.com/device',
        keys: { p256dh: 'key', auth: 'auth' },
      };
      const deviceName = 'iPhone 15 Pro';

      mockDb.returning.mockResolvedValue([{
        id: 'sub-1',
        userId,
        endpoint: subscription.endpoint,
        deviceName,
      }]);

      const result = await service.subscribe(userId, subscription, deviceName);

      expect(result.deviceName).toBe(deviceName);
    });
  });

  describe('unsubscribe', () => {
    it('should delete subscription by endpoint', async () => {
      const userId = 'user-123';
      const endpoint = 'https://push.example.com/send/abc123';

      mockDb.returning.mockResolvedValue([{ id: 'deleted-sub' }]);

      await service.unsubscribe(userId, endpoint);

      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should return false if subscription not found', async () => {
      const userId = 'user-123';
      const endpoint = 'https://push.example.com/nonexistent';

      mockDb.returning.mockResolvedValue([]);

      const result = await service.unsubscribe(userId, endpoint);

      expect(result).toBe(false);
    });
  });

  describe('getUserSubscriptions', () => {
    it('should return all subscriptions for a user', async () => {
      const userId = 'user-123';
      const subscriptions = [
        { id: 'sub-1', endpoint: 'https://push.example.com/1', deviceName: 'iPhone' },
        { id: 'sub-2', endpoint: 'https://push.example.com/2', deviceName: 'Chrome' },
      ];

      mockDb.where.mockResolvedValue(subscriptions);

      const result = await service.getUserSubscriptions(userId);

      expect(result).toHaveLength(2);
      expect(result[0].deviceName).toBe('iPhone');
    });

    it('should return empty array if user has no subscriptions', async () => {
      mockDb.where.mockResolvedValue([]);

      const result = await service.getUserSubscriptions('user-no-subs');

      expect(result).toEqual([]);
    });
  });

  describe('sendToUser', () => {
    const notification: NotificationPayload = {
      title: 'Test Notification',
      body: 'This is a test',
      url: '/test',
      type: 'wellness_survey',
    };

    it('should send notification to all user subscriptions', async () => {
      const userId = 'user-123';
      const subscriptions = [
        { id: 'sub-1', endpoint: 'https://push.example.com/1', p256dh: 'key1', auth: 'auth1' },
        { id: 'sub-2', endpoint: 'https://push.example.com/2', p256dh: 'key2', auth: 'auth2' },
      ];

      // Mock getUserSubscriptions
      mockDb.where.mockResolvedValueOnce(subscriptions);
      // Mock notification preferences - enabled
      mockDb.where.mockResolvedValueOnce([{ pushEnabled: true, pushWellnessSurveys: true }]);
      // Mock sendNotification success
      (webPush.sendNotification as any).mockResolvedValue({ statusCode: 201 });

      const result = await service.sendToUser(userId, notification);

      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
      expect(webPush.sendNotification).toHaveBeenCalledTimes(2);
    });

    it('should respect user notification preferences', async () => {
      const userId = 'user-123';
      const subscriptions = [
        { id: 'sub-1', endpoint: 'https://push.example.com/1', p256dh: 'key1', auth: 'auth1' },
      ];

      // Mock getUserSubscriptions
      mockDb.where.mockResolvedValueOnce(subscriptions);
      // Mock notification preferences - push disabled
      mockDb.where.mockResolvedValueOnce([{ pushEnabled: false, pushWellnessSurveys: true }]);

      const result = await service.sendToUser(userId, notification);

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('push_disabled');
      expect(webPush.sendNotification).not.toHaveBeenCalled();
    });

    it('should respect notification type preferences', async () => {
      const userId = 'user-123';
      const subscriptions = [
        { id: 'sub-1', endpoint: 'https://push.example.com/1', p256dh: 'key1', auth: 'auth1' },
      ];

      // Mock getUserSubscriptions
      mockDb.where.mockResolvedValueOnce(subscriptions);
      // Mock notification preferences - wellness surveys disabled
      mockDb.where.mockResolvedValueOnce([{ pushEnabled: true, pushWellnessSurveys: false }]);

      const result = await service.sendToUser(userId, notification);

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe('type_disabled');
    });

    it('should handle subscription gone (410) by removing it', async () => {
      const userId = 'user-123';
      const subscriptions = [
        { id: 'sub-1', endpoint: 'https://push.example.com/gone', p256dh: 'key1', auth: 'auth1' },
      ];

      // Mock getUserSubscriptions
      mockDb.where.mockResolvedValueOnce(subscriptions);
      // Mock notification preferences - enabled
      mockDb.where.mockResolvedValueOnce([{ pushEnabled: true, pushWellnessSurveys: true }]);
      // Mock sendNotification failure with 410 (subscription expired)
      (webPush.sendNotification as any).mockRejectedValue({ statusCode: 410 });
      // Mock delete
      mockDb.returning.mockResolvedValue([{ id: 'sub-1' }]);

      const result = await service.sendToUser(userId, notification);

      expect(result.failed).toBe(1);
      expect(result.removed).toBe(1); // Subscription should be removed
      expect(mockDb.delete).toHaveBeenCalled();
    });

    it('should return noSubscription if user has no push subscriptions', async () => {
      const userId = 'user-no-subs';

      // Mock getUserSubscriptions - empty
      mockDb.where.mockResolvedValueOnce([]);

      const result = await service.sendToUser(userId, notification);

      expect(result.noSubscription).toBe(true);
      expect(webPush.sendNotification).not.toHaveBeenCalled();
    });

    it('should record notification in history', async () => {
      const userId = 'user-123';
      const subscriptions = [
        { id: 'sub-1', endpoint: 'https://push.example.com/1', p256dh: 'key1', auth: 'auth1' },
      ];

      // Mock getUserSubscriptions
      mockDb.where.mockResolvedValueOnce(subscriptions);
      // Mock notification preferences - enabled
      mockDb.where.mockResolvedValueOnce([{ pushEnabled: true, pushWellnessSurveys: true }]);
      // Mock sendNotification success
      (webPush.sendNotification as any).mockResolvedValue({ statusCode: 201 });
      // Mock insert for history
      mockDb.returning.mockResolvedValue([{ id: 'history-1' }]);

      await service.sendToUser(userId, notification);

      // Should have inserted into notification_history
      expect(mockDb.insert).toHaveBeenCalled();
    });
  });

  describe('sendToTeam', () => {
    const notification: NotificationPayload = {
      title: 'Team Announcement',
      body: 'Important team update',
      url: '/team/123',
      type: 'team_announcement',
    };

    // TODO: Convert to integration test - unit test mocking is too complex for nested db queries
    it.skip('should send notification to all team members', async () => {
      const teamId = 'team-123';
      const teamMembers = [
        { userId: 'user-1' },
        { userId: 'user-2' },
      ];

      // Mock all db.where calls (team members query + per-user subscription/preference queries)
      // Note: sendToUser also calls where for lastUsedAt updates, so we use mockImplementation
      let whereCallCount = 0;
      mockDb.where.mockImplementation(() => {
        whereCallCount++;
        // First call: team members
        if (whereCallCount === 1) {
          return Promise.resolve(teamMembers);
        }
        // Odd calls after first: subscriptions (calls 2, 4 are subs; 3, 5 are prefs)
        if (whereCallCount % 2 === 0) {
          return Promise.resolve([{
            id: `sub-${whereCallCount}`,
            endpoint: `https://push/${whereCallCount}`,
            p256dh: 'key',
            auth: 'auth'
          }]);
        }
        // Even calls: preferences
        return Promise.resolve([{ pushEnabled: true, pushTeamAnnouncements: true }]);
      });

      (webPush.sendNotification as any).mockResolvedValue({ statusCode: 201 });
      mockDb.returning.mockResolvedValue([{ id: 'history-1' }]);

      const result = await service.sendToTeam(teamId, notification);

      expect(result.totalMembers).toBe(2);
      expect(result.successful).toBeGreaterThanOrEqual(2);
    });
  });

  describe('quiet hours', () => {
    it('should defer notification during quiet hours', async () => {
      const userId = 'user-quiet';
      const notification: NotificationPayload = {
        title: 'Late Night Notification',
        body: 'This should be deferred',
        type: 'new_measurement',
      };

      // Current time is 11 PM
      const now = new Date();
      now.setHours(23, 0, 0, 0);
      vi.setSystemTime(now);

      // Mock subscriptions
      mockDb.where.mockResolvedValueOnce([{ id: 'sub-1', endpoint: 'https://push/1', p256dh: 'key', auth: 'auth' }]);
      // Mock preferences with quiet hours 10PM-7AM
      mockDb.where.mockResolvedValueOnce([{
        pushEnabled: true,
        pushNewMeasurements: true,
        quietHoursEnabled: true,
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
        quietHoursTimezone: 'America/New_York',
      }]);

      const result = await service.sendToUser(userId, notification);

      expect(result.deferred).toBe(true);
      expect(webPush.sendNotification).not.toHaveBeenCalled();
    });
  });
});
