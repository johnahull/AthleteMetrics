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
  let teamA: Team;
  let teamB: Team;
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
    teamA = await storage.createTeam({ name: `Iso Team A ${ts}`, level: 'Club', organizationId: orgA.id });
    teamB = await storage.createTeam({ name: `Iso Team B ${ts}`, level: 'Club', organizationId: orgB.id });

    userA = await storage.createUser({
      username: `isousera${ts}`,
      password: PASSWORD,
      emails: [`isousera${ts}@test.com`],
      firstName: 'Iso',
      lastName: 'UserA',
    });
    await storage.addUserToOrganization(userA.id, orgA.id, 'org_admin');

    agentA = request.agent(app);
    await agentA.post('/api/auth/login').send({ username: userA.username, password: PASSWORD }).expect(200);
  });

  afterAll(async () => {
    try { await storage.deleteUser(userA.id); } catch { /* ignore */ }
    try { await storage.deleteTeam(teamA.id); } catch { /* ignore */ }
    try { await storage.deleteTeam(teamB.id); } catch { /* ignore */ }
    try { await storage.deleteOrganization(orgA.id); } catch { /* ignore */ }
    try { await storage.deleteOrganization(orgB.id); } catch { /* ignore */ }
  });

  it('GET /api/export/teams returns only the caller\'s organization teams', async () => {
    const res = await agentA.get('/api/export/teams').expect(200);
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
