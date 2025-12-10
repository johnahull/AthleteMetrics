/**
 * Integration Tests for Automatic Metric Enablement on Organization Creation
 *
 * These tests verify that when a new organization is created, all active site metrics
 * that are available to the organization's type are automatically enabled.
 */

// Set environment variables BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { db } from '../../packages/api/db';
import { organizations, users, siteMetrics, organizationMetrics } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

// Mock vite module before importing registerRoutes
vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn()
}));

import { registerRoutes } from '../../packages/api/routes';

let app: Express;
let testSiteAdmin: any;
let authCookie: string;
const createdOrgIds: string[] = [];
const createdMetricCodes: string[] = [];

beforeAll(async () => {
  // Create Express app and register routes
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  // Get the admin user
  const adminUser = await db.select().from(users).where(eq(users.username, process.env.ADMIN_USER || 'admin')).limit(1);
  if (adminUser.length > 0) {
    testSiteAdmin = adminUser[0];
  } else {
    throw new Error('Admin user not found after initialization');
  }

  // Authenticate and get session cookie
  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({
      username: process.env.ADMIN_USER || 'admin',
      password: process.env.ADMIN_PASSWORD || 'TestPassword123!',
    });

  if (loginResponse.status !== 200 || !loginResponse.headers['set-cookie']) {
    throw new Error(
      `Login failed (status: ${loginResponse.status}). ` +
      `Ensure ADMIN_PASSWORD environment variable matches the initialized admin user password.`
    );
  }

  authCookie = loginResponse.headers['set-cookie'][0];
});

afterEach(async () => {
  // Clean up created organizations
  if (createdOrgIds.length > 0) {
    await db.delete(organizations).where(
      eq(organizations.id, createdOrgIds[createdOrgIds.length - 1])
    );
    createdOrgIds.pop();
  }

  // Clean up created metrics
  if (createdMetricCodes.length > 0) {
    await db.delete(siteMetrics).where(
      eq(siteMetrics.code, createdMetricCodes[createdMetricCodes.length - 1])
    );
    createdMetricCodes.pop();
  }
});

afterAll(async () => {
  // Cleanup any remaining test data
  for (const orgId of createdOrgIds) {
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }
  for (const metricCode of createdMetricCodes) {
    await db.delete(siteMetrics).where(eq(siteMetrics.code, metricCode));
  }
});

