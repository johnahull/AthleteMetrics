/**
 * Audit Logging Tests
 *
 * Tests for authorization failure logging helper
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logAuthorizationFailure } from '../audit-logging';
import { storage } from '../../storage';

// Mock storage
vi.mock('../../storage', () => ({
  storage: {
    createSecurityEvent: vi.fn(),
  },
}));

describe('logAuthorizationFailure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call createSecurityEvent with correct parameters for authenticated user', async () => {
    const userId = 'user-123';
    const action = 'read';
    const resource = 'athlete';
    const context = {
      attemptedOrgId: 'org-456',
      userOrgIds: ['org-789'],
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
      route: '/api/athletes/123',
      method: 'GET',
    };

    // Mock successful security event creation
    vi.mocked(storage.createSecurityEvent).mockResolvedValue(undefined);

    // Call the function (fire-and-forget, so we don't await)
    logAuthorizationFailure(userId, action, resource, context);

    // Wait a tick for async operation to start
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(storage.createSecurityEvent).toHaveBeenCalledWith({
      eventType: 'authorization_failed',
      userId: 'user-123',
      severity: 'warning',
      eventData: JSON.stringify({
        action: 'read',
        resource: 'athlete',
        attemptedOrgId: 'org-456',
        userOrgIds: ['org-789'],
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        route: '/api/athletes/123',
        method: 'GET',
      }),
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    });
  });

  it('should handle unauthenticated users (undefined userId)', async () => {
    const userId = undefined;
    const action = 'read';
    const resource = 'athlete';
    const context = {
      attemptedOrgId: 'org-456',
      ipAddress: '10.0.0.1',
      userAgent: 'curl/7.0',
      route: '/api/athletes/123',
      method: 'GET',
    };

    vi.mocked(storage.createSecurityEvent).mockResolvedValue(undefined);

    logAuthorizationFailure(userId, action, resource, context);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(storage.createSecurityEvent).toHaveBeenCalledWith({
      eventType: 'authorization_failed',
      userId: null, // undefined is converted to null
      severity: 'warning',
      eventData: JSON.stringify({
        action: 'read',
        resource: 'athlete',
        attemptedOrgId: 'org-456',
        ipAddress: '10.0.0.1',
        userAgent: 'curl/7.0',
        route: '/api/athletes/123',
        method: 'GET',
      }),
      ipAddress: '10.0.0.1',
      userAgent: 'curl/7.0',
    });
  });

  it('should handle minimal context (only required fields)', async () => {
    const userId = 'user-123';
    const action = 'delete';
    const resource = 'measurement';
    const context = {
      // No optional fields
    };

    vi.mocked(storage.createSecurityEvent).mockResolvedValue(undefined);

    logAuthorizationFailure(userId, action, resource, context);

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(storage.createSecurityEvent).toHaveBeenCalledWith({
      eventType: 'authorization_failed',
      userId: 'user-123',
      severity: 'warning',
      eventData: JSON.stringify({
        action: 'delete',
        resource: 'measurement',
      }),
      ipAddress: 'unknown', // undefined is converted to 'unknown' placeholder
      userAgent: null, // undefined is converted to null
    });
  });

  it('should handle errors gracefully without throwing (fire-and-forget)', async () => {
    const userId = 'user-123';
    const action = 'read';
    const resource = 'athlete';
    const context = {
      ipAddress: '192.168.1.1',
    };

    // Mock createSecurityEvent to reject
    vi.mocked(storage.createSecurityEvent).mockRejectedValue(new Error('Database error'));

    // Spy on console.error
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Should not throw despite the error
    expect(() => {
      logAuthorizationFailure(userId, action, resource, context);
    }).not.toThrow();

    // Wait for async error handling
    await new Promise(resolve => setTimeout(resolve, 50));

    // Verify error was logged to console (prefix matches implementation)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[security:audit] Failed to log authorization failure:',
      expect.any(Error)
    );

    consoleErrorSpy.mockRestore();
  });

  it('should use fire-and-forget pattern (non-blocking)', () => {
    const userId = 'user-123';
    const action = 'read';
    const resource = 'athlete';
    const context = {
      ipAddress: '192.168.1.1',
    };

    // Mock a slow operation
    vi.mocked(storage.createSecurityEvent).mockImplementation(
      () => new Promise(resolve => setTimeout(resolve, 1000))
    );

    const startTime = Date.now();

    // Call the function
    logAuthorizationFailure(userId, action, resource, context);

    const endTime = Date.now();

    // Should return immediately (< 50ms), not wait for the async operation
    expect(endTime - startTime).toBeLessThan(50);
  });

  it('should include all context fields in eventData', async () => {
    const userId = 'user-123';
    const action = 'update';
    const resource = 'team';
    const context = {
      attemptedOrgId: 'org-abc',
      userOrgIds: ['org-def', 'org-ghi'],
      ipAddress: '203.0.113.0',
      userAgent: 'Mobile Safari',
      route: '/api/teams/456',
      method: 'PUT',
    };

    vi.mocked(storage.createSecurityEvent).mockResolvedValue(undefined);

    logAuthorizationFailure(userId, action, resource, context);

    await new Promise(resolve => setTimeout(resolve, 10));

    const call = vi.mocked(storage.createSecurityEvent).mock.calls[0][0];
    const eventData = JSON.parse(call.eventData);

    expect(eventData).toEqual({
      action: 'update',
      resource: 'team',
      attemptedOrgId: 'org-abc',
      userOrgIds: ['org-def', 'org-ghi'],
      ipAddress: '203.0.113.0',
      userAgent: 'Mobile Safari',
      route: '/api/teams/456',
      method: 'PUT',
    });
  });
});
