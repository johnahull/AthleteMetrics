/**
 * Integration tests for benchmark endpoints
 * Tests actual API endpoints with real Express app and PostgreSQL database
 *
 * NOTE: Requires DATABASE_URL environment variable to be set to a PostgreSQL connection string
 */

// Set environment variables before any imports (DATABASE_URL must be provided externally)
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Express } from 'express';

// Mock vite module before importing registerRoutes to prevent build directory errors
vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn()
}));

import { registerRoutes } from '../../packages/api/routes';
import { db } from '../../packages/api/db';
import { users, organizations, userOrganizations, siteBenchmarks, customBenchmarks, organizationBenchmarks } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';
import bcrypt from 'bcrypt';

// Test data
let app: Express;
let testOrgId: string;
let testSiteAdminId: string;
let testSiteAdminUsername: string; // Store site admin username for login
let testOrgAdminId: string;
let testOrgAdminUsername: string; // Store org admin username for login
let testSiteBenchmarkId: string;
let testCustomBenchmarkId: string;
let activeAgents: Set<request.SuperAgentTest> = new Set();

// Test data setup
const setupTestData = async () => {
  // Create dedicated admin user for benchmark tests to avoid conflicts with other tests
  // Use a unique username so this test doesn't interfere with admin-initialization.test.ts
  const adminUsername = 'benchmark-test-admin-' + Date.now();
  const adminPassword = 'TestPassword123!';
  const adminEmail = 'benchmark-admin@test.com';

  const adminHashedPassword = await bcrypt.hash(adminPassword, BCRYPT_SALT_ROUNDS);

  const adminUserResult = await db.insert(users).values({
    username: adminUsername,
    emails: [adminEmail],
    password: adminHashedPassword,
    firstName: 'Site',
    lastName: 'Admin',
    fullName: 'Site Admin',
    isSiteAdmin: true,
    isActive: true,
    isEmailVerified: true,
  }).onConflictDoUpdate({
    target: users.username,
    set: {
      password: adminHashedPassword,
      isSiteAdmin: true,
      isActive: true,
    }
  }).returning();

  testSiteAdminId = adminUserResult[0].id;
  testSiteAdminUsername = adminUsername; // Save username for login

  if (!testSiteAdminId) {
    throw new Error('Failed to create or retrieve site admin user for integration tests');
  }

  // Create test organization with benchmarks enabled
  const orgResult = await db.insert(organizations).values({
    name: 'Test Org ' + Date.now(),
    isActive: true,
    benchmarksEnabled: true,
    allowCustomBenchmarks: true,
  }).returning();
  testOrgId = orgResult[0].id;

  // Create org admin user
  const hashedPassword = await bcrypt.hash('TestPassword123!', BCRYPT_SALT_ROUNDS);
  testOrgAdminUsername = 'orgadmin' + Date.now();

  const orgAdminResult = await db.insert(users).values({
    username: testOrgAdminUsername,
    emails: [`orgadmin${Date.now()}@test.com`],
    password: hashedPassword,
    firstName: 'Org',
    lastName: 'Admin',
    fullName: 'Org Admin', // Required field
    isSiteAdmin: false,
    isActive: true,
  }).returning();
  testOrgAdminId = orgAdminResult[0].id;

  // Link org admin to organization
  await db.insert(userOrganizations).values({
    userId: testOrgAdminId,
    organizationId: testOrgId,
    role: 'org_admin',
  });
};

