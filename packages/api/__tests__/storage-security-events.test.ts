/**
 * Storage Security Events Tests
 *
 * Tests for storage.createSecurityEvent implementation
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { storage } from '../storage';
import { db } from '../db';
import { securityEvents } from '@shared/enhanced-auth-schema';
import { eq, desc, isNotNull } from 'drizzle-orm';

describe('storage.createSecurityEvent', () => {
  let testUserId: string | null = null;

  // Create a test user before all tests
  beforeEach(async () => {
    // Create a test user for FK constraint
    const timestamp = Date.now();
    const testUser = await storage.createUser({
      username: `test-user-${timestamp}`,
      email: `test-${timestamp}@example.com`,
      password: 'test-password-123',
      role: 'athlete',
      firstName: 'Test',
      lastName: 'User',
    });
    testUserId = testUser.id;
  });

  // Clean up after each test
  afterEach(async () => {
    // Delete test security events
    await db.delete(securityEvents)
      .where(eq(securityEvents.eventType, 'authorization_failed'));

    // Delete test user
    if (testUserId) {
      await storage.hardDeleteUser(testUserId);
      testUserId = null;
    }
  });

  it('should insert security event into database with all fields', async () => {
    const event = {
      eventType: 'authorization_failed' as const,
      userId: testUserId!,
      severity: 'warning' as const,
      eventData: JSON.stringify({ action: 'read', resource: 'athlete' }),
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    };

    await storage.createSecurityEvent(event);

    // Verify event was inserted
    const inserted = await db.select()
      .from(securityEvents)
      .where(eq(securityEvents.userId, testUserId!))
      .orderBy(desc(securityEvents.createdAt))
      .limit(1);

    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      eventType: 'authorization_failed',
      userId: testUserId,
      severity: 'warning',
      eventData: JSON.stringify({ action: 'read', resource: 'athlete' }),
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    });
    expect(inserted[0].id).toBeDefined();
    expect(inserted[0].createdAt).toBeInstanceOf(Date);
  });

  it('should insert security event with null userId for unauthenticated requests', async () => {
    const event = {
      eventType: 'authorization_failed' as const,
      userId: undefined,
      severity: 'warning' as const,
      eventData: JSON.stringify({ action: 'read', resource: 'athlete' }),
      ipAddress: '10.0.0.1',
      userAgent: 'curl/7.0',
    };

    await storage.createSecurityEvent(event);

    // Verify event was inserted with null userId
    const inserted = await db.select()
      .from(securityEvents)
      .where(eq(securityEvents.ipAddress, '10.0.0.1'))
      .orderBy(desc(securityEvents.createdAt))
      .limit(1);

    expect(inserted).toHaveLength(1);
    expect(inserted[0].userId).toBeNull();
    expect(inserted[0].eventType).toBe('authorization_failed');
    expect(inserted[0].ipAddress).toBe('10.0.0.1');
  });

  it('should insert security event with minimal fields', async () => {
    const event = {
      eventType: 'authorization_failed' as const,
      userId: testUserId!,
      severity: 'warning' as const,
      eventData: JSON.stringify({ action: 'delete' }),
      ipAddress: '172.16.0.1',
      userAgent: undefined,
    };

    await storage.createSecurityEvent(event);

    // Verify event was inserted
    const inserted = await db.select()
      .from(securityEvents)
      .where(eq(securityEvents.userId, testUserId!))
      .orderBy(desc(securityEvents.createdAt))
      .limit(1);

    expect(inserted).toHaveLength(1);
    expect(inserted[0].userId).toBe(testUserId);
    expect(inserted[0].userAgent).toBeNull();
  });

  it('should handle critical severity level', async () => {
    const event = {
      eventType: 'authorization_failed' as const,
      userId: testUserId!,
      severity: 'critical' as const,
      eventData: JSON.stringify({ action: 'read', attempts: 10 }),
      ipAddress: '198.51.100.1',
      userAgent: 'Suspicious Bot',
    };

    await storage.createSecurityEvent(event);

    const inserted = await db.select()
      .from(securityEvents)
      .where(eq(securityEvents.userId, testUserId!))
      .orderBy(desc(securityEvents.createdAt))
      .limit(1);

    expect(inserted).toHaveLength(1);
    expect(inserted[0].severity).toBe('critical');
  });

  it('should store complex eventData as JSON string', async () => {
    const complexData = {
      action: 'read',
      resource: 'athlete',
      attemptedOrgId: 'org-123',
      userOrgIds: ['org-456', 'org-789'],
      route: '/api/athletes/123',
      method: 'GET',
      timestamp: new Date().toISOString(),
    };

    const event = {
      eventType: 'authorization_failed' as const,
      userId: testUserId!,
      severity: 'warning' as const,
      eventData: JSON.stringify(complexData),
      ipAddress: '203.0.113.1',
      userAgent: 'Test Agent',
    };

    await storage.createSecurityEvent(event);

    const inserted = await db.select()
      .from(securityEvents)
      .where(eq(securityEvents.userId, testUserId!))
      .orderBy(desc(securityEvents.createdAt))
      .limit(1);

    expect(inserted).toHaveLength(1);
    const parsedData = JSON.parse(inserted[0].eventData!);
    expect(parsedData).toEqual(complexData);
  });

  it('should auto-generate id and createdAt timestamp', async () => {
    const event = {
      eventType: 'authorization_failed' as const,
      userId: testUserId!,
      severity: 'info' as const,
      eventData: JSON.stringify({ test: true }),
      ipAddress: '192.0.2.1',
      userAgent: 'Test',
    };

    await storage.createSecurityEvent(event);

    const inserted = await db.select()
      .from(securityEvents)
      .where(eq(securityEvents.userId, testUserId!))
      .orderBy(desc(securityEvents.createdAt))
      .limit(1);

    expect(inserted).toHaveLength(1);

    // Verify id is auto-generated
    expect(inserted[0].id).toBeDefined();
    expect(typeof inserted[0].id).toBe('string');
    expect(inserted[0].id.length).toBeGreaterThan(0);

    // Verify createdAt is auto-generated and is a valid date
    expect(inserted[0].createdAt).toBeInstanceOf(Date);
    expect(inserted[0].createdAt.getTime()).toBeGreaterThan(0);

    // Verify it's a recent timestamp (within last year, not in the future by more than a day)
    const oneYearAgo = Date.now() - (365 * 24 * 60 * 60 * 1000);
    const oneDayFromNow = Date.now() + (24 * 60 * 60 * 1000);
    expect(inserted[0].createdAt.getTime()).toBeGreaterThan(oneYearAgo);
    expect(inserted[0].createdAt.getTime()).toBeLessThan(oneDayFromNow);
  });
});
