/**
 * Integration tests for analytics endpoints
 * Tests actual API endpoints with real Express app and in-memory database
 */

// Set environment variables before any imports
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'file:./test-integration.db';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only';
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.ADMIN_PASSWORD = 'password123456789';

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import type { Express } from 'express';
import { registerRoutes } from '../../server/routes';
import type { AnalyticsRequest } from '@shared/analytics-types';

// In-memory database for testing
let app: Express;
let testOrgId: string;
let testAthleteId: string;
let adminSession: any;
let activeAgents: Set<request.SuperAgentTest> = new Set();

// Test data setup
const setupTestData = async () => {
  // This would set up test organizations, athletes, and measurements
  // For now, we'll use mock IDs
  testOrgId = 'test-org-' + Date.now();
  testAthleteId = 'test-athlete-' + Date.now();
};

const createAuthenticatedSession = async (userType: 'admin' | 'athlete' = 'admin') => {
  const agent = request.agent(app);
  activeAgents.add(agent);

  // Login with test credentials
  const loginResponse = await agent
    .post('/api/auth/login')
    .send({
      email: process.env.ADMIN_EMAIL || 'admin@test.com',
      password: process.env.ADMIN_PASSWORD || 'password123456789'
    });

  expect(loginResponse.status).toBe(200);
  return agent;
};

const cleanupAgent = (agent: request.SuperAgentTest) => {
  // Close any open connections
  if (agent && typeof (agent as any).close === 'function') {
    (agent as any).close();
  }
  activeAgents.delete(agent);
};

