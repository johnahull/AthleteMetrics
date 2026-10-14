/**
 * Bulk team roster changes from the team athletes modal:
 *   POST   /api/teams/:id/add-athletes     body { athleteIds }
 *   DELETE /api/teams/:id/remove-athletes  body { athleteIds }
 *
 * One request per bulk operation (the team mutation limiter allows few requests per window). Each id is
 * handled on its own; failures are reported per id in { success, errorCount, errors }.
 */

process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET =
  'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { and, eq } from 'drizzle-orm';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

// Lift the team mutation limiter so the whole file fits in one window
vi.mock('../../packages/api/constants/rate-limits', async (importOriginal) => {
  const actual: any = await importOriginal();
  return { ...actual, RATE_LIMITS: { ...actual.RATE_LIMITS, MUTATION: 1000 } };
});

import { registerRoutes } from '../../packages/api/routes';
import { db } from '../../packages/api/db';
import { organizations, users, userOrganizations, teams, userTeams } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';
import { purgeTestRows } from '../helpers/purge-test-rows';
import { TeamService } from '../../packages/api/services/team-service';

const PASSWORD = 'TestCoach123!';
const suffix = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const PREFIX = 'tmbulk';

let app: Express;
let orgA: any;
let orgB: any;
let coachA: any;
let coachB: any;
let athleteCaller: any;
let dualRole: any;
let siteAdmin: any;
const cookies: Record<string, string> = {};

async function login(username: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password: PASSWORD });
  expect(res.status).toBe(200);
  return res.headers['set-cookie'][0];
}

let counter = 0;
async function mkUser(tag: string, extra: Record<string, unknown> = {}) {
  counter += 1;
  const [u] = await db
    .insert(users)
    .values({
      username: `${PREFIX}_${tag}_${counter}_${suffix}`,
      emails: [`${PREFIX}_${tag}_${counter}_${suffix}@test.com`],
      password: await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS),
      firstName: tag,
      lastName: `Ath${counter}`,
      fullName: `${tag} Ath${counter}`,
      ...extra,
    } as any)
    .returning();
  return u;
}

async function mkAthlete(org: any) {
  const u = await mkUser('athlete');
  await db.insert(userOrganizations).values({ userId: u.id, organizationId: org.id, role: 'athlete' } as any);
  return u;
}

async function mkTeam(org: any = orgA) {
  const [t] = await db
    .insert(teams)
    .values({ name: `${PREFIX} Team ${counter++} ${suffix}`, organizationId: org.id, level: 'Club' } as any)
    .returning();
  return t;
}

const addAthletes = (teamId: string, body: unknown, cookie: string | null = cookies.coachA) => {
  const req = request(app).post(`/api/teams/${teamId}/add-athletes`);
  return (cookie ? req.set('Cookie', cookie) : req).send(body as any);
};

const removeAthletes = (teamId: string, body: unknown, cookie: string | null = cookies.coachA) => {
  const req = request(app).delete(`/api/teams/${teamId}/remove-athletes`);
  return (cookie ? req.set('Cookie', cookie) : req).send(body as any);
};

const activeMemberIds = async (teamId: string) =>
  (await db
    .select({ userId: userTeams.userId })
    .from(userTeams)
    .where(and(eq(userTeams.teamId, teamId), eq(userTeams.isActive, true))))
    .map((r) => r.userId)
    .sort();

