/**
 * Integration Tests for Sports Management API Routes
 *
 * Tests verify:
 * - GET /api/sports - List all active sports (authenticated users)
 * - GET /api/site-sports - List all sports including inactive (site admin)
 * - GET /api/sports/:code - Get sport by code
 * - GET /api/sports/:code/usage - Get usage statistics (site admin)
 * - POST /api/sports - Create sport (site admin)
 * - PATCH /api/sports/:code - Update sport (site admin)
 * - DELETE /api/sports/:code - Delete sport (site admin)
 * - GET /api/sports/:sportCode/positions - List positions for a sport
 * - POST /api/sports/:sportCode/positions - Create position (site admin)
 * - PATCH /api/positions/:id - Update position (site admin)
 * - DELETE /api/positions/:id - Delete position (site admin)
 *
 * TDD: These tests are written first, before implementation.
 */

// Set environment variables BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-sports-integration-tests-at-least-32-chars';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { db } from '../../packages/api/db';
import { storage } from '../../packages/api/storage';
import {
  organizations,
  users,
  siteSports,
  sitePositions,
  teams,
} from '@shared/schema';
import { eq, and, isNull } from 'drizzle-orm';

let app: express.Application;
let siteAdmin: any;
let regularUser: any;
let testOrg: any;
let siteAdminCookie: string;
let regularUserCookie: string;

const createdSportIds: string[] = [];
const createdPositionIds: string[] = [];

beforeAll(async () => {
  // Setup Express app with routes
  app = express();
  app.use(express.json());
  app.use(
    session({
      secret: process.env.SESSION_SECRET!,
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
    })
  );

  // Add mock login endpoint for testing
  app.post('/mock-login', async (req: any, res: any) => {
    const { userId, isSiteAdmin } = req.body;
    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    req.session.user = {
      id: user.id,
      emails: user.emails,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      role: 'coach',
      isSiteAdmin: isSiteAdmin ?? user.isSiteAdmin ?? false,
    };
    res.json({ success: true });
  });

  // Import and register sports routes
  const { registerSportsRoutes } = await import('../../packages/api/routes/sport-routes');
  registerSportsRoutes(app);

  // Ensure SOCCER sport exists (may not exist if migration 0058 didn't run)
  const existingSoccer = await db.select().from(siteSports).where(eq(siteSports.code, 'SOCCER')).limit(1);
  if (existingSoccer.length === 0) {
    // Create SOCCER sport with positions (mimics migration 0058 seeding)
    const [soccer] = await db.insert(siteSports).values({
      code: 'SOCCER',
      name: 'Soccer',
      description: 'Association football',
      isSystemDefault: true,
      isActive: true,
    }).returning();

    // Create default positions
    await db.insert(sitePositions).values([
      { sportId: soccer.id, code: 'F', name: 'Forward', shortName: 'FW', isSystemDefault: true, isActive: true },
      { sportId: soccer.id, code: 'M', name: 'Midfielder', shortName: 'MF', isSystemDefault: true, isActive: true },
      { sportId: soccer.id, code: 'D', name: 'Defender', shortName: 'DF', isSystemDefault: true, isActive: true },
      { sportId: soccer.id, code: 'GK', name: 'Goalkeeper', shortName: 'GK', isSystemDefault: true, isActive: true },
    ]);
  }

  // Create test organization
  const [org] = await db.insert(organizations).values({
    name: `Sports Test Org ${Date.now()}`,
    description: 'Test organization for sports route tests',
    orgType: 'club',
  }).returning();
  testOrg = org;

  // Create site admin user
  const [admin] = await db.insert(users).values({
    username: `sports_siteadmin_${Date.now()}`,
    emails: ['sports.siteadmin@test.com'],
    password: 'hashed_password_here',
    firstName: 'Site',
    lastName: 'Admin',
    fullName: 'Site Admin',
    isSiteAdmin: true,
  }).returning();
  siteAdmin = admin;

  // Create regular (non-admin) user
  const [regular] = await db.insert(users).values({
    username: `sports_regular_${Date.now()}`,
    emails: ['sports.regular@test.com'],
    password: 'hashed_password_here',
    firstName: 'Regular',
    lastName: 'User',
    fullName: 'Regular User',
    isSiteAdmin: false,
  }).returning();
  regularUser = regular;

  // Get session cookies
  const adminLoginRes = await request(app)
    .post('/mock-login')
    .send({ userId: siteAdmin.id, isSiteAdmin: true });
  siteAdminCookie = adminLoginRes.headers['set-cookie']?.[0] || '';

  const regularLoginRes = await request(app)
    .post('/mock-login')
    .send({ userId: regularUser.id, isSiteAdmin: false });
  regularUserCookie = regularLoginRes.headers['set-cookie']?.[0] || '';
});

