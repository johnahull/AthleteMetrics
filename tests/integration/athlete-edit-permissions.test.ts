/**
 * Integration tests for who may edit, deactivate, delete, create or read athletes through /api/athletes.
 *
 * Rules (see packages/api/middleware/athlete-permissions.ts):
 *  - Acting on another user needs coach/org_admin IN an organization the target belongs to; a role held in a
 *    different organization does not count.
 *  - The caller's role there must outrank the target's role there (a coach manages athletes, an org admin manages
 *    coaches and athletes). Site admins are managed by site admins only.
 *  - Account-level actions (status, delete, email change) need that authority in EVERY organization of the target.
 *  - Emails of a claimed account (real password or OAuth) are changed only by the owner or a site admin.
 *  - teamIds / organizationId must name teams and organizations the caller manages, and an update only replaces
 *    the target's teams in those organizations.
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
import { users, userOrganizations, type Organization, type User, type Team } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { db } from '../../packages/api/db';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';
import { purgeTestRows } from '../helpers/purge-test-rows';

const PASSWORD = 'TestPass123!';
type OrgRole = 'org_admin' | 'coach' | 'athlete' | 'parent';
const REFUSAL = "Access denied - you need a coach or organization admin role above this user's role in their organization";

describe('Athlete edit permissions', () => {
  // orgA sorts first, so a user who is coach in A and athlete in B has session role "coach".
  let orgA: Organization;
  let orgB: Organization;
  let teamA: Team;
  let teamA2: Team;
  let teamB: Team;
  let coachA: User;
  let adminA: User;
  let siteAdmin: User;
  let app: express.Express;
  const trackedUserIds: string[] = [];

  let seq = 0;
  /** A claimed account (real password) with the given memberships. */
  async function makeUser(memberships: Array<[Organization, OrgRole]>): Promise<User> {
    const uniq = `${Date.now()}${seq++}`;
    const user = await storage.createUser({
      birthDate: '1990-01-01', // the profile gate requires a birthdate
      username: `aeperm${uniq}`,
      password: PASSWORD,
      emails: [`aeperm${uniq}@test.com`],
      firstName: 'Edit',
      lastName: `Perm${uniq}`,
    });
    for (const [org, role] of memberships) {
      // storage.addUserToOrganization only takes staff/athlete roles; parent rows are written directly elsewhere too
      if (role === 'parent') await db.insert(userOrganizations).values({ userId: user.id, organizationId: org.id, role });
      else await storage.addUserToOrganization(user.id, org.id, role);
    }
    trackedUserIds.push(user.id);
    return user;
  }

  /** An unclaimed athlete record (placeholder password, never logged in). */
  async function makeUnclaimedAthlete(orgs: Organization[]): Promise<User> {
    const uniq = `${Date.now()}${seq++}`;
    const athlete = await storage.createAthlete({
      firstName: 'Unclaimed',
      lastName: `Athlete${uniq}`,
      emails: [`aeunclaimed${uniq}@test.com`],
      birthDate: '2008-05-05',
    });
    for (const org of orgs) await storage.addUserToOrganization(athlete.id, org.id, 'athlete');
    trackedUserIds.push(athlete.id);
    return athlete;
  }

  async function agentFor(user: User) {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ username: user.username, password: PASSWORD }).expect(200);
    return agent;
  }

  const teamIdsOf = async (userId: string) => (await storage.getUserTeams(userId)).map((ut) => ut.team.id).sort();

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set.');
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    await registerRoutes(app);

    const ts = Date.now();
    orgA = await storage.createOrganization({ name: `AAAEditPerm A ${ts}`, description: 'athlete edit permissions' });
    orgB = await storage.createOrganization({ name: `ZZZEditPerm B ${ts}`, description: 'athlete edit permissions' });
    teamA = await storage.createTeam({ name: `EditPerm A1 ${ts}`, level: 'Club', organizationId: orgA.id });
    teamA2 = await storage.createTeam({ name: `EditPerm A2 ${ts}`, level: 'Club', organizationId: orgA.id });
    teamB = await storage.createTeam({ name: `EditPerm B1 ${ts}`, level: 'Club', organizationId: orgB.id });
    coachA = await makeUser([[orgA, 'coach']]);
    adminA = await makeUser([[orgA, 'org_admin']]);
    siteAdmin = await makeUser([[orgA, 'athlete']]);
    await storage.updateUser(siteAdmin.id, { isSiteAdmin: true });
  });

  afterAll(async () => {
    await purgeTestRows({ userIds: trackedUserIds, orgIds: [orgA?.id, orgB?.id] });
  });

  describe('role must be held in the target organization', () => {
    it('refuses a coach of A who is only an athlete in B to edit, deactivate or delete an athlete of B', async () => {
      const mixed = await makeUser([[orgA, 'coach'], [orgB, 'athlete']]);
      const victim = await makeUser([[orgB, 'athlete']]);
      const agent = await agentFor(mixed);

      expect((await agent.put(`/api/athletes/${victim.id}`).send({ school: 'Changed' })).status).toBe(403);
      expect((await agent.patch(`/api/athletes/${victim.id}/status`).send({ isActive: false })).status).toBe(403);
      expect((await agent.delete(`/api/athletes/${victim.id}`)).status).toBe(403);

      const after = await storage.getUser(victim.id);
      expect(after?.school).not.toBe('Changed');
      expect(after?.isActive).toBe(true);
    });

    it('refuses that user reading an athlete of B through GET /api/athletes/:id', async () => {
      const mixed = await makeUser([[orgA, 'coach'], [orgB, 'athlete']]);
      const victim = await makeUser([[orgB, 'athlete']]);
      const agent = await agentFor(mixed);

      expect((await agent.get(`/api/athletes/${victim.id}`)).status).toBe(403);
    });

    it('refuses that user bulk-deleting an athlete of B or bulk-inviting into B', async () => {
      const mixed = await makeUser([[orgA, 'coach'], [orgB, 'athlete']]);
      const victim = await makeUser([[orgB, 'athlete']]);
      await storage.addUserToTeam(victim.id, teamB.id);
      const agent = await agentFor(mixed);

      const del = await agent.post('/api/athletes/bulk-delete').send({ athleteIds: [victim.id] });
      expect(del.body.deleted ?? 0).toBe(0);
      expect(await storage.getUser(victim.id)).toBeTruthy();

      const inv = await agent.post('/api/athletes/bulk-invite').send({ athleteIds: [victim.id], organizationId: orgB.id });
      expect(inv.status).toBe(403);
    });
  });

  describe('target role', () => {
    it('refuses a coach changing the email of an org admin of the same organization', async () => {
      const agent = await agentFor(coachA);
      const res = await agent.put(`/api/athletes/${adminA.id}`).send({ emails: ['taken-over@test.com'] });
      expect(res.status).toBe(403);
      expect((await storage.getUser(adminA.id))?.emails).not.toContain('taken-over@test.com');
    });

    it('refuses a coach deactivating another coach', async () => {
      const otherCoach = await makeUser([[orgA, 'coach']]);
      const agent = await agentFor(coachA);
      expect((await agent.patch(`/api/athletes/${otherCoach.id}/status`).send({ isActive: false })).status).toBe(403);
      expect((await storage.getUser(otherCoach.id))?.isActive).toBe(true);
    });

    it('refuses an org admin editing a site admin who is a member of their organization', async () => {
      const agent = await agentFor(adminA);
      expect((await agent.put(`/api/athletes/${siteAdmin.id}`).send({ school: 'Nope' })).status).toBe(403);
    });

    it('lets an org admin deactivate a coach of their organization', async () => {
      const otherCoach = await makeUser([[orgA, 'coach']]);
      const agent = await agentFor(adminA);
      expect((await agent.patch(`/api/athletes/${otherCoach.id}/status`).send({ isActive: false })).status).toBe(200);
      expect((await storage.getUser(otherCoach.id))?.isActive).toBe(false);
    });
  });

  describe('targets in several organizations', () => {
    it('lets a coach of A edit the profile of an athlete in A and B', async () => {
      const shared = await makeUser([[orgA, 'athlete'], [orgB, 'athlete']]);
      const agent = await agentFor(coachA);
      const res = await agent.put(`/api/athletes/${shared.id}`).send({ school: 'Shared High' });
      expect(res.status).toBe(200);
      expect((await storage.getUser(shared.id))?.school).toBe('Shared High');
    });

    it('refuses a coach of A deactivating, deleting or re-addressing an athlete also in B', async () => {
      const shared = await makeUnclaimedAthlete([orgA, orgB]);
      const agent = await agentFor(coachA);
      expect((await agent.patch(`/api/athletes/${shared.id}/status`).send({ isActive: true })).status).toBe(403);
      expect((await agent.put(`/api/athletes/${shared.id}`).send({ emails: ['moved@test.com'] })).status).toBe(403);
      expect((await agent.delete(`/api/athletes/${shared.id}`)).status).toBe(403);
      expect(await storage.getUser(shared.id)).toBeTruthy();
    });
  });

  describe('email changes', () => {
    it('refuses a coach replacing the email of a claimed athlete', async () => {
      const claimed = await makeUser([[orgA, 'athlete']]);
      const agent = await agentFor(coachA);
      const res = await agent.put(`/api/athletes/${claimed.id}`).send({ emails: ['attacker@test.com'] });
      expect(res.status).toBe(403);
      expect((await storage.getUser(claimed.id))?.emails).toEqual(claimed.emails);
    });

    it('lets a coach resubmit the unchanged email of a claimed athlete with other edits', async () => {
      const claimed = await makeUser([[orgA, 'athlete']]);
      const agent = await agentFor(coachA);
      const res = await agent.put(`/api/athletes/${claimed.id}`).send({ emails: claimed.emails, school: 'Same Email High' });
      expect(res.status).toBe(200);
      expect((await storage.getUser(claimed.id))?.school).toBe('Same Email High');
    });

    it('lets a coach change the email of an unclaimed athlete of their organization', async () => {
      const unclaimed = await makeUnclaimedAthlete([orgA]);
      const agent = await agentFor(coachA);
      const res = await agent.put(`/api/athletes/${unclaimed.id}`).send({ emails: ['fixed-typo@test.com'] });
      expect(res.status).toBe(200);
      expect((await storage.getUser(unclaimed.id))?.emails).toEqual(['fixed-typo@test.com']);
    });

    it('lets an athlete change their own email', async () => {
      const self = await makeUser([[orgA, 'athlete']]);
      const agent = await agentFor(self);
      const newEmail = `self-${self.id.slice(0, 8)}@test.com`;
      const res = await agent.put(`/api/athletes/${self.id}`).send({ emails: [newEmail] });
      expect(res.status).toBe(200);
    });
  });

  describe('response shape', () => {
    it('does not return the password hash or MFA fields from PUT /api/athletes/:id', async () => {
      const athlete = await makeUser([[orgA, 'athlete']]);
      const agent = await agentFor(coachA);
      const res = await agent.put(`/api/athletes/${athlete.id}`).send({});
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(athlete.id);
      for (const key of ['password', 'mfaSecret', 'backupCodes', 'loginAttempts', 'lockedUntil']) {
        expect(res.body).not.toHaveProperty(key);
      }
    });
  });

  describe('teams and organizations', () => {
    it('keeps teams in other organizations when a coach of A replaces teamIds', async () => {
      const athlete = await makeUser([[orgA, 'athlete'], [orgB, 'athlete']]);
      await storage.addUserToTeam(athlete.id, teamA.id);
      await storage.addUserToTeam(athlete.id, teamB.id);
      const agent = await agentFor(coachA);

      const res = await agent.put(`/api/athletes/${athlete.id}`).send({ teamIds: [teamA2.id] });
      expect(res.status).toBe(200);
      expect(await teamIdsOf(athlete.id)).toEqual([teamA2.id, teamB.id].sort());
    });

    it('refuses a coach of A putting an athlete on a team of B', async () => {
      const athlete = await makeUser([[orgA, 'athlete'], [orgB, 'athlete']]);
      const agent = await agentFor(coachA);
      expect((await agent.put(`/api/athletes/${athlete.id}`).send({ teamIds: [teamB.id] })).status).toBe(403);
      expect(await teamIdsOf(athlete.id)).toEqual([]);
    });

    it('refuses an athlete putting themselves on a team', async () => {
      const self = await makeUser([[orgA, 'athlete']]);
      const agent = await agentFor(self);
      expect((await agent.put(`/api/athletes/${self.id}`).send({ teamIds: [teamA.id] })).status).toBe(403);
      expect(await teamIdsOf(self.id)).toEqual([]);
    });

    it('refuses a coach of A creating an athlete in B by organizationId or by teamIds', async () => {
      const agent = await agentFor(coachA);
      const byOrg = await agent.post('/api/athletes').send({ firstName: 'Planted', lastName: 'ByOrg', organizationId: orgB.id });
      expect(byOrg.status).toBe(403);
      const byTeam = await agent.post('/api/athletes').send({ firstName: 'Planted', lastName: 'ByTeam', teamIds: [teamB.id] });
      expect(byTeam.status).toBe(403);
      if (byOrg.body?.id) trackedUserIds.push(byOrg.body.id);
      if (byTeam.body?.id) trackedUserIds.push(byTeam.body.id);
    });

    it('lets a coach of A create an athlete on a team of A', async () => {
      const agent = await agentFor(coachA);
      const res = await agent.post('/api/athletes').send({ firstName: 'Legit', lastName: 'Create', teamIds: [teamA.id] });
      expect(res.status).toBe(201);
      trackedUserIds.push(res.body.id);
      expect(res.body).not.toHaveProperty('password');
      expect(res.body.teams.map((t: { id: string }) => t.id)).toEqual([teamA.id]);
      const orgs = await storage.getUserOrganizations(res.body.id);
      expect(orgs.map((o) => o.organizationId)).toEqual([orgA.id]);
      expect(await teamIdsOf(res.body.id)).toEqual([teamA.id]);
    });

    it('creates the athlete in the requested organization the coach manages', async () => {
      const multi = await makeUser([[orgA, 'athlete'], [orgB, 'coach']]);
      const agent = await agentFor(multi);
      const res = await agent.post('/api/athletes').send({ firstName: 'Legit', lastName: 'InB', organizationId: orgB.id });
      expect(res.status).toBe(201);
      trackedUserIds.push(res.body.id);
      const orgs = await storage.getUserOrganizations(res.body.id);
      expect(orgs.map((o) => o.organizationId)).toEqual([orgB.id]);
    });
  });

  describe('review follow-ups', () => {
    /** What the athlete edit dialog sends on save: every form field, parentEmail null when unset. */
    const modalPayload = (u: User) => ({
      firstName: u.firstName,
      lastName: u.lastName,
      emails: u.emails,
      birthDate: '1990-01-01',
      graduationYear: 2030,
      school: 'Modal High',
      sports: [],
      positions: [],
      phoneNumbers: [],
      gender: 'Female',
      parentEmail: null,
    });

    it('lets a coach save the full edit-dialog payload for an athlete', async () => {
      const athlete = await makeUser([[orgA, 'athlete']]);
      const agent = await agentFor(coachA);
      const res = await agent.put(`/api/athletes/${athlete.id}`).send(modalPayload(athlete));
      expect(res.status).toBe(200);
      expect((await storage.getUser(athlete.id))?.school).toBe('Modal High');
    });

    it('lets an athlete save the full edit-dialog payload for themselves', async () => {
      const self = await makeUser([[orgA, 'athlete']]);
      const agent = await agentFor(self);
      const res = await agent.put(`/api/athletes/${self.id}`).send(modalPayload(self));
      expect(res.status).toBe(200);
      expect((await storage.getUser(self.id))?.school).toBe('Modal High');
    });

    it('refuses a coach setting a new parent email', async () => {
      const athlete = await makeUser([[orgA, 'athlete']]);
      const agent = await agentFor(coachA);
      const res = await agent.put(`/api/athletes/${athlete.id}`).send({ parentEmail: 'someone@test.com' });
      expect(res.status).toBe(403);
      expect((await storage.getUser(athlete.id))?.parentEmail ?? null).toBeNull();
    });

    it('refuses a parent-email change authorized only by an organization where the caller does not manage the user', async () => {
      // Caller: coach in A (manages the target there), org admin in B. Target: athlete in A, org admin in B.
      const caller = await makeUser([[orgA, 'coach'], [orgB, 'org_admin']]);
      const target = await makeUser([[orgA, 'athlete'], [orgB, 'org_admin']]);
      const agent = await agentFor(caller);
      const res = await agent.put(`/api/athletes/${target.id}`).send({ parentEmail: 'redirect@test.com' });
      expect(res.status).toBe(403);
      expect((await storage.getUser(target.id))?.parentEmail ?? null).toBeNull();
    });

    it('refuses a coach changing the email of an OAuth-only account', async () => {
      const oauth = await makeUnclaimedAthlete([orgA]);
      await db.update(users).set({ password: null, googleId: `g-${oauth.id}` }).where(eq(users.id, oauth.id));
      const agent = await agentFor(coachA);
      const res = await agent.put(`/api/athletes/${oauth.id}`).send({ emails: ['oauth-takeover@test.com'] });
      expect(res.status).toBe(403);
    });

    it('refuses an org admin acting on another org admin of the same organization', async () => {
      const peer = await makeUser([[orgA, 'org_admin']]);
      const agent = await agentFor(adminA);
      expect((await agent.put(`/api/athletes/${peer.id}`).send({ school: 'Peer' })).status).toBe(403);
      expect((await agent.patch(`/api/athletes/${peer.id}/status`).send({ isActive: false })).status).toBe(403);
      expect((await storage.getUser(peer.id))?.isActive).toBe(true);
    });

    it('refuses a coach acting on a parent-role member', async () => {
      const parent = await makeUser([[orgA, 'parent']]);
      const agent = await agentFor(coachA);
      expect((await agent.put(`/api/athletes/${parent.id}`).send({ school: 'Parent' })).status).toBe(403);
      expect((await agent.patch(`/api/athletes/${parent.id}/status`).send({ isActive: false })).status).toBe(403);
      expect((await storage.getUser(parent.id))?.isActive).toBe(true);
    });

    it('gives a site-admin target the same refusal as any other unmanaged user', async () => {
      const agent = await agentFor(adminA);
      const res = await agent.put(`/api/athletes/${siteAdmin.id}`).send({ school: 'Nope' });
      expect(res.status).toBe(403);
      expect(res.body.message).toBe(REFUSAL);
    });

    it('bulk-deletes only the users the coach manages everywhere', async () => {
      const onlyA = await makeUser([[orgA, 'athlete']]);
      const alsoB = await makeUser([[orgA, 'athlete'], [orgB, 'athlete']]);
      const agent = await agentFor(coachA);
      const res = await agent.post('/api/athletes/bulk-delete').send({ athleteIds: [onlyA.id, alsoB.id] });
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(1);
      expect(await storage.getUser(onlyA.id)).toBeFalsy();
      expect(await storage.getUser(alsoB.id)).toBeTruthy();
    });

    it('keeps an athlete on their teams when they send teamIds: [] for themselves', async () => {
      const self = await makeUser([[orgA, 'athlete']]);
      await storage.addUserToTeam(self.id, teamA.id);
      const agent = await agentFor(self);
      expect((await agent.put(`/api/athletes/${self.id}`).send({ teamIds: [] })).status).toBe(200);
      expect(await teamIdsOf(self.id)).toEqual([teamA.id]);
    });

    it('refuses a parent-role member reading an athlete profile, and lets a coach read it', async () => {
      const parent = await makeUser([[orgA, 'parent']]);
      const athlete = await makeUser([[orgA, 'athlete']]);
      expect((await (await agentFor(parent)).get(`/api/athletes/${athlete.id}`)).status).toBe(403);
      expect((await (await agentFor(coachA)).get(`/api/athletes/${athlete.id}`)).status).toBe(200);
    });

    it('bulk-invites only unclaimed athletes the caller manages', async () => {
      const unclaimed = await makeUnclaimedAthlete([orgA]);
      const claimed = await makeUser([[orgA, 'athlete']]);
      const otherCoach = await makeUser([[orgA, 'coach']]);
      const agent = await agentFor(coachA);
      const res = await agent
        .post('/api/athletes/bulk-invite')
        .send({ athleteIds: [unclaimed.id, claimed.id, otherCoach.id], organizationId: orgA.id });
      expect(res.status).toBe(200);
      expect(res.body.invited).toBe(1);
      expect(res.body.skipped).toBe(2);
    });
  });
});