beforeAll(async () => {
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  [orgA] = await db.insert(organizations).values({ name: `${PREFIX} Org A ${suffix}`, isActive: true }).returning();
  [orgB] = await db.insert(organizations).values({ name: `${PREFIX} Org B ${suffix}`, isActive: true }).returning();
  coachA = await mkUser('coachA');
  coachB = await mkUser('coachB');
  athleteCaller = await mkUser('callerathlete');
  dualRole = await mkUser('dualrole');
  siteAdmin = await mkUser('siteadmin', { isSiteAdmin: true });
  await db.insert(userOrganizations).values([
    { userId: coachA.id, organizationId: orgA.id, role: 'coach' },
    { userId: coachB.id, organizationId: orgB.id, role: 'coach' },
    { userId: athleteCaller.id, organizationId: orgA.id, role: 'athlete' },
    // Coach in Org A (alphabetically first, so the session role is 'coach'), athlete in Org B
    { userId: dualRole.id, organizationId: orgA.id, role: 'coach' },
    { userId: dualRole.id, organizationId: orgB.id, role: 'athlete' },
  ] as any);
  cookies.coachA = await login(coachA.username);
  cookies.coachB = await login(coachB.username);
  cookies.athlete = await login(athleteCaller.username);
  cookies.dualRole = await login(dualRole.username);
  cookies.siteAdmin = await login(siteAdmin.username);
});

afterAll(async () => {
  await purgeTestRows({ usernameLike: [`${PREFIX}_%_${suffix}`], orgNameLike: [`${PREFIX} Org %${suffix}`] });
});

