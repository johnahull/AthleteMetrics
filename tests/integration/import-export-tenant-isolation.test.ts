/**
 * Tenant-isolation regression tests for import/export.
 *
 *  - GET /api/export/teams returned every tenant's teams (no org scoping).
 *  - CSV import trusted a client-supplied options.organizationId and only
 *    validated it inside the create-team branch, so a caller could import
 *    athletes/measurements into an organization they do not belong to.
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { storage } from '../../packages/api/storage';
import type { Organization, Team, User } from '@shared/schema';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const PASSWORD = 'TestPass123!';

describe('Import/export tenant isolation', () => {
  let app: express.Express;
  let orgA: Organization;
  let orgB: Organization;
  let orgC: Organization;
  let teamA: Team;
  let teamB: Team;
  let teamC: Team;
  let userA: User;
  let agentA: ReturnType<typeof request.agent>;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set.');
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    await registerRoutes(app);

    const ts = Date.now();
    orgA = await storage.createOrganization({ name: `Iso Org A ${ts}`, description: 'a' });
    orgB = await storage.createOrganization({ name: `Iso Org B ${ts}`, description: 'b' });
    orgC = await storage.createOrganization({ name: `Iso Org C ${ts}`, description: 'c' });
    teamA = await storage.createTeam({ name: `Iso Team A ${ts}`, level: 'Club', organizationId: orgA.id });
    teamB = await storage.createTeam({ name: `Iso Team B ${ts}`, level: 'Club', organizationId: orgB.id });
    teamC = await storage.createTeam({ name: `Iso Team C ${ts}`, level: 'Club', organizationId: orgC.id });

    userA = await storage.createUser({
      username: `isousera${ts}`,
      password: PASSWORD,
      emails: [`isousera${ts}@test.com`],
      firstName: 'Iso',
      lastName: 'UserA',
    });
    // userA belongs to TWO orgs (A and C) but not B.
    await storage.addUserToOrganization(userA.id, orgA.id, 'org_admin');
    await storage.addUserToOrganization(userA.id, orgC.id, 'coach');

    agentA = request.agent(app);
    await agentA.post('/api/auth/login').send({ username: userA.username, password: PASSWORD }).expect(200);
  });

  afterAll(async () => {
    try { await storage.deleteUser(userA.id); } catch { /* ignore */ }
    try { await storage.deleteTeam(teamA.id); } catch { /* ignore */ }
    try { await storage.deleteTeam(teamB.id); } catch { /* ignore */ }
    try { await storage.deleteTeam(teamC.id); } catch { /* ignore */ }
    try { await storage.deleteOrganization(orgA.id); } catch { /* ignore */ }
    try { await storage.deleteOrganization(orgB.id); } catch { /* ignore */ }
    try { await storage.deleteOrganization(orgC.id); } catch { /* ignore */ }
  });

  it('GET /api/export/teams returns teams from all the caller\'s orgs, and no others', async () => {
    const res = await agentA.get('/api/export/teams').expect(200);
    // Both of userA's organizations (A and C) are included...
    expect(res.text).toContain(teamA.id);
    expect(res.text).toContain(teamC.id);
    // ...but not an organization they don't belong to.
    expect(res.text).not.toContain(teamB.id);
  });

  it('a repeated organizationId param (array) cannot bypass team-export scoping', async () => {
    // ?organizationId=orgB&organizationId=orgB arrives as an array; it must be
    // treated as "no org requested" (caller's own orgs), never leak orgB.
    const res = await agentA
      .get('/api/export/teams')
      .query({ organizationId: [orgB.id, orgB.id] })
      .expect(200);
    expect(res.text).toContain(teamA.id);
    expect(res.text).not.toContain(teamB.id);
  });

  it('blocks importing athletes into an organization the caller does not belong to', async () => {
    const res = await agentA
      .post('/api/import/athletes')
      .field('options', JSON.stringify({ organizationId: orgB.id, teamHandling: 'leave_teamless' }))
      .field('preview', 'true')
      .attach('file', Buffer.from('firstName,lastName\nJohn,Doe'), 'athletes.csv');

    expect(res.status).toBe(403);
  });

  it('allows importing athletes into the caller\'s own organization', async () => {
    const res = await agentA
      .post('/api/import/athletes')
      .field('options', JSON.stringify({ organizationId: orgA.id, teamHandling: 'leave_teamless' }))
      .field('preview', 'true')
      .attach('file', Buffer.from('firstName,lastName\nJane,Roe'), 'athletes.csv');

    expect(res.status).not.toBe(403);
  });
});
