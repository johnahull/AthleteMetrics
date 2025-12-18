/**
 * Integration tests for derived metric API routes
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { registerMetricRoutes } from '../routes/metric-routes';
import { db } from '../db';
import { siteMetrics, users, organizations } from '@shared/schema';
import { eq } from 'drizzle-orm';

describe('Metric Routes - Derived Metrics', () => {
  let app: express.Express;
  let testUserId: string;
  let testOrgId: string;
  let sessionCookie: string;

  beforeEach(async () => {
    // Create Express app with session
    app = express();
    app.use(express.json());
    app.use(
      session({
        secret: 'test-secret',
        resave: false,
        saveUninitialized: false,
      })
    );

    // Mock authentication middleware
    app.use((req, res, next) => {
      if (sessionCookie) {
        req.session.user = {
          id: testUserId,
          isSiteAdmin: true,
        };
      }
      next();
    });

    registerMetricRoutes(app);

    // Create test organization
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const [org] = await db.insert(organizations).values({
      name: `Test Org ${uniqueSuffix}`,
      description: 'Test organization for metric tests',
    }).returning();
    testOrgId = org.id;

    // Create test site admin user
    const [user] = await db.insert(users).values({
      username: `admin${uniqueSuffix}`,
      emails: ['admin@test.com'],
      password: 'hashedpassword',
      firstName: 'Admin',
      lastName: 'User',
      fullName: 'Admin User',
      isSiteAdmin: true,
    }).returning();
    testUserId = user.id;

    sessionCookie = 'test-session';
  });

  afterEach(async () => {
    // Cleanup in reverse dependency order
    // Delete test metrics first (they may reference users)
    await db.delete(siteMetrics).where(eq(siteMetrics.createdBy, testUserId));

    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
    if (testOrgId) {
      await db.delete(organizations).where(eq(organizations.id, testOrgId));
    }
  });

  describe('POST /api/metrics/validate-formula', () => {
    beforeEach(async () => {
      // Delete any existing test metrics to avoid conflicts
      await db.delete(siteMetrics).where(eq(siteMetrics.createdBy, testUserId));

      // Create some test metrics for formula validation
      await db.insert(siteMetrics).values([
        {
          code: 'TEST_METRIC_A',
          label: 'Test Metric A',
          unit: 's',
          metricType: 'lower_is_better',
          isActive: true,
          createdBy: testUserId,
        },
        {
          code: 'TEST_METRIC_B',
          label: 'Test Metric B',
          unit: 'in',
          metricType: 'higher_is_better',
          isActive: true,
          createdBy: testUserId,
        },
      ]);
    });

    it('should return valid for a good formula', async () => {
      const response = await request(app)
        .post('/api/metrics/validate-formula')
        .send({
          formula: '10 / TEST_METRIC_A * 2.045',
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        valid: true,
        errors: [],
        referencedMetrics: ['test_metric_a'], // Normalized to lowercase
      });
    });

    it('should return errors for a formula with invalid syntax', async () => {
      const response = await request(app)
        .post('/api/metrics/validate-formula')
        .send({
          formula: '10 / (',
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        valid: false,
        errors: expect.arrayContaining([
          expect.stringContaining('Invalid formula syntax'),
        ]),
      });
    });

    it('should return errors for a formula with unknown metric', async () => {
      const response = await request(app)
        .post('/api/metrics/validate-formula')
        .send({
          formula: '10 / UNKNOWN_METRIC',
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        valid: false,
        errors: expect.arrayContaining([
          expect.stringContaining('Unknown metric: unknown_metric'), // Normalized to lowercase
        ]),
      });
    });

    it('should exclude specified metric code from validation', async () => {
      const response = await request(app)
        .post('/api/metrics/validate-formula')
        .send({
          formula: '10 / TEST_METRIC_A',
          excludeMetricCode: 'TEST_METRIC_A',
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        valid: false,
        errors: expect.arrayContaining([
          expect.stringContaining('Unknown metric: test_metric_a'), // Normalized to lowercase
        ]),
      });
    });

    it('should validate formulas with multiple metrics', async () => {
      const response = await request(app)
        .post('/api/metrics/validate-formula')
        .send({
          formula: 'TEST_METRIC_B / TEST_METRIC_A',
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        valid: true,
        errors: [],
        referencedMetrics: expect.arrayContaining(['test_metric_b', 'test_metric_a']), // Normalized to lowercase
      });
    });
  });

  describe('GET /api/metrics/:code/dependencies', () => {
    beforeEach(async () => {
      // Delete any existing test metrics to avoid conflicts
      await db.delete(siteMetrics).where(eq(siteMetrics.createdBy, testUserId));

      // Create metric hierarchy:
      // TEST_DERIVED_1 depends on TEST_SOURCE_1
      // TEST_DERIVED_2 depends on TEST_SOURCE_2 and TEST_DERIVED_1
      await db.insert(siteMetrics).values([
        {
          code: 'TEST_SOURCE_1',
          label: 'Test Source 1',
          unit: 's',
          metricType: 'lower_is_better',
          isActive: true,
          isDerived: false,
          createdBy: testUserId,
        },
        {
          code: 'TEST_SOURCE_2',
          label: 'Test Source 2',
          unit: 'in',
          metricType: 'higher_is_better',
          isActive: true,
          isDerived: false,
          createdBy: testUserId,
        },
        {
          code: 'TEST_DERIVED_1',
          label: 'Test Derived 1',
          unit: 'score',
          metricType: 'higher_is_better',
          isActive: true,
          isDerived: true,
          formula: '10 / TEST_SOURCE_1 * 100',
          dependentMetrics: ['TEST_SOURCE_1'],
          createdBy: testUserId,
        },
        {
          code: 'TEST_DERIVED_2',
          label: 'Test Derived 2',
          unit: 'index',
          metricType: 'higher_is_better',
          isActive: true,
          isDerived: true,
          formula: 'TEST_SOURCE_2 * TEST_DERIVED_1',
          dependentMetrics: ['TEST_SOURCE_2', 'TEST_DERIVED_1'],
          createdBy: testUserId,
        },
      ]);
    });

    it('should return dependency graph for a source metric', async () => {
      const response = await request(app)
        .get('/api/metrics/TEST_SOURCE_1/dependencies');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        metric: 'TEST_SOURCE_1',
        dependsOn: [],
        dependedOnBy: expect.arrayContaining(['TEST_DERIVED_1']),
      });
    });

    it('should return dependency graph for a derived metric', async () => {
      const response = await request(app)
        .get('/api/metrics/TEST_DERIVED_1/dependencies');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        metric: 'TEST_DERIVED_1',
        dependsOn: ['TEST_SOURCE_1'],
        dependedOnBy: expect.arrayContaining(['TEST_DERIVED_2']),
      });
    });

    it('should return empty arrays for a metric with no dependencies', async () => {
      const response = await request(app)
        .get('/api/metrics/TEST_SOURCE_2/dependencies');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        metric: 'TEST_SOURCE_2',
        dependsOn: [],
        dependedOnBy: expect.arrayContaining(['TEST_DERIVED_2']),
      });
    });

    it('should handle non-existent metric', async () => {
      const response = await request(app)
        .get('/api/metrics/NON_EXISTENT/dependencies');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        metric: null,
        dependsOn: [],
        dependedOnBy: [],
      });
    });
  });

  describe('PATCH /api/metrics/:code - Derived metric validation', () => {
    let baseMetricCode: string;

    beforeEach(async () => {
      // Delete any existing test metrics to avoid conflicts
      await db.delete(siteMetrics).where(eq(siteMetrics.createdBy, testUserId));

      // Create a base metric
      await db.insert(siteMetrics).values({
        code: 'TEST_BASE_METRIC',
        label: 'Test Base Metric',
        unit: 's',
        metricType: 'lower_is_better',
        isActive: true,
        isDerived: false,
        createdBy: testUserId,
      });
      baseMetricCode = 'TEST_BASE_METRIC';
    });

    it('should reject derived metric without formula', async () => {
      const response = await request(app)
        .patch(`/api/metrics/${baseMetricCode}`)
        .send({
          isDerived: true,
          // Missing formula
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        message: expect.stringContaining('Formula'),
      });
    });

    it('should detect circular dependencies', async () => {
      // Create TEST_CHILD that depends on TEST_BASE_METRIC
      await db.insert(siteMetrics).values({
        code: 'TEST_CHILD',
        label: 'Test Child',
        unit: 'score',
        metricType: 'higher_is_better',
        isActive: true,
        isDerived: true,
        formula: '10 / TEST_BASE_METRIC',
        dependentMetrics: ['TEST_BASE_METRIC'],
        createdBy: testUserId,
      });

      // Try to update TEST_BASE_METRIC to depend on TEST_CHILD (circular!)
      const response = await request(app)
        .patch('/api/metrics/TEST_BASE_METRIC')
        .send({
          isDerived: true,
          formula: 'TEST_CHILD * 2',
          dependentMetrics: ['TEST_CHILD'],
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        message: expect.stringContaining('Circular'),
      });
    });

    it('should accept valid derived metric update', async () => {
      // Create another metric to reference
      await db.insert(siteMetrics).values({
        code: 'TEST_REF_METRIC',
        label: 'Test Reference Metric',
        unit: 's',
        metricType: 'lower_is_better',
        isActive: true,
        isDerived: false,
        createdBy: testUserId,
      });

      const response = await request(app)
        .patch(`/api/metrics/${baseMetricCode}`)
        .send({
          isDerived: true,
          formula: '10 / TEST_REF_METRIC',
          dependentMetrics: ['TEST_REF_METRIC'],
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        code: baseMetricCode,
        isDerived: true,
        formula: '10 / TEST_REF_METRIC',
        dependentMetrics: ['TEST_REF_METRIC'],
      });
    });

    it('should validate formula syntax on update', async () => {
      const response = await request(app)
        .patch(`/api/metrics/${baseMetricCode}`)
        .send({
          isDerived: true,
          formula: '10 / (',
          dependentMetrics: [],
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        message: expect.stringContaining('Invalid formula'),
      });
    });
  });
});
