/**
 * Import Wizard Endpoint Tests
 * Tests for the template generation wizard endpoint
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '../../db';
import { teams, organizations, siteMetrics, organizationMetrics, users, userOrganizations } from '@shared/schema';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { registerImportExportRoutes } from '../import-export-routes';

// Mock session data for testing
let mockSessionUser: any = null;

// Create test app with mocked session middleware
function createTestApp() {
  const app = express();
  app.use(express.json());

  // Mock session middleware for testing
  app.use((req: Request, res: Response, next: NextFunction) => {
    req.session = {
      user: mockSessionUser,
    } as any;
    next();
  });

  // Register import/export routes
  registerImportExportRoutes(app);

  return app;
}

const app = createTestApp();

describe('POST /api/import/templates/wizard', () => {
  let testOrgId: string;
  let testTeamIds: string[];
  let testMetricCodes: string[];
  let testUserId: string;

  beforeAll(async () => {
    // Create test organization with unique name
    const uniqueId = Date.now();
    const [org] = await db.insert(organizations).values({
      name: `Test Wizard Org ${uniqueId}`,
      subdomain: `test-wizard-${uniqueId}`,
    }).returning();
    testOrgId = org.id;

    // Create test teams
    const [team1] = await db.insert(teams).values({
      name: 'Varsity Football',
      organizationId: testOrgId,
    }).returning();

    const [team2] = await db.insert(teams).values({
      name: 'JV Basketball',
      organizationId: testOrgId,
    }).returning();

    testTeamIds = [team1.id, team2.id];

    // Create test metrics
    const metricsToCreate = [
      { code: 'FLY10_TIME', label: '10-Yard Fly Time', unit: 's', category: 'speed' },
      { code: 'VERTICAL_JUMP', label: 'Vertical Jump', unit: 'in', category: 'power' },
      { code: 'DASH_40YD', label: '40-Yard Dash', unit: 's', category: 'speed' },
    ];

    for (const metric of metricsToCreate) {
      await db.insert(siteMetrics).values({
        code: metric.code,
        label: metric.label,
        unit: metric.unit,
        category: metric.category,
        isActive: true,
        isSystemDefault: true,
      }).onConflictDoNothing();
    }

    testMetricCodes = metricsToCreate.map(m => m.code);

    // Enable metrics for organization
    for (const code of testMetricCodes) {
      await db.insert(organizationMetrics).values({
        organizationId: testOrgId,
        metricCode: code,
        isEnabled: true,
      }).onConflictDoNothing();
    }

    // Create test user
    const [user] = await db.insert(users).values({
      username: 'wizardtester',
      firstName: 'Wizard',
      lastName: 'Tester',
      fullName: 'Wizard Tester',
      emails: ['wizard@test.com'],
      role: 'coach',
      password: 'hashed_password',
      isActive: true,
    }).returning();
    testUserId = user.id;

    // Add user to organization
    await db.insert(userOrganizations).values({
      userId: testUserId,
      organizationId: testOrgId,
      role: 'coach',
    });

    // Set up mock session user
    mockSessionUser = {
      id: testUserId,
      username: 'wizardtester',
      firstName: 'Wizard',
      lastName: 'Tester',
      role: 'coach',
      isSiteAdmin: false,
    };
  });

  afterAll(async () => {
    // Cleanup
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
    await db.delete(organizationMetrics).where(eq(organizationMetrics.organizationId, testOrgId));
    await db.delete(teams).where(eq(teams.organizationId, testOrgId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  });

  it('should require authentication', async () => {
    // Temporarily remove mock session user
    const originalUser = mockSessionUser;
    mockSessionUser = null;

    const response = await request(app)
      .post('/api/import/templates/wizard')
      .send({ type: 'athletes' });

    expect(response.status).toBe(401);

    // Restore mock session user
    mockSessionUser = originalUser;
  });

  it('should generate athlete template with teams', async () => {
    const response = await request(app)
      .post('/api/import/templates/wizard')
      .send({
        type: 'athletes',
        teamIds: testTeamIds,
        includeExamples: true,
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('csvContent');
    expect(response.body).toHaveProperty('headers');
    expect(response.body).toHaveProperty('teams');
    expect(response.body).toHaveProperty('exampleRows');

    // Check headers
    const expectedHeaders = [
      'firstName', 'lastName', 'birthDate', 'birthYear', 'graduationYear',
      'gender', 'emails', 'phoneNumbers', 'sports', 'position', 'height',
      'weight', 'school', 'teamName'
    ];
    expect(response.body.headers).toEqual(expectedHeaders);

    // Check teams
    expect(response.body.teams).toHaveLength(2);
    expect(response.body.teams.map((t: any) => t.name)).toContain('Varsity Football');
    expect(response.body.teams.map((t: any) => t.name)).toContain('JV Basketball');

    // Check example rows
    expect(response.body.exampleRows).toBeInstanceOf(Array);
    expect(response.body.exampleRows.length).toBeGreaterThan(0);
  });

  it('should generate athlete template without examples', async () => {
    const response = await request(app)
      .post('/api/import/templates/wizard')
      .send({
        type: 'athletes',
        teamIds: testTeamIds,
        includeExamples: false,
      });

    expect(response.status).toBe(200);
    expect(response.body.csvContent).toBeDefined();

    // CSV should only have headers, no data rows
    const lines = response.body.csvContent.split('\n').filter((l: string) => l.trim());
    expect(lines).toHaveLength(1); // Only header line
  });

  it('should generate measurement template with metrics', async () => {
    const response = await request(app)
      .post('/api/import/templates/wizard')
      .send({
        type: 'measurements',
        teamIds: testTeamIds,
        metricCodes: testMetricCodes,
        includeExamples: true,
      });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('csvContent');
    expect(response.body).toHaveProperty('headers');
    expect(response.body).toHaveProperty('enabledMetrics');
    expect(response.body).toHaveProperty('teams');
    expect(response.body).toHaveProperty('exampleRows');

    // Check headers
    const expectedHeaders = [
      'firstName', 'lastName', 'teamName', 'date', 'age',
      'metric', 'value', 'units', 'flyInDistance', 'notes', 'gender'
    ];
    expect(response.body.headers).toEqual(expectedHeaders);

    // Check enabled metrics
    expect(response.body.enabledMetrics).toHaveLength(testMetricCodes.length);
    const metricCodes = response.body.enabledMetrics.map((m: any) => m.code);
    expect(metricCodes).toContain('FLY10_TIME');
    expect(metricCodes).toContain('VERTICAL_JUMP');
    expect(metricCodes).toContain('DASH_40YD');
  });

  it('should use COMMON_METRICS when no metricCodes specified', async () => {
    const response = await request(app)
      .post('/api/import/templates/wizard')
      .send({
        type: 'measurements',
        teamIds: testTeamIds,
        includeExamples: false,
      });

    expect(response.status).toBe(200);

    // Should include common metrics that are enabled
    const commonMetrics = ['FLY10_TIME', 'VERTICAL_JUMP', 'DASH_40YD', 'AGILITY_505', 'TOP_SPEED'];
    const metricCodes = response.body.enabledMetrics.map((m: any) => m.code);

    // At least some common metrics should be present
    const hasCommonMetrics = commonMetrics.some(code => metricCodes.includes(code));
    expect(hasCommonMetrics).toBe(true);
  });

  it('should fall back to site metrics when org has no enabled metrics', async () => {
    // Create new org with no enabled metrics
    const uniqueId = Date.now();
    const [emptyOrg] = await db.insert(organizations).values({
      name: `Empty Org ${uniqueId}`,
      subdomain: `empty-wizard-${uniqueId}`,
    }).returning();

    const [emptyTeam] = await db.insert(teams).values({
      name: 'Empty Team',
      organizationId: emptyOrg.id,
    }).returning();

    // Add user to empty org
    await db.insert(userOrganizations).values({
      userId: testUserId,
      organizationId: emptyOrg.id,
      role: 'coach',
    });

    const response = await request(app)
      .post('/api/import/templates/wizard')
      .send({
        type: 'measurements',
        teamIds: [emptyTeam.id],
        includeExamples: false,
      });

    expect(response.status).toBe(200);
    expect(response.body.enabledMetrics.length).toBeGreaterThan(0);

    // Cleanup
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, emptyOrg.id));
    await db.delete(teams).where(eq(teams.id, emptyTeam.id));
    await db.delete(organizations).where(eq(organizations.id, emptyOrg.id));
  });

  it('should validate type parameter', async () => {
    const response = await request(app)
      .post('/api/import/templates/wizard')
      .send({
        type: 'invalid_type',
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('Invalid type');
  });

  it('should require at least one team', async () => {
    const response = await request(app)
      .post('/api/import/templates/wizard')
      .send({
        type: 'athletes',
        teamIds: [],
      });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('At least one team is required');
  });

  it('should return CSV with proper formatting', async () => {
    const response = await request(app)
      .post('/api/import/templates/wizard')
      .send({
        type: 'athletes',
        teamIds: testTeamIds,
        includeExamples: true,
      });

    expect(response.status).toBe(200);

    const csv = response.body.csvContent;
    const lines = csv.split('\n').filter(l => l.trim());

    // Should have comment, header line, and example rows
    expect(lines.length).toBeGreaterThan(2);

    // First line is comment
    expect(lines[0]).toContain('# Example athlete import template');

    // Second line is header
    expect(lines[1]).toContain('firstName');
    expect(lines[1]).toContain('lastName');
    expect(lines[1]).toContain('teamName');

    // Should have example data rows after header
    expect(lines.length).toBeGreaterThan(2);
  });

  it('should handle measurement template with specific metrics only', async () => {
    const response = await request(app)
      .post('/api/import/templates/wizard')
      .send({
        type: 'measurements',
        teamIds: testTeamIds,
        metricCodes: ['FLY10_TIME', 'VERTICAL_JUMP'],
        includeExamples: true,
      });

    expect(response.status).toBe(200);

    // Should only include requested metrics in enabled metrics list
    const metricCodes = response.body.enabledMetrics.map((m: any) => m.code);
    expect(metricCodes).toHaveLength(2);
    expect(metricCodes).toContain('FLY10_TIME');
    expect(metricCodes).toContain('VERTICAL_JUMP');

    // Example rows should contain only these metrics
    const exampleMetrics = response.body.exampleRows.map((r: any) => r.metric);
    exampleMetrics.forEach((metric: string) => {
      expect(['FLY10_TIME', 'VERTICAL_JUMP']).toContain(metric);
    });
  });
});
