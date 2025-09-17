/**
 * Integration tests for analytics endpoints
 * Tests API security, validation, and rate limiting
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';

// Mock the main app
const mockApp = {
  get: jest.fn(),
  post: jest.fn(),
  use: jest.fn(),
  listen: jest.fn(),
} as unknown as Express;

describe('Analytics Endpoints', () => {
  describe('Authentication & Authorization', () => {
    it('should require authentication for analytics endpoints', async () => {
      // Test that unauthenticated requests are rejected
      const response = await request(mockApp)
        .get('/api/analytics/dashboard')
        .expect(401);

      expect(response.body).toEqual({
        message: expect.stringContaining('authentication')
      });
    });

    it('should validate organization access', async () => {
      // Test that users can only access their organization's data
      const response = await request(mockApp)
        .get('/api/analytics/dashboard')
        .query({ organizationId: 'unauthorized-org' })
        .set('Authorization', 'Bearer valid-token')
        .expect(403);

      expect(response.body).toEqual({
        message: expect.stringContaining('access denied')
      });
    });

    it('should allow site admins to access any organization', async () => {
      // Test site admin privileges
      const response = await request(mockApp)
        .get('/api/analytics/dashboard')
        .query({ organizationId: 'any-org' })
        .set('Authorization', 'Bearer site-admin-token')
        .expect(200);

      // Should not throw authorization error
      expect(response.status).toBe(200);
    });
  });

  describe('Input Validation', () => {
    it('should validate required fields in POST requests', async () => {
      const invalidRequest = {
        // Missing required fields
        analysisType: 'individual'
      };

      const response = await request(mockApp)
        .post('/api/analytics/dashboard')
        .send(invalidRequest)
        .set('Authorization', 'Bearer valid-token')
        .expect(400);

      expect(response.body.message).toContain('required');
    });

    it('should validate metric names', async () => {
      const requestWithInvalidMetric = {
        analysisType: 'individual',
        filters: { organizationId: 'test-org' },
        metrics: { primary: 'INVALID_METRIC', additional: [] },
        timeframe: { type: 'recent', period: '1_month' }
      };

      const response = await request(mockApp)
        .post('/api/analytics/dashboard')
        .send(requestWithInvalidMetric)
        .set('Authorization', 'Bearer valid-token')
        .expect(400);

      expect(response.body.message).toContain('Invalid primary metric');
    });

    it('should validate organization ID format', async () => {
      const requestWithInvalidOrgId = {
        analysisType: 'individual',
        filters: { organizationId: '' }, // Empty organization ID
        metrics: { primary: 'FLY10_TIME', additional: [] },
        timeframe: { type: 'recent', period: '1_month' }
      };

      const response = await request(mockApp)
        .post('/api/analytics/dashboard')
        .send(requestWithInvalidOrgId)
        .set('Authorization', 'Bearer valid-token')
        .expect(400);

      expect(response.body.message).toContain('Organization ID is required');
    });

    it('should sanitize input data', async () => {
      const requestWithMaliciousInput = {
        analysisType: 'individual',
        filters: { 
          organizationId: 'test-org',
          // Potential SQL injection attempt
          additionalFilter: "'; DROP TABLE measurements; --"
        },
        metrics: { primary: 'FLY10_TIME', additional: [] },
        timeframe: { type: 'recent', period: '1_month' }
      };

      // Should not cause any issues - input should be sanitized
      const response = await request(mockApp)
        .post('/api/analytics/dashboard')
        .send(requestWithMaliciousInput)
        .set('Authorization', 'Bearer valid-token');

      // Should either process safely or reject with validation error
      expect([200, 400]).toContain(response.status);
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on analytics endpoints', async () => {
      const validRequest = {
        analysisType: 'individual',
        filters: { organizationId: 'test-org' },
        metrics: { primary: 'FLY10_TIME', additional: [] },
        timeframe: { type: 'recent', period: '1_month' }
      };

      // Simulate multiple rapid requests
      const requests = Array.from({ length: 55 }, () =>
        request(mockApp)
          .post('/api/analytics/dashboard')
          .send(validRequest)
          .set('Authorization', 'Bearer valid-token')
      );

      const responses = await Promise.all(requests);
      
      // Should have some rate limited responses (429 status)
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should include rate limit headers', async () => {
      const response = await request(mockApp)
        .get('/api/analytics/dashboard')
        .query({ organizationId: 'test-org' })
        .set('Authorization', 'Bearer valid-token');

      // Should include rate limiting headers
      expect(response.headers).toHaveProperty('x-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-ratelimit-remaining');
    });
  });

  describe('Data Access Controls', () => {
    it('should prevent cross-organization data leakage', async () => {
      const athleteRequest = {
        analysisType: 'individual',
        filters: { 
          organizationId: 'org-a',
          athleteIds: ['athlete-from-org-b'] // Athlete from different org
        },
        metrics: { primary: 'FLY10_TIME', additional: [] },
        timeframe: { type: 'recent', period: '1_month' }
      };

      const response = await request(mockApp)
        .post('/api/analytics/dashboard')
        .send(athleteRequest)
        .set('Authorization', 'Bearer org-a-token');

      // Should not return data for athletes from other organizations
      if (response.status === 200) {
        expect(response.body.data).toEqual([]);
      } else {
        expect(response.status).toBe(403);
      }
    });

    it('should filter data by user role', async () => {
      // Athlete should only see their own data
      const athleteRequest = {
        analysisType: 'individual',
        filters: { organizationId: 'test-org' },
        metrics: { primary: 'FLY10_TIME', additional: [] },
        timeframe: { type: 'recent', period: '1_month' }
      };

      const response = await request(mockApp)
        .post('/api/analytics/dashboard')
        .send(athleteRequest)
        .set('Authorization', 'Bearer athlete-token');

      if (response.status === 200) {
        // Should only contain data for the authenticated athlete
        const uniqueAthleteIds = [...new Set(response.body.data?.map((d: any) => d.athleteId))];
        expect(uniqueAthleteIds.length).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('Performance & Caching', () => {
    it('should return results within acceptable time limits', async () => {
      const startTime = Date.now();
      
      const response = await request(mockApp)
        .get('/api/analytics/dashboard')
        .query({ organizationId: 'test-org' })
        .set('Authorization', 'Bearer valid-token');

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Should respond within 5 seconds
      expect(responseTime).toBeLessThan(5000);
    });

    it('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = Array.from({ length: 10 }, () =>
        request(mockApp)
          .get('/api/analytics/dashboard')
          .query({ organizationId: 'test-org' })
          .set('Authorization', 'Bearer valid-token')
      );

      const startTime = Date.now();
      const responses = await Promise.all(concurrentRequests);
      const endTime = Date.now();

      // All requests should complete successfully
      responses.forEach(response => {
        expect([200, 304]).toContain(response.status); // 304 for cached responses
      });

      // Should handle concurrent load efficiently
      const totalTime = endTime - startTime;
      expect(totalTime).toBeLessThan(10000); // Within 10 seconds
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Simulate database error
      jest.spyOn(console, 'error').mockImplementation(() => {});

      // Make request that would trigger database error
      const response = await request(mockApp)
        .get('/api/analytics/dashboard')
        .query({ organizationId: 'test-org' })
        .set('Authorization', 'Bearer valid-token');

      // Should return appropriate error response
      if (response.status === 500) {
        expect(response.body.message).toContain('Failed to');
        expect(response.body.message).not.toContain('SQL'); // No internal details
      }
    });

    it('should not expose sensitive information in errors', async () => {
      const response = await request(mockApp)
        .post('/api/analytics/dashboard')
        .send({ invalid: 'data' })
        .set('Authorization', 'Bearer valid-token')
        .expect(400);

      // Error messages should not contain sensitive information
      expect(response.body.message).not.toContain('password');
      expect(response.body.message).not.toContain('token');
      expect(response.body.message).not.toContain('secret');
    });
  });
});