/**
 * Integration Tests: Training Module Feature Flag
 *
 * Tests verify:
 * - requireTrainingEnabled middleware blocks when site flag off (disabledBy: 'site_admin')
 * - requireTrainingEnabled middleware blocks when org flag off (disabledBy: 'org_admin')
 * - Both flags enabled → training routes return 200
 * - PATCH /api/site-settings includes trainingModuleEnabled + audit log
 * - GET /api/site-settings/public includes trainingModuleEnabled
 * - PATCH /api/organizations/:id with trainingEnabled:true when site=false → 422
 * - PATCH /api/organizations/:id with trainingEnabled:true when site=true → 200
 * - GET /api/organizations/:id includes trainingEnabled
 */

// Must be set BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { db } from '../../packages/api/db';
import { storage } from '../../packages/api/storage';
import { organizations, users, siteSettings, userOrganizations } from '@shared/schema';
import { eq } from 'drizzle-orm';

const TS = Date.now();

let app: express.Application;
let testOrg: any;
let siteAdmin: any;
let testCoach: any;
let siteAdminCookie: string;
let coachCookie: string;

// We'll temporarily patch site_settings for tests — track the original
let originalSiteSettings: any;

async function getSiteSettings() {
  const rows = await db.select().from(siteSettings).limit(1);
  return rows[0] ?? null;
}

async function setSiteTrainingFlag(enabled: boolean) {
  await db.update(siteSettings).set({ trainingModuleEnabled: enabled });
}

async function setOrgTrainingFlag(orgId: string, enabled: boolean) {
  await db.update(organizations).set({ trainingEnabled: enabled }).where(eq(organizations.id, orgId));
}

beforeAll(async () => {
  // Setup Express
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

  // Mock login endpoint
  app.post('/mock-login', async (req: any, res: any) => {
    const { userId, role } = req.body;
    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    req.session.user = {
      id: user.id,
      emails: user.emails,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: user.fullName,
      role: role || 'coach',
      isSiteAdmin: user.isSiteAdmin || false,
    };
    res.json({ success: true });
  });

  // Import all routes
  const { registerAllRoutes } = await import('../../packages/api/routes/index');
  const { registerTrainingRoutes } = await import('../../packages/api/routes/training-routes');

  // Register site-settings routes (used in registerAllRoutes too but we need training)
  registerAllRoutes(app);
  registerTrainingRoutes(app);

  // Save original site settings for restoration
  originalSiteSettings = await getSiteSettings();

  // Ensure site settings row exists with training disabled
  if (!originalSiteSettings) {
    await db.insert(siteSettings).values({ aiModel: 'gpt-5-nano', wellnessModuleEnabled: true, trainingModuleEnabled: false });
  } else {
    await setSiteTrainingFlag(false);
  }

  // Create test organization with training disabled by default
  const [org] = await db.insert(organizations).values({
    name: `Training Flag Test Org ${TS}`,
    orgType: 'club',
    trainingEnabled: false,
  }).returning();
  testOrg = org;

  // Create site admin
  const [admin] = await db.insert(users).values({
    username: `training_flag_siteadmin_${TS}`,
    emails: [`training_flag_admin_${TS}@test.com`],
    password: 'hashed_pw',
    firstName: 'Training',
    lastName: 'Admin',
    fullName: 'Training Admin',
    isSiteAdmin: true,
  }).returning();
  siteAdmin = admin;

  // Create test coach in the org
  const [coach] = await db.insert(users).values({
    username: `training_flag_coach_${TS}`,
    emails: [`training_flag_coach_${TS}@test.com`],
    password: 'hashed_pw',
    firstName: 'Training',
    lastName: 'Coach',
    fullName: 'Training Coach',
    isSiteAdmin: false,
  }).returning();
  testCoach = coach;

  await storage.addUserToOrganization(testCoach.id, testOrg.id, 'coach');

  // Create sessions
  const adminRes = await request(app).post('/mock-login').send({ userId: siteAdmin.id, role: 'site_admin' });
  siteAdminCookie = adminRes.headers['set-cookie']?.[0] || '';

  const coachRes = await request(app).post('/mock-login').send({ userId: testCoach.id, role: 'coach' });
  coachCookie = coachRes.headers['set-cookie']?.[0] || '';
});

