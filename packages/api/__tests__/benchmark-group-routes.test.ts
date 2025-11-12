/**
 * Integration tests for benchmark group API routes (TDD approach)
 * Tests both site-level and organization-level benchmark groups
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { registerBenchmarkGroupRoutes } from '../routes/benchmark-group-routes';
import { db } from '../db';
import { users, organizations, siteBenchmarks, customBenchmarks, siteBenchmarkGroups, customBenchmarkGroups } from '@shared/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';

let app: express.Express;
let siteAdminCookie: string;
let orgAdminCookie: string;
let testOrgId: string;
let testSiteBenchmarkId: string;
let testCustomBenchmarkId: string;

beforeAll(async () => {
  // Setup Express app with session
  app = express();
  app.use(express.json());
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'test-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false },
    })
  );

  // Register routes
  registerBenchmarkGroupRoutes(app);

  // Create test users and organization
  const hashedPassword = await bcrypt.hash('password123', 10);

  const [siteAdmin] = await db
    .insert(users)
    .values({
      username: 'siteadmin-benchmarkgroup-test',
      emails: ['siteadmin-benchmarkgroup@test.com'],
      password: hashedPassword,
      firstName: 'Site',
      lastName: 'Admin',
      fullName: 'Site Admin',
      isSiteAdmin: true,
    })
    .returning();

  const [orgAdmin] = await db
    .insert(users)
    .values({
      username: 'orgadmin-benchmarkgroup-test',
      emails: ['orgadmin-benchmarkgroup@test.com'],
      password: hashedPassword,
      firstName: 'Org',
      lastName: 'Admin',
      fullName: 'Org Admin',
      isSiteAdmin: false,
    })
    .returning();

  const [org] = await db
    .insert(organizations)
    .values({
      name: 'Test Org Benchmark Groups',
      isActive: true,
      benchmarksEnabled: true,
      allowCustomBenchmarks: true,
    })
    .returning();

  testOrgId = org.id;

  // Create test benchmarks
  const [siteBenchmark] = await db
    .insert(siteBenchmarks)
    .values({
      metricCode: 'FLY10_TIME',
      name: 'Test Site Benchmark',
      benchmarkValue: '1.50',
      comparisonOperator: 'lte',
      isActive: true,
      createdBy: siteAdmin.id,
    })
    .returning();

  testSiteBenchmarkId = siteBenchmark.id;

  const [customBenchmark] = await db
    .insert(customBenchmarks)
    .values({
      organizationId: testOrgId,
      metricCode: 'VERTICAL_JUMP',
      name: 'Test Custom Benchmark',
      benchmarkValue: '30.00',
      comparisonOperator: 'gte',
      isActive: true,
      createdBy: orgAdmin.id,
    })
    .returning();

  testCustomBenchmarkId = customBenchmark.id;

  // Get session cookies
  const siteAdminRes = await request(app)
    .post('/api/test-login')
    .send({ userId: siteAdmin.id, isSiteAdmin: true });
  siteAdminCookie = siteAdminRes.headers['set-cookie'];

  const orgAdminRes = await request(app)
    .post('/api/test-login')
    .send({ userId: orgAdmin.id, organizationId: testOrgId });
  orgAdminCookie = orgAdminRes.headers['set-cookie'];
});

afterAll(async () => {
  // Cleanup
  await db.delete(siteBenchmarkGroups).where(eq(siteBenchmarkGroups.name, 'NCAA D1 Women Soccer'));
  await db.delete(customBenchmarkGroups).where(eq(customBenchmarkGroups.name, 'Custom Group Test'));
  await db.delete(siteBenchmarks).where(eq(siteBenchmarks.id, testSiteBenchmarkId));
  await db.delete(customBenchmarks).where(eq(customBenchmarks.id, testCustomBenchmarkId));
  await db.delete(organizations).where(eq(organizations.id, testOrgId));
  await db.delete(users).where(eq(users.username, 'siteadmin-benchmarkgroup-test'));
  await db.delete(users).where(eq(users.username, 'orgadmin-benchmarkgroup-test'));
});

describe('Site Benchmark Group Routes', () => {
  describe('POST /api/benchmark-groups', () => {
    it('should create a site benchmark group (site admin)', async () => {
      const res = await request(app)
        .post('/api/benchmark-groups')
        .set('Cookie', siteAdminCookie)
        .send({
          name: 'NCAA D1 Women Soccer',
          description: 'Benchmarks for NCAA Division 1 women\'s soccer',
          isActive: true,
          displayOrder: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('NCAA D1 Women Soccer');
      expect(res.body.isActive).toBe(true);
    });

    it('should reject creation by non-site-admin', async () => {
      const res = await request(app)
        .post('/api/benchmark-groups')
        .set('Cookie', orgAdminCookie)
        .send({
          name: 'Unauthorized Group',
          description: 'Should fail',
        });

      expect(res.status).toBe(403);
    });

    it('should validate required fields', async () => {
      const res = await request(app)
        .post('/api/benchmark-groups')
        .set('Cookie', siteAdminCookie)
        .send({
          description: 'Missing name',
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/benchmark-groups', () => {
    it('should list all site benchmark groups', async () => {
      const res = await request(app)
        .get('/api/benchmark-groups')
        .set('Cookie', siteAdminCookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('should include member benchmarks when requested', async () => {
      const res = await request(app)
        .get('/api/benchmark-groups?includeMembers=true')
        .set('Cookie', siteAdminCookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        expect(res.body[0]).toHaveProperty('benchmarks');
        expect(Array.isArray(res.body[0].benchmarks)).toBe(true);
      }
    });
  });

  describe('GET /api/benchmark-groups/:id', () => {
    let groupId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/benchmark-groups')
        .set('Cookie', siteAdminCookie)
        .send({
          name: 'Temp Group for Get Test',
          description: 'Temporary',
        });
      groupId = res.body.id;
    });

    it('should get a specific benchmark group', async () => {
      const res = await request(app)
        .get(`/api/benchmark-groups/${groupId}`)
        .set('Cookie', siteAdminCookie);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(groupId);
      expect(res.body.name).toBe('Temp Group for Get Test');
    });

    it('should return 404 for non-existent group', async () => {
      const res = await request(app)
        .get('/api/benchmark-groups/nonexistent-id')
        .set('Cookie', siteAdminCookie);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/benchmark-groups/:id', () => {
    let groupId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/benchmark-groups')
        .set('Cookie', siteAdminCookie)
        .send({
          name: 'Group to Update',
          description: 'Original',
        });
      groupId = res.body.id;
    });

    it('should update a benchmark group', async () => {
      const res = await request(app)
        .patch(`/api/benchmark-groups/${groupId}`)
        .set('Cookie', siteAdminCookie)
        .send({
          description: 'Updated description',
          isActive: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.description).toBe('Updated description');
      expect(res.body.isActive).toBe(false);
    });
  });

  describe('DELETE /api/benchmark-groups/:id', () => {
    let groupId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/benchmark-groups')
        .set('Cookie', siteAdminCookie)
        .send({
          name: 'Group to Delete',
          description: 'Will be deleted',
        });
      groupId = res.body.id;
    });

    it('should delete a benchmark group', async () => {
      const res = await request(app)
        .delete(`/api/benchmark-groups/${groupId}`)
        .set('Cookie', siteAdminCookie);

      expect(res.status).toBe(204);
    });
  });

  describe('POST /api/benchmark-groups/:id/benchmarks/:benchmarkId', () => {
    let groupId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/benchmark-groups')
        .set('Cookie', siteAdminCookie)
        .send({
          name: 'Group for Members',
          description: 'Testing member addition',
        });
      groupId = res.body.id;
    });

    it('should add a benchmark to a group', async () => {
      const res = await request(app)
        .post(`/api/benchmark-groups/${groupId}/benchmarks/${testSiteBenchmarkId}`)
        .set('Cookie', siteAdminCookie)
        .send({
          displayOrder: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.groupId).toBe(groupId);
      expect(res.body.benchmarkId).toBe(testSiteBenchmarkId);
    });

    it('should prevent duplicate benchmark in group', async () => {
      // Add once
      await request(app)
        .post(`/api/benchmark-groups/${groupId}/benchmarks/${testSiteBenchmarkId}`)
        .set('Cookie', siteAdminCookie);

      // Try to add again
      const res = await request(app)
        .post(`/api/benchmark-groups/${groupId}/benchmarks/${testSiteBenchmarkId}`)
        .set('Cookie', siteAdminCookie);

      expect(res.status).toBe(409);
    });
  });

  describe('DELETE /api/benchmark-groups/:id/benchmarks/:benchmarkId', () => {
    let groupId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/benchmark-groups')
        .set('Cookie', siteAdminCookie)
        .send({
          name: 'Group for Member Removal',
          description: 'Testing member removal',
        });
      groupId = res.body.id;

      // Add a benchmark
      await request(app)
        .post(`/api/benchmark-groups/${groupId}/benchmarks/${testSiteBenchmarkId}`)
        .set('Cookie', siteAdminCookie);
    });

    it('should remove a benchmark from a group', async () => {
      const res = await request(app)
        .delete(`/api/benchmark-groups/${groupId}/benchmarks/${testSiteBenchmarkId}`)
        .set('Cookie', siteAdminCookie);

      expect(res.status).toBe(204);
    });
  });
});

describe('Custom Benchmark Group Routes', () => {
  describe('POST /api/organizations/:orgId/benchmark-groups/custom', () => {
    it('should create a custom benchmark group', async () => {
      const res = await request(app)
        .post(`/api/organizations/${testOrgId}/benchmark-groups/custom`)
        .set('Cookie', orgAdminCookie)
        .send({
          name: 'Custom Group Test',
          description: 'Organization-specific group',
          isActive: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Custom Group Test');
      expect(res.body.organizationId).toBe(testOrgId);
    });

    it('should validate organization access', async () => {
      const res = await request(app)
        .post('/api/organizations/wrong-org-id/benchmark-groups/custom')
        .set('Cookie', orgAdminCookie)
        .send({
          name: 'Unauthorized Group',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/organizations/:orgId/benchmark-groups/custom', () => {
    it('should list custom benchmark groups for organization', async () => {
      const res = await request(app)
        .get(`/api/organizations/${testOrgId}/benchmark-groups/custom`)
        .set('Cookie', orgAdminCookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should include member benchmarks when requested', async () => {
      const res = await request(app)
        .get(`/api/organizations/${testOrgId}/benchmark-groups/custom?includeMembers=true`)
        .set('Cookie', orgAdminCookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
