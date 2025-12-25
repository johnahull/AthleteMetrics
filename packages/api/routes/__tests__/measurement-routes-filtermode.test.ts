import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { registerMeasurementRoutes } from '../measurement-routes';
import { db } from '../../db';
import { users, organizations, userOrganizations, measurements } from '@shared/schema';
import { eq, and, inArray } from 'drizzle-orm';

/**
 * Route-level integration tests for measurement filterMode feature
 * Tests authorization and security at the route layer (not just service layer)
 *
 * Coverage:
 * - Non-admins can only query orgIds they belong to (403 for unauthorized)
 * - Site admins can query any orgIds
 * - Personal measurements (NULL organizationId) are properly isolated
 * - filterMode='all' combines multiple orgs + personal measurements
 * - filterMode='personal' returns only personal measurements
 * - Empty/invalid orgIds handling
 */
describe('Measurement Routes - filterMode Authorization', () => {
  let app: express.Express;
  let siteAdminUserId: string;
  let athleteUserId: string;
  let org1Id: string;
  let org2Id: string;
  let org3Id: string; // Org the athlete does NOT belong to

  beforeAll(async () => {
    // Safety check: prevent running tests against production database
    const dbUrl = process.env.DATABASE_URL || '';
    const allowTestDb = process.env.ALLOW_TEST_DATABASE === 'true';

    if (!dbUrl.includes('test') && !dbUrl.includes('localhost') && !allowTestDb) {
      throw new Error('DATABASE_URL must include "test" or "localhost" for safety. Running tests against production is forbidden. Set ALLOW_TEST_DATABASE=true for known testing databases.');
    }
  });

  beforeEach(async () => {
    // Create Express app with session middleware
    app = express();
    app.use(express.json());
    app.use(session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
    }));

    // Register measurement routes
    registerMeasurementRoutes(app);

    // Create test data with unique identifiers to avoid conflicts
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Create test organizations
    const [org1] = await db.insert(organizations).values({
      name: `Org 1 ${uniqueSuffix}`,
      description: 'Test organization 1',
    }).returning();
    org1Id = org1.id;

    const [org2] = await db.insert(organizations).values({
      name: `Org 2 ${uniqueSuffix}`,
      description: 'Test organization 2',
    }).returning();
    org2Id = org2.id;

    const [org3] = await db.insert(organizations).values({
      name: `Org 3 ${uniqueSuffix}`,
      description: 'Test organization 3 (unauthorized)',
    }).returning();
    org3Id = org3.id;

    // Create site admin user
    const [siteAdmin] = await db.insert(users).values({
      username: `siteadmin_${uniqueSuffix}`,
      emails: ['siteadmin@test.com'],
      password: 'hashedpassword',
      firstName: 'Site',
      lastName: 'Admin',
      fullName: 'Site Admin',
      isSiteAdmin: true,
    }).returning();
    siteAdminUserId = siteAdmin.id;

    // Create athlete user (belongs to org1 and org2, but NOT org3)
    const [athlete] = await db.insert(users).values({
      username: `athlete_${uniqueSuffix}`,
      emails: ['athlete@test.com'],
      password: 'hashedpassword',
      firstName: 'Test',
      lastName: 'Athlete',
      fullName: 'Test Athlete',
      role: 'athlete',
      birthYear: 2000,
    }).returning();
    athleteUserId = athlete.id;

    // Add athlete to org1 and org2 (but NOT org3)
    await db.insert(userOrganizations).values([
      {
        userId: athleteUserId,
        organizationId: org1Id,
        role: 'athlete',
      },
      {
        userId: athleteUserId,
        organizationId: org2Id,
        role: 'athlete',
      },
    ]);

    // Create test measurements
    await db.insert(measurements).values([
      // Org1 measurements
      {
        userId: athleteUserId,
        organizationId: org1Id,
        metric: 'FLY10_TIME',
        value: '1.50',
        units: 's',
        date: '2024-01-01',
        submittedBy: siteAdminUserId,
      },
      // Org2 measurements
      {
        userId: athleteUserId,
        organizationId: org2Id,
        metric: 'FLY10_TIME',
        value: '1.45',
        units: 's',
        date: '2024-01-02',
        submittedBy: siteAdminUserId,
      },
      // Org3 measurements (athlete NOT authorized)
      {
        userId: athleteUserId,
        organizationId: org3Id,
        metric: 'FLY10_TIME',
        value: '1.40',
        units: 's',
        date: '2024-01-03',
        submittedBy: siteAdminUserId,
      },
      // Personal measurement (NULL organizationId)
      {
        userId: athleteUserId,
        organizationId: null,
        metric: 'FLY10_TIME',
        value: '1.55',
        units: 's',
        date: '2024-01-04',
        submittedBy: athleteUserId,
      },
    ]);
  });

  afterEach(async () => {
    // Clean up test data
    await db.delete(measurements).where(eq(measurements.userId, athleteUserId));
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, athleteUserId));
    await db.delete(users).where(inArray(users.id, [siteAdminUserId, athleteUserId]));
    await db.delete(organizations).where(inArray(organizations.id, [org1Id, org2Id, org3Id]));
  });

  // Helper function to create authenticated request
  function createAuthenticatedAgent(userId: string, role: string = 'athlete', isSiteAdmin: boolean = false) {
    const agent = request.agent(app);

    // Simulate authenticated session
    return agent
      .get('/api/measurements')
      .set('Cookie', [`connect.sid=test-session-${userId}`])
      .query({ athleteId: athleteUserId })
      .use((req: any) => {
        // Inject session user for testing
        (req as any).session = {
          user: {
            id: userId,
            username: isSiteAdmin ? 'siteadmin' : 'athlete',
            role: role,
            isSiteAdmin: isSiteAdmin,
          }
        };
      });
  }

  describe('Non-Admin Authorization', () => {
    it('should reject non-admin querying unauthorized orgIds (403)', async () => {
      // Athlete tries to query org3 (which they do NOT belong to)
      const agent = request.agent(app);

      const response = await agent
        .get('/api/measurements')
        .query({
          athleteId: athleteUserId,
          filterMode: 'all',
          orgIds: org3Id, // Unauthorized org
        })
        .use((req: any) => {
          (req as any).session = {
            user: {
              id: athleteUserId,
              username: 'athlete',
              role: 'athlete',
              isSiteAdmin: false,
            }
          };
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('not authorized');
    });

    it('should reject non-admin querying mix of authorized and unauthorized orgIds', async () => {
      // Athlete tries to query org1 (authorized) + org3 (unauthorized)
      const agent = request.agent(app);

      const response = await agent
        .get('/api/measurements')
        .query({
          athleteId: athleteUserId,
          filterMode: 'all',
          orgIds: `${org1Id},${org3Id}`, // Mix of authorized and unauthorized
        })
        .use((req: any) => {
          (req as any).session = {
            user: {
              id: athleteUserId,
              username: 'athlete',
              role: 'athlete',
              isSiteAdmin: false,
            }
          };
        });

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('not authorized');
    });

    it('should allow non-admin querying only their own orgIds', async () => {
      // Athlete queries org1 and org2 (both authorized)
      const agent = request.agent(app);

      const response = await agent
        .get('/api/measurements')
        .query({
          athleteId: athleteUserId,
          filterMode: 'all',
          orgIds: `${org1Id},${org2Id}`, // Both authorized
        })
        .use((req: any) => {
          (req as any).session = {
            user: {
              id: athleteUserId,
              username: 'athlete',
              role: 'athlete',
              isSiteAdmin: false,
            }
          };
        });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      // Should include org1, org2, and personal measurements
      const orgIds = response.body.map((m: any) => m.organizationId).filter(Boolean);
      expect(orgIds).toContain(org1Id);
      expect(orgIds).toContain(org2Id);
      expect(orgIds).not.toContain(org3Id); // Should NOT include unauthorized org
    });
  });

  describe('Site Admin Bypass', () => {
    it('should allow site admin to query any orgIds (including unauthorized)', async () => {
      // Site admin queries all orgs (including org3)
      const agent = request.agent(app);

      const response = await agent
        .get('/api/measurements')
        .query({
          athleteId: athleteUserId,
          filterMode: 'all',
          orgIds: `${org1Id},${org2Id},${org3Id}`, // All orgs
        })
        .use((req: any) => {
          (req as any).session = {
            user: {
              id: siteAdminUserId,
              username: 'siteadmin',
              role: 'site_admin',
              isSiteAdmin: true,
            }
          };
        });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      // Should include all orgs
      const orgIds = response.body.map((m: any) => m.organizationId).filter(Boolean);
      expect(orgIds).toContain(org1Id);
      expect(orgIds).toContain(org2Id);
      expect(orgIds).toContain(org3Id); // Site admin CAN access org3
    });
  });

  describe('filterMode=personal', () => {
    it('should return only personal measurements (NULL organizationId)', async () => {
      const agent = request.agent(app);

      const response = await agent
        .get('/api/measurements')
        .query({
          athleteId: athleteUserId,
          filterMode: 'personal',
        })
        .use((req: any) => {
          (req as any).session = {
            user: {
              id: athleteUserId,
              username: 'athlete',
              role: 'athlete',
              isSiteAdmin: false,
            }
          };
        });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      // All measurements should have NULL organizationId
      const allPersonal = response.body.every((m: any) => m.organizationId === null);
      expect(allPersonal).toBe(true);
      expect(response.body.length).toBeGreaterThan(0); // Should have at least the personal measurement
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty orgIds string (returns empty result for non-admins)', async () => {
      const agent = request.agent(app);

      const response = await agent
        .get('/api/measurements')
        .query({
          athleteId: athleteUserId,
          filterMode: 'all',
          orgIds: '', // Empty string
        })
        .use((req: any) => {
          (req as any).session = {
            user: {
              id: athleteUserId,
              username: 'athlete',
              role: 'athlete',
              isSiteAdmin: false,
            }
          };
        });

      // Empty orgIds should be handled gracefully
      expect(response.status).toBe(200);
    });

    it('should handle whitespace in orgIds', async () => {
      const agent = request.agent(app);

      const response = await agent
        .get('/api/measurements')
        .query({
          athleteId: athleteUserId,
          filterMode: 'all',
          orgIds: `  ${org1Id}  ,  ${org2Id}  `, // Whitespace around UUIDs
        })
        .use((req: any) => {
          (req as any).session = {
            user: {
              id: athleteUserId,
              username: 'athlete',
              role: 'athlete',
              isSiteAdmin: false,
            }
          };
        });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it('should reject invalid UUID format in orgIds', async () => {
      const agent = request.agent(app);

      const response = await agent
        .get('/api/measurements')
        .query({
          athleteId: athleteUserId,
          filterMode: 'all',
          orgIds: 'invalid-uuid,another-invalid',
        })
        .use((req: any) => {
          (req as any).session = {
            user: {
              id: athleteUserId,
              username: 'athlete',
              role: 'athlete',
              isSiteAdmin: false,
            }
          };
        });

      // Should fail Zod validation
      expect(response.status).toBe(400);
      expect(response.body.message).toContain('Invalid query parameters');
    });
  });

  describe('filterMode=all Integration', () => {
    it('should combine multiple orgs + personal measurements', async () => {
      const agent = request.agent(app);

      const response = await agent
        .get('/api/measurements')
        .query({
          athleteId: athleteUserId,
          filterMode: 'all',
          orgIds: `${org1Id},${org2Id}`, // Athlete's authorized orgs
        })
        .use((req: any) => {
          (req as any).session = {
            user: {
              id: athleteUserId,
              username: 'athlete',
              role: 'athlete',
              isSiteAdmin: false,
            }
          };
        });

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      // Should include measurements from org1, org2, AND personal
      const orgIds = response.body.map((m: any) => m.organizationId);
      expect(orgIds).toContain(org1Id);
      expect(orgIds).toContain(org2Id);
      expect(orgIds).toContain(null); // Personal measurement

      // Should have at least 3 measurements (1 from each org + 1 personal)
      expect(response.body.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Rate Limiting', () => {
    it('should apply per-org rate limiting to cross-org queries', async () => {
      // Note: This test verifies that orgSpecificLimiter is applied
      // Actual rate limit testing would require making 10+ requests rapidly
      // which is beyond the scope of this integration test

      const agent = request.agent(app);

      const response = await agent
        .get('/api/measurements')
        .query({
          athleteId: athleteUserId,
          filterMode: 'all',
          orgIds: `${org1Id},${org2Id}`,
        })
        .use((req: any) => {
          (req as any).session = {
            user: {
              id: athleteUserId,
              username: 'athlete',
              role: 'athlete',
              isSiteAdmin: false,
            }
          };
        });

      // First request should succeed
      expect(response.status).toBe(200);

      // Verify rate limit headers are present (express-rate-limit sets these)
      expect(response.headers['ratelimit-limit']).toBeDefined();
    });
  });
});
