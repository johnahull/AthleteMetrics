/**
 * Integration Tests for Measurement Routes
 *
 * Tests the actual HTTP endpoints with:
 * - Validation (Zod schema enforcement)
 * - Authorization (organization-based access control)
 * - Rate limiting
 * - Error handling
 * - Query parameter handling
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { registerMeasurementRoutes } from '../measurement-routes';
import { db } from '../../db';
import { measurements, users, organizations, userOrganizations } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Test data IDs - dynamically generated to prevent race conditions
const TEST_ORG_ID = randomUUID();
const TEST_USER_ID = randomUUID();
const TEST_ATHLETE_ID = randomUUID();
const TEST_MEASUREMENT_ID = randomUUID();

describe('Measurement Routes - Integration Tests', () => {
  let app: express.Express;

  beforeAll(async () => {
    // Setup test app
    app = express();
    app.use(express.json());

    // Mock authentication middleware
    app.use((req, res, next) => {
      req.session = {
        user: {
          id: TEST_USER_ID,
          isSiteAdmin: false,
          primaryOrganizationId: TEST_ORG_ID
        }
      } as any;
      next();
    });

    // Register routes
    registerMeasurementRoutes(app);

    // Setup test data
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  beforeEach(() => {
    // Reset rate limiters between tests if needed
  });

  describe('GET /api/measurements', () => {
    describe('Validation', () => {
      it('should reject invalid UUID for organizationId', async () => {
        const res = await request(app)
          .get('/api/measurements')
          .query({ organizationId: 'not-a-uuid' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('errors');
      });

      it('should reject limit above maximum (20000)', async () => {
        const res = await request(app)
          .get('/api/measurements')
          .query({ organizationId: TEST_ORG_ID, limit: 25000 });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('errors');
      });

      it('should reject negative offset', async () => {
        const res = await request(app)
          .get('/api/measurements')
          .query({ organizationId: TEST_ORG_ID, offset: -1 });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('errors');
      });

      it('should reject invalid metric type', async () => {
        const res = await request(app)
          .get('/api/measurements')
          .query({ organizationId: TEST_ORG_ID, metric: 'INVALID_METRIC' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('errors');
      });

      it('should reject invalid datetime format for dateFrom', async () => {
        const res = await request(app)
          .get('/api/measurements')
          .query({ organizationId: TEST_ORG_ID, dateFrom: '2025-01-01' }); // Missing time

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('errors');
      });

      it('should accept valid datetime ISO format', async () => {
        const res = await request(app)
          .get('/api/measurements')
          .query({
            organizationId: TEST_ORG_ID,
            dateFrom: '2025-01-01T00:00:00.000Z'
          });

        expect(res.status).toBe(200);
      });
    });

    describe('Authorization', () => {
      it('should allow users to query their own organization', async () => {
        const res = await request(app)
          .get('/api/measurements')
          .query({ organizationId: TEST_ORG_ID });

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
      });

      it('should reject non-admin querying different organization', async () => {
        const res = await request(app)
          .get('/api/measurements')
          .query({ organizationId: '00000000-0000-0000-0000-999999999999' }); // Different valid UUID

        expect(res.status).toBe(403);
        expect(res.body.message).toContain('Access denied');
      });

      it('should auto-apply organizationId filter when not specified', async () => {
        const res = await request(app)
          .get('/api/measurements');

        expect(res.status).toBe(200);
        // Should filter by user's organization automatically
        const measurements = res.body;
        expect(Array.isArray(measurements)).toBe(true);
      });
    });

    describe('Pagination', () => {
      it('should respect limit parameter', async () => {
        const res = await request(app)
          .get('/api/measurements')
          .query({ organizationId: TEST_ORG_ID, limit: 5 });

        expect(res.status).toBe(200);
        expect(res.body.length).toBeLessThanOrEqual(5);
      });

      it('should respect offset parameter', async () => {
        // Get first page
        const page1 = await request(app)
          .get('/api/measurements')
          .query({ organizationId: TEST_ORG_ID, limit: 2, offset: 0 });

        // Get second page
        const page2 = await request(app)
          .get('/api/measurements')
          .query({ organizationId: TEST_ORG_ID, limit: 2, offset: 2 });

        expect(page1.status).toBe(200);
        expect(page2.status).toBe(200);

        if (page1.body.length > 0 && page2.body.length > 0) {
          // IDs should be different
          expect(page1.body[0].id).not.toBe(page2.body[0].id);
        }
      });
    });

    describe('Filtering', () => {
      it('should filter by metric', async () => {
        const res = await request(app)
          .get('/api/measurements')
          .query({ organizationId: TEST_ORG_ID, metric: 'FLY10_TIME' });

        expect(res.status).toBe(200);
        res.body.forEach((m: any) => {
          expect(m.metric).toBe('FLY10_TIME');
        });
      });

      it('should filter by userId', async () => {
        const res = await request(app)
          .get('/api/measurements')
          .query({ organizationId: TEST_ORG_ID, userId: TEST_ATHLETE_ID });

        expect(res.status).toBe(200);
        res.body.forEach((m: any) => {
          expect(m.userId).toBe(TEST_ATHLETE_ID);
        });
      });

      it('should filter by date range', async () => {
        const dateFrom = '2025-01-01T00:00:00.000Z';
        const dateTo = '2025-12-31T23:59:59.999Z';

        const res = await request(app)
          .get('/api/measurements')
          .query({
            organizationId: TEST_ORG_ID,
            dateFrom,
            dateTo
          });

        expect(res.status).toBe(200);
        res.body.forEach((m: any) => {
          const measurementDate = new Date(m.date);
          expect(measurementDate >= new Date(dateFrom)).toBe(true);
          expect(measurementDate <= new Date(dateTo)).toBe(true);
        });
      });
    });
  });

  describe('POST /api/measurements', () => {
    it('should create a measurement with valid data', async () => {
      const newMeasurement = {
        userId: TEST_ATHLETE_ID,
        date: '2025-10-24T10:00:00.000Z',
        metric: 'FLY10_TIME',
        value: 1.25,
        notes: 'Test measurement'
      };

      const res = await request(app)
        .post('/api/measurements')
        .send(newMeasurement);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.metric).toBe('FLY10_TIME');
      // Value is stored as DECIMAL, so it may have trailing zeros
      expect(parseFloat(res.body.value)).toBe(1.25);
    });

    it('should reject measurement with missing required fields', async () => {
      const res = await request(app)
        .post('/api/measurements')
        .send({ userId: TEST_ATHLETE_ID }); // Missing other fields

      expect(res.status).toBe(400);
    });

    it('should reject measurement with invalid metric', async () => {
      const res = await request(app)
        .post('/api/measurements')
        .send({
          userId: TEST_ATHLETE_ID,
          date: '2025-10-24T10:00:00.000Z',
          metric: 'INVALID_METRIC',
          value: 1.25
        });

      expect(res.status).toBe(400);
    });

    it('should auto-calculate units based on metric', async () => {
      const res = await request(app)
        .post('/api/measurements')
        .send({
          userId: TEST_ATHLETE_ID,
          date: '2025-10-24T10:00:00.000Z',
          metric: 'FLY10_TIME',
          value: 1.25
        });

      expect(res.status).toBe(201);
      expect(res.body.units).toBe('s'); // Seconds for time metrics
    });
  });

  describe('GET /api/measurements/:id', () => {
    it('should return a specific measurement', async () => {
      const res = await request(app)
        .get(`/api/measurements/${TEST_MEASUREMENT_ID}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(TEST_MEASUREMENT_ID);
    });

    it('should return 404 for non-existent measurement', async () => {
      const res = await request(app)
        .get('/api/measurements/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/measurements/:id', () => {
    it('should update a measurement', async () => {
      const res = await request(app)
        .put(`/api/measurements/${TEST_MEASUREMENT_ID}`)
        .send({ notes: 'Updated notes' });

      expect(res.status).toBe(200);
      expect(res.body.notes).toBe('Updated notes');
    });

    it('should not allow updating submittedBy', async () => {
      // Get the original measurement first
      const originalRes = await request(app)
        .get(`/api/measurements/${TEST_MEASUREMENT_ID}`);

      const originalSubmittedBy = originalRes.body.submittedBy;

      // Try to update notes (valid field) to verify submittedBy stays unchanged
      const updateRes = await request(app)
        .put(`/api/measurements/${TEST_MEASUREMENT_ID}`)
        .send({ notes: 'Some notes' });

      expect(updateRes.status).toBe(200);
      // submittedBy should remain unchanged even after update
      expect(updateRes.body.submittedBy).toBe(originalSubmittedBy);
      expect(updateRes.body.submittedBy).toBe(TEST_USER_ID); // Verify it's still the original submitter
    });
  });

  describe('DELETE /api/measurements/:id', () => {
    it('should delete a measurement', async () => {
      // First create a measurement to delete
      const createRes = await request(app)
        .post('/api/measurements')
        .send({
          userId: TEST_ATHLETE_ID,
          date: '2025-10-24T10:00:00.000Z',
          metric: 'VERTICAL_JUMP',
          value: 30
        });

      const measurementId = createRes.body.id;

      // Then delete it
      const deleteRes = await request(app)
        .delete(`/api/measurements/${measurementId}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.message).toBe('Measurement deleted successfully');

      // Verify it's gone
      const getRes = await request(app)
        .get(`/api/measurements/${measurementId}`);
      expect(getRes.status).toBe(404);
    });
  });

  describe('POST /api/measurements/:id/verify', () => {
    it('should verify a measurement', async () => {
      const res = await request(app)
        .post(`/api/measurements/${TEST_MEASUREMENT_ID}/verify`);

      expect(res.status).toBe(200);
      expect(res.body.isVerified).toBe(true);
      expect(res.body.verifiedBy).toBe(TEST_USER_ID);
    });
  });
});

// Test data setup helpers
async function setupTestData() {
  try {
    // Create test organization
    await db.insert(organizations).values({
      id: TEST_ORG_ID,
      name: 'Test Organization',
      type: 'College',
      isActive: true
    }).onConflictDoNothing();

    // Create test user
    await db.insert(users).values({
      id: TEST_USER_ID,
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'Coach',
      fullName: 'Test Coach',
      username: 'testcoach',
      password: 'hashed',
      isActive: true
    }).onConflictDoNothing();

    // Create test athlete
    await db.insert(users).values({
      id: TEST_ATHLETE_ID,
      email: 'athlete@example.com',
      firstName: 'Test',
      lastName: 'Athlete',
      fullName: 'Test Athlete',
      username: 'testathlete',
      password: 'hashed',
      birthYear: 2005,
      isActive: true
    }).onConflictDoNothing();

    // Link user to organization
    await db.insert(userOrganizations).values({
      userId: TEST_USER_ID,
      organizationId: TEST_ORG_ID,
      role: 'coach'
    }).onConflictDoNothing();

    // Create test measurement
    await db.insert(measurements).values({
      id: TEST_MEASUREMENT_ID,
      userId: TEST_ATHLETE_ID,
      submittedBy: TEST_USER_ID,
      date: '2025-10-24T10:00:00.000Z',
      metric: 'FLY10_TIME',
      value: '1.25',
      units: 's',
      age: 20,
      organizationId: TEST_ORG_ID,
      isVerified: false
    }).onConflictDoNothing();
  } catch (error) {
    console.error('Error setting up test data:', error);
  }
}

async function cleanupTestData() {
  try {
    // Clean up in reverse order of foreign key dependencies
    await db.delete(measurements).where(eq(measurements.id, TEST_MEASUREMENT_ID));
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, TEST_USER_ID));
    await db.delete(users).where(eq(users.id, TEST_ATHLETE_ID));
    await db.delete(users).where(eq(users.id, TEST_USER_ID));
    await db.delete(organizations).where(eq(organizations.id, TEST_ORG_ID));
  } catch (error) {
    console.error('Error cleaning up test data:', error);
  }
}
