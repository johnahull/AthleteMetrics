/**
 * Import Template API Tests
 * Tests for dynamic CSV template endpoints that show valid metrics/sports/positions
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db';
import { siteMetrics, siteSports, sitePositions } from '@shared/schema';
import { eq } from 'drizzle-orm';
import express from 'express';
import request from 'supertest';
import session from 'express-session';
import { registerImportExportRoutes } from '../import-export-routes';

// Create test app
const createTestApp = () => {
  const app = express();

  // Session middleware (required for requireAuth)
  app.use(session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
  }));

  // Mock authentication middleware
  app.use((req, res, next) => {
    req.session.user = {
      id: 'test-user-id',
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
      role: 'coach',
      isSiteAdmin: false,
      isActive: true
    };
    next();
  });

  registerImportExportRoutes(app);
  return app;
};

describe('Import Template API', () => {
  let app: express.Application;
  let testMetricIds: string[] = [];
  let testSportIds: string[] = [];
  let testPositionIds: string[] = [];

  beforeAll(async () => {
    app = createTestApp();

    // Clean up orphaned test data from previous test runs
    // This ensures consistent test results regardless of database state
    const { like } = await import('drizzle-orm');
    await db.delete(sitePositions).where(like(sitePositions.code, 'TEST_%'));
    await db.delete(siteMetrics).where(like(siteMetrics.code, 'TEST_%'));
    await db.delete(siteSports).where(like(siteSports.code, 'TEST_%'));

    // Create test metrics
    const metric1 = await db.insert(siteMetrics).values({
      code: 'TEST_SPRINT_10M',
      label: '10m Sprint',
      unit: 's',
      category: 'speed',
      metricType: 'lower_is_better',
      isActive: true,
      isSystemDefault: false
    }).returning();
    testMetricIds.push(metric1[0].id);

    const metric2 = await db.insert(siteMetrics).values({
      code: 'TEST_JUMP_HEIGHT',
      label: 'Jump Height',
      unit: 'in',
      category: 'power',
      metricType: 'higher_is_better',
      isActive: true,
      isSystemDefault: false
    }).returning();
    testMetricIds.push(metric2[0].id);

    // Create inactive metric (should not appear in templates)
    const metric3 = await db.insert(siteMetrics).values({
      code: 'TEST_INACTIVE_METRIC',
      label: 'Inactive Metric',
      unit: 'kg',
      category: 'strength',
      metricType: 'higher_is_better',
      isActive: false,
      isSystemDefault: false
    }).returning();
    testMetricIds.push(metric3[0].id);

    // Create test sports
    const sport1 = await db.insert(siteSports).values({
      code: 'TEST_SOCCER',
      name: 'Test Soccer',
      isActive: true,
      isSystemDefault: false
    }).returning();
    testSportIds.push(sport1[0].id);

    const sport2 = await db.insert(siteSports).values({
      code: 'TEST_BASKETBALL',
      name: 'Test Basketball',
      isActive: true,
      isSystemDefault: false
    }).returning();
    testSportIds.push(sport2[0].id);

    // Create inactive sport (should not appear in templates)
    const sport3 = await db.insert(siteSports).values({
      code: 'TEST_INACTIVE_SPORT',
      name: 'Inactive Sport',
      isActive: false,
      isSystemDefault: false
    }).returning();
    testSportIds.push(sport3[0].id);

    // Create test positions
    const position1 = await db.insert(sitePositions).values({
      sportId: sport1[0].id,
      code: 'FW',
      name: 'Forward',
      isActive: true
    }).returning();
    testPositionIds.push(position1[0].id);

    const position2 = await db.insert(sitePositions).values({
      sportId: sport1[0].id,
      code: 'GK',
      name: 'Goalkeeper',
      isActive: true
    }).returning();
    testPositionIds.push(position2[0].id);
  });

  afterAll(async () => {
    // Clean up test data
    for (const id of testPositionIds) {
      await db.delete(sitePositions).where(eq(sitePositions.id, id));
    }
    for (const id of testSportIds) {
      await db.delete(siteSports).where(eq(siteSports.id, id));
    }
    for (const id of testMetricIds) {
      await db.delete(siteMetrics).where(eq(siteMetrics.id, id));
    }
  });

  describe('GET /api/import/templates/athletes', () => {
    it('should return CSV template with valid sports in comment', async () => {
      const response = await request(app)
        .get('/api/import/templates/athletes')
        .expect(200)
        .expect('Content-Type', /text\/csv/);

      const csvText = response.text;

      // Check for comment line with valid sports
      expect(csvText).toContain('# Valid sports:');
      expect(csvText).toContain('TEST_SOCCER');
      expect(csvText).toContain('TEST_BASKETBALL');

      // Should NOT contain inactive sport
      expect(csvText).not.toContain('TEST_INACTIVE_SPORT');

      // Check for header row
      expect(csvText).toContain('firstName,lastName,birthDate');
      expect(csvText).toContain('sports,position,height');
    });

    it('should include Content-Disposition header for filename', async () => {
      const response = await request(app)
        .get('/api/import/templates/athletes')
        .expect(200);

      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('athletes-template.csv');
    });

    it('should include all athlete CSV fields in header', async () => {
      const response = await request(app)
        .get('/api/import/templates/athletes')
        .expect(200);

      const csvText = response.text;
      const requiredFields = [
        'firstName',
        'lastName',
        'birthDate',
        'birthYear',
        'graduationYear',
        'gender',
        'emails',
        'phoneNumbers',
        'sports',
        'position',
        'height',
        'weight',
        'school',
        'teamName'
      ];

      for (const field of requiredFields) {
        expect(csvText).toContain(field);
      }
    });

    it('should exclude inactive sports from template', async () => {
      const response = await request(app)
        .get('/api/import/templates/athletes')
        .expect(200);

      const csvText = response.text;

      // Verify only active sports are included
      expect(csvText).toContain('TEST_SOCCER');
      expect(csvText).toContain('TEST_BASKETBALL');
      expect(csvText).not.toContain('TEST_INACTIVE_SPORT');
    });
  });

  describe('GET /api/import/templates/measurements', () => {
    it('should return CSV template with valid metrics and units', async () => {
      const response = await request(app)
        .get('/api/import/templates/measurements')
        .expect(200)
        .expect('Content-Type', /text\/csv/);

      const csvText = response.text;

      // Check for comment line with valid metrics
      expect(csvText).toContain('# Valid metrics:');
      expect(csvText).toContain('TEST_SPRINT_10M');
      expect(csvText).toContain('TEST_JUMP_HEIGHT');

      // Should NOT contain inactive metric
      expect(csvText).not.toContain('TEST_INACTIVE_METRIC');

      // Check for header row
      expect(csvText).toContain('firstName,lastName,teamName');
      expect(csvText).toContain('metric,value,units');
    });

    it('should show units in parentheses for each metric', async () => {
      const response = await request(app)
        .get('/api/import/templates/measurements')
        .expect(200);

      const csvText = response.text;

      // Metrics should be displayed with units
      expect(csvText).toContain('TEST_SPRINT_10M (s)');
      expect(csvText).toContain('TEST_JUMP_HEIGHT (in)');
    });

    it('should include Content-Disposition header for filename', async () => {
      const response = await request(app)
        .get('/api/import/templates/measurements')
        .expect(200);

      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('measurements-template.csv');
    });

    it('should include all measurement CSV fields in header', async () => {
      const response = await request(app)
        .get('/api/import/templates/measurements')
        .expect(200);

      const csvText = response.text;
      const requiredFields = [
        'firstName',
        'lastName',
        'teamName',
        'date',
        'age',
        'metric',
        'value',
        'units',
        'flyInDistance',
        'notes',
        'gender'
      ];

      for (const field of requiredFields) {
        expect(csvText).toContain(field);
      }
    });

    it('should exclude inactive metrics from template', async () => {
      const response = await request(app)
        .get('/api/import/templates/measurements')
        .expect(200);

      const csvText = response.text;

      // Verify only active metrics are included
      expect(csvText).toContain('TEST_SPRINT_10M');
      expect(csvText).toContain('TEST_JUMP_HEIGHT');
      expect(csvText).not.toContain('TEST_INACTIVE_METRIC');
    });

    it('should handle metrics without units gracefully', async () => {
      // Create a metric without a unit
      const metricNoUnit = await db.insert(siteMetrics).values({
        code: 'TEST_NO_UNIT',
        label: 'Test No Unit',
        unit: null,
        category: 'other',
        metricType: 'higher_is_better',
        isActive: true,
        isSystemDefault: false
      }).returning();

      testMetricIds.push(metricNoUnit[0].id);

      const response = await request(app)
        .get('/api/import/templates/measurements')
        .expect(200);

      const csvText = response.text;

      // Metric without unit should still appear
      expect(csvText).toContain('TEST_NO_UNIT');

      // Clean up
      await db.delete(siteMetrics).where(eq(siteMetrics.id, metricNoUnit[0].id));
      testMetricIds = testMetricIds.filter(id => id !== metricNoUnit[0].id);
    });
  });

  describe('Template Format', () => {
    it('athletes template should be valid CSV format', async () => {
      const response = await request(app)
        .get('/api/import/templates/athletes')
        .expect(200);

      const csvText = response.text;
      const lines = csvText.split('\n').filter(line => line.trim());

      // First line should be comment
      expect(lines[0]).toMatch(/^#/);

      // Second line should be header with commas
      expect(lines[1]).toMatch(/firstName.*lastName.*birthDate/);
      expect(lines[1].split(',').length).toBeGreaterThan(5);
    });

    it('measurements template should be valid CSV format', async () => {
      const response = await request(app)
        .get('/api/import/templates/measurements')
        .expect(200);

      const csvText = response.text;
      const lines = csvText.split('\n').filter(line => line.trim());

      // First line should be comment
      expect(lines[0]).toMatch(/^#/);

      // Second line should be header with commas
      expect(lines[1]).toMatch(/firstName.*lastName.*metric/);
      expect(lines[1].split(',').length).toBeGreaterThan(5);
    });
  });
});
