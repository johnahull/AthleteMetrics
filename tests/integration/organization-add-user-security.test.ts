/**
 * Security regression tests for POST /api/organizations/:id/users
 *
 * Guards against a privilege-escalation / mass-assignment vulnerability where:
 *  - the route only required authentication (any org member passed the check), and
 *  - req.body was passed straight into createUser, whose column whitelist includes
 *    `isSiteAdmin` and whose role defaulted from client-supplied `role`.
 *
 * That allowed any athlete-role member to mint a site administrator.
 */

// Set environment variables before any imports
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { storage } from '../../packages/api/storage';
import type { Organization, User } from '@shared/schema';

// Mock vite module before importing registerRoutes
vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const PASSWORD = 'TestPass123!';

describe('POST /api/organizations/:id/users — authorization', () => {
  let org: Organization;
  let orgAdmin: User;
  let athlete: User;
  let app: express.Express;
  const createdUsernames: string[] = [];

  async function agentFor(user: User) {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ username: user.username, password: PASSWORD })
      .expect(200);
    return agent;
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL must be set to run integration tests.');
    }

    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    await registerRoutes(app);

    const ts = Date.now();
    org = await storage.createOrganization({
      name: `Wave1 Security Org ${ts}`,
      description: 'add-user authorization tests',
    });

    orgAdmin = await storage.createUser({
      username: `wave1admin${ts}`,
      password: PASSWORD,
      emails: [`wave1admin${ts}@test.com`],
      firstName: 'Org',
      lastName: 'Admin',
    });
    await storage.addUserToOrganization(orgAdmin.id, org.id, 'org_admin');

    athlete = await storage.createUser({
      username: `wave1athlete${ts}`,
      password: PASSWORD,
      emails: [`wave1athlete${ts}@test.com`],
      firstName: 'Reg',
      lastName: 'Athlete',
    });
    await storage.addUserToOrganization(athlete.id, org.id, 'athlete');
  });

  afterAll(async () => {
    for (const username of createdUsernames) {
      try {
        const u = await storage.getUserByUsername(username);
        if (u) await storage.deleteUser(u.id);
      } catch { /* best-effort cleanup */ }
    }
    try { await storage.deleteUser(orgAdmin.id); } catch { /* ignore */ }
    try { await storage.deleteUser(athlete.id); } catch { /* ignore */ }
    try { await storage.deleteOrganization(org.id); } catch { /* ignore */ }
  });

  it('forbids an athlete-role member from creating a site admin', async () => {
    const agent = await agentFor(athlete);
    const username = `wave1escalated${Date.now()}`;
    createdUsernames.push(username);

    const res = await agent
      .post(`/api/organizations/${org.id}/users`)
      .send({
        username,
        password: PASSWORD,
        emails: [`${username}@test.com`],
        firstName: 'Esc',
        lastName: 'Alated',
        role: 'org_admin',
        isSiteAdmin: true,
      });

    expect(res.status).toBe(403);

    // And no escalated account may exist as a side effect.
    const created = await storage.getUserByUsername(username);
    expect(created).toBeFalsy();
  });

  it('ignores a client-supplied isSiteAdmin flag when an org admin adds a user', async () => {
    const agent = await agentFor(orgAdmin);
    const username = `wave1coach${Date.now()}`;
    createdUsernames.push(username);

    const res = await agent
      .post(`/api/organizations/${org.id}/users`)
      .send({
        username,
        password: PASSWORD,
        emails: [`${username}@test.com`],
        firstName: 'New',
        lastName: 'Coach',
        role: 'coach',
        isSiteAdmin: true,
      });

    expect(res.status).toBe(201);

    const created = await storage.getUserByUsername(username);
    expect(created).toBeTruthy();
    expect(created!.isSiteAdmin).toBe(false);
  });
});
