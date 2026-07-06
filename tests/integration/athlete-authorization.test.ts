/**
 * Security regression tests for athlete management authorization.
 *
 * Guards against two authorization gaps:
 *  1. DELETE /api/athletes/:id and PATCH /api/athletes/:id/status used
 *     requireAthleteAccessPermission, whose self-access branch let an athlete
 *     delete their own account or re-activate themselves after an admin
 *     deactivated them.
 *  2. POST /api/athletes/bulk-delete and /bulk-invite checked org membership
 *     only (no role), so any athlete-role member could delete/invite teammates.
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
import type { Organization, User, Team } from '@shared/schema';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const PASSWORD = 'TestPass123!';

describe('Athlete management authorization', () => {
  let org: Organization;
  let team: Team;
  let orgAdmin: User;
  let coach: User;
  let app: express.Express;
  const trackedUserIds: string[] = [];

  let seq = 0;
  async function makeUser(role: 'org_admin' | 'coach' | 'athlete'): Promise<User> {
    const uniq = `${Date.now()}${seq++}`;
    const user = await storage.createUser({
      username: `wave1${role.replace('_', '')}${uniq}`,
      password: PASSWORD,
      emails: [`wave1${role.replace('_', '')}${uniq}@test.com`],
      firstName: 'Test',
      lastName: role,
    });
    await storage.addUserToOrganization(user.id, org.id, role);
    trackedUserIds.push(user.id);
    return user;
  }

  async function agentFor(user: User) {
    const agent = request.agent(app);
    await agent
      .post('/api/auth/login')
      .send({ username: user.username, password: PASSWORD })
      .expect(200);
    return agent;
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set.');
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    await registerRoutes(app);

    org = await storage.createOrganization({
      name: `Wave1 Athlete Auth Org ${Date.now()}`,
      description: 'athlete authorization tests',
    });
    team = await storage.createTeam({
      name: `Wave1 Auth Team ${Date.now()}`,
      level: 'Club',
      organizationId: org.id,
    });
    orgAdmin = await makeUser('org_admin');
    coach = await makeUser('coach');
  });

  afterAll(async () => {
    for (const id of trackedUserIds) {
      try { await storage.deleteUser(id); } catch { /* best-effort */ }
    }
    try { await storage.deleteTeam(team.id); } catch { /* ignore */ }
    try { await storage.deleteOrganization(org.id); } catch { /* ignore */ }
  });

  it('forbids an athlete from deleting their own account', async () => {
    const athlete = await makeUser('athlete');
    const agent = await agentFor(athlete);

    const res = await agent.delete(`/api/athletes/${athlete.id}`);

    expect(res.status).toBe(403);
    expect(await storage.getUser(athlete.id)).toBeTruthy();
  });

  it('forbids an athlete from re-activating themselves via status toggle', async () => {
    const athlete = await makeUser('athlete');
    // Log in while active (a deactivated user cannot authenticate), then the
    // admin deactivates them; the athlete's existing session must not be able
    // to reverse it.
    const agent = await agentFor(athlete);
    await storage.updateUser(athlete.id, { isActive: false });

    const res = await agent
      .patch(`/api/athletes/${athlete.id}/status`)
      .send({ isActive: true });

    expect(res.status).toBe(403);
    const after = await storage.getUser(athlete.id);
    expect(after?.isActive).toBe(false);
  });

  it('forbids an athlete from bulk-deleting a teammate', async () => {
    const attacker = await makeUser('athlete');
    const victim = await makeUser('athlete');
    const agent = await agentFor(attacker);

    const res = await agent
      .post('/api/athletes/bulk-delete')
      .send({ athleteIds: [victim.id] });

    expect(res.status).toBe(403);
    expect(await storage.getUser(victim.id)).toBeTruthy();
  });

  it('forbids an athlete from bulk-inviting teammates', async () => {
    const attacker = await makeUser('athlete');
    const target = await makeUser('athlete');
    const agent = await agentFor(attacker);

    const res = await agent
      .post('/api/athletes/bulk-invite')
      .send({ athleteIds: [target.id], organizationId: org.id });

    expect(res.status).toBe(403);
  });

  it('still allows an org admin to delete an athlete', async () => {
    const athlete = await makeUser('athlete');
    const agent = await agentFor(orgAdmin);

    const res = await agent.delete(`/api/athletes/${athlete.id}`);

    expect(res.status).toBe(200);
    expect(await storage.getUser(athlete.id)).toBeFalsy();
  });

  it('still allows a coach to bulk-delete an athlete in the org', async () => {
    const athlete = await makeUser('athlete');
    // bulk-delete scopes each athlete by their team's organization, so the
    // athlete must be on a team in the org for the coach to reach them.
    await storage.addUserToTeam(athlete.id, team.id);
    const agent = await agentFor(coach);

    const res = await agent
      .post('/api/athletes/bulk-delete')
      .send({ athleteIds: [athlete.id] });

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(1);
  });
});