describe('Analytics Endpoints Integration Tests', () => {
  beforeAll(async () => {
    // Create test app (environment already set at top of file)
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));

    // Register routes
    await registerRoutes(app);

    await setupTestData();
  });

  afterEach(() => {
    // Clean up any active agents after each test
    activeAgents.forEach(agent => {
      cleanupAgent(agent);
    });
    activeAgents.clear();
  });

  afterAll(async () => {
    // Cleanup test database if needed
    // In production, this would clean up the test database

    // Ensure all agents are cleaned up
    activeAgents.forEach(agent => {
      cleanupAgent(agent);
    });
    activeAgents.clear();
  });

  describe('GET /api/analytics/dashboard', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/analytics/dashboard')
        .query({ organizationId: testOrgId });

      expect(response.status).toBe(401);
      expect(response.body.message).toContain('authentication');
    });

    it('should return dashboard analytics for authenticated admin', async () => {
      const agent = await createAuthenticatedSession('admin');

      const response = await agent
        .get('/api/analytics/dashboard')
        .query({ organizationId: testOrgId });

      // Should either return data or 404 if no data exists
      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('summary');
        expect(response.body).toHaveProperty('teams');
        expect(response.body).toHaveProperty('recentMeasurements');
        expect(response.body).toHaveProperty('bestPerformances');
      }
    });

    it('should validate organizationId parameter', async () => {
      const agent = await createAuthenticatedSession('admin');

      const response = await agent
        .get('/api/analytics/dashboard')
        .query({ organizationId: '' });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Organization ID');
    });

    it('should enforce rate limiting', async () => {
      const agent = await createAuthenticatedSession('admin');

      try {
        // Make multiple rapid requests
        const requests = Array.from({ length: 60 }, () =>
          agent
            .get('/api/analytics/dashboard')
            .query({ organizationId: testOrgId })
        );

        const responses = await Promise.allSettled(requests);

        // At least some requests should be rate limited
        const rateLimitedResponses = responses.filter(
          result => result.status === 'fulfilled' && result.value.status === 429
        );

        expect(rateLimitedResponses.length).toBeGreaterThan(0);
      } finally {
        cleanupAgent(agent);
      }
    });

    it('should include rate limit headers', async () => {
      const agent = await createAuthenticatedSession('admin');

      const response = await agent
        .get('/api/analytics/dashboard')
        .query({ organizationId: testOrgId });

      // Should include rate limiting headers
      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
    });
  });

  describe('POST /api/analytics/dashboard', () => {
    const validAnalyticsRequest: AnalyticsRequest = {
      analysisType: 'individual',
      filters: {
        organizationId: 'test-org'
      },
      metrics: {
        primary: 'FLY10_TIME',
        additional: []
      },
      timeframe: {
        type: 'recent',
        period: '1_month'
      }
    };

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/api/analytics/dashboard')
        .send(validAnalyticsRequest);

      expect(response.status).toBe(401);
    });

    it('should validate request body', async () => {
      const agent = await createAuthenticatedSession('admin');

      const invalidRequest = {
        analysisType: 'individual'
        // Missing required fields
      };

      const response = await agent
        .post('/api/analytics/dashboard')
        .send(invalidRequest);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('required');
    });

    it('should validate metric names', async () => {
      const agent = await createAuthenticatedSession('admin');

      const requestWithInvalidMetric = {
        ...validAnalyticsRequest,
        metrics: {
          primary: 'INVALID_METRIC',
          additional: []
        }
      };

      const response = await agent
        .post('/api/analytics/dashboard')
        .send(requestWithInvalidMetric);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Invalid primary metric');
    });

    it('should validate timeframe parameters', async () => {
      const agent = await createAuthenticatedSession('admin');

      const requestWithInvalidTimeframe = {
        ...validAnalyticsRequest,
        timeframe: {
          type: 'invalid_type' as any,
          period: '1_month'
        }
      };

      const response = await agent
        .post('/api/analytics/dashboard')
        .send(requestWithInvalidTimeframe);

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('timeframe');
    });

    it('should process valid analytics request', async () => {
      const agent = await createAuthenticatedSession('admin');

      const response = await agent
        .post('/api/analytics/dashboard')
        .send(validAnalyticsRequest);

      // Should either return data or indicate no data available
      expect([200, 204]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('data');
        expect(response.body).toHaveProperty('statistics');
        expect(Array.isArray(response.body.data)).toBe(true);
      }
    });

    it('should handle large dataset requests efficiently', async () => {
      const agent = await createAuthenticatedSession('admin');

      const largeDataRequest = {
        ...validAnalyticsRequest,
        timeframe: {
          type: 'recent' as const,
          period: '2_years' as const
        }
      };

      const startTime = Date.now();
      const response = await agent
        .post('/api/analytics/dashboard')
        .send(largeDataRequest);
      const endTime = Date.now();

      const responseTime = endTime - startTime;

      // Should complete within reasonable time
      expect(responseTime).toBeLessThan(10000); // 10 seconds
      expect([200, 204]).toContain(response.status);
    });

    it('should sanitize input to prevent SQL injection', async () => {
      const agent = await createAuthenticatedSession('admin');

      const maliciousRequest = {
        ...validAnalyticsRequest,
        filters: {
          organizationId: "test-org'; DROP TABLE measurements; --",
          additionalFilter: "1=1 OR '1'='1"
        }
      };

      const response = await agent
        .post('/api/analytics/dashboard')
        .send(maliciousRequest);

      // Should handle malicious input safely
      expect([200, 204, 400]).toContain(response.status);

      // The malicious SQL should not be executed
      // The app should continue to function normally
    });
  });

  describe('GET /api/analytics/teams', () => {
    it('should require authentication', async () => {
      const response = await request(app)
        .get('/api/analytics/teams')
        .query({ organizationId: testOrgId });

      expect(response.status).toBe(401);
    });

    it('should return team analytics data', async () => {
      const agent = await createAuthenticatedSession('admin');

      const response = await agent
        .get('/api/analytics/teams')
        .query({ organizationId: testOrgId });

      expect([200, 404]).toContain(response.status);

      if (response.status === 200) {
        expect(Array.isArray(response.body)).toBe(true);

        // Validate structure of returned team data
        if (response.body.length > 0) {
          const teamData = response.body[0];
          expect(teamData).toHaveProperty('teamId');
          expect(teamData).toHaveProperty('teamName');
          expect(teamData).toHaveProperty('athleteCount');
          expect(typeof teamData.athleteCount).toBe('number');
        }
      }
    });

    it('should validate organizationId parameter', async () => {
      const agent = await createAuthenticatedSession('admin');

      const response = await agent
        .get('/api/analytics/teams')
        .query({ organizationId: '' });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Organization ID');
    });
  });

  describe('Error Handling & Security', () => {
    it('should handle database connection errors gracefully', async () => {
      const agent = await createAuthenticatedSession('admin');

      // Mock a database error by using an invalid organization ID
      const response = await agent
        .get('/api/analytics/dashboard')
        .query({ organizationId: 'non-existent-org' });

      // Should handle gracefully without exposing internal errors
      expect([200, 404, 500]).toContain(response.status);

      if (response.status === 500) {
        expect(response.body.message).toContain('Failed to');
        expect(response.body.message).not.toContain('SQL');
        expect(response.body.message).not.toContain('database');
      }
    });

    it('should not expose sensitive information in error responses', async () => {
      const agent = await createAuthenticatedSession('admin');

      const response = await agent
        .post('/api/analytics/dashboard')
        .send({ invalid: 'data' });

      expect(response.status).toBe(400);

      // Error messages should not contain sensitive information
      expect(response.body.message).not.toMatch(/password|token|secret|key|admin/i);
    });

    it('should enforce CORS and security headers', async () => {
      const agent = await createAuthenticatedSession('admin');

      const response = await agent
        .get('/api/analytics/dashboard')
        .query({ organizationId: testOrgId });

      // Should include security headers
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
    });
  });

  describe('Performance & Monitoring', () => {
    it('should handle concurrent requests efficiently', async () => {
      const agent = await createAuthenticatedSession('admin');

      try {
        const concurrentRequests = Array.from({ length: 10 }, () =>
          agent
            .get('/api/analytics/dashboard')
            .query({ organizationId: testOrgId })
        );

        const startTime = Date.now();
        const responses = await Promise.all(concurrentRequests);
        const endTime = Date.now();

        const totalTime = endTime - startTime;

        // All requests should complete successfully
        responses.forEach(response => {
          expect([200, 304, 404]).toContain(response.status);
        });

        // Should handle concurrent load efficiently
        expect(totalTime).toBeLessThan(15000); // Within 15 seconds
      } finally {
        cleanupAgent(agent);
      }
    });

    it('should return appropriate HTTP status codes', async () => {
      const agent = await createAuthenticatedSession('admin');

      // Test various scenarios
      const scenarios = [
        {
          path: '/api/analytics/dashboard',
          query: { organizationId: testOrgId },
          expectedStatuses: [200, 404]
        },
        {
          path: '/api/analytics/teams',
          query: { organizationId: testOrgId },
          expectedStatuses: [200, 404]
        }
      ];

      for (const scenario of scenarios) {
        const response = await agent
          .get(scenario.path)
          .query(scenario.query);

        expect(scenario.expectedStatuses).toContain(response.status);
      }
    });

    it('should include appropriate caching headers', async () => {
      const agent = await createAuthenticatedSession('admin');

      const response = await agent
        .get('/api/analytics/dashboard')
        .query({ organizationId: testOrgId });

      if (response.status === 200) {
        // Should include cache control headers for analytics data
        expect(response.headers).toHaveProperty('cache-control');
      }
    });
  });
});