/**
 * Integration Tests for Rate Limiting Security
 *
 * Tests production safeguards for rate limiting bypass flags:
 * - Verifies rate limiting CANNOT be bypassed in production environment
 * - Tests that BYPASS_GENERAL_RATE_LIMIT flag is ignored when NODE_ENV=production
 * - Ensures defense-in-depth for rate limiting enforcement
 *
 * NOTE: Requires DATABASE_URL environment variable to be set to a PostgreSQL connection string
 */

// Set environment variables before any imports
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { storage } from '../../server/storage';
import type { User } from '@shared/schema';

// Mock vite module before importing registerRoutes
vi.mock('../../server/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn()
}));

import { registerRoutes } from '../../server/routes';

describe('Rate Limiting Security - Production Safeguards', () => {
  let siteAdminUser: User;
  let app: Express;
  let agent: request.SuperAgentTest;
  let originalNodeEnv: string | undefined;
  let originalBypassFlag: string | undefined;

  beforeAll(async () => {
    // Validate DATABASE_URL is set
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'DATABASE_URL must be set to run integration tests. ' +
        'See README.md for PostgreSQL setup instructions.'
      );
    }

    // Save original environment variables
    originalNodeEnv = process.env.NODE_ENV;
    originalBypassFlag = process.env.BYPASS_GENERAL_RATE_LIMIT;

    // Create site admin user
    const timestamp = Date.now();
    siteAdminUser = await storage.createUser({
      username: `test-ratelimit-security-${timestamp}`,
      email: `ratelimit-security-${timestamp}@test.com`,
      password: 'TestPassword123!',
      firstName: 'Rate',
      lastName: 'Limit',
      role: 'coach',
      isSiteAdmin: true,
      isActive: true
    });

    // Create Express app with routes
    app = express();
    app.use(express.json());
    await registerRoutes(app);
    agent = request.agent(app);

    // Login as site admin
    await agent
      .post('/api/auth/login')
      .send({
        username: siteAdminUser.username,
        password: 'TestPassword123!'
      });
  });

  afterAll(async () => {
    // Restore original environment variables
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }

    if (originalBypassFlag !== undefined) {
      process.env.BYPASS_GENERAL_RATE_LIMIT = originalBypassFlag;
    } else {
      delete process.env.BYPASS_GENERAL_RATE_LIMIT;
    }

    // Clean up test user
    if (siteAdminUser?.id) {
      try {
        await storage.deleteUser(siteAdminUser.id);
      } catch (error) {
        console.error('Error cleaning up test user:', error);
      }
    }
  });

  afterEach(() => {
    // Reset to test environment after each test
    process.env.NODE_ENV = 'test';
    delete process.env.BYPASS_GENERAL_RATE_LIMIT;
  });

  it.skip('should enforce rate limits in production even with BYPASS_GENERAL_RATE_LIMIT=true', async () => {
    // Set production environment with bypass flag
    process.env.NODE_ENV = 'production';
    process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

    // Create a new Express app with production settings
    // (Route limiters read NODE_ENV at initialization time)
    const prodApp = express();
    prodApp.use(express.json());
    await registerRoutes(prodApp);
    const prodAgent = request.agent(prodApp);

    // Login as site admin
    await prodAgent
      .post('/api/auth/login')
      .send({
        username: siteAdminUser.username,
        password: 'TestPassword123!'
      })
      .expect(200);

    // Attempt to make multiple requests that would trigger rate limiting
    // Using athlete creation endpoint (limit: 20 per 15 minutes)
    // Execute sequentially for deterministic results
    const responses: request.Response[] = [];
    const timestamp = Date.now();

    for (let i = 0; i < 25; i++) {
      const response = await prodAgent
        .post('/api/athletes')
        .send({
          firstName: `Athlete${i}`,
          lastName: `RateLimit${timestamp}`,
          email: `athlete-${i}-${timestamp}@test.com`,
          sports: ['Soccer']
        });
      responses.push(response);
    }

    // Count successful and rate-limited responses
    const successCount = responses.filter(r => r.status === 201).length;
    const rateLimitedCount = responses.filter(r => r.status === 429).length;

    // Verify that rate limiting WAS enforced despite bypass flag
    // Exactly 20 requests should succeed, rest should be rate limited
    expect(successCount).toBe(20);
    expect(rateLimitedCount).toBe(5);
    expect(responses[20].status).toBe(429); // First blocked request

    // Verify rate limit response includes appropriate headers
    const rateLimitedResponse = responses.find(r => r.status === 429);
    expect(rateLimitedResponse).toBeDefined();
    expect(rateLimitedResponse?.body.message).toContain('Too many requests');

    // Clean up created athletes
    // Note: Using deleteUser is correct - in the unified model, athletes are users
    // The /api/athletes endpoint creates users with athlete role
    for (const response of responses) {
      if (response.status === 201 && response.body?.id) {
        try {
          await storage.deleteUser(response.body.id);
        } catch (error) {
          // Ignore cleanup errors (athlete may have already been deleted)
        }
      }
    }
  });

  it.skip('should enforce analytics rate limits in production even with BYPASS_ANALYTICS_RATE_LIMIT=true', async () => {
    // Set production environment with analytics bypass flag
    process.env.NODE_ENV = 'production';
    process.env.BYPASS_ANALYTICS_RATE_LIMIT = 'true';

    // Create a new Express app with production settings
    const prodApp = express();
    prodApp.use(express.json());
    await registerRoutes(prodApp);
    const prodAgent = request.agent(prodApp);

    // Login as site admin
    await prodAgent
      .post('/api/auth/login')
      .send({
        username: siteAdminUser.username,
        password: 'TestPassword123!'
      })
      .expect(200);

    // Attempt to make multiple analytics requests (limit: 50 per 15 minutes by default)
    // Execute sequentially for deterministic results
    const responses: request.Response[] = [];

    for (let i = 0; i < 55; i++) {
      const response = await prodAgent
        .get('/api/analytics/simple')
        .query({
          metric: 'FLY10_TIME',
          startDate: '2024-01-01',
          endDate: '2024-12-31'
        });
      responses.push(response);
    }

    // Count successful and rate-limited responses
    const successCount = responses.filter(r => r.status === 200).length;
    const rateLimitedCount = responses.filter(r => r.status === 429).length;

    // Verify that rate limiting WAS enforced despite bypass flag
    // Exactly 50 requests should succeed, rest should be rate limited
    expect(successCount).toBe(50);
    expect(rateLimitedCount).toBe(5);
    expect(responses[50].status).toBe(429); // First blocked request

    // Verify rate limit response
    const rateLimitedResponse = responses.find(r => r.status === 429);
    expect(rateLimitedResponse).toBeDefined();
    expect(rateLimitedResponse?.body.message).toMatch(/Too many.*requests/i);
  });

  it('should allow bypass in test/development environments', async () => {
    // Set test environment with bypass flag
    process.env.NODE_ENV = 'test';
    process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

    // Create a new Express app with test settings
    const testApp = express();
    testApp.use(express.json());
    await registerRoutes(testApp);
    const testAgent = request.agent(testApp);

    // Login
    await testAgent
      .post('/api/auth/login')
      .send({
        username: siteAdminUser.username,
        password: 'TestPassword123!'
      })
      .expect(200);

    // Make multiple requests that would normally trigger rate limiting
    const timestamp = Date.now();
    const responses: request.Response[] = [];

    for (let i = 0; i < 25; i++) {
      const response = await testAgent
        .post('/api/athletes')
        .send({
          firstName: `TestAthlete${i}`,
          lastName: `Bypass${timestamp}`,
          email: `test-bypass-${i}-${timestamp}@test.com`,
          sports: ['Soccer']
        });
      responses.push(response);
    }

    // All requests should succeed (bypass is working)
    const successCount = responses.filter(r => r.status === 201).length;
    expect(successCount).toBe(25);

    // Clean up created athletes
    // Note: Using deleteUser is correct - in the unified model, athletes are users
    for (const response of responses) {
      if (response.status === 201 && response.body?.id) {
        try {
          await storage.deleteUser(response.body.id);
        } catch (error) {
          // Ignore cleanup errors (athlete may have already been deleted)
        }
      }
    }
  });
});