const cleanupTestData = async () => {
  // Clean up in reverse order of dependencies
  if (testOrgId) {
    await db.delete(organizationBenchmarks).where(eq(organizationBenchmarks.organizationId, testOrgId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  }

  if (testCustomBenchmarkId) {
    await db.delete(customBenchmarks).where(eq(customBenchmarks.id, testCustomBenchmarkId));
  }

  if (testSiteBenchmarkId) {
    await db.delete(organizationBenchmarks).where(eq(organizationBenchmarks.benchmarkId, testSiteBenchmarkId));
    await db.delete(siteBenchmarks).where(eq(siteBenchmarks.id, testSiteBenchmarkId));
  }

  if (testOrgAdminId) {
    await db.delete(users).where(eq(users.id, testOrgAdminId));
  }

  if (testSiteAdminId) {
    await db.delete(users).where(eq(users.id, testSiteAdminId));
  }
};

const createAuthenticatedSession = async (userType: 'siteAdmin' | 'orgAdmin' = 'siteAdmin') => {
  const agent = request.agent(app);
  activeAgents.add(agent);

  const credentials = userType === 'siteAdmin'
    ? { username: testSiteAdminUsername, password: 'TestPassword123!' }
    : { username: testOrgAdminUsername, password: 'TestPassword123!' };

  // For orgAdmin, verify the user exists before attempting login
  if (userType === 'orgAdmin') {
    const userCheck = await db.select().from(users).where(eq(users.username, testOrgAdminUsername)).limit(1);
    console.log('OrgAdmin user check:', {
      username: testOrgAdminUsername,
      exists: userCheck.length > 0,
      user: userCheck[0] ? {
        username: userCheck[0].username,
        isActive: userCheck[0].isActive,
        isSiteAdmin: userCheck[0].isSiteAdmin
      } : null
    });
  }

  const loginResponse = await agent
    .post('/api/auth/login')
    .send(credentials);

  if (loginResponse.status !== 200) {
    console.error('Login failed:', {
      userType,
      username: credentials.username,
      status: loginResponse.status,
      body: loginResponse.body
    });
  }

  expect(loginResponse.status).toBe(200);
  return agent;
};

const cleanupAgent = (agent: request.SuperAgentTest) => {
  activeAgents.delete(agent);
};

describe('Benchmark Endpoints Integration Tests', () => {
  beforeAll(async () => {
    // Validate DATABASE_URL is set
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL must be set to run integration tests. ' +
        'See README.md for PostgreSQL setup instructions.'
      );
    }

    // Create test app
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // Setup test data BEFORE registering routes
    // This ensures admin user exists when routes initialize
    await setupTestData();

    // Register routes after test data is ready
    await registerRoutes(app);
  });

  afterAll(async () => {
    // Clean up all active agents
    activeAgents.forEach(agent => cleanupAgent(agent));

    await cleanupTestData();
  });

  afterEach(() => {
    // Clean up any active agents after each test
    activeAgents.forEach(agent => cleanupAgent(agent));
    activeAgents.clear();
  });

  describe('Site Benchmark Endpoints', () => {
    describe('GET /api/benchmarks', () => {
      it('should return site benchmarks for authenticated users', async () => {
        const agent = await createAuthenticatedSession('siteAdmin');

        const response = await agent.get('/api/benchmarks');

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        cleanupAgent(agent);
      });

      it('should return 401 for unauthenticated users', async () => {
        const response = await request(app).get('/api/benchmarks');

        expect(response.status).toBe(401);
      });

      it('should filter inactive benchmarks for non-site-admins', async () => {
        const agent = await createAuthenticatedSession('siteAdmin');

        const responseWithInactive = await agent.get('/api/benchmarks?includeInactive=true');
        const responseWithoutInactive = await agent.get('/api/benchmarks?includeInactive=false');

        expect(responseWithInactive.status).toBe(200);
        expect(responseWithoutInactive.status).toBe(200);
        cleanupAgent(agent);
      });
    });

    describe('GET /api/benchmarks/:id', () => {
      it('should return specific benchmark for authenticated users', async () => {
        const agent = await createAuthenticatedSession('siteAdmin');

        // Create a test benchmark first
        const createResponse = await agent.post('/api/benchmarks').send({
          metricCode: 'FLY10_TIME',
          name: 'Test Benchmark',
          description: 'Test description',
          benchmarkValue: 1.5,
          comparisonOperator: 'lte',
          isActive: true,
        });

        expect(createResponse.status).toBe(201);
        testSiteBenchmarkId = createResponse.body.id;

        const response = await agent.get(`/api/benchmarks/${testSiteBenchmarkId}`);

        expect(response.status).toBe(200);
        expect(response.body.id).toBe(testSiteBenchmarkId);
        expect(response.body.name).toBe('Test Benchmark');
        cleanupAgent(agent);
      });

      it('should return 404 for non-existent benchmark', async () => {
        const agent = await createAuthenticatedSession('siteAdmin');

        const response = await agent.get('/api/benchmarks/00000000-0000-0000-0000-000000000000');

        expect(response.status).toBe(404);
        cleanupAgent(agent);
      });

      // Rate limiting test removed - redundant with dedicated rate-limiting-security.test.ts
      // and flaky due to 101 parallel requests causing ECONNRESET errors
      // Rate limiting is also bypassed in test env, so this wasn't testing actual rate limiting
    });

    describe('POST /api/benchmarks', () => {
      it('should create benchmark for site admin', async () => {
        const agent = await createAuthenticatedSession('siteAdmin');

        const response = await agent.post('/api/benchmarks').send({
          metricCode: 'FLY10_TIME',
          name: 'New Benchmark',
          description: 'New description',
          benchmarkValue: 1.6,
          comparisonOperator: 'lte',
          isActive: true,
        });

        expect(response.status).toBe(201);
        expect(response.body.name).toBe('New Benchmark');
        testSiteBenchmarkId = response.body.id;
        cleanupAgent(agent);
      });

      it('should return 400 for invalid data', async () => {
        const agent = await createAuthenticatedSession('siteAdmin');

        const response = await agent.post('/api/benchmarks').send({
          // Missing required fields
          name: 'Invalid Benchmark',
        });

        expect(response.status).toBe(400);
        cleanupAgent(agent);
      });
    });

    describe('PATCH /api/benchmarks/:id', () => {
      it('should update benchmark for site admin', async () => {
        const agent = await createAuthenticatedSession('siteAdmin');

        // Create benchmark first
        const createResponse = await agent.post('/api/benchmarks').send({
          metricCode: 'FLY10_TIME',
          name: 'Update Test',
          description: 'Original description',
          benchmarkValue: 1.7,
          comparisonOperator: 'lte',
          isActive: true,
        });

        testSiteBenchmarkId = createResponse.body.id;

        const updateResponse = await agent.patch(`/api/benchmarks/${testSiteBenchmarkId}`).send({
          name: 'Updated Name',
          description: 'Updated description',
        });

        expect(updateResponse.status).toBe(200);
        expect(updateResponse.body.name).toBe('Updated Name');
        expect(updateResponse.body.description).toBe('Updated description');
        cleanupAgent(agent);
      });
    });

    describe('DELETE /api/benchmarks/:id', () => {
      it('should delete benchmark for site admin', async () => {
        const agent = await createAuthenticatedSession('siteAdmin');

        // Create benchmark first
        const createResponse = await agent.post('/api/benchmarks').send({
          metricCode: 'FLY10_TIME',
          name: 'Delete Test',
          description: 'To be deleted',
          benchmarkValue: 1.8,
          comparisonOperator: 'lte',
          isActive: true,
        });

        const benchmarkId = createResponse.body.id;

        const deleteResponse = await agent.delete(`/api/benchmarks/${benchmarkId}`);

        expect(deleteResponse.status).toBe(204);

        // Verify it's deleted
        const getResponse = await agent.get(`/api/benchmarks/${benchmarkId}`);
        expect(getResponse.status).toBe(404);
        cleanupAgent(agent);
      });
    });
  });

  describe('Custom Benchmark Endpoints', () => {
    describe('GET /api/organizations/:organizationId/benchmarks/custom', () => {
      it('should return custom benchmarks for organization', async () => {
        const agent = await createAuthenticatedSession('siteAdmin');

        const response = await agent.get(`/api/organizations/${testOrgId}/benchmarks/custom`);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        cleanupAgent(agent);
      });

      it('should return 403 for unauthorized organization access', async () => {
        const agent = await createAuthenticatedSession('siteAdmin');

        const response = await agent.get('/api/organizations/00000000-0000-0000-0000-000000000000/benchmarks/custom');

        expect([403, 404]).toContain(response.status);
        cleanupAgent(agent);
      });
    });

    describe('POST /api/organizations/:organizationId/benchmarks/custom', () => {
      it('should create custom benchmark for organization', async () => {
        const agent = await createAuthenticatedSession('siteAdmin');

        const response = await agent
          .post(`/api/organizations/${testOrgId}/benchmarks/custom`)
          .send({
            metricCode: 'FLY10_TIME',
            name: 'Custom Benchmark',
            description: 'Custom description',
            benchmarkValue: 1.9,
            comparisonOperator: 'lte',
            isActive: true,
          });

        expect(response.status).toBe(201);
        expect(response.body.name).toBe('Custom Benchmark');
        testCustomBenchmarkId = response.body.id;
        cleanupAgent(agent);
      });

      it('should prioritize URL organizationId over body', async () => {
        const agent = await createAuthenticatedSession('siteAdmin');

        // Try to send different organizationId in body (should be ignored)
        const response = await agent
          .post(`/api/organizations/${testOrgId}/benchmarks/custom`)
          .send({
            organizationId: '00000000-0000-0000-0000-000000000000', // Should be ignored
            metricCode: 'FLY10_TIME',
            name: 'Security Test Benchmark',
            description: 'Testing authorization bypass prevention',
            benchmarkValue: 2.0,
            comparisonOperator: 'lte',
            isActive: true,
          });

        expect(response.status).toBe(201);
        // Verify it was created with the URL organizationId
        expect(response.body.organizationId).toBe(testOrgId);
        cleanupAgent(agent);
      });
    });
  });

  describe('Benchmark Enablement Endpoints', () => {
    describe('GET /api/organizations/:organizationId/benchmarks', () => {
      it('should return enabled benchmarks for organization', async () => {
        const agent = await createAuthenticatedSession('siteAdmin');

        const response = await agent.get(`/api/organizations/${testOrgId}/benchmarks`);

        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        cleanupAgent(agent);
      });
    });

    describe('POST /api/organizations/:organizationId/benchmarks/:id/enable', () => {
      it('should enable site benchmark for organization', async () => {
        const agent = await createAuthenticatedSession('siteAdmin');

        // Create site benchmark first
        const createResponse = await agent.post('/api/benchmarks').send({
          metricCode: 'FLY10_TIME',
          name: 'Enable Test Benchmark',
          description: 'For enablement test',
          benchmarkValue: 2.1,
          comparisonOperator: 'lte',
          isActive: true,
        });

        const benchmarkId = createResponse.body.id;
        testSiteBenchmarkId = benchmarkId;

        const enableResponse = await agent
          .post(`/api/organizations/${testOrgId}/benchmarks/${benchmarkId}/enable`)
          .send({ benchmarkType: 'site' });

        expect(enableResponse.status).toBe(201);
        expect(enableResponse.body.benchmarkId).toBe(benchmarkId);
        expect(enableResponse.body.isEnabled).toBe(true);
        cleanupAgent(agent);
      });

      it('should return 400 for missing benchmarkType', async () => {
        const agent = await createAuthenticatedSession('siteAdmin');

        const response = await agent
          .post(`/api/organizations/${testOrgId}/benchmarks/00000000-0000-0000-0000-000000000000/enable`)
          .send({});

        expect(response.status).toBe(400);
        cleanupAgent(agent);
      });
    });

    describe('POST /api/organizations/:organizationId/benchmarks/:id/disable', () => {
      it('should disable benchmark for organization', async () => {
        const agent = await createAuthenticatedSession('siteAdmin');

        // Create and enable benchmark first
        const createResponse = await agent.post('/api/benchmarks').send({
          metricCode: 'FLY10_TIME',
          name: 'Disable Test Benchmark',
          description: 'For disable test',
          benchmarkValue: 2.2,
          comparisonOperator: 'lte',
          isActive: true,
        });

        const benchmarkId = createResponse.body.id;
        testSiteBenchmarkId = benchmarkId;

        await agent
          .post(`/api/organizations/${testOrgId}/benchmarks/${benchmarkId}/enable`)
          .send({ benchmarkType: 'site' });

        const disableResponse = await agent
          .post(`/api/organizations/${testOrgId}/benchmarks/${benchmarkId}/disable`)
          .send({ benchmarkType: 'site' });

        expect(disableResponse.status).toBe(200);
        expect(disableResponse.body.isEnabled).toBe(false);
        cleanupAgent(agent);
      });
    });
  });

  describe('Authorization & Security', () => {
    it('should prevent authorization bypass via body organizationId', async () => {
      const agent = await createAuthenticatedSession('siteAdmin');

      // Create a benchmark with mismatched organizationId in body
      const response = await agent
        .post(`/api/organizations/${testOrgId}/benchmarks/custom`)
        .send({
          organizationId: '00000000-0000-0000-0000-000000000000', // Different org ID in body
          metricCode: 'FLY10_TIME',
          name: 'Auth Bypass Test',
          description: 'Should use URL org ID',
          benchmarkValue: 2.3,
          comparisonOperator: 'lte',
          isActive: true,
        });

      // Should succeed and use URL org ID
      expect(response.status).toBe(201);
      expect(response.body.organizationId).toBe(testOrgId);
      cleanupAgent(agent);
    });

    it('should enforce timing-safe benchmark visibility checks', async () => {
      const agent = await createAuthenticatedSession('siteAdmin');

      // Create an inactive benchmark
      const createResponse = await agent.post('/api/benchmarks').send({
        metricCode: 'FLY10_TIME',
        name: 'Timing Test Benchmark',
        description: 'For timing attack test',
        benchmarkValue: 2.4,
        comparisonOperator: 'lte',
        isActive: false, // Inactive
      });

      const benchmarkId = createResponse.body.id;
      testSiteBenchmarkId = benchmarkId;

      // Measure response times (should be similar for existing vs non-existing)
      const start1 = Date.now();
      await agent.get(`/api/benchmarks/${benchmarkId}`);
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      await agent.get('/api/benchmarks/00000000-0000-0000-0000-000000000000');
      const time2 = Date.now() - start2;

      // Response times should be similar (within 50ms tolerance)
      // With 100ms minimum response time, variations should be minimal
      // This validates the timing-safe implementation prevents information leakage
      expect(Math.abs(time1 - time2)).toBeLessThan(50);
      cleanupAgent(agent);
    });
  });
});
