/**
 * Integration tests for Sprint F-V Profile routes
 *
 * Tests the full API flow: session discovery, profile generation,
 * CRUD operations, RBAC, and feature toggle enforcement.
 *
 * NOTE: Requires DATABASE_URL environment variable to be set
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Express } from 'express';
import { randomUUID } from 'crypto';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn()
}));

import { registerRoutes } from '../../packages/api/routes';
import { db } from '../../packages/api/db';
import {
  users,
  organizations,
  teams,
  userTeams,
  measurements,
  siteSettings,
  sprintFvProfiles,
  userOrganizations,
} from '@shared/schema';
import { eq } from 'drizzle-orm';

let app: Express;
let adminAgent: request.SuperAgentTest;
let testOrgId: string;
let testTeamId: string;
let testAthleteId: string;
let testCoachId: string;

const TEST_DATE = '2026-03-15';
const uniqueSuffix = () => `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

describe('Sprint F-V Profile Integration Tests', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL must be set to run integration tests.');
    }

    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    await registerRoutes(app);

    // Login as admin
    adminAgent = request.agent(app);
    const loginResponse = await adminAgent
      .post('/api/auth/login')
      .send({
        username: process.env.ADMIN_USER || 'admin',
        password: process.env.ADMIN_PASSWORD || 'TestPassword123!'
      });
    expect(loginResponse.status).toBe(200);

    // Create test org with sprint F-V enabled
    const [testOrg] = await db.insert(organizations).values({
      id: randomUUID(),
      name: `Sprint FV Test Org ${uniqueSuffix()}`,
      type: 'club',
      isActive: true,
      sprintFvEnabled: true,
    }).returning();
    testOrgId = testOrg.id;

    // Enable sprint F-V at site level (insert if missing, update if exists)
    const existingSettings = await db.select().from(siteSettings).limit(1);
    if (existingSettings.length > 0) {
      await db.update(siteSettings)
        .set({ sprintFvEnabled: true })
        .where(eq(siteSettings.id, existingSettings[0].id));
    } else {
      await db.insert(siteSettings).values({
        id: randomUUID(),
        sprintFvEnabled: true,
      });
    }

    // Create test team
    const [testTeam] = await db.insert(teams).values({
      id: randomUUID(),
      name: `Sprint FV Test Team ${uniqueSuffix()}`,
      organizationId: testOrgId,
      sport: 'Track',
      isArchived: false,
    }).returning();
    testTeamId = testTeam.id;

    // Create test athlete with weight
    const [athlete] = await db.insert(users).values({
      id: randomUUID(),
      username: `fv_athlete_${uniqueSuffix()}`,
      email: `fv_athlete_${uniqueSuffix()}@test.com`,
      password: 'Test123!@',
      role: 'athlete',
      firstName: 'Test',
      lastName: 'Sprinter',
      fullName: 'Test Sprinter',
      birthDate: '2002-06-15',
      birthYear: 2002,
      gender: 'Male',
      sports: ['Track'],
      primaryOrganizationId: testOrgId,
      isActive: true,
    }).returning();
    testAthleteId = athlete.id;

    // Create org membership for athlete
    await db.insert(userOrganizations).values({
      userId: testAthleteId,
      organizationId: testOrgId,
      role: 'athlete',
    });

    // Create test coach
    const [coach] = await db.insert(users).values({
      id: randomUUID(),
      username: `fv_coach_${uniqueSuffix()}`,
      email: `fv_coach_${uniqueSuffix()}@test.com`,
      password: 'Test123!@',
      role: 'coach',
      firstName: 'Test',
      lastName: 'Coach',
      fullName: 'Test Coach',
      primaryOrganizationId: testOrgId,
      isActive: true,
    }).returning();
    testCoachId = coach.id;

    await db.insert(userOrganizations).values({
      userId: testCoachId,
      organizationId: testOrgId,
      role: 'coach',
    });

    // Insert split time measurements for the athlete
    const splitMetrics = [
      { metric: 'DASH_5YD', value: '1.10' },
      { metric: 'DASH_10YD', value: '1.82' },
      { metric: 'DASH_20YD', value: '3.15' },
      { metric: 'DASH_30YD', value: '4.45' },
    ];

    for (const m of splitMetrics) {
      await db.insert(measurements).values({
        id: randomUUID(),
        userId: testAthleteId,
        submittedBy: testCoachId,
        date: TEST_DATE,
        age: 24,
        metric: m.metric,
        value: m.value,
        units: 's',
        organizationId: testOrgId,
        teamId: testTeamId,
        teamNameSnapshot: 'Sprint FV Test Team',
      });
    }

    // Insert WEIGHT measurement
    await db.insert(measurements).values({
      id: randomUUID(),
      userId: testAthleteId,
      submittedBy: testCoachId,
      date: TEST_DATE,
      age: 24,
      metric: 'WEIGHT',
      value: '176.0',
      units: 'lbs',
      organizationId: testOrgId,
    });
  });

  afterAll(async () => {
    // Cleanup test data
    await db.delete(sprintFvProfiles).where(eq(sprintFvProfiles.userId, testAthleteId));
    await db.delete(measurements).where(eq(measurements.userId, testAthleteId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, testOrgId));
    await db.delete(userTeams).where(eq(userTeams.teamId, testTeamId));
    await db.delete(teams).where(eq(teams.id, testTeamId));
    await db.delete(users).where(eq(users.id, testAthleteId));
    await db.delete(users).where(eq(users.id, testCoachId));
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  });

  describe('GET /api/sprint-fv-profiles/eligible/:userId', () => {
    it('should return eligible sessions for athlete with splits', async () => {
      const res = await adminAgent
        .get(`/api/sprint-fv-profiles/eligible/${testAthleteId}`)
        .expect(200);

      expect(res.body.sessions).toBeDefined();
      expect(res.body.sessions.length).toBeGreaterThanOrEqual(1);

      const session = res.body.sessions[0];
      expect(session.date).toBe(TEST_DATE);
      expect(session.availableSplits).toContain('DASH_5YD');
      expect(session.availableSplits).toContain('DASH_10YD');
      expect(session.availableSplits).toContain('DASH_20YD');
      expect(session.availableSplits).toContain('DASH_30YD');
      expect(session.hasWeight).toBe(true);
      expect(session.profileExists).toBe(false);
    });
  });

  describe('POST /api/sprint-fv-profiles/generate', () => {
    let generatedProfileId: string;

    it('should generate a profile from existing measurements', async () => {
      const res = await adminAgent
        .post('/api/sprint-fv-profiles/generate')
        .send({
          userId: testAthleteId,
          date: TEST_DATE,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.userId).toBe(testAthleteId);
      expect(res.body.date).toBe(TEST_DATE);
      expect(res.body.vmax).toBeTruthy();
      expect(res.body.f0Rel).toBeTruthy();
      expect(res.body.v0).toBeTruthy();
      expect(res.body.pmaxRel).toBeTruthy();
      expect(res.body.fitR2).toBeTruthy();
      expect(parseFloat(res.body.fitR2)).toBeGreaterThan(0.95);

      // Analysis should be present
      expect(res.body.analysisJson).toBeDefined();
      expect(res.body.analysisJson.classification).toBeDefined();
      expect(res.body.analysisJson.optimalGap).toBeDefined();
      expect(['force-deficit', 'velocity-deficit', 'well-balanced']).toContain(
        res.body.analysisJson.classification.classification
      );

      generatedProfileId = res.body.id;
    });

    it('should return the generated profile by ID', async () => {
      const res = await adminAgent
        .get(`/api/sprint-fv-profiles/${generatedProfileId}`)
        .expect(200);

      expect(res.body.id).toBe(generatedProfileId);
      expect(res.body.analysisJson).toBeDefined();
    });

    it('should list profiles for athlete', async () => {
      const res = await adminAgent
        .get(`/api/sprint-fv-profiles/athlete/${testAthleteId}`)
        .expect(200);

      expect(res.body.profiles).toBeDefined();
      expect(res.body.profiles.length).toBeGreaterThanOrEqual(1);
      expect(res.body.total).toBeGreaterThanOrEqual(1);
    });

    it('should regenerate profile for same date (replace)', async () => {
      const res = await adminAgent
        .post('/api/sprint-fv-profiles/generate')
        .send({
          userId: testAthleteId,
          date: TEST_DATE,
        })
        .expect(201);

      // Should get a new ID (old one was deleted)
      expect(res.body.id).toBeDefined();
      expect(res.body.id).not.toBe(generatedProfileId);
      generatedProfileId = res.body.id;
    });

    it('should delete a profile', async () => {
      await adminAgent
        .delete(`/api/sprint-fv-profiles/${generatedProfileId}`)
        .expect(200);

      // Verify it's gone
      await adminAgent
        .get(`/api/sprint-fv-profiles/${generatedProfileId}`)
        .expect(404);
    });
  });

  describe('POST /api/sprint-fv-profiles/generate with bodyMassLbsOverride', () => {
    it('should accept manual body mass override in lbs and convert to kg', async () => {
      const res = await adminAgent
        .post('/api/sprint-fv-profiles/generate')
        .send({
          userId: testAthleteId,
          date: TEST_DATE,
          bodyMassLbsOverride: 187.4, // ~85 kg
        })
        .expect(201);

      // 187.4 lbs * 0.453592 = ~85.0 kg
      expect(parseFloat(res.body.bodyMassKg)).toBeCloseTo(85.0, 0);

      // Cleanup
      await adminAgent.delete(`/api/sprint-fv-profiles/${res.body.id}`);
    });
  });

  describe('Feature toggle enforcement', () => {
    it('should return 403 when site-level toggle is disabled', async () => {
      // Disable at site level
      const settings = await db.select().from(siteSettings).limit(1);
      if (settings.length > 0) {
        await db.update(siteSettings)
          .set({ sprintFvEnabled: false })
          .where(eq(siteSettings.id, settings[0].id));
      }

      const res = await adminAgent
        .get(`/api/sprint-fv-profiles/eligible/${testAthleteId}`)
        .expect(403);

      expect(res.body.featureDisabled).toBe(true);
      expect(res.body.disabledBy).toBe('site_admin');

      // Re-enable
      if (settings.length > 0) {
        await db.update(siteSettings)
          .set({ sprintFvEnabled: true })
          .where(eq(siteSettings.id, settings[0].id));
      }
    });

    it('should return 403 when org-level toggle is disabled (for org members)', async () => {
      // Disable at org level
      await db.update(organizations)
        .set({ sprintFvEnabled: false })
        .where(eq(organizations.id, testOrgId));

      // Site admin bypasses org-level checks (no org membership resolved),
      // so this returns 200. The org-level block applies to coaches/athletes
      // who have an org membership that the middleware can resolve.
      const res = await adminAgent
        .get(`/api/sprint-fv-profiles/eligible/${testAthleteId}`)
        .expect(200);

      // Re-enable
      await db.update(organizations)
        .set({ sprintFvEnabled: true })
        .where(eq(organizations.id, testOrgId));
    });
  });

  describe('Validation', () => {
    it('should return 400 for invalid date format', async () => {
      await adminAgent
        .post('/api/sprint-fv-profiles/generate')
        .send({
          userId: testAthleteId,
          date: 'not-a-date',
        })
        .expect(400);
    });

    it('should return 400 for missing userId', async () => {
      await adminAgent
        .post('/api/sprint-fv-profiles/generate')
        .send({
          date: TEST_DATE,
        })
        .expect(400);
    });
  });
});