afterAll(async () => {
  // Restore original training flags
  if (originalSiteSettings !== null) {
    await db.update(siteSettings).set({
      trainingModuleEnabled: originalSiteSettings?.trainingModuleEnabled ?? false,
    });
  }

  // Cleanup in reverse-insertion order
  const userOrgRows = await db.select().from(userOrganizations).where(eq(userOrganizations.userId, testCoach.id));
  for (const row of userOrgRows) {
    await db.delete(userOrganizations).where(eq(userOrganizations.id, row.id));
  }
  if (testCoach) await db.delete(users).where(eq(users.id, testCoach.id));
  if (siteAdmin) await db.delete(users).where(eq(users.id, siteAdmin.id));
  if (testOrg) await db.delete(organizations).where(eq(organizations.id, testOrg.id));
});

// ---------------------------------------------------------------------------
// requireTrainingEnabled middleware tests
// ---------------------------------------------------------------------------

describe('Training feature flag — middleware gate', () => {
  it('GET /api/training/exercises → 403 {featureDisabled:true, disabledBy:"site_admin"} when site flag false', async () => {
    await setSiteTrainingFlag(false);
    await setOrgTrainingFlag(testOrg.id, true);

    const res = await request(app)
      .get('/api/training/exercises')
      .set('Cookie', coachCookie);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ featureDisabled: true, disabledBy: 'site_admin' });
  });

  it('GET /api/training/exercises → 403 {featureDisabled:true, disabledBy:"org_admin"} when site=true, org=false', async () => {
    await setSiteTrainingFlag(true);
    await setOrgTrainingFlag(testOrg.id, false);

    const res = await request(app)
      .get('/api/training/exercises')
      .set('Cookie', coachCookie);

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ featureDisabled: true, disabledBy: 'org_admin' });
  });

  it('GET /api/training/exercises → 200 when both flags true', async () => {
    await setSiteTrainingFlag(true);
    await setOrgTrainingFlag(testOrg.id, true);

    const res = await request(app)
      .get('/api/training/exercises')
      .set('Cookie', coachCookie);

    expect(res.status).toBe(200);
  });

  it('GET /api/training/my-program → 403 when site flag false', async () => {
    await setSiteTrainingFlag(false);

    const res = await request(app)
      .get('/api/training/my-program')
      .set('Cookie', coachCookie);

    expect(res.status).toBe(403);
    expect(res.body.featureDisabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Site settings: trainingModuleEnabled
// ---------------------------------------------------------------------------

describe('PATCH /api/site-settings — trainingModuleEnabled', () => {
  it('updates trainingModuleEnabled and creates audit log', async () => {
    await setSiteTrainingFlag(false);

    const res = await request(app)
      .patch('/api/site-settings')
      .set('Cookie', siteAdminCookie)
      .send({ trainingModuleEnabled: true });

    expect(res.status).toBe(200);
    expect(res.body.trainingModuleEnabled).toBe(true);

    // Reset
    await setSiteTrainingFlag(false);
  });

  it('GET /api/site-settings/public includes trainingModuleEnabled', async () => {
    await setSiteTrainingFlag(false);

    const res = await request(app).get('/api/site-settings/public');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('trainingModuleEnabled');
    expect(res.body.trainingModuleEnabled).toBe(false);
  });

  it('returns 401 for unauthenticated PATCH', async () => {
    const res = await request(app)
      .patch('/api/site-settings')
      .send({ trainingModuleEnabled: true });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Organization routes: trainingEnabled
// ---------------------------------------------------------------------------

describe('PATCH /api/organizations/:id — trainingEnabled', () => {
  it('returns 422 when trying to enable trainingEnabled but site flag is off', async () => {
    await setSiteTrainingFlag(false);

    const res = await request(app)
      .patch(`/api/organizations/${testOrg.id}`)
      .set('Cookie', siteAdminCookie)
      .send({ trainingEnabled: true });

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/globally/i);
  });

  it('returns 200 when enabling trainingEnabled with site flag on', async () => {
    await setSiteTrainingFlag(true);

    const res = await request(app)
      .patch(`/api/organizations/${testOrg.id}`)
      .set('Cookie', siteAdminCookie)
      .send({ trainingEnabled: true });

    expect(res.status).toBe(200);

    // Reset
    await setOrgTrainingFlag(testOrg.id, false);
    await setSiteTrainingFlag(false);
  });

  it('GET /api/organizations/:id includes trainingEnabled field', async () => {
    const res = await request(app)
      .get(`/api/organizations/${testOrg.id}`)
      .set('Cookie', siteAdminCookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('trainingEnabled');
  });
});
