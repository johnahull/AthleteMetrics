/**
 * Authorization parity tests for the org-admin-gated organization routes.
 *
 * These pin the behavior of the "org admin (or site admin) required" gate across
 * the organization routes so the duplicated inline checks can be consolidated
 * onto the shared requireOrgAccess({ role: 'org_admin' }) middleware without
 * changing behavior: a non-admin member is rejected (403); an org admin passes.
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
import type { Organization, User } from '@shared/schema';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const PASSWORD = 'TestPass123!';

describe('Organization route authorization (org-admin gate)', () => {
  let app: express.Express;
  let org: Organization;
  let orgAdmin: User;
  let coach: User;
  let athlete: User;
  let siteAdmin: User;
  const trackedUserIds: string[] = [];
  let seq = 0;

  async function makeUser(role: 'org_admin' | 'coach' | 'athlete'): Promise<User> {
    const uniq = `${Date.now()}${seq++}`;
    const u = await storage.createUser({
      username: `orgauth${role.replace('_', '')}${uniq}`,
      password: PASSWORD,
      emails: [`orgauth${role.replace('_', '')}${uniq}@test.com`],
      firstName: 'Org',
      lastName: 'Auth',
    });
    await storage.addUserToOrganization(u.id, org.id, role);
    trackedUserIds.push(u.id);
    return u;
  }

  async function agentFor(user: User) {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: user.username, password: PASSWORD }).expect(200);
    return agent;
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set.');
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    await registerRoutes(app);

    org = await storage.createOrganization({ name: `Org Auth ${Date.now()}`, description: 'x' });
    orgAdmin = await makeUser('org_admin');
    coach = await makeUser('coach');
    athlete = await makeUser('athlete');

    // Site admin who is NOT a member of the org (to exercise the site-admin bypass).
    const saUniq = `${Date.now()}${seq++}`;
    siteAdmin = await storage.createUser({
      username: `orgauthsite${saUniq}`,
      password: PASSWORD,
      emails: [`orgauthsite${saUniq}@test.com`],
      firstName: 'Site',
      lastName: 'Admin',
      isSiteAdmin: true,
    });
    trackedUserIds.push(siteAdmin.id);
  });

  afterAll(async () => {
    for (const id of trackedUserIds) {
      try { await storage.deleteUser(id); } catch { /* ignore */ }
    }
    try { await storage.deleteOrganization(org.id); } catch { /* ignore */ }
  });

  describe('POST /api/organizations/:id/users', () => {
    it('rejects a non-admin member', async () => {
      const agent = await agentFor(coach);
      const res = await agent.post(`/api/organizations/${org.id}/users`).send({
        username: `blocked${Date.now()}`, password: PASSWORD,
        emails: [`blocked${Date.now()}@test.com`], firstName: 'B', lastName: 'L', role: 'athlete',
      });
      expect(res.status).toBe(403);
    });

    it('allows an org admin', async () => {
      const agent = await agentFor(orgAdmin);
      const username = `added${Date.now()}${seq++}`;
      const res = await agent.post(`/api/organizations/${org.id}/users`).send({
        username, password: PASSWORD, emails: [`${username}@test.com`],
        firstName: 'A', lastName: 'D', role: 'coach',
      });
      expect(res.status).toBe(201);
      const created = await storage.getUserByUsername(username);
      if (created) trackedUserIds.push(created.id);
    });
  });

  describe('PUT /api/organizations/:id/users/:userId/role', () => {
    it('rejects a non-admin member', async () => {
      const agent = await agentFor(coach);
      const res = await agent.put(`/api/organizations/${org.id}/users/${athlete.id}/role`).send({ role: 'coach' });
      expect(res.status).toBe(403);
    });

    it('allows an org admin', async () => {
      const target = await makeUser('athlete');
      const agent = await agentFor(orgAdmin);
      const res = await agent.put(`/api/organizations/${org.id}/users/${target.id}/role`).send({ role: 'coach' });
      expect(res.status).toBe(200);
    });

    it('blocks an org admin from changing their own role (handler self-guard preserved)', async () => {
      const agent = await agentFor(orgAdmin);
      const res = await agent.put(`/api/organizations/${org.id}/users/${orgAdmin.id}/role`).send({ role: 'coach' });
      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/organizations/:id/org-settings', () => {
    it('rejects a non-admin member', async () => {
      const agent = await agentFor(coach);
      const res = await agent.patch(`/api/organizations/${org.id}/org-settings`).send({ someSetting: true });
      expect(res.status).toBe(403);
    });

    it('allows a site admin (full system access), even without org membership', async () => {
      // Consistent with every other org-admin route, which all bypass for site
      // admins. (The pre-refactor inline check was the odd one out.)
      const agent = await agentFor(siteAdmin);
      const res = await agent.patch(`/api/organizations/${org.id}/org-settings`).send({ someSetting: true });
      expect(res.status).not.toBe(403);
    });
  });

  describe('merge-profiles gate', () => {
    it('rejects a non-admin member on preview', async () => {
      const agent = await agentFor(coach);
      const res = await agent.post(`/api/organizations/${org.id}/merge-profiles/preview`).send({});
      expect(res.status).toBe(403);
    });

    it('rejects a non-admin member on merge', async () => {
      const agent = await agentFor(coach);
      const res = await agent.post(`/api/organizations/${org.id}/merge-profiles`).send({});
      expect(res.status).toBe(403);
    });
  });
});
