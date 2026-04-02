/**
 * Integration tests for aiPromptContext in org-admin settings
 *
 * Tests the PATCH /api/organizations/:id/org-settings endpoint
 * for creating, updating, clearing, and validating the aiPromptContext field.
 */

// Set environment variables BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { db } from '../../packages/api/db';
import { organizations, users, userOrganizations } from '@shared/schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

// Mock vite module before importing registerRoutes
vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn()
}));

import { registerRoutes } from '../../packages/api/routes';

let app: Express;
let orgAdminCookie: string;
let athleteCookie: string;
let otherOrgAdminCookie: string;
let testOrg: any;
let otherOrg: any;
let orgAdminUser: any;
let athleteUser: any;
let otherOrgAdminUser: any;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  // Create test organization with AI enabled by site admin
  [testOrg] = await db.insert(organizations).values({
    name: `AI Context Test Org ${Date.now()}`,
    description: 'Test org for aiPromptContext integration tests',
    isActive: true,
    aiEnabledBySiteAdmin: true,
    aiEnabled: true,
  }).returning();

  // Create org admin user
  const hashedPassword = await bcrypt.hash('OrgAdmin123!', BCRYPT_SALT_ROUNDS);
  [orgAdminUser] = await db.insert(users).values({
    username: `orgadmin-aiprompt-${Date.now()}`,
    emails: [`orgadmin-aiprompt-${Date.now()}@test.com`],
    password: hashedPassword,
    firstName: 'OrgAdmin',
    lastName: 'Tester',
    fullName: 'OrgAdmin Tester',
    isActive: true,
  }).returning();

  // Assign org_admin role
  await db.insert(userOrganizations).values({
    userId: orgAdminUser.id,
    organizationId: testOrg.id,
    role: 'org_admin',
  });

  // Login as org admin
  const loginResponse = await request(app)
    .post('/api/auth/login')
    .send({
      username: orgAdminUser.username,
      password: 'OrgAdmin123!',
    });

  if (loginResponse.status !== 200 || !loginResponse.headers['set-cookie']) {
    throw new Error(
      `Org admin login failed (status: ${loginResponse.status}). Response: ${JSON.stringify(loginResponse.body)}`
    );
  }

  orgAdminCookie = loginResponse.headers['set-cookie'][0];

  // Create athlete user in the same org
  const athletePassword = await bcrypt.hash('Athlete123!', BCRYPT_SALT_ROUNDS);
  [athleteUser] = await db.insert(users).values({
    username: `athlete-aiprompt-${Date.now()}`,
    emails: [`athlete-aiprompt-${Date.now()}@test.com`],
    password: athletePassword,
    firstName: 'Athlete',
    lastName: 'Tester',
    fullName: 'Athlete Tester',
    isActive: true,
  }).returning();

  await db.insert(userOrganizations).values({
    userId: athleteUser.id,
    organizationId: testOrg.id,
    role: 'athlete',
  });

  const athleteLogin = await request(app)
    .post('/api/auth/login')
    .send({ username: athleteUser.username, password: 'Athlete123!' });
  athleteCookie = athleteLogin.headers['set-cookie'][0];

  // Create a second (unrelated) org and org admin to test cross-org isolation
  const ts = Date.now();
  [otherOrg] = await db.insert(organizations).values({
    name: `Other AI Context Org ${ts}`,
    isActive: true,
    aiEnabledBySiteAdmin: true,
    aiEnabled: true,
  }).returning();

  const otherHashedPassword = await bcrypt.hash('OtherAdmin123!', BCRYPT_SALT_ROUNDS);
  [otherOrgAdminUser] = await db.insert(users).values({
    username: `other-orgadmin-aiprompt-${ts}`,
    emails: [`other-orgadmin-aiprompt-${ts}@test.com`],
    password: otherHashedPassword,
    firstName: 'Other',
    lastName: 'Admin',
    fullName: 'Other Admin',
    isActive: true,
  }).returning();

  await db.insert(userOrganizations).values({
    userId: otherOrgAdminUser.id,
    organizationId: otherOrg.id,
    role: 'org_admin',
  });

  const otherLoginResponse = await request(app)
    .post('/api/auth/login')
    .send({ username: otherOrgAdminUser.username, password: 'OtherAdmin123!' });

  if (otherLoginResponse.status !== 200 || !otherLoginResponse.headers['set-cookie']) {
    throw new Error(
      `Other org admin login failed (status: ${otherLoginResponse.status}). Response: ${JSON.stringify(otherLoginResponse.body)}`
    );
  }

  otherOrgAdminCookie = otherLoginResponse.headers['set-cookie'][0];
});

afterAll(async () => {
  // Cleanup in reverse order of creation
  for (const user of [otherOrgAdminUser, athleteUser, orgAdminUser]) {
    if (user?.id) {
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    }
  }
  for (const org of [otherOrg, testOrg]) {
    if (org?.id) {
      await db.delete(organizations).where(eq(organizations.id, org.id));
    }
  }
});