describe('Organization Creation with Automatic Metric Enablement', () => {
  it('should automatically enable all active site metrics when creating an organization', async () => {
    // Create test metrics
    const testMetric1Code = `TEST_METRIC_${Date.now()}_1`;
    const testMetric2Code = `TEST_METRIC_${Date.now()}_2`;

    await db.insert(siteMetrics).values([
      {
        code: testMetric1Code,
        label: 'Test Metric 1',
        unit: 's',
        metricType: 'lower_is_better',
        isActive: true,
        isSystemDefault: false,
        availableOrgTypes: null, // Available to all org types
        createdBy: testSiteAdmin.id,
      },
      {
        code: testMetric2Code,
        label: 'Test Metric 2',
        unit: 'in',
        metricType: 'higher_is_better',
        isActive: true,
        isSystemDefault: false,
        availableOrgTypes: null,
        createdBy: testSiteAdmin.id,
      }
    ]);

    createdMetricCodes.push(testMetric1Code, testMetric2Code);

    // Create organization via API
    const response = await request(app)
      .post('/api/organizations')
      .set('Cookie', authCookie)
      .send({
        name: `Test Org Auto Metrics ${Date.now()}`,
        description: 'Test organization for automatic metric enablement',
        orgType: 'club',
      });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');

    const newOrgId = response.body.id;
    createdOrgIds.push(newOrgId);

    // Verify that organization metrics were automatically created
    const orgMetrics = await db
      .select()
      .from(organizationMetrics)
      .where(eq(organizationMetrics.organizationId, newOrgId));

    // Should have at least the two test metrics we created
    expect(orgMetrics.length).toBeGreaterThanOrEqual(2);

    // Verify our test metrics are enabled
    const testMetric1Enabled = orgMetrics.find(
      (om) => om.metricCode === testMetric1Code
    );
    const testMetric2Enabled = orgMetrics.find(
      (om) => om.metricCode === testMetric2Code
    );

    expect(testMetric1Enabled).toBeDefined();
    expect(testMetric1Enabled?.isEnabled).toBe(true);
    expect(testMetric2Enabled).toBeDefined();
    expect(testMetric2Enabled?.isEnabled).toBe(true);
  });

  it('should only enable metrics available to the organization type', async () => {
    // Create metrics with different org type restrictions
    const collegeOnlyMetric = `COLLEGE_METRIC_${Date.now()}`;
    const clubOnlyMetric = `CLUB_METRIC_${Date.now()}`;

    await db.insert(siteMetrics).values([
      {
        code: collegeOnlyMetric,
        label: 'College Only Metric',
        unit: 's',
        metricType: 'lower_is_better',
        isActive: true,
        isSystemDefault: false,
        availableOrgTypes: ['college'],
        createdBy: testSiteAdmin.id,
      },
      {
        code: clubOnlyMetric,
        label: 'Club Only Metric',
        unit: 'in',
        metricType: 'higher_is_better',
        isActive: true,
        isSystemDefault: false,
        availableOrgTypes: ['club'],
        createdBy: testSiteAdmin.id,
      }
    ]);

    createdMetricCodes.push(collegeOnlyMetric, clubOnlyMetric);

    // Create a club organization
    const clubOrgResponse = await request(app)
      .post('/api/organizations')
      .set('Cookie', authCookie)
      .send({
        name: `Club Org ${Date.now()}`,
        description: 'Club organization',
        orgType: 'club',
      });

    expect(clubOrgResponse.status).toBe(201);
    createdOrgIds.push(clubOrgResponse.body.id);

    // Verify only club metric is enabled
    const clubOrgMetrics = await db
      .select()
      .from(organizationMetrics)
      .where(eq(organizationMetrics.organizationId, clubOrgResponse.body.id));

    const hasCollegeMetric = clubOrgMetrics.some(
      (om) => om.metricCode === collegeOnlyMetric
    );
    const hasClubMetric = clubOrgMetrics.some(
      (om) => om.metricCode === clubOnlyMetric
    );

    expect(hasCollegeMetric).toBe(false); // Should NOT have college-only metric
    expect(hasClubMetric).toBe(true); // Should have club metric

    // Create a college organization
    const collegeOrgResponse = await request(app)
      .post('/api/organizations')
      .set('Cookie', authCookie)
      .send({
        name: `College Org ${Date.now()}`,
        description: 'College organization',
        orgType: 'college',
      });

    expect(collegeOrgResponse.status).toBe(201);
    createdOrgIds.push(collegeOrgResponse.body.id);

    // Verify only college metric is enabled
    const collegeOrgMetrics = await db
      .select()
      .from(organizationMetrics)
      .where(eq(organizationMetrics.organizationId, collegeOrgResponse.body.id));

    const hasCollegeMetricInCollege = collegeOrgMetrics.some(
      (om) => om.metricCode === collegeOnlyMetric
    );
    const hasClubMetricInCollege = collegeOrgMetrics.some(
      (om) => om.metricCode === clubOnlyMetric
    );

    expect(hasCollegeMetricInCollege).toBe(true); // Should have college metric
    expect(hasClubMetricInCollege).toBe(false); // Should NOT have club-only metric
  });

  it('should not enable inactive metrics', async () => {
    // Create an inactive metric
    const inactiveMetric = `INACTIVE_METRIC_${Date.now()}`;

    await db.insert(siteMetrics).values({
      code: inactiveMetric,
      label: 'Inactive Metric',
      unit: 's',
      metricType: 'lower_is_better',
      isActive: false, // Inactive
      isSystemDefault: false,
      availableOrgTypes: null,
      createdBy: testSiteAdmin.id,
    });

    createdMetricCodes.push(inactiveMetric);

    // Create organization
    const response = await request(app)
      .post('/api/organizations')
      .set('Cookie', authCookie)
      .send({
        name: `Test Org Inactive ${Date.now()}`,
        description: 'Test organization for inactive metric check',
        orgType: 'club',
      });

    expect(response.status).toBe(201);
    createdOrgIds.push(response.body.id);

    // Verify inactive metric is NOT enabled
    const orgMetrics = await db
      .select()
      .from(organizationMetrics)
      .where(eq(organizationMetrics.organizationId, response.body.id));

    const hasInactiveMetric = orgMetrics.some(
      (om) => om.metricCode === inactiveMetric
    );

    expect(hasInactiveMetric).toBe(false);
  });
});