afterEach(async () => {
  // Clean up created positions
  for (const id of createdPositionIds) {
    try {
      await db.delete(sitePositions).where(eq(sitePositions.id, id));
    } catch (error) {
      // Ignore if already deleted
    }
  }
  createdPositionIds.length = 0;

  // Clean up created sports
  for (const id of createdSportIds) {
    try {
      await db.delete(siteSports).where(eq(siteSports.id, id));
    } catch (error) {
      // Ignore if already deleted
    }
  }
  createdSportIds.length = 0;
});

afterAll(async () => {
  // Clean up test data
  if (regularUser?.id) {
    await db.delete(users).where(eq(users.id, regularUser.id));
  }
  if (siteAdmin?.id) {
    await db.delete(users).where(eq(users.id, siteAdmin.id));
  }
  if (testOrg?.id) {
    await db.delete(organizations).where(eq(organizations.id, testOrg.id));
  }
});

// ============================================================================
// SPORTS CRUD TESTS
// ============================================================================

describe('Sports Management API', () => {
  describe('GET /api/sports', () => {
    it('should return active sports for authenticated users', async () => {
      const res = await request(app)
        .get('/api/sports')
        .set('Cookie', regularUserCookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // Should include seeded Soccer sport
      const soccer = res.body.find((s: any) => s.code === 'SOCCER');
      expect(soccer).toBeDefined();
      expect(soccer.name).toBe('Soccer');
      expect(soccer.isActive).toBe(true);
    });

    it('should reject unauthenticated requests', async () => {
      const res = await request(app).get('/api/sports');

      expect(res.status).toBe(401);
    });

    it('should not include inactive sports for regular users', async () => {
      // Create an inactive sport
      const [inactiveSport] = await db.insert(siteSports).values({
        code: 'INACTIVE_TEST',
        name: 'Inactive Test Sport',
        isActive: false,
      }).returning();
      createdSportIds.push(inactiveSport.id);

      const res = await request(app)
        .get('/api/sports')
        .set('Cookie', regularUserCookie);

      expect(res.status).toBe(200);
      const found = res.body.find((s: any) => s.code === 'INACTIVE_TEST');
      expect(found).toBeUndefined();
    });
  });

  describe('GET /api/site-sports', () => {
    it('should return all sports including inactive for site admin', async () => {
      // Create an inactive sport
      const [inactiveSport] = await db.insert(siteSports).values({
        code: 'INACTIVE_ADMIN_TEST',
        name: 'Inactive Admin Test',
        isActive: false,
      }).returning();
      createdSportIds.push(inactiveSport.id);

      const res = await request(app)
        .get('/api/site-sports')
        .set('Cookie', siteAdminCookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const found = res.body.find((s: any) => s.code === 'INACTIVE_ADMIN_TEST');
      expect(found).toBeDefined();
    });

    it('should reject non-admin users', async () => {
      const res = await request(app)
        .get('/api/site-sports')
        .set('Cookie', regularUserCookie);

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/sports/:code', () => {
    it('should return sport details with positions', async () => {
      const res = await request(app)
        .get('/api/sports/SOCCER')
        .set('Cookie', regularUserCookie);

      expect(res.status).toBe(200);
      expect(res.body.code).toBe('SOCCER');
      expect(res.body.name).toBe('Soccer');
      expect(Array.isArray(res.body.positions)).toBe(true);
      // Should have seeded positions
      expect(res.body.positions.length).toBeGreaterThanOrEqual(4);
    });

    it('should return 404 for non-existent sport', async () => {
      const res = await request(app)
        .get('/api/sports/NONEXISTENT')
        .set('Cookie', regularUserCookie);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/sports/:code/usage', () => {
    it('should return usage counts for site admin', async () => {
      const res = await request(app)
        .get('/api/sports/SOCCER/usage')
        .set('Cookie', siteAdminCookie);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('athleteCount');
      expect(res.body).toHaveProperty('teamCount');
      expect(res.body).toHaveProperty('metricCount');
      expect(typeof res.body.athleteCount).toBe('number');
    });

    it('should reject non-admin users', async () => {
      const res = await request(app)
        .get('/api/sports/SOCCER/usage')
        .set('Cookie', regularUserCookie);

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/sports', () => {
    it('should create a new sport as site admin', async () => {
      const newSport = {
        code: 'BASKETBALL',
        name: 'Basketball',
        description: 'Basketball sport for testing',
        icon: 'basketball',
        color: 'orange',
      };

      const res = await request(app)
        .post('/api/sports')
        .set('Cookie', siteAdminCookie)
        .send(newSport);

      expect(res.status).toBe(201);
      expect(res.body.code).toBe('BASKETBALL');
      expect(res.body.name).toBe('Basketball');
      expect(res.body.isSystemDefault).toBe(false);
      createdSportIds.push(res.body.id);
    });

    it('should reject duplicate sport code', async () => {
      const res = await request(app)
        .post('/api/sports')
        .set('Cookie', siteAdminCookie)
        .send({
          code: 'SOCCER', // Already exists
          name: 'Duplicate Soccer',
        });

      expect(res.status).toBe(409);
    });

    it('should reject invalid sport code format', async () => {
      const res = await request(app)
        .post('/api/sports')
        .set('Cookie', siteAdminCookie)
        .send({
          code: 'invalid-code', // lowercase not allowed
          name: 'Invalid Code Sport',
        });

      expect(res.status).toBe(400);
    });

    it('should reject non-admin users', async () => {
      const res = await request(app)
        .post('/api/sports')
        .set('Cookie', regularUserCookie)
        .send({
          code: 'TEST_SPORT',
          name: 'Test Sport',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/sports/:code', () => {
    it('should update sport as site admin', async () => {
      // Create a sport to update
      const [sport] = await db.insert(siteSports).values({
        code: 'UPDATE_TEST',
        name: 'Update Test',
      }).returning();
      createdSportIds.push(sport.id);

      const res = await request(app)
        .patch('/api/sports/UPDATE_TEST')
        .set('Cookie', siteAdminCookie)
        .send({
          name: 'Updated Name',
          description: 'New description',
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Name');
      expect(res.body.description).toBe('New description');
    });

    it('should not allow updating sport code', async () => {
      const res = await request(app)
        .patch('/api/sports/SOCCER')
        .set('Cookie', siteAdminCookie)
        .send({
          code: 'FUTBOL', // Should not be allowed
        });

      // Code should remain unchanged
      expect(res.status).toBe(200);
      expect(res.body.code).toBe('SOCCER');
    });

    it('should reject non-admin users', async () => {
      const res = await request(app)
        .patch('/api/sports/SOCCER')
        .set('Cookie', regularUserCookie)
        .send({
          name: 'Hacked Name',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/sports/:code', () => {
    it('should delete sport as site admin', async () => {
      // Create a sport to delete
      const [sport] = await db.insert(siteSports).values({
        code: 'DELETE_TEST',
        name: 'Delete Test',
      }).returning();

      const res = await request(app)
        .delete('/api/sports/DELETE_TEST')
        .set('Cookie', siteAdminCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify deleted
      const deleted = await db.select()
        .from(siteSports)
        .where(eq(siteSports.code, 'DELETE_TEST'));
      expect(deleted.length).toBe(0);
    });

    it('should not allow deleting system default sports', async () => {
      const res = await request(app)
        .delete('/api/sports/SOCCER')
        .set('Cookie', siteAdminCookie);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('system default');
    });

    it('should reject non-admin users', async () => {
      const res = await request(app)
        .delete('/api/sports/SOCCER')
        .set('Cookie', regularUserCookie);

      expect(res.status).toBe(403);
    });
  });
});

// ============================================================================
// POSITIONS CRUD TESTS
// ============================================================================

describe('Positions Management API', () => {
  describe('GET /api/sports/:sportCode/positions', () => {
    it('should return positions for a sport', async () => {
      const res = await request(app)
        .get('/api/sports/SOCCER/positions')
        .set('Cookie', regularUserCookie);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // Should have seeded Soccer positions
      const forward = res.body.find((p: any) => p.code === 'F');
      expect(forward).toBeDefined();
      expect(forward.name).toBe('Forward');
    });

    it('should return 404 for non-existent sport', async () => {
      const res = await request(app)
        .get('/api/sports/NONEXISTENT/positions')
        .set('Cookie', regularUserCookie);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/sports/:sportCode/positions', () => {
    it('should create a new position as site admin', async () => {
      // First create a sport without positions
      const [sport] = await db.insert(siteSports).values({
        code: 'TENNIS',
        name: 'Tennis',
      }).returning();
      createdSportIds.push(sport.id);

      const newPosition = {
        code: 'S',
        name: 'Singles',
        shortName: 'SGL',
        description: 'Singles player',
      };

      const res = await request(app)
        .post('/api/sports/TENNIS/positions')
        .set('Cookie', siteAdminCookie)
        .send(newPosition);

      expect(res.status).toBe(201);
      expect(res.body.code).toBe('S');
      expect(res.body.name).toBe('Singles');
      expect(res.body.sportId).toBe(sport.id);
      createdPositionIds.push(res.body.id);
    });

    it('should reject duplicate position code within same sport', async () => {
      const res = await request(app)
        .post('/api/sports/SOCCER/positions')
        .set('Cookie', siteAdminCookie)
        .send({
          code: 'F', // Already exists for SOCCER
          name: 'Duplicate Forward',
        });

      expect(res.status).toBe(409);
    });

    it('should reject non-admin users', async () => {
      const res = await request(app)
        .post('/api/sports/SOCCER/positions')
        .set('Cookie', regularUserCookie)
        .send({
          code: 'TEST',
          name: 'Test Position',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/positions/:id', () => {
    it('should update position as site admin', async () => {
      // Create a sport and position to update
      const [sport] = await db.insert(siteSports).values({
        code: 'PATCH_POS_TEST',
        name: 'Patch Position Test',
      }).returning();
      createdSportIds.push(sport.id);

      const [position] = await db.insert(sitePositions).values({
        sportId: sport.id,
        code: 'T',
        name: 'Test Position',
      }).returning();
      createdPositionIds.push(position.id);

      const res = await request(app)
        .patch(`/api/positions/${position.id}`)
        .set('Cookie', siteAdminCookie)
        .send({
          name: 'Updated Position Name',
          shortName: 'UPN',
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Position Name');
      expect(res.body.shortName).toBe('UPN');
    });

    it('should reject non-admin users', async () => {
      // Get a real position ID
      const positions = await db.select().from(sitePositions).limit(1);
      const positionId = positions[0]?.id;

      if (positionId) {
        const res = await request(app)
          .patch(`/api/positions/${positionId}`)
          .set('Cookie', regularUserCookie)
          .send({
            name: 'Hacked Name',
          });

        expect(res.status).toBe(403);
      }
    });
  });

  describe('DELETE /api/positions/:id', () => {
    it('should delete position as site admin', async () => {
      // Create a sport and position to delete
      const [sport] = await db.insert(siteSports).values({
        code: 'DEL_POS_TEST',
        name: 'Delete Position Test',
      }).returning();
      createdSportIds.push(sport.id);

      const [position] = await db.insert(sitePositions).values({
        sportId: sport.id,
        code: 'DEL',
        name: 'To Be Deleted',
      }).returning();

      const res = await request(app)
        .delete(`/api/positions/${position.id}`)
        .set('Cookie', siteAdminCookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should not allow deleting system default positions', async () => {
      // Find a system default position (seeded Soccer positions)
      const [soccerForward] = await db.select()
        .from(sitePositions)
        .where(and(
          eq(sitePositions.code, 'F'),
          eq(sitePositions.isSystemDefault, true)
        ));

      if (soccerForward) {
        const res = await request(app)
          .delete(`/api/positions/${soccerForward.id}`)
          .set('Cookie', siteAdminCookie);

        expect(res.status).toBe(403);
        expect(res.body.message).toContain('system default');
      }
    });
  });

  describe('GET /api/positions/:id/usage', () => {
    it('should return usage count for position', async () => {
      // Get a position ID
      const [position] = await db.select()
        .from(sitePositions)
        .where(eq(sitePositions.code, 'F'));

      if (position) {
        const res = await request(app)
          .get(`/api/positions/${position.id}/usage`)
          .set('Cookie', siteAdminCookie);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('athleteCount');
        expect(typeof res.body.athleteCount).toBe('number');
      }
    });

    it('should reject non-admin users', async () => {
      const [position] = await db.select()
        .from(sitePositions)
        .where(eq(sitePositions.code, 'F'));

      if (position) {
        const res = await request(app)
          .get(`/api/positions/${position.id}/usage`)
          .set('Cookie', regularUserCookie);

        expect(res.status).toBe(403);
      }
    });
  });
});
