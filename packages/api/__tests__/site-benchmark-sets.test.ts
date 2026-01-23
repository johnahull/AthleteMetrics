import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import express, { Express } from 'express';
import session from 'express-session';
import request from 'supertest';
import { db } from '../db';
import {
  benchmarkSets,
  benchmarkSetItems,
  siteBenchmarks,
  siteMetrics,
  organizations,
  users,
} from '@shared/schema';
import { eq, isNull, and } from 'drizzle-orm';
import { registerBenchmarkSetRoutes } from '../routes/benchmark-set-routes';

/**
 * Site-Level Benchmark Sets API Integration Tests
 *
 * These tests verify the site-admin-only endpoints for managing
 * benchmark sets at the site level (organizationId = NULL).
 */

describe('Site Benchmark Sets API', () => {
  let app: Express;
  let siteAdminUserId: string;
  let regularUserId: string;
  let testOrgId: string;
  let testMetricCode: string;
  let testSiteBenchmarkId: string;
  let uniqueSuffix: string;
  let createdSetIds: string[] = [];
  let createdBenchmarkIds: string[] = [];

  // Helper to create authenticated session for site admin
  const createSiteAdminAgent = () => {
    const agent = request.agent(app);
    return agent;
  };

  // Helper to make requests as site admin
  const asSiteAdmin = (agent: any) => {
    return agent.set('Cookie', [`test-user-id=${siteAdminUserId};test-is-site-admin=true`]);
  };

  // Helper to make requests as regular user
  const asRegularUser = (agent: any) => {
    return agent.set('Cookie', [`test-user-id=${regularUserId};test-is-site-admin=false`]);
  };

  beforeAll(async () => {
    // Safety check: prevent running tests against production database
    const dbUrl = process.env.DATABASE_URL || '';
    const allowTestDb = process.env.ALLOW_TEST_DATABASE === 'true';

    if (!dbUrl.includes('test') && !dbUrl.includes('localhost') && !allowTestDb) {
      throw new Error('DATABASE_URL must include "test" or "localhost" for safety.');
    }
  });

  beforeEach(async () => {
    createdSetIds = [];
    createdBenchmarkIds = [];
    uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create test organization
    const [org] = await db.insert(organizations).values({
      name: `Test Org Site Sets ${uniqueSuffix}`,
      description: 'Test organization for site benchmark set tests',
    }).returning();
    testOrgId = org.id;

    // Create site admin user
    const [siteAdmin] = await db.insert(users).values({
      username: `siteadmin-sets-${uniqueSuffix}`,
      emails: [`siteadmin-${uniqueSuffix}@example.com`],
      password: 'hashedpassword',
      firstName: 'Site',
      lastName: 'Admin',
      fullName: 'Site Admin',
      isSiteAdmin: true,
    }).returning();
    siteAdminUserId = siteAdmin.id;

    // Create regular user
    const [regularUser] = await db.insert(users).values({
      username: `regularuser-${uniqueSuffix}`,
      emails: [`regular-${uniqueSuffix}@example.com`],
      password: 'hashedpassword',
      firstName: 'Regular',
      lastName: 'User',
      fullName: 'Regular User',
      isSiteAdmin: false,
    }).returning();
    regularUserId = regularUser.id;

    // Create or use existing test metric
    testMetricCode = 'FLY10_TIME';
    try {
      await db.insert(siteMetrics).values({
        code: testMetricCode,
        label: '10-Yard Fly Time',
        category: 'speed',
        unit: 's',
        lowerIsBetter: true,
        isSystemDefault: true,
        isActive: true,
      }).onConflictDoNothing();
    } catch {
      // Metric already exists
    }

    // Create a site benchmark for testing
    const [siteBenchmark] = await db.insert(siteBenchmarks).values({
      metricCode: testMetricCode,
      name: `Site Benchmark ${uniqueSuffix}`,
      benchmarkValue: '1.50',
      comparisonOperator: 'lte',
      isActive: true,
      createdBy: siteAdminUserId,
    }).returning();
    testSiteBenchmarkId = siteBenchmark.id;
    createdBenchmarkIds.push(siteBenchmark.id);

    // Setup Express app with test session handling
    app = express();
    app.use(express.json());

    // Test session middleware that reads from cookies
    app.use((req, res, next) => {
      const cookies = req.headers.cookie || '';
      const userIdMatch = cookies.match(/test-user-id=([^;]+)/);
      const isSiteAdminMatch = cookies.match(/test-is-site-admin=([^;]+)/);

      if (userIdMatch) {
        const userId = userIdMatch[1];
        const isSiteAdmin = isSiteAdminMatch?.[1] === 'true';

        req.session = {
          user: {
            id: userId,
            isSiteAdmin,
            role: isSiteAdmin ? 'site_admin' : 'athlete',
          },
        } as any;
      }
      next();
    });

    // Register routes
    registerBenchmarkSetRoutes(app);
  });

  afterEach(async () => {
    // Clean up created sets
    for (const setId of createdSetIds) {
      await db.delete(benchmarkSets).where(eq(benchmarkSets.id, setId)).catch(() => {});
    }

    // Clean up created benchmarks
    for (const benchmarkId of createdBenchmarkIds) {
      await db.delete(siteBenchmarks).where(eq(siteBenchmarks.id, benchmarkId)).catch(() => {});
    }

    // Clean up test data
    await db.delete(organizations).where(eq(organizations.id, testOrgId)).catch(() => {});
    await db.delete(users).where(eq(users.id, siteAdminUserId)).catch(() => {});
    await db.delete(users).where(eq(users.id, regularUserId)).catch(() => {});
  });

  // ===========================================================================
  // LIST SITE BENCHMARK SETS
  // ===========================================================================
  describe('GET /api/site-benchmark-sets', () => {
    it('should list site-level benchmark sets for site admin', async () => {
      // Create a site-level set
      const [set] = await db.insert(benchmarkSets).values({
        organizationId: null, // Site-level
        name: `Site Set ${uniqueSuffix}`,
        description: 'Test site-level set',
        isActive: true,
        createdBy: siteAdminUserId,
      }).returning();
      createdSetIds.push(set.id);

      const agent = createSiteAdminAgent();
      const res = await asSiteAdmin(agent.get('/api/site-benchmark-sets'));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((s: any) => s.id === set.id)).toBe(true);
    });

    it('should return 403 for non-site-admin', async () => {
      const agent = createSiteAdminAgent();
      const res = await asRegularUser(agent.get('/api/site-benchmark-sets'));

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Site admin');
    });

    it('should return 401 for unauthenticated request', async () => {
      const res = await request(app).get('/api/site-benchmark-sets');

      expect(res.status).toBe(401);
    });

    it('should filter inactive sets by default', async () => {
      // Create active and inactive sets
      const [activeSet] = await db.insert(benchmarkSets).values({
        organizationId: null,
        name: `Active Set ${uniqueSuffix}`,
        isActive: true,
        createdBy: siteAdminUserId,
      }).returning();
      createdSetIds.push(activeSet.id);

      const [inactiveSet] = await db.insert(benchmarkSets).values({
        organizationId: null,
        name: `Inactive Set ${uniqueSuffix}`,
        isActive: false,
        createdBy: siteAdminUserId,
      }).returning();
      createdSetIds.push(inactiveSet.id);

      const agent = createSiteAdminAgent();
      const res = await asSiteAdmin(agent.get('/api/site-benchmark-sets'));

      expect(res.status).toBe(200);
      expect(res.body.some((s: any) => s.id === activeSet.id)).toBe(true);
      expect(res.body.some((s: any) => s.id === inactiveSet.id)).toBe(false);
    });

    it('should include inactive sets when includeInactive=true', async () => {
      const [inactiveSet] = await db.insert(benchmarkSets).values({
        organizationId: null,
        name: `Inactive Set Included ${uniqueSuffix}`,
        isActive: false,
        createdBy: siteAdminUserId,
      }).returning();
      createdSetIds.push(inactiveSet.id);

      const agent = createSiteAdminAgent();
      const res = await asSiteAdmin(agent.get('/api/site-benchmark-sets?includeInactive=true'));

      expect(res.status).toBe(200);
      expect(res.body.some((s: any) => s.id === inactiveSet.id)).toBe(true);
    });
  });

  // ===========================================================================
  // CREATE SITE BENCHMARK SET
  // ===========================================================================
  describe('POST /api/site-benchmark-sets', () => {
    it('should create site-level benchmark set for site admin', async () => {
      const agent = createSiteAdminAgent();
      const res = await asSiteAdmin(
        agent.post('/api/site-benchmark-sets')
          .send({
            name: `New Site Set ${uniqueSuffix}`,
            description: 'A new site-level set',
            sport: 'Soccer',
          })
      );

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe(`New Site Set ${uniqueSuffix}`);
      expect(res.body.organizationId).toBeNull();
      expect(res.body.createdBy).toBe(siteAdminUserId);

      createdSetIds.push(res.body.id);
    });

    it('should return 403 for non-site-admin', async () => {
      const agent = createSiteAdminAgent();
      const res = await asRegularUser(
        agent.post('/api/site-benchmark-sets')
          .send({ name: 'Should Fail' })
      );

      expect(res.status).toBe(403);
    });

    it('should return 400 for missing name', async () => {
      const agent = createSiteAdminAgent();
      const res = await asSiteAdmin(
        agent.post('/api/site-benchmark-sets')
          .send({ description: 'No name provided' })
      );

      expect(res.status).toBe(400);
    });

    it('should return 409 for duplicate name', async () => {
      // Create first set
      const [existing] = await db.insert(benchmarkSets).values({
        organizationId: null,
        name: `Duplicate Name ${uniqueSuffix}`,
        createdBy: siteAdminUserId,
      }).returning();
      createdSetIds.push(existing.id);

      const agent = createSiteAdminAgent();
      const res = await asSiteAdmin(
        agent.post('/api/site-benchmark-sets')
          .send({ name: `Duplicate Name ${uniqueSuffix}` })
      );

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('already exists');
    });
  });

  // ===========================================================================
  // GET SINGLE SITE BENCHMARK SET
  // ===========================================================================
  describe('GET /api/site-benchmark-sets/:setId', () => {
    it('should get site-level set with items', async () => {
      // Create set
      const [set] = await db.insert(benchmarkSets).values({
        organizationId: null,
        name: `Get Set Test ${uniqueSuffix}`,
        createdBy: siteAdminUserId,
      }).returning();
      createdSetIds.push(set.id);

      // Add item
      await db.insert(benchmarkSetItems).values({
        setId: set.id,
        benchmarkId: testSiteBenchmarkId,
        benchmarkType: 'site',
        displayOrder: 0,
      });

      const agent = createSiteAdminAgent();
      const res = await asSiteAdmin(agent.get(`/api/site-benchmark-sets/${set.id}`));

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(set.id);
      expect(res.body.name).toBe(`Get Set Test ${uniqueSuffix}`);
      expect(res.body.items).toBeDefined();
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].benchmarkId).toBe(testSiteBenchmarkId);
    });

    it('should return 404 for non-existent set', async () => {
      const agent = createSiteAdminAgent();
      const res = await asSiteAdmin(agent.get('/api/site-benchmark-sets/non-existent-id'));

      expect(res.status).toBe(404);
    });

    it('should return 404 for org-level set (not site-level)', async () => {
      // Create an org-level set
      const [orgSet] = await db.insert(benchmarkSets).values({
        organizationId: testOrgId,
        name: `Org Set ${uniqueSuffix}`,
        createdBy: siteAdminUserId,
      }).returning();
      createdSetIds.push(orgSet.id);

      const agent = createSiteAdminAgent();
      const res = await asSiteAdmin(agent.get(`/api/site-benchmark-sets/${orgSet.id}`));

      expect(res.status).toBe(404);
    });
  });

  // ===========================================================================
  // UPDATE SITE BENCHMARK SET
  // ===========================================================================
  describe('PATCH /api/site-benchmark-sets/:setId', () => {
    it('should update site-level set', async () => {
      const [set] = await db.insert(benchmarkSets).values({
        organizationId: null,
        name: `Original Name ${uniqueSuffix}`,
        createdBy: siteAdminUserId,
      }).returning();
      createdSetIds.push(set.id);

      const agent = createSiteAdminAgent();
      const res = await asSiteAdmin(
        agent.patch(`/api/site-benchmark-sets/${set.id}`)
          .send({
            name: `Updated Name ${uniqueSuffix}`,
            description: 'Updated description',
          })
      );

      expect(res.status).toBe(200);
      expect(res.body.name).toBe(`Updated Name ${uniqueSuffix}`);
      expect(res.body.description).toBe('Updated description');
    });

    it('should return 403 for non-site-admin', async () => {
      const [set] = await db.insert(benchmarkSets).values({
        organizationId: null,
        name: `Protected Set ${uniqueSuffix}`,
        createdBy: siteAdminUserId,
      }).returning();
      createdSetIds.push(set.id);

      const agent = createSiteAdminAgent();
      const res = await asRegularUser(
        agent.patch(`/api/site-benchmark-sets/${set.id}`)
          .send({ name: 'Hacked' })
      );

      expect(res.status).toBe(403);
    });

    it('should return 404 for non-existent set', async () => {
      const agent = createSiteAdminAgent();
      const res = await asSiteAdmin(
        agent.patch('/api/site-benchmark-sets/non-existent-id')
          .send({ name: 'New Name' })
      );

      expect(res.status).toBe(404);
    });
  });

  // ===========================================================================
  // DELETE SITE BENCHMARK SET
  // ===========================================================================
  describe('DELETE /api/site-benchmark-sets/:setId', () => {
    it('should delete site-level set', async () => {
      const [set] = await db.insert(benchmarkSets).values({
        organizationId: null,
        name: `To Delete ${uniqueSuffix}`,
        createdBy: siteAdminUserId,
      }).returning();

      const agent = createSiteAdminAgent();
      const res = await asSiteAdmin(agent.delete(`/api/site-benchmark-sets/${set.id}`));

      expect(res.status).toBe(204);

      // Verify deleted
      const [deleted] = await db.select().from(benchmarkSets).where(eq(benchmarkSets.id, set.id));
      expect(deleted).toBeUndefined();
    });

    it('should return 403 for non-site-admin', async () => {
      const [set] = await db.insert(benchmarkSets).values({
        organizationId: null,
        name: `Protected Delete ${uniqueSuffix}`,
        createdBy: siteAdminUserId,
      }).returning();
      createdSetIds.push(set.id);

      const agent = createSiteAdminAgent();
      const res = await asRegularUser(agent.delete(`/api/site-benchmark-sets/${set.id}`));

      expect(res.status).toBe(403);
    });
  });

  // ===========================================================================
  // ADD BENCHMARK TO SITE SET
  // ===========================================================================
  describe('POST /api/site-benchmark-sets/:setId/items', () => {
    it('should add site benchmark to site set', async () => {
      const [set] = await db.insert(benchmarkSets).values({
        organizationId: null,
        name: `Add Items Set ${uniqueSuffix}`,
        createdBy: siteAdminUserId,
      }).returning();
      createdSetIds.push(set.id);

      const agent = createSiteAdminAgent();
      const res = await asSiteAdmin(
        agent.post(`/api/site-benchmark-sets/${set.id}/items`)
          .send({
            benchmarkId: testSiteBenchmarkId,
            benchmarkType: 'site',
          })
      );

      expect(res.status).toBe(201);
      expect(res.body.benchmarkId).toBe(testSiteBenchmarkId);
      expect(res.body.benchmarkType).toBe('site');
      expect(res.body.benchmark).toBeDefined();
    });

    it('should reject custom benchmark for site set', async () => {
      const [set] = await db.insert(benchmarkSets).values({
        organizationId: null,
        name: `Reject Custom ${uniqueSuffix}`,
        createdBy: siteAdminUserId,
      }).returning();
      createdSetIds.push(set.id);

      const agent = createSiteAdminAgent();
      const res = await asSiteAdmin(
        agent.post(`/api/site-benchmark-sets/${set.id}/items`)
          .send({
            benchmarkId: 'some-custom-benchmark-id',
            benchmarkType: 'custom',
          })
      );

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('site benchmarks only');
    });

    it('should return 409 for duplicate benchmark in set', async () => {
      const [set] = await db.insert(benchmarkSets).values({
        organizationId: null,
        name: `Duplicate Item ${uniqueSuffix}`,
        createdBy: siteAdminUserId,
      }).returning();
      createdSetIds.push(set.id);

      // Add first item
      await db.insert(benchmarkSetItems).values({
        setId: set.id,
        benchmarkId: testSiteBenchmarkId,
        benchmarkType: 'site',
        displayOrder: 0,
      });

      const agent = createSiteAdminAgent();
      const res = await asSiteAdmin(
        agent.post(`/api/site-benchmark-sets/${set.id}/items`)
          .send({
            benchmarkId: testSiteBenchmarkId,
            benchmarkType: 'site',
          })
      );

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('already in the set');
    });

    it('should return 404 for non-existent benchmark', async () => {
      const [set] = await db.insert(benchmarkSets).values({
        organizationId: null,
        name: `Missing Benchmark ${uniqueSuffix}`,
        createdBy: siteAdminUserId,
      }).returning();
      createdSetIds.push(set.id);

      const agent = createSiteAdminAgent();
      const res = await asSiteAdmin(
        agent.post(`/api/site-benchmark-sets/${set.id}/items`)
          .send({
            benchmarkId: 'non-existent-benchmark-id',
            benchmarkType: 'site',
          })
      );

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('benchmark not found');
    });
  });

  // ===========================================================================
  // REMOVE BENCHMARK FROM SITE SET
  // ===========================================================================
  describe('DELETE /api/site-benchmark-sets/:setId/items/:itemId', () => {
    it('should remove benchmark from site set', async () => {
      const [set] = await db.insert(benchmarkSets).values({
        organizationId: null,
        name: `Remove Item Set ${uniqueSuffix}`,
        createdBy: siteAdminUserId,
      }).returning();
      createdSetIds.push(set.id);

      const [item] = await db.insert(benchmarkSetItems).values({
        setId: set.id,
        benchmarkId: testSiteBenchmarkId,
        benchmarkType: 'site',
        displayOrder: 0,
      }).returning();

      const agent = createSiteAdminAgent();
      const res = await asSiteAdmin(agent.delete(`/api/site-benchmark-sets/${set.id}/items/${item.id}`));

      expect(res.status).toBe(204);

      // Verify deleted
      const [deleted] = await db.select().from(benchmarkSetItems).where(eq(benchmarkSetItems.id, item.id));
      expect(deleted).toBeUndefined();
    });

    it('should return 404 for non-existent item', async () => {
      const [set] = await db.insert(benchmarkSets).values({
        organizationId: null,
        name: `Missing Item Set ${uniqueSuffix}`,
        createdBy: siteAdminUserId,
      }).returning();
      createdSetIds.push(set.id);

      const agent = createSiteAdminAgent();
      const res = await asSiteAdmin(agent.delete(`/api/site-benchmark-sets/${set.id}/items/non-existent-item`));

      expect(res.status).toBe(404);
    });
  });

  // ===========================================================================
  // REORDER ITEMS IN SITE SET
  // ===========================================================================
  describe('PATCH /api/site-benchmark-sets/:setId/items/reorder', () => {
    it('should reorder items in site set', async () => {
      const [set] = await db.insert(benchmarkSets).values({
        organizationId: null,
        name: `Reorder Set ${uniqueSuffix}`,
        createdBy: siteAdminUserId,
      }).returning();
      createdSetIds.push(set.id);

      // Create another benchmark
      const [secondBenchmark] = await db.insert(siteBenchmarks).values({
        metricCode: testMetricCode,
        name: `Second Benchmark ${uniqueSuffix}`,
        benchmarkValue: '2.00',
        comparisonOperator: 'lte',
        createdBy: siteAdminUserId,
      }).returning();
      createdBenchmarkIds.push(secondBenchmark.id);

      // Add two items
      const [item1] = await db.insert(benchmarkSetItems).values({
        setId: set.id,
        benchmarkId: testSiteBenchmarkId,
        benchmarkType: 'site',
        displayOrder: 0,
      }).returning();

      const [item2] = await db.insert(benchmarkSetItems).values({
        setId: set.id,
        benchmarkId: secondBenchmark.id,
        benchmarkType: 'site',
        displayOrder: 1,
      }).returning();

      const agent = createSiteAdminAgent();
      const res = await asSiteAdmin(
        agent.patch(`/api/site-benchmark-sets/${set.id}/items/reorder`)
          .send({
            items: [
              { id: item2.id, displayOrder: 0 },
              { id: item1.id, displayOrder: 1 },
            ],
          })
      );

      expect(res.status).toBe(200);
      expect(res.body.items).toBeDefined();
      expect(res.body.items[0].id).toBe(item2.id);
      expect(res.body.items[1].id).toBe(item1.id);
    });
  });

  // ===========================================================================
  // AUTHORIZATION TESTS
  // ===========================================================================
  describe('Authorization', () => {
    it('should return 403 for all endpoints when user is not site admin', async () => {
      const [set] = await db.insert(benchmarkSets).values({
        organizationId: null,
        name: `Auth Test Set ${uniqueSuffix}`,
        createdBy: siteAdminUserId,
      }).returning();
      createdSetIds.push(set.id);

      const agent = createSiteAdminAgent();

      // Test all endpoints
      const endpoints = [
        { method: 'get', path: '/api/site-benchmark-sets' },
        { method: 'post', path: '/api/site-benchmark-sets' },
        { method: 'get', path: `/api/site-benchmark-sets/${set.id}` },
        { method: 'patch', path: `/api/site-benchmark-sets/${set.id}` },
        { method: 'delete', path: `/api/site-benchmark-sets/${set.id}` },
        { method: 'post', path: `/api/site-benchmark-sets/${set.id}/items` },
        { method: 'delete', path: `/api/site-benchmark-sets/${set.id}/items/some-id` },
        { method: 'patch', path: `/api/site-benchmark-sets/${set.id}/items/reorder` },
      ];

      for (const endpoint of endpoints) {
        let req;
        switch (endpoint.method) {
          case 'get':
            req = agent.get(endpoint.path);
            break;
          case 'post':
            req = agent.post(endpoint.path).send({});
            break;
          case 'patch':
            req = agent.patch(endpoint.path).send({});
            break;
          case 'delete':
            req = agent.delete(endpoint.path);
            break;
        }

        const res = await asRegularUser(req);
        expect(res.status).toBe(403);
      }
    });
  });
});
