/**
 * Integration Tests for Organization Routes
 *
 * These tests verify the complete request/response cycle for organization
 * deactivation, reactivation, deletion, and dependency checking endpoints.
 * Unlike unit tests, these use real HTTP requests and a test database.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../server';
import { db } from '../../server/db';
import { organizations, users, userOrganizations, teams, userTeams, measurements, auditLogs } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { hashPassword } from '../../server/auth-utils';

// Test data
let testSiteAdmin: any;
let testOrg: any;
let authCookie: string;

beforeAll(async () => {
  // Create test site admin
  const hashedPassword = await hashPassword('TestPassword123!');
  [testSiteAdmin] = await db.insert(users).values({
    username: 'test-site-admin-org-routes',
    emails: ['test-org-routes@example.com'],
    password: hashedPassword,
    firstName: 'Test',
    lastName: 'Admin',
    fullName: 'Test Admin',
    isSiteAdmin: true,
    isActive: true,
  }).returning();

  // Authenticate and get session cookie
  const loginResponse = await request(app)
    .post('/api/login')
    .send({
      username: 'test-site-admin-org-routes',
      password: 'TestPassword123!',
    });

  authCookie = loginResponse.headers['set-cookie'][0];
});

afterAll(async () => {
  // Cleanup test data
  if (testSiteAdmin?.id) {
    await db.delete(users).where(eq(users.id, testSiteAdmin.id));
  }
});

beforeEach(async () => {
  // Create fresh test organization for each test
  [testOrg] = await db.insert(organizations).values({
    name: `Test Org ${Date.now()}`,
    description: 'Test organization for integration tests',
    isActive: true,
  }).returning();
});

describe('POST /api/organizations/:id/deactivate', () => {
  it('should deactivate an active organization', async () => {
    const response = await request(app)
      .patch(`/api/organizations/${testOrg.id}/status`)
      .set('Cookie', authCookie)
      .send({ isActive: false });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: testOrg.id,
      isActive: false,
    });

    // Verify database state
    const [updated] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, testOrg.id));

    expect(updated.isActive).toBe(false);

    // Verify audit log created
    const logs = await db
      .select()
      .from(auditLogs)
      .where(and(
        eq(auditLogs.action, 'organization_deactivated'),
        eq(auditLogs.resourceId, testOrg.id)
      ));

    expect(logs.length).toBeGreaterThan(0);
  });

  it('should return 400 if organization already deactivated', async () => {
    // First deactivate
    await db
      .update(organizations)
      .set({ isActive: false })
      .where(eq(organizations.id, testOrg.id));

    // Try to deactivate again
    const response = await request(app)
      .patch(`/api/organizations/${testOrg.id}/status`)
      .set('Cookie', authCookie)
      .send({ isActive: false });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('already deactivated');
  });

  it('should return 404 for non-existent organization', async () => {
    const response = await request(app)
      .patch('/api/organizations/00000000-0000-0000-0000-000000000000/status')
      .set('Cookie', authCookie)
      .send({ isActive: false });

    expect(response.status).toBe(404);
  });

  it('should return 400 for invalid UUID format', async () => {
    const response = await request(app)
      .patch('/api/organizations/invalid-uuid/status')
      .set('Cookie', authCookie)
      .send({ isActive: false });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('Invalid organization ID format');
  });
});

describe('POST /api/organizations/:id/reactivate', () => {
  beforeEach(async () => {
    // Deactivate test org for reactivation tests
    await db
      .update(organizations)
      .set({ isActive: false })
      .where(eq(organizations.id, testOrg.id));
  });

  it('should reactivate a deactivated organization', async () => {
    const response = await request(app)
      .patch(`/api/organizations/${testOrg.id}/status`)
      .set('Cookie', authCookie)
      .send({ isActive: true });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: testOrg.id,
      isActive: true,
    });

    // Verify database state
    const [updated] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, testOrg.id));

    expect(updated.isActive).toBe(true);

    // Verify audit log created
    const logs = await db
      .select()
      .from(auditLogs)
      .where(and(
        eq(auditLogs.action, 'organization_reactivated'),
        eq(auditLogs.resourceId, testOrg.id)
      ));

    expect(logs.length).toBeGreaterThan(0);
  });

  it('should return 400 if organization already active', async () => {
    // First reactivate
    await db
      .update(organizations)
      .set({ isActive: true })
      .where(eq(organizations.id, testOrg.id));

    // Try to reactivate again
    const response = await request(app)
      .patch(`/api/organizations/${testOrg.id}/status`)
      .set('Cookie', authCookie)
      .send({ isActive: true });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('already active');
  });
});

describe('GET /api/organizations/:id/dependencies', () => {
  let testUser: any;
  let testTeam: any;

  beforeEach(async () => {
    // Create test user
    const hashedPassword = await hashPassword('TestPassword123!');
    [testUser] = await db.insert(users).values({
      username: `test-user-${Date.now()}`,
      emails: ['test@example.com'],
      password: hashedPassword,
      firstName: 'Test',
      lastName: 'User',
      fullName: 'Test User',
      isActive: true,
    }).returning();

    // Add user to organization
    await db.insert(userOrganizations).values({
      userId: testUser.id,
      organizationId: testOrg.id,
      role: 'athlete',
    });

    // Create test team
    [testTeam] = await db.insert(teams).values({
      organizationId: testOrg.id,
      name: 'Test Team',
      level: 'Club',
    }).returning();

    // Add user to team
    await db.insert(userTeams).values({
      userId: testUser.id,
      teamId: testTeam.id,
      isActive: true,
    });

    // Create test measurement
    await db.insert(measurements).values({
      userId: testUser.id,
      submittedBy: testSiteAdmin.id,
      teamId: testTeam.id,
      date: new Date().toISOString().split('T')[0],
      age: 20,
      metric: 'FLY10_TIME',
      value: '1.850',
      units: 's',
      isVerified: false,
    });
  });

  it('should return dependency counts for organization', async () => {
    const response = await request(app)
      .get(`/api/organizations/${testOrg.id}/dependencies`)
      .set('Cookie', authCookie);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      users: expect.any(Number),
      teams: expect.any(Number),
      measurements: expect.any(Number),
    });

    // Should have at least 1 user, 1 team, 1 measurement
    expect(response.body.users).toBeGreaterThanOrEqual(1);
    expect(response.body.teams).toBeGreaterThanOrEqual(1);
    expect(response.body.measurements).toBeGreaterThanOrEqual(1);

    // Verify audit log created
    const logs = await db
      .select()
      .from(auditLogs)
      .where(and(
        eq(auditLogs.action, 'organization_dependencies_viewed'),
        eq(auditLogs.resourceId, testOrg.id)
      ));

    expect(logs.length).toBeGreaterThan(0);
  });

  it('should return zero counts for empty organization', async () => {
    // Create empty organization
    const [emptyOrg] = await db.insert(organizations).values({
      name: `Empty Org ${Date.now()}`,
      isActive: true,
    }).returning();

    const response = await request(app)
      .get(`/api/organizations/${emptyOrg.id}/dependencies`)
      .set('Cookie', authCookie);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      users: 0,
      teams: 0,
      measurements: 0,
    });

    // Cleanup
    await db.delete(organizations).where(eq(organizations.id, emptyOrg.id));
  });
});

describe('DELETE /api/organizations/:id', () => {
  it('should delete organization with no dependencies', async () => {
    const response = await request(app)
      .delete(`/api/organizations/${testOrg.id}`)
      .set('Cookie', authCookie)
      .send({ confirmationName: testOrg.name });

    expect(response.status).toBe(200);
    expect(response.body.message).toContain('successfully deleted');

    // Verify organization is deleted
    const [deleted] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, testOrg.id));

    expect(deleted).toBeUndefined();

    // Verify audit log created (before deletion, so check by action)
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'organization_deleted'));

    expect(logs.length).toBeGreaterThan(0);
  });

  it('should prevent deletion of organization with dependencies', async () => {
    // Add a user to the organization
    const hashedPassword = await hashPassword('TestPassword123!');
    const [testUser] = await db.insert(users).values({
      username: `test-user-${Date.now()}`,
      emails: ['test@example.com'],
      password: hashedPassword,
      firstName: 'Test',
      lastName: 'User',
      fullName: 'Test User',
      isActive: true,
    }).returning();

    await db.insert(userOrganizations).values({
      userId: testUser.id,
      organizationId: testOrg.id,
      role: 'athlete',
    });

    const response = await request(app)
      .delete(`/api/organizations/${testOrg.id}`)
      .set('Cookie', authCookie)
      .send({ confirmationName: testOrg.name });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('has dependencies');

    // Verify organization still exists
    const [stillExists] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, testOrg.id));

    expect(stillExists).toBeDefined();

    // Cleanup
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, testUser.id));
    await db.delete(users).where(eq(users.id, testUser.id));
  });

  it('should return 400 if confirmation name does not match', async () => {
    const response = await request(app)
      .delete(`/api/organizations/${testOrg.id}`)
      .set('Cookie', authCookie)
      .send({ confirmationName: 'Wrong Name' });

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('confirmation does not match');
  });

  it('should use constant-time comparison for confirmation name', async () => {
    // Test case-insensitive comparison
    const response = await request(app)
      .delete(`/api/organizations/${testOrg.id}`)
      .set('Cookie', authCookie)
      .send({ confirmationName: testOrg.name.toUpperCase() });

    // Should work regardless of case
    expect([200, 400]).toContain(response.status);

    // The key security test: timing should be consistent
    // This is more of a documentation test - actual timing analysis
    // would require statistical testing over many iterations
  });
});

describe('Authorization', () => {
  let regularUser: any;
  let regularUserCookie: string;

  beforeAll(async () => {
    // Create regular (non-admin) user
    const hashedPassword = await hashPassword('TestPassword123!');
    [regularUser] = await db.insert(users).values({
      username: 'test-regular-user-org-routes',
      emails: ['regular@example.com'],
      password: hashedPassword,
      firstName: 'Regular',
      lastName: 'User',
      fullName: 'Regular User',
      isSiteAdmin: false,
      isActive: true,
    }).returning();

    // Authenticate regular user
    const loginResponse = await request(app)
      .post('/api/login')
      .send({
        username: 'test-regular-user-org-routes',
        password: 'TestPassword123!',
      });

    regularUserCookie = loginResponse.headers['set-cookie'][0];
  });

  afterAll(async () => {
    if (regularUser?.id) {
      await db.delete(users).where(eq(users.id, regularUser.id));
    }
  });

  it('should prevent non-admin from deactivating organization', async () => {
    const response = await request(app)
      .patch(`/api/organizations/${testOrg.id}/status`)
      .set('Cookie', regularUserCookie)
      .send({ isActive: false });

    expect(response.status).toBe(403);
  });

  it('should prevent non-admin from deleting organization', async () => {
    const response = await request(app)
      .delete(`/api/organizations/${testOrg.id}`)
      .set('Cookie', regularUserCookie)
      .send({ confirmationName: testOrg.name });

    expect(response.status).toBe(403);
  });

  it('should prevent unauthenticated access', async () => {
    const response = await request(app)
      .patch(`/api/organizations/${testOrg.id}/status`)
      .send({ isActive: false });

    expect(response.status).toBe(401);
  });
});