describe('POST /api/teams/:id/add-athletes', () => {
  it('adds every athlete in one request', async () => {
    const team = await mkTeam();
    const a1 = await mkAthlete(orgA);
    const a2 = await mkAthlete(orgA);
    const res = await addAthletes(team.id, { athleteIds: [a1.id, a2.id] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: 2, errorCount: 0, errors: [] });
    expect(await activeMemberIds(team.id)).toEqual([a1.id, a2.id].sort());
  });

  it('is idempotent for athletes already on the team', async () => {
    const team = await mkTeam();
    const a1 = await mkAthlete(orgA);
    await addAthletes(team.id, { athleteIds: [a1.id] });
    const res = await addAthletes(team.id, { athleteIds: [a1.id] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: 1, errorCount: 0, errors: [] });
    expect(await activeMemberIds(team.id)).toEqual([a1.id]);
  });

  it('reports an athlete from another organization and still adds the others', async () => {
    const team = await mkTeam();
    const a1 = await mkAthlete(orgA);
    const outsider = await mkAthlete(orgB);
    const res = await addAthletes(team.id, { athleteIds: [a1.id, outsider.id] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(1);
    expect(res.body.errorCount).toBe(1);
    expect(res.body.errors).toEqual([{ athleteId: outsider.id, message: expect.stringContaining('does not belong') }]);
    expect(await activeMemberIds(team.id)).toEqual([a1.id]);
  });

  it('rejects a coach of another organization with 403', async () => {
    const team = await mkTeam();
    const a1 = await mkAthlete(orgA);
    const res = await addAthletes(team.id, { athleteIds: [a1.id] }, cookies.coachB);
    expect(res.status).toBe(403);
    expect(await activeMemberIds(team.id)).toEqual([]);
  });

  it('rejects an athlete caller with 403', async () => {
    const team = await mkTeam();
    const a1 = await mkAthlete(orgA);
    const res = await addAthletes(team.id, { athleteIds: [a1.id] }, cookies.athlete);
    expect(res.status).toBe(403);
    expect(await activeMemberIds(team.id)).toEqual([]);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const team = await mkTeam();
    const res = await addAthletes(team.id, { athleteIds: [coachA.id] }, null);
    expect(res.status).toBe(401);
  });

  it('rejects a caller who is a coach elsewhere but only an athlete in the team organization', async () => {
    const team = await mkTeam(orgB);
    const b1 = await mkAthlete(orgB);
    const res = await addAthletes(team.id, { athleteIds: [b1.id] }, cookies.dualRole);
    expect(res.status).toBe(403);
    expect(await activeMemberIds(team.id)).toEqual([]);
  });

  it('counts a duplicated id once', async () => {
    const team = await mkTeam();
    const a1 = await mkAthlete(orgA);
    const res = await addAthletes(team.id, { athleteIds: [a1.id, a1.id] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: 1, errorCount: 0, errors: [] });
  });

  it('does not let a site admin add an athlete from another organization', async () => {
    const team = await mkTeam();
    const a1 = await mkAthlete(orgA);
    const outsider = await mkAthlete(orgB);
    const res = await addAthletes(team.id, { athleteIds: [a1.id, outsider.id] }, cookies.siteAdmin);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(1);
    expect(res.body.errors).toEqual([{ athleteId: outsider.id, message: expect.stringContaining('does not belong') }]);
    expect(await activeMemberIds(team.id)).toEqual([a1.id]);
  });

  it('does not leak database error text for an unknown athlete id', async () => {
    const team = await mkTeam();
    const missing = crypto.randomUUID();
    const res = await addAthletes(team.id, { athleteIds: [missing] }, cookies.siteAdmin);
    expect(res.status).toBe(200);
    expect(res.body.errorCount).toBe(1);
    expect(res.body.errors[0].athleteId).toBe(missing);
    expect(res.body.errors[0].message).toMatch(/^Access denied/);
  });

  it('replaces an unexpected per-athlete error with a generic message', async () => {
    const team = await mkTeam();
    const a1 = await mkAthlete(orgA);
    const spy = vi
      .spyOn(TeamService.prototype, 'addUserToTeam')
      .mockRejectedValueOnce(new Error('insert or update on table "user_teams" violates foreign key constraint'));
    try {
      const res = await addAthletes(team.id, { athleteIds: [a1.id] });
      expect(res.status).toBe(200);
      expect(res.body.errors).toEqual([{ athleteId: a1.id, message: 'Failed to add athlete' }]);
    } finally {
      spy.mockRestore();
    }
  });

  it('does not pass through a plain error even when its text looks like a service message', async () => {
    const team = await mkTeam();
    const a1 = await mkAthlete(orgA);
    const spy = vi.spyOn(TeamService.prototype, 'addUserToTeam').mockRejectedValueOnce(new Error('Access denied - internal detail'));
    try {
      const res = await addAthletes(team.id, { athleteIds: [a1.id] });
      expect(res.body.errors).toEqual([{ athleteId: a1.id, message: 'Failed to add athlete' }]);
    } finally {
      spy.mockRestore();
    }
  });

  it('rejects an archived team before adding anyone', async () => {
    const team = await mkTeam();
    await db.update(teams).set({ isArchived: true, archivedAt: new Date() } as any).where(eq(teams.id, team.id));
    const a1 = await mkAthlete(orgA);
    const res = await addAthletes(team.id, { athleteIds: [a1.id] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/archived/i);
    expect(await activeMemberIds(team.id)).toEqual([]);
  });

  it('reports a target who is not an athlete in the team organization and still adds the athletes', async () => {
    const team = await mkTeam();
    const a1 = await mkAthlete(orgA);
    const res = await addAthletes(team.id, { athleteIds: [a1.id, coachA.id] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(1);
    expect(res.body.errors).toEqual([{ athleteId: coachA.id, message: expect.stringContaining('not an athlete') }]);
    expect(await activeMemberIds(team.id)).toEqual([a1.id]);
  });

  it('returns 404 for an unknown team', async () => {
    const a1 = await mkAthlete(orgA);
    const res = await addAthletes('00000000-0000-4000-8000-000000000000', { athleteIds: [a1.id] });
    expect(res.status).toBe(404);
  });

  it.each([
    ['empty list', { athleteIds: [] }],
    ['more than 200 ids', { athleteIds: Array.from({ length: 201 }, () => crypto.randomUUID()) }],
    ['non-uuid id', { athleteIds: ['not-a-uuid'] }],
    ['missing athleteIds', {}],
  ])('rejects %s with 400', async (_label, body) => {
    const team = await mkTeam();
    const res = await addAthletes(team.id, body);
    expect(res.status).toBe(400);
    expect(typeof res.body.message).toBe('string');
  });
});

describe('DELETE /api/teams/:id/remove-athletes', () => {
  it('removes every athlete in one request', async () => {
    const team = await mkTeam();
    const a1 = await mkAthlete(orgA);
    const a2 = await mkAthlete(orgA);
    const a3 = await mkAthlete(orgA);
    await addAthletes(team.id, { athleteIds: [a1.id, a2.id, a3.id] });
    const res = await removeAthletes(team.id, { athleteIds: [a1.id, a2.id] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: 2, errorCount: 0, errors: [] });
    expect(await activeMemberIds(team.id)).toEqual([a3.id]);
  });

  it('removes an athlete who has already left the organization', async () => {
    const team = await mkTeam();
    const a1 = await mkAthlete(orgA);
    await addAthletes(team.id, { athleteIds: [a1.id] });
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, a1.id));
    const res = await removeAthletes(team.id, { athleteIds: [a1.id] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: 1, errorCount: 0, errors: [] });
    expect(await activeMemberIds(team.id)).toEqual([]);
  });

  it("only touches the named team's roster", async () => {
    const team = await mkTeam();
    const otherTeamA = await mkTeam();
    const teamB = await mkTeam(orgB);
    const a1 = await mkAthlete(orgA);
    const b1 = await mkAthlete(orgB);
    await addAthletes(team.id, { athleteIds: [a1.id] });
    await addAthletes(otherTeamA.id, { athleteIds: [a1.id] });
    await addAthletes(teamB.id, { athleteIds: [b1.id] }, cookies.coachB);
    const res = await removeAthletes(team.id, { athleteIds: [a1.id, b1.id] });
    expect(res.status).toBe(200);
    expect(await activeMemberIds(team.id)).toEqual([]);
    expect(await activeMemberIds(otherTeamA.id)).toEqual([a1.id]);
    expect(await activeMemberIds(teamB.id)).toEqual([b1.id]);
  });

  it('rejects a coach of another organization with 403', async () => {
    const team = await mkTeam();
    const a1 = await mkAthlete(orgA);
    await addAthletes(team.id, { athleteIds: [a1.id] });
    const res = await removeAthletes(team.id, { athleteIds: [a1.id] }, cookies.coachB);
    expect(res.status).toBe(403);
    expect(await activeMemberIds(team.id)).toEqual([a1.id]);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const team = await mkTeam();
    const res = await removeAthletes(team.id, { athleteIds: [coachA.id] }, null);
    expect(res.status).toBe(401);
  });

  it('rejects a caller who is a coach elsewhere but only an athlete in the team organization', async () => {
    const team = await mkTeam(orgB);
    const b1 = await mkAthlete(orgB);
    await addAthletes(team.id, { athleteIds: [b1.id] }, cookies.coachB);
    const res = await removeAthletes(team.id, { athleteIds: [b1.id] }, cookies.dualRole);
    expect(res.status).toBe(403);
    expect(await activeMemberIds(team.id)).toEqual([b1.id]);
  });

  it('counts a duplicated id once', async () => {
    const team = await mkTeam();
    const a1 = await mkAthlete(orgA);
    await addAthletes(team.id, { athleteIds: [a1.id] });
    const res = await removeAthletes(team.id, { athleteIds: [a1.id, a1.id] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: 1, errorCount: 0, errors: [] });
  });

  it('replaces an unexpected per-athlete error with a generic message', async () => {
    const team = await mkTeam();
    const a1 = await mkAthlete(orgA);
    const spy = vi.spyOn(TeamService.prototype, 'removeUserFromTeam').mockRejectedValueOnce(new Error('deadlock detected'));
    try {
      const res = await removeAthletes(team.id, { athleteIds: [a1.id] });
      expect(res.status).toBe(200);
      expect(res.body.errors).toEqual([{ athleteId: a1.id, message: 'Failed to remove athlete' }]);
    } finally {
      spy.mockRestore();
    }
  });

  it('rejects an invalid body with 400', async () => {
    const team = await mkTeam();
    const res = await removeAthletes(team.id, { athleteIds: ['not-a-uuid'] });
    expect(res.status).toBe(400);
  });
});
