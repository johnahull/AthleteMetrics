/**
 * Integration tests for GET /api/metric-explanations (athlete-readable)
 *
 * Verifies:
 *  - Authed athlete can fetch explanations for built-in codes
 *  - Custom-org-metric codes resolve via organizationId query param
 *  - Site-admin override wins over built-in per-field
 *  - Unauthed request → 401
 *  - Cross-org custom metric request (user not in org) → 403
 *  - Validation: missing codes → 400
 */

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import {
  organizations,
  users,
  userOrganizations,
  customOrgMetrics,
  siteMetricExplanations,
} from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

let app: Express;
let testOrg: any;
let otherOrg: any;
let athlete: any;
let athleteCookie: string;
const overriddenCodes: string[] = [];

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);
});

beforeEach(async () => {
  const ts = Date.now();

  [testOrg] = await db
    .insert(organizations)
    .values({
      name: `Expl Routes Org ${ts}`,
      description: 'athlete metric explanation route tests',
      isActive: true,
    })
    .returning();

  [otherOrg] = await db
    .insert(organizations)
    .values({
      name: `Expl Routes Other Org ${ts}`,
      description: 'org the athlete does NOT belong to',
      isActive: true,
    })
    .returning();

  const hashed = await hashPassword('TestAthlete123!');
  [athlete] = await db
    .insert(users)
    .values({
      username: `expl_athlete_${ts}`,
      emails: [`expl_athlete_${ts}@test.com`],
      password: hashed,
      firstName: 'Test',
      lastName: 'Athlete',
      fullName: 'Test Athlete',
    })
    .returning();

  await db.insert(userOrganizations).values({
    userId: athlete.id,
    organizationId: testOrg.id,
    role: 'athlete',
  });

  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: athlete.username, password: 'TestAthlete123!' });
  athleteCookie = login.headers['set-cookie'][0];
});

afterEach(async () => {
  if (overriddenCodes.length > 0) {
    await db
      .delete(siteMetricExplanations)
      .where(inArray(siteMetricExplanations.metricCode, overriddenCodes));
    overriddenCodes.length = 0;
  }
  if (testOrg?.id) {
    await db.delete(customOrgMetrics).where(eq(customOrgMetrics.organizationId, testOrg.id));
  }
  if (otherOrg?.id) {
    await db.delete(customOrgMetrics).where(eq(customOrgMetrics.organizationId, otherOrg.id));
  }
  if (athlete?.id && testOrg?.id) {
    await db
      .delete(userOrganizations)
      .where(
        and(
          eq(userOrganizations.userId, athlete.id),
          eq(userOrganizations.organizationId, testOrg.id),
        ),
      );
  }
  if (athlete?.id) {
    await db.delete(users).where(eq(users.id, athlete.id));
  }
  if (testOrg?.id) {
    await db.delete(organizations).where(eq(organizations.id, testOrg.id));
  }
  if (otherOrg?.id) {
    await db.delete(organizations).where(eq(organizations.id, otherOrg.id));
  }
});

describe('GET /api/metric-explanations', () => {
  it('401 when unauthenticated', async () => {
    const res = await request(app).get('/api/metric-explanations?codes=FLY10_TIME');
    expect(res.status).toBe(401);
  });

  it('400 when codes query param is missing', async () => {
    const res = await request(app)
      .get('/api/metric-explanations')
      .set('Cookie', athleteCookie);
    expect(res.status).toBe(400);
  });

  it('returns built-in explanations for authed athlete', async () => {
    const res = await request(app)
      .get('/api/metric-explanations?codes=FLY10_TIME,VERTICAL_JUMP')
      .set('Cookie', athleteCookie);

    expect(res.status).toBe(200);
    expect(res.body.explanations.FLY10_TIME).toBeDefined();
    expect(res.body.explanations.FLY10_TIME.title).toBe('10-Yard Fly');
    expect(res.body.explanations.FLY10_TIME.directionOfBetter).toBe('lower');
    expect(res.body.explanations.VERTICAL_JUMP.title).toBe('Vertical Jump');
    expect(res.body.explanations.VERTICAL_JUMP.directionOfBetter).toBe('higher');
  });

  it('includes custom-org-metric label when organizationId matches the athletes org', async () => {
    await db.insert(customOrgMetrics).values({
      organizationId: testOrg.id,
      code: 'CUSTOM_SHUTTLE',
      label: 'Shuttle Run',
      description: 'Back-and-forth sprint between two cones.',
      unit: 'seconds',
      metricType: 'lower_is_better',
    });

    const res = await request(app)
      .get(`/api/metric-explanations?codes=CUSTOM_SHUTTLE&organizationId=${testOrg.id}`)
      .set('Cookie', athleteCookie);

    expect(res.status).toBe(200);
    const expl = res.body.explanations.CUSTOM_SHUTTLE;
    expect(expl).toBeDefined();
    expect(expl.title).toBe('Shuttle Run');
    expect(expl.whatItMeasures).toBe('Back-and-forth sprint between two cones.');
    expect(expl.directionOfBetter).toBe('lower');
    expect(expl.unitNote).toMatch(/seconds/i);
  });

  it('403 when user requests explanations for an org they do not belong to', async () => {
    await db.insert(customOrgMetrics).values({
      organizationId: otherOrg.id,
      code: 'CUSTOM_FOREIGN',
      label: 'Foreign Metric',
      description: 'Should not be exposed.',
      unit: 'reps',
      metricType: 'higher_is_better',
    });

    const res = await request(app)
      .get(`/api/metric-explanations?codes=CUSTOM_FOREIGN&organizationId=${otherOrg.id}`)
      .set('Cookie', athleteCookie);

    expect(res.status).toBe(403);
  });

  it('site-admin override wins over built-in prose per-field', async () => {
    await db.insert(siteMetricExplanations).values({
      metricCode: 'FLY10_TIME',
      shortDescription: 'Overridden short desc for tests',
      updatedBy: null,
    });
    overriddenCodes.push('FLY10_TIME');

    const res = await request(app)
      .get('/api/metric-explanations?codes=FLY10_TIME')
      .set('Cookie', athleteCookie);

    expect(res.status).toBe(200);
    expect(res.body.explanations.FLY10_TIME.shortDescription).toBe(
      'Overridden short desc for tests',
    );
    // Non-overridden fields still come from built-in
    expect(res.body.explanations.FLY10_TIME.title).toBe('10-Yard Fly');
  });

  it('falls back to generic placeholder for unknown codes', async () => {
    const res = await request(app)
      .get('/api/metric-explanations?codes=UNKNOWN_CODE')
      .set('Cookie', athleteCookie);

    expect(res.status).toBe(200);
    expect(res.body.explanations.UNKNOWN_CODE).toBeDefined();
    expect(res.body.explanations.UNKNOWN_CODE.whatItMeasures).toMatch(
      /custom metric tracked by your organization/i,
    );
  });
});
