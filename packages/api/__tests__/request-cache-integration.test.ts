/**
 * Integration test for request-level caching
 *
 * Tests that getUserOrganizations() caching works correctly in real route handlers.
 * Verifies that multiple calls within a single request use the cache instead of hitting the database.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { Request, Response } from 'express';
import { requestCacheMiddleware } from '../middleware/request-cache';
import { getCachedUserOrganizations } from '../helpers/cached-org-access';
import { storage } from '../storage';

// Mock storage
vi.mock('../storage', () => ({
  storage: {
    getUserOrganizations: vi.fn(),
  },
}));

describe('Request Cache Integration', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create Express app with request cache middleware
    app = express();
    app.use(express.json());
    app.use(requestCacheMiddleware);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should cache getUserOrganizations across multiple calls in a single request', async () => {
    const userId = 'user-123';
    const mockOrgs = [
      { organizationId: 'org-1', role: 'coach' },
      { organizationId: 'org-2', role: 'athlete' },
    ];

    // Mock storage to return data
    vi.mocked(storage.getUserOrganizations).mockResolvedValue(mockOrgs);

    // Create route that calls getCachedUserOrganizations multiple times
    app.get('/test-cache', async (req: Request, res: Response) => {
      try {
        // Simulate a route that calls getUserOrganizations multiple times
        // (like athlete-routes.ts does)
        const orgs1 = await getCachedUserOrganizations(req, userId);
        const orgs2 = await getCachedUserOrganizations(req, userId);
        const orgs3 = await getCachedUserOrganizations(req, userId);

        res.json({
          callCount: (storage.getUserOrganizations as any).mock.calls.length,
          orgs1Length: orgs1.length,
          orgs2Length: orgs2.length,
          orgs3Length: orgs3.length,
          allSameReference: orgs1 === orgs2 && orgs2 === orgs3,
        });
      } catch (error) {
        res.status(500).json({ error: (error as Error).message });
      }
    });

    const response = await request(app).get('/test-cache');

    expect(response.status).toBe(200);
    expect(response.body.callCount).toBe(1); // Storage should only be called once
    expect(response.body.orgs1Length).toBe(2);
    expect(response.body.orgs2Length).toBe(2);
    expect(response.body.orgs3Length).toBe(2);
    expect(response.body.allSameReference).toBe(true); // All should return same cached object
  });

  it('should not share cache between different requests', async () => {
    const userId = 'user-123';
    const mockOrgs = [{ organizationId: 'org-1', role: 'coach' }];

    vi.mocked(storage.getUserOrganizations).mockResolvedValue(mockOrgs);

    // Create route that uses cache
    app.get('/test-isolation', async (req: Request, res: Response) => {
      const orgs = await getCachedUserOrganizations(req, userId);
      res.json({ orgCount: orgs.length });
    });

    // Make two separate requests
    const response1 = await request(app).get('/test-isolation');
    const response2 = await request(app).get('/test-isolation');

    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);

    // Storage should be called twice (once per request, not cached across requests)
    expect(storage.getUserOrganizations).toHaveBeenCalledTimes(2);
  });

  it('should cache different users separately within same request', async () => {
    const userId1 = 'user-1';
    const userId2 = 'user-2';
    const orgs1 = [{ organizationId: 'org-1', role: 'coach' }];
    const orgs2 = [{ organizationId: 'org-2', role: 'athlete' }];

    vi.mocked(storage.getUserOrganizations)
      .mockResolvedValueOnce(orgs1)
      .mockResolvedValueOnce(orgs2);

    app.get('/test-multi-user', async (req: Request, res: Response) => {
      // Get orgs for both users
      const userOrgs1 = await getCachedUserOrganizations(req, userId1);
      const userOrgs2 = await getCachedUserOrganizations(req, userId2);

      // Call again - should use cache
      const userOrgs1Again = await getCachedUserOrganizations(req, userId1);
      const userOrgs2Again = await getCachedUserOrganizations(req, userId2);

      res.json({
        callCount: (storage.getUserOrganizations as any).mock.calls.length,
        user1Orgs: userOrgs1.length,
        user2Orgs: userOrgs2.length,
        user1Same: userOrgs1 === userOrgs1Again,
        user2Same: userOrgs2 === userOrgs2Again,
      });
    });

    const response = await request(app).get('/test-multi-user');

    expect(response.status).toBe(200);
    expect(response.body.callCount).toBe(2); // Once per user
    expect(response.body.user1Orgs).toBe(1);
    expect(response.body.user2Orgs).toBe(1);
    expect(response.body.user1Same).toBe(true);
    expect(response.body.user2Same).toBe(true);
  });

  it('should work correctly when request has no cache (graceful fallback)', async () => {
    const userId = 'user-123';
    const mockOrgs = [{ organizationId: 'org-1', role: 'coach' }];

    vi.mocked(storage.getUserOrganizations).mockResolvedValue(mockOrgs);

    // Create app WITHOUT request cache middleware
    const appNoCache = express();
    appNoCache.use(express.json());
    // Note: NOT using requestCacheMiddleware

    appNoCache.get('/test-no-cache', async (req: Request, res: Response) => {
      const orgs = await getCachedUserOrganizations(req, userId);
      res.json({ orgCount: orgs.length });
    });

    const response = await request(appNoCache).get('/test-no-cache');

    expect(response.status).toBe(200);
    expect(response.body.orgCount).toBe(1);
    // Should still call storage even without cache
    expect(storage.getUserOrganizations).toHaveBeenCalledTimes(1);
  });

  it('should demonstrate performance improvement with real scenario (8+ calls)', async () => {
    const userId = 'user-123';
    const mockOrgs = [
      { organizationId: 'org-1', role: 'coach' },
      { organizationId: 'org-2', role: 'athlete' },
    ];

    vi.mocked(storage.getUserOrganizations).mockResolvedValue(mockOrgs);

    // Simulate a complex route like athlete-routes.ts that makes many calls
    app.get('/test-realistic', async (req: Request, res: Response) => {
      // Simulate 8 calls like in athlete-routes.ts (sequentially to match real patterns)
      const result1 = await getCachedUserOrganizations(req, userId); // Call 1
      const result2 = await getCachedUserOrganizations(req, userId); // Call 2
      const result3 = await getCachedUserOrganizations(req, userId); // Call 3
      const result4 = await getCachedUserOrganizations(req, userId); // Call 4
      const result5 = await getCachedUserOrganizations(req, userId); // Call 5
      const result6 = await getCachedUserOrganizations(req, userId); // Call 6
      const result7 = await getCachedUserOrganizations(req, userId); // Call 7
      const result8 = await getCachedUserOrganizations(req, userId); // Call 8

      const results = [result1, result2, result3, result4, result5, result6, result7, result8];

      res.json({
        totalCalls: 8,
        dbQueryCount: (storage.getUserOrganizations as any).mock.calls.length,
        queriesAvoided: 8 - (storage.getUserOrganizations as any).mock.calls.length,
        allResultsValid: results.every(r => r.length === 2),
      });
    });

    const response = await request(app).get('/test-realistic');

    expect(response.status).toBe(200);
    expect(response.body.totalCalls).toBe(8);
    expect(response.body.dbQueryCount).toBe(1); // Only 1 DB query!
    expect(response.body.queriesAvoided).toBe(7); // 7 queries avoided
    expect(response.body.allResultsValid).toBe(true);
  });
});
