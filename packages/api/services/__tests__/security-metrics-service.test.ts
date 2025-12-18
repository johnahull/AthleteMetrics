import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { SecurityMetricsService } from '../security-metrics-service';
import { db } from '../../db';
import { users, organizations } from '@shared/schema';
import { securityEvents } from '@shared/enhanced-auth-schema';
import { eq, or, isNull, gte } from 'drizzle-orm';

describe('SecurityMetricsService', () => {
  let securityMetricsService: SecurityMetricsService;
  let testUserId1: string;
  let testUserId2: string;
  let testOrgId: string;
  let testStartTime: Date;

  beforeAll(async () => {
    // Safety check: prevent running tests against production database
    const dbUrl = process.env.DATABASE_URL || '';
    const allowTestDb = process.env.ALLOW_TEST_DATABASE === 'true';

    if (!dbUrl.includes('test') && !dbUrl.includes('localhost') && !allowTestDb) {
      throw new Error('DATABASE_URL must include "test" or "localhost" for safety. Running tests against production is forbidden. Set ALLOW_TEST_DATABASE=true for known testing databases.');
    }
  });

  beforeEach(async () => {
    securityMetricsService = new SecurityMetricsService();

    // Wait a bit to ensure timestamp separation between tests
    await new Promise(resolve => setTimeout(resolve, 10));

    // Clean up any lingering security events from previous tests
    // Delete events from the last hour to ensure clean slate
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await db.delete(securityEvents).where(gte(securityEvents.createdAt, oneHourAgo));

    // Mark the start time for cleanup AFTER the pre-cleanup
    testStartTime = new Date();

    // Create unique suffix to avoid race conditions
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: `Test Security Org ${uniqueSuffix}`,
      description: 'Test organization for security metrics tests',
    }).returning();
    testOrgId = org.id;

    // Create test users
    const [user1] = await db.insert(users).values({
      username: `testuser1_${uniqueSuffix}`,
      emails: ['testuser1@example.com'],
      password: 'hashedpassword',
      firstName: 'Test',
      lastName: 'User1',
      fullName: 'Test User1',
      isSiteAdmin: false,
    }).returning();
    testUserId1 = user1.id;

    const [user2] = await db.insert(users).values({
      username: `testuser2_${uniqueSuffix}`,
      emails: ['testuser2@example.com'],
      password: 'hashedpassword',
      firstName: 'Test',
      lastName: 'User2',
      fullName: 'Test User2',
      isSiteAdmin: false,
    }).returning();
    testUserId2 = user2.id;
  });

  afterEach(async () => {
    // Clean up test data - delete security events created during this test
    // Use timestamp-based cleanup to avoid affecting other tests
    if (testStartTime) {
      await db.delete(securityEvents).where(
        gte(securityEvents.createdAt, testStartTime)
      );
    }
    // Delete test users
    if (testUserId1) {
      await db.delete(users).where(eq(users.id, testUserId1));
    }
    if (testUserId2) {
      await db.delete(users).where(eq(users.id, testUserId2));
    }
    // Delete test organization
    if (testOrgId) {
      await db.delete(organizations).where(eq(organizations.id, testOrgId));
    }
  });

  describe('getMetrics', () => {
    it('should return zero counts when no 403 errors exist', async () => {
      const metrics = await securityMetricsService.getMetrics(60);

      expect(metrics.total403Count).toBe(0);
      expect(metrics.errorsByUser).toHaveLength(0);
      expect(metrics.errorsByIP).toHaveLength(0);
      expect(metrics.suspiciousPatterns).toHaveLength(0);
      expect(metrics.timeWindowMinutes).toBe(60);
    });

    it('should return correct count for 403 errors within time window', async () => {
      // Insert 403 errors within the time window
      const now = new Date();
      await db.insert(securityEvents).values([
        {
          userId: testUserId1,
          eventType: 'authorization_failed',
          eventData: JSON.stringify({ resource: '/api/teams/123' }),
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0',
          severity: 'warning',
          createdAt: new Date(now.getTime() - 30 * 60 * 1000), // 30 minutes ago
        },
        {
          userId: testUserId1,
          eventType: 'authorization_failed',
          eventData: JSON.stringify({ resource: '/api/teams/456' }),
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0',
          severity: 'warning',
          createdAt: new Date(now.getTime() - 45 * 60 * 1000), // 45 minutes ago
        },
      ]);

      const metrics = await securityMetricsService.getMetrics(60);

      expect(metrics.total403Count).toBe(2);
      expect(metrics.timeWindowMinutes).toBe(60);
    });

    it('should exclude 403 errors outside the time window', async () => {
      const now = new Date();
      await db.insert(securityEvents).values([
        {
          userId: testUserId1,
          eventType: 'authorization_failed',
          eventData: JSON.stringify({ resource: '/api/teams/123' }),
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0',
          severity: 'warning',
          createdAt: new Date(now.getTime() - 30 * 60 * 1000), // 30 minutes ago (within window)
        },
        {
          userId: testUserId1,
          eventType: 'authorization_failed',
          eventData: JSON.stringify({ resource: '/api/teams/456' }),
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0',
          severity: 'warning',
          createdAt: new Date(now.getTime() - 90 * 60 * 1000), // 90 minutes ago (outside 60min window)
        },
      ]);

      const metrics = await securityMetricsService.getMetrics(60);

      expect(metrics.total403Count).toBe(1); // Only the recent one
    });

    it('should exclude non-authorization_failed events', async () => {
      const now = new Date();
      await db.insert(securityEvents).values([
        {
          userId: testUserId1,
          eventType: 'authorization_failed',
          eventData: JSON.stringify({ resource: '/api/teams/123' }),
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0',
          severity: 'warning',
          createdAt: now,
        },
        {
          userId: testUserId1,
          eventType: 'login_success',
          eventData: JSON.stringify({}),
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0',
          severity: 'info',
          createdAt: now,
        },
      ]);

      const metrics = await securityMetricsService.getMetrics(60);

      expect(metrics.total403Count).toBe(1); // Only authorization_failed
    });

    it('should group errors by user correctly', async () => {
      const now = new Date();
      await db.insert(securityEvents).values([
        {
          userId: testUserId1,
          eventType: 'authorization_failed',
          eventData: JSON.stringify({ resource: '/api/teams/123' }),
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0',
          severity: 'warning',
          createdAt: now,
        },
        {
          userId: testUserId1,
          eventType: 'authorization_failed',
          eventData: JSON.stringify({ resource: '/api/teams/456' }),
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0',
          severity: 'warning',
          createdAt: now,
        },
        {
          userId: testUserId2,
          eventType: 'authorization_failed',
          eventData: JSON.stringify({ resource: '/api/teams/789' }),
          ipAddress: '192.168.1.200',
          userAgent: 'Mozilla/5.0',
          severity: 'warning',
          createdAt: now,
        },
      ]);

      const metrics = await securityMetricsService.getMetrics(60);

      expect(metrics.errorsByUser).toHaveLength(2);

      // Find the user with 2 errors (testUserId1)
      const user1Errors = metrics.errorsByUser.find(u => u.userId === testUserId1);
      expect(user1Errors).toBeDefined();
      expect(user1Errors?.count).toBe(2);

      // Find the user with 1 error (testUserId2)
      const user2Errors = metrics.errorsByUser.find(u => u.userId === testUserId2);
      expect(user2Errors).toBeDefined();
      expect(user2Errors?.count).toBe(1);
    });

    it('should group errors by IP address correctly', async () => {
      const now = new Date();
      await db.insert(securityEvents).values([
        {
          userId: testUserId1,
          eventType: 'authorization_failed',
          eventData: JSON.stringify({ resource: '/api/teams/123' }),
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0',
          severity: 'warning',
          createdAt: now,
        },
        {
          userId: testUserId2,
          eventType: 'authorization_failed',
          eventData: JSON.stringify({ resource: '/api/teams/456' }),
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0',
          severity: 'warning',
          createdAt: now,
        },
        {
          userId: testUserId2,
          eventType: 'authorization_failed',
          eventData: JSON.stringify({ resource: '/api/teams/789' }),
          ipAddress: '192.168.1.200',
          userAgent: 'Mozilla/5.0',
          severity: 'warning',
          createdAt: now,
        },
      ]);

      const metrics = await securityMetricsService.getMetrics(60);

      expect(metrics.errorsByIP).toHaveLength(2);

      // Find the IP with 2 errors
      const ip1Errors = metrics.errorsByIP.find(ip => ip.ipAddress === '192.168.1.100');
      expect(ip1Errors).toBeDefined();
      expect(ip1Errors?.count).toBe(2);

      // Find the IP with 1 error
      const ip2Errors = metrics.errorsByIP.find(ip => ip.ipAddress === '192.168.1.200');
      expect(ip2Errors).toBeDefined();
      expect(ip2Errors?.count).toBe(1);
    });

    it('should detect high frequency IP patterns (>10 failures)', async () => {
      const now = new Date();
      const events = [];

      // Create 15 failures from the same IP
      for (let i = 0; i < 15; i++) {
        events.push({
          userId: testUserId1,
          eventType: 'authorization_failed' as const,
          eventData: JSON.stringify({ resource: `/api/teams/${i}` }),
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0',
          severity: 'warning' as const,
          createdAt: now,
        });
      }

      await db.insert(securityEvents).values(events);

      const metrics = await securityMetricsService.getMetrics(60);

      expect(metrics.suspiciousPatterns.length).toBeGreaterThan(0);

      const highFreqIPPattern = metrics.suspiciousPatterns.find(
        p => p.type === 'high_frequency_ip' && p.identifier === '192.168.1.100'
      );

      expect(highFreqIPPattern).toBeDefined();
      expect(highFreqIPPattern?.count).toBe(15);
      expect(highFreqIPPattern?.severity).toBe('low'); // 15 is between 10-20
    });

    it('should detect medium severity IP patterns (>20 failures)', async () => {
      const now = new Date();
      const events = [];

      // Create 25 failures from the same IP
      for (let i = 0; i < 25; i++) {
        events.push({
          userId: testUserId1,
          eventType: 'authorization_failed' as const,
          eventData: JSON.stringify({ resource: `/api/teams/${i}` }),
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0',
          severity: 'warning' as const,
          createdAt: now,
        });
      }

      await db.insert(securityEvents).values(events);

      const metrics = await securityMetricsService.getMetrics(60);

      const highFreqIPPattern = metrics.suspiciousPatterns.find(
        p => p.type === 'high_frequency_ip' && p.identifier === '192.168.1.100'
      );

      expect(highFreqIPPattern).toBeDefined();
      expect(highFreqIPPattern?.severity).toBe('medium'); // 25 is between 20-50
    });

    it('should detect high severity IP patterns (>50 failures)', async () => {
      const now = new Date();
      const events = [];

      // Create 60 failures from the same IP
      for (let i = 0; i < 60; i++) {
        events.push({
          userId: testUserId1,
          eventType: 'authorization_failed' as const,
          eventData: JSON.stringify({ resource: `/api/teams/${i}` }),
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0',
          severity: 'warning' as const,
          createdAt: now,
        });
      }

      await db.insert(securityEvents).values(events);

      const metrics = await securityMetricsService.getMetrics(60);

      const highFreqIPPattern = metrics.suspiciousPatterns.find(
        p => p.type === 'high_frequency_ip' && p.identifier === '192.168.1.100'
      );

      expect(highFreqIPPattern).toBeDefined();
      expect(highFreqIPPattern?.severity).toBe('high'); // >50
    });

    it('should detect high frequency user patterns (>5 failures)', async () => {
      const now = new Date();
      const events = [];

      // Create 8 failures from the same user
      for (let i = 0; i < 8; i++) {
        events.push({
          userId: testUserId1,
          eventType: 'authorization_failed' as const,
          eventData: JSON.stringify({ resource: `/api/teams/${i}` }),
          ipAddress: `192.168.1.${i}`, // Different IPs
          userAgent: 'Mozilla/5.0',
          severity: 'warning' as const,
          createdAt: now,
        });
      }

      await db.insert(securityEvents).values(events);

      const metrics = await securityMetricsService.getMetrics(60);

      const highFreqUserPattern = metrics.suspiciousPatterns.find(
        p => p.type === 'high_frequency_user' && p.identifier === testUserId1
      );

      expect(highFreqUserPattern).toBeDefined();
      expect(highFreqUserPattern?.count).toBe(8);
      expect(highFreqUserPattern?.severity).toBe('low'); // 8 is between 5-10
    });

    it('should detect medium severity user patterns (>10 failures)', async () => {
      const now = new Date();
      const events = [];

      // Create 15 failures from the same user
      for (let i = 0; i < 15; i++) {
        events.push({
          userId: testUserId1,
          eventType: 'authorization_failed' as const,
          eventData: JSON.stringify({ resource: `/api/teams/${i}` }),
          ipAddress: `192.168.1.${i}`, // Different IPs
          userAgent: 'Mozilla/5.0',
          severity: 'warning' as const,
          createdAt: now,
        });
      }

      await db.insert(securityEvents).values(events);

      const metrics = await securityMetricsService.getMetrics(60);

      const highFreqUserPattern = metrics.suspiciousPatterns.find(
        p => p.type === 'high_frequency_user' && p.identifier === testUserId1
      );

      expect(highFreqUserPattern).toBeDefined();
      expect(highFreqUserPattern?.severity).toBe('medium'); // 15 is between 10-20
    });

    it('should detect high severity user patterns (>20 failures)', async () => {
      const now = new Date();
      const events = [];

      // Create 25 failures from the same user
      for (let i = 0; i < 25; i++) {
        events.push({
          userId: testUserId1,
          eventType: 'authorization_failed' as const,
          eventData: JSON.stringify({ resource: `/api/teams/${i}` }),
          ipAddress: `192.168.1.${i % 100}`, // Different IPs
          userAgent: 'Mozilla/5.0',
          severity: 'warning' as const,
          createdAt: now,
        });
      }

      await db.insert(securityEvents).values(events);

      const metrics = await securityMetricsService.getMetrics(60);

      const highFreqUserPattern = metrics.suspiciousPatterns.find(
        p => p.type === 'high_frequency_user' && p.identifier === testUserId1
      );

      expect(highFreqUserPattern).toBeDefined();
      expect(highFreqUserPattern?.severity).toBe('high'); // >20
    });

    it('should support custom time windows', async () => {
      const now = new Date();
      await db.insert(securityEvents).values([
        {
          userId: testUserId1,
          eventType: 'authorization_failed',
          eventData: JSON.stringify({ resource: '/api/teams/123' }),
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0',
          severity: 'warning',
          createdAt: new Date(now.getTime() - 10 * 60 * 1000), // 10 minutes ago
        },
        {
          userId: testUserId1,
          eventType: 'authorization_failed',
          eventData: JSON.stringify({ resource: '/api/teams/456' }),
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0',
          severity: 'warning',
          createdAt: new Date(now.getTime() - 25 * 60 * 1000), // 25 minutes ago
        },
      ]);

      // 15-minute window should only include the first event
      const metrics15 = await securityMetricsService.getMetrics(15);
      expect(metrics15.total403Count).toBe(1);
      expect(metrics15.timeWindowMinutes).toBe(15);

      // 30-minute window should include both events
      const metrics30 = await securityMetricsService.getMetrics(30);
      expect(metrics30.total403Count).toBe(2);
      expect(metrics30.timeWindowMinutes).toBe(30);
    });

    it('should handle null userId in security events', async () => {
      const now = new Date();
      await db.insert(securityEvents).values([
        {
          userId: null, // Unauthenticated attempt
          eventType: 'authorization_failed',
          eventData: JSON.stringify({ resource: '/api/teams/123' }),
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0',
          severity: 'warning',
          createdAt: now,
        },
      ]);

      const metrics = await securityMetricsService.getMetrics(60);

      expect(metrics.total403Count).toBe(1);
      expect(metrics.errorsByUser).toHaveLength(1);
      expect(metrics.errorsByUser[0].userId).toBeNull();
      expect(metrics.errorsByUser[0].count).toBe(1);
    });

    it('should order results by count descending', async () => {
      const now = new Date();
      const events = [];

      // User 1: 5 failures
      for (let i = 0; i < 5; i++) {
        events.push({
          userId: testUserId1,
          eventType: 'authorization_failed' as const,
          eventData: JSON.stringify({ resource: `/api/teams/${i}` }),
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0',
          severity: 'warning' as const,
          createdAt: now,
        });
      }

      // User 2: 10 failures
      for (let i = 0; i < 10; i++) {
        events.push({
          userId: testUserId2,
          eventType: 'authorization_failed' as const,
          eventData: JSON.stringify({ resource: `/api/teams/${i}` }),
          ipAddress: '192.168.1.200',
          userAgent: 'Mozilla/5.0',
          severity: 'warning' as const,
          createdAt: now,
        });
      }

      await db.insert(securityEvents).values(events);

      const metrics = await securityMetricsService.getMetrics(60);

      // First result should be user2 with 10 errors (higher count)
      expect(metrics.errorsByUser[0].userId).toBe(testUserId2);
      expect(metrics.errorsByUser[0].count).toBe(10);

      // Second result should be user1 with 5 errors
      expect(metrics.errorsByUser[1].userId).toBe(testUserId1);
      expect(metrics.errorsByUser[1].count).toBe(5);
    });
  });
});
