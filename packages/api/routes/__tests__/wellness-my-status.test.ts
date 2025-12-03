/**
 * Wellness My Status API Integration Tests
 *
 * Tests for the /api/wellness/my-status endpoint that provides
 * athlete wellness status information for the dashboard.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { db } from '../../db';
import wellnessRoutes from '../wellness-routes';
import { users, organizations, wellnessSubmissions, wellnessTemplates } from '@shared/schema';
import { eq } from 'drizzle-orm';

const app = express();

// Setup middleware
app.use(express.json());
app.use(
  session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: false,
  })
);

// Mount wellness routes
app.use('/api/wellness', wellnessRoutes);

describe('GET /api/wellness/my-status', () => {
  let testOrgId: string;
  let testAthleteId: string;
  let testTemplateId: string;
  let authCookie: string;

  beforeAll(async () => {
    // Create test organization
    const [org] = await db
      .insert(organizations)
      .values({
        name: 'Test Wellness Org',
        orgType: 'college',
      })
      .returning();
    testOrgId = org.id;

    // Create test athlete
    const [athlete] = await db
      .insert(users)
      .values({
        email: `test-wellness-athlete-${Date.now()}@example.com`,
        username: `wellness-athlete-${Date.now()}`,
        role: 'athlete',
        firstName: 'Test',
        lastName: 'Athlete',
        primaryOrganizationId: testOrgId,
      })
      .returning();
    testAthleteId = athlete.id;

    // Create test template
    const [template] = await db
      .insert(wellnessTemplates)
      .values({
        name: 'Test Status Template',
        organizationId: testOrgId,
        isActive: true,
        config: {
          questions: [
            {
              id: 'q1',
              type: 'scale',
              label: 'How are you feeling?',
              scaleMin: 1,
              scaleMax: 10,
              minLabel: 'Poor',
              maxLabel: 'Great',
              required: true,
            },
          ],
        },
      })
      .returning();
    testTemplateId = template.id;

    // Create authenticated session
    const agent = request.agent(app);
    const loginResponse = await agent.post('/api/auth/login').send({
      username: athlete.username,
      password: 'test-password',
    });

    // Extract session cookie
    const cookies = loginResponse.headers['set-cookie'];
    if (cookies) {
      authCookie = cookies[0];
    }
  });

  afterAll(async () => {
    // Cleanup
    if (testAthleteId) {
      await db.delete(wellnessSubmissions).where(eq(wellnessSubmissions.userId, testAthleteId));
      await db.delete(users).where(eq(users.id, testAthleteId));
    }
    if (testTemplateId) {
      await db.delete(wellnessTemplates).where(eq(wellnessTemplates.id, testTemplateId));
    }
    if (testOrgId) {
      await db.delete(organizations).where(eq(organizations.id, testOrgId));
    }
  });

  describe('Authentication', () => {
    it('should return 401 if not authenticated', async () => {
      const response = await request(app).get('/api/wellness/my-status');

      expect(response.status).toBe(401);
    });

    it('should require athlete role', async () => {
      // Create coach user
      const [coach] = await db
        .insert(users)
        .values({
          email: `test-coach-${Date.now()}@example.com`,
          username: `coach-${Date.now()}`,
          role: 'coach',
          firstName: 'Test',
          lastName: 'Coach',
          primaryOrganizationId: testOrgId,
        })
        .returning();

      // Authenticate as coach
      const agent = request.agent(app);
      const loginResponse = await agent.post('/api/auth/login').send({
        username: coach.username,
        password: 'test-password',
      });

      const coachCookie = loginResponse.headers['set-cookie']?.[0];

      const response = await agent
        .get('/api/wellness/my-status')
        .set('Cookie', coachCookie || '');

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('message', 'Athletes only');

      // Cleanup
      await db.delete(users).where(eq(users.id, coach.id));
    });
  });

  describe('No Submissions', () => {
    it('should return null status when athlete has no submissions', async () => {
      const agent = request.agent(app);

      const response = await agent
        .get('/api/wellness/my-status')
        .set('Cookie', authCookie || '');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        lastSubmission: null,
        status: null,
        concerns: [],
      });
    });
  });

  describe('With Submissions', () => {
    beforeAll(async () => {
      // Create a wellness submission
      await db.insert(wellnessSubmissions).values({
        userId: testAthleteId,
        templateId: testTemplateId,
        organizationId: testOrgId,
        responses: {
          q1: 3, // Low score (out of 10)
        },
        submittedAt: new Date(),
      });
    });

    it('should return wellness status with last submission date', async () => {
      const agent = request.agent(app);

      const response = await agent
        .get('/api/wellness/my-status')
        .set('Cookie', authCookie || '');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('lastSubmission');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('concerns');
      expect(Array.isArray(response.body.concerns)).toBe(true);
    });

    it('should calculate status based on recent submission scores', async () => {
      const agent = request.agent(app);

      const response = await agent
        .get('/api/wellness/my-status')
        .set('Cookie', authCookie || '');

      expect(response.status).toBe(200);

      // Status should be red/yellow for low score (3/10)
      const status = response.body.status;
      expect(status).toMatch(/red|yellow/);
    });

    it('should identify flagged concerns', async () => {
      const agent = request.agent(app);

      const response = await agent
        .get('/api/wellness/my-status')
        .set('Cookie', authCookie || '');

      expect(response.status).toBe(200);

      // Low score should be flagged as concern
      const concerns = response.body.concerns;
      expect(concerns.length).toBeGreaterThan(0);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on requests', async () => {
      const agent = request.agent(app);

      // Make multiple rapid requests
      const requests = Array(60)
        .fill(null)
        .map(() =>
          agent
            .get('/api/wellness/my-status')
            .set('Cookie', authCookie || '')
        );

      const responses = await Promise.all(requests);

      // Some requests should be rate limited (429)
      const rateLimitedRequests = responses.filter((r) => r.status === 429);
      expect(rateLimitedRequests.length).toBeGreaterThan(0);
    });
  });

  describe('Response Validation', () => {
    it('should return data matching Zod schema', async () => {
      const agent = request.agent(app);

      const response = await agent
        .get('/api/wellness/my-status')
        .set('Cookie', authCookie || '');

      expect(response.status).toBe(200);

      // Validate response structure
      expect(response.body).toHaveProperty('lastSubmission');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('concerns');

      // Validate types
      if (response.body.lastSubmission !== null) {
        expect(typeof response.body.lastSubmission).toBe('string');
      }

      if (response.body.status !== null) {
        expect(typeof response.body.status).toBe('string');
        expect(['green', 'yellow', 'red']).toContain(response.body.status);
      }

      expect(Array.isArray(response.body.concerns)).toBe(true);
    });

    it('should include concern details when present', async () => {
      const agent = request.agent(app);

      const response = await agent
        .get('/api/wellness/my-status')
        .set('Cookie', authCookie || '');

      expect(response.status).toBe(200);

      if (response.body.concerns.length > 0) {
        const concern = response.body.concerns[0];

        expect(concern).toHaveProperty('type');
        expect(concern).toHaveProperty('message');
        expect(typeof concern.type).toBe('string');
        expect(typeof concern.message).toBe('string');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle athlete with no organization', async () => {
      // Create athlete without organization
      const [orphanAthlete] = await db
        .insert(users)
        .values({
          email: `orphan-athlete-${Date.now()}@example.com`,
          username: `orphan-${Date.now()}`,
          role: 'athlete',
          firstName: 'Orphan',
          lastName: 'Athlete',
          primaryOrganizationId: null,
        })
        .returning();

      const agent = request.agent(app);
      const loginResponse = await agent.post('/api/auth/login').send({
        username: orphanAthlete.username,
        password: 'test-password',
      });

      const orphanCookie = loginResponse.headers['set-cookie']?.[0];

      const response = await agent
        .get('/api/wellness/my-status')
        .set('Cookie', orphanCookie || '');

      // Should return gracefully with null status
      expect(response.status).toBe(200);
      expect(response.body.status).toBeNull();

      // Cleanup
      await db.delete(users).where(eq(users.id, orphanAthlete.id));
    });

    it('should handle corrupted submission data', async () => {
      // Create submission with invalid/corrupted responses
      await db.insert(wellnessSubmissions).values({
        userId: testAthleteId,
        templateId: testTemplateId,
        organizationId: testOrgId,
        responses: null as any, // Invalid responses
        submittedAt: new Date(),
      });

      const agent = request.agent(app);

      const response = await agent
        .get('/api/wellness/my-status')
        .set('Cookie', authCookie || '');

      // Should return gracefully without crashing
      expect(response.status).toBe(200);
    });
  });
});