describe('PATCH /api/organizations/:id/org-settings – aiPromptContext', () => {
  it('should set aiPromptContext', async () => {
    const context = 'We focus on speed development for youth athletes using French Contrast training.';

    const response = await request(app)
      .patch(`/api/organizations/${testOrg.id}/org-settings`)
      .set('Cookie', orgAdminCookie)
      .send({ aiPromptContext: context });

    expect(response.status).toBe(200);

    // Verify in database
    const [updated] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, testOrg.id));

    expect(updated.aiPromptContext).toBe(context);
  });

  it('should update aiPromptContext to a new value', async () => {
    const newContext = 'We now emphasize injury prevention and periodization.';

    const response = await request(app)
      .patch(`/api/organizations/${testOrg.id}/org-settings`)
      .set('Cookie', orgAdminCookie)
      .send({ aiPromptContext: newContext });

    expect(response.status).toBe(200);

    const [updated] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, testOrg.id));

    expect(updated.aiPromptContext).toBe(newContext);
  });

  it('should clear aiPromptContext with empty string', async () => {
    // First set a value
    await db.update(organizations)
      .set({ aiPromptContext: 'Some context' })
      .where(eq(organizations.id, testOrg.id));

    const response = await request(app)
      .patch(`/api/organizations/${testOrg.id}/org-settings`)
      .set('Cookie', orgAdminCookie)
      .send({ aiPromptContext: '' });

    expect(response.status).toBe(200);

    const [updated] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, testOrg.id));

    expect(updated.aiPromptContext).toBeNull();
  });

  it('should clear aiPromptContext with null', async () => {
    await db.update(organizations)
      .set({ aiPromptContext: 'Some context' })
      .where(eq(organizations.id, testOrg.id));

    const response = await request(app)
      .patch(`/api/organizations/${testOrg.id}/org-settings`)
      .set('Cookie', orgAdminCookie)
      .send({ aiPromptContext: null });

    expect(response.status).toBe(200);

    const [updated] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, testOrg.id));

    expect(updated.aiPromptContext).toBeNull();
  });

  it('should reject aiPromptContext longer than 2000 characters', async () => {
    const longContext = 'A'.repeat(2001);

    const response = await request(app)
      .patch(`/api/organizations/${testOrg.id}/org-settings`)
      .set('Cookie', orgAdminCookie)
      .send({ aiPromptContext: longContext });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('2000 characters');
  });

  it('should accept aiPromptContext at exactly 2000 characters', async () => {
    const maxContext = 'B'.repeat(2000);

    const response = await request(app)
      .patch(`/api/organizations/${testOrg.id}/org-settings`)
      .set('Cookie', orgAdminCookie)
      .send({ aiPromptContext: maxContext });

    expect(response.status).toBe(200);

    const [updated] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, testOrg.id));

    expect(updated.aiPromptContext).toBe(maxContext);
  });

  it('should reject non-string aiPromptContext', async () => {
    const response = await request(app)
      .patch(`/api/organizations/${testOrg.id}/org-settings`)
      .set('Cookie', orgAdminCookie)
      .send({ aiPromptContext: 12345 });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('must be a string');
  });

  it('should not affect other fields when only aiPromptContext is sent', async () => {
    // Set known state
    await db.update(organizations)
      .set({ aiEnabled: true, aiPromptContext: null })
      .where(eq(organizations.id, testOrg.id));

    const response = await request(app)
      .patch(`/api/organizations/${testOrg.id}/org-settings`)
      .set('Cookie', orgAdminCookie)
      .send({ aiPromptContext: 'New context only' });

    expect(response.status).toBe(200);

    const [updated] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, testOrg.id));

    expect(updated.aiPromptContext).toBe('New context only');
    expect(updated.aiEnabled).toBe(true); // unchanged
  });
});

describe('PATCH /api/organizations/:id/org-settings – aiPromptContext authorization', () => {
  it('should reject athlete in the same org', async () => {
    const response = await request(app)
      .patch(`/api/organizations/${testOrg.id}/org-settings`)
      .set('Cookie', athleteCookie)
      .send({ aiPromptContext: 'Athlete trying to set context' });

    expect(response.status).toBe(403);
  });

  it('should forbid an org admin from updating a different org\'s aiPromptContext', async () => {
    const response = await request(app)
      .patch(`/api/organizations/${testOrg.id}/org-settings`)
      .set('Cookie', otherOrgAdminCookie)
      .send({ aiPromptContext: 'Injected from another org' });

    expect(response.status).toBe(403);

    // Verify the database was not modified
    const [unchanged] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, testOrg.id));

    expect(unchanged.aiPromptContext).not.toBe('Injected from another org');
  });

  it('should reject unauthenticated request', async () => {
    const response = await request(app)
      .patch(`/api/organizations/${testOrg.id}/org-settings`)
      .send({ aiPromptContext: 'No auth' });

    expect(response.status).toBe(401);
  });
});
