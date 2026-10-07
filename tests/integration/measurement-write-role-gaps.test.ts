/**
 * Issues #515 and #516: measurement write paths must not be open to every
 * authenticated role.
 *  - POST /api/measurements: only athlete (self), coach / org_admin (their org)
 *    and site admins may create. parent and guest sessions get 403.
 *  - PUT / DELETE /api/measurements/:id: parent and guest sessions stay denied.
 *  - POST /api/import/measurements: only coach, org_admin and site_admin may
 *    import (matches POST /api/import/photo); athlete, parent and guest get 403.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../../packages/api/db';
import { measurements, organizations, teams, userOrganizations, userTeams, users } from '@shared/schema';
import { parentAthleteLinks } from '@shared/schema/tables/coppa';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const PASSWORD = 'WriteGaps123!';

describe('measurement write role gaps (#515, #516)', () => {
  let app: Express;
  let orgId: string;
  let teamId: string;
  let teamName: string;
  let athlete: any;
  let victim: any;
  let coach: any;
  let orgAdmin: any;
  let parent: any;
  let guest: any;
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    await registerRoutes(app);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const letters = suffix.replace(/[^a-z]/g, '');
    const [org] = await db.insert(organizations).values({ name: `Write Gaps Org ${suffix}` }).returning();
    orgId = org.id;
    teamName = `Write Gaps Team ${suffix}`;
    const [team] = await db.insert(teams).values({ name: teamName, organizationId: orgId, level: 'College' }).returning();
    teamId = team.id;
    const hashed = await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS);
    const mk = async (tag: string) =>
      (
        await db
          .insert(users)
          .values({
            username: `wg-${tag}-${suffix}`,
            emails: [`wg-${tag}-${suffix}@test.com`],
            password: hashed,
            firstName: 'Wgap',
            lastName: `Person${tag}${letters}`,
            fullName: `Wgap Person${tag}`,
            birthDate: '2008-01-01',
            birthYear: 2008,
          } as any)
          .returning()
      )[0];
    athlete = await mk('athlete');
    victim = await mk('victim');
    coach = await mk('coach');
    orgAdmin = await mk('orgadmin');
    parent = await mk('parent');
    guest = await mk('guest');
    await db.insert(userOrganizations).values([
      { userId: athlete.id, organizationId: orgId, role: 'athlete' },
      { userId: victim.id, organizationId: orgId, role: 'athlete' },
      { userId: coach.id, organizationId: orgId, role: 'coach' },
      { userId: orgAdmin.id, organizationId: orgId, role: 'org_admin' },
      { userId: guest.id, organizationId: orgId, role: 'guest' },
    ] as any);
    await db.insert(userTeams).values([
      { userId: athlete.id, teamId, joinedAt: new Date('2020-01-01'), isActive: true },
      { userId: victim.id, teamId, joinedAt: new Date('2020-01-01'), isActive: true },
    ]);
    await db.insert(parentAthleteLinks).values({
      parentEmail: parent.emails[0],
      parentUserId: parent.id,
      athleteUserId: victim.id,
      isActive: true,
    });

    for (const [role, u] of Object.entries({ athlete, coach, orgAdmin, parent, guest })) {
      const login = await request(app).post('/api/auth/login').send({ username: u.username, password: PASSWORD });
      cookies[role] = login.headers['set-cookie'][0];
    }
  });

  const victimRows = () => db.select().from(measurements).where(eq(measurements.userId, victim.id));

  afterEach(async () => {
    await db.delete(measurements).where(inArray(measurements.userId, [athlete.id, victim.id]));
  });

  afterAll(async () => {
    await db.delete(measurements).where(inArray(measurements.userId, [athlete.id, victim.id]));
    await db.delete(parentAthleteLinks).where(eq(parentAthleteLinks.parentUserId, parent.id));
    await db.delete(userTeams).where(eq(userTeams.teamId, teamId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, orgId));
    await db.delete(teams).where(eq(teams.id, teamId));
    await db.delete(users).where(inArray(users.id, [athlete.id, victim.id, coach.id, orgAdmin.id, parent.id, guest.id]));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  const seedCoachMeasurement = async () =>
    (
      await db
        .insert(measurements)
        .values({
          userId: victim.id,
          submittedBy: coach.id,
          organizationId: orgId,
          teamId,
          metric: 'VERTICAL_JUMP',
          value: '30',
          units: 'in',
          date: '2026-03-10',
          age: 17,
        } as any)
        .returning()
    )[0];

  describe('POST /api/measurements (#515)', () => {
    const body = () => ({ userId: victim.id, metric: 'VERTICAL_JUMP', value: 30, date: '2026-03-10' });

    it.each(['parent', 'guest'])('403 when a %s session creates a measurement; nothing is written', async (role) => {
      const res = await request(app).post('/api/measurements').set('Cookie', cookies[role]).send(body());
      expect(res.status, JSON.stringify(res.body)).toBe(403);
      expect(await victimRows()).toHaveLength(0);
    });

    it('a coach in the same organization can still create the measurement', async () => {
      const res = await request(app).post('/api/measurements').set('Cookie', cookies.coach).send(body());
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(await victimRows()).toHaveLength(1);
    });

    it('an org_admin in the same organization can create the measurement', async () => {
      const res = await request(app).post('/api/measurements').set('Cookie', cookies.orgAdmin).send(body());
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      expect(await victimRows()).toHaveLength(1);
    });

    it("an athlete can still create their own measurement but not another athlete's", async () => {
      const own = await request(app)
        .post('/api/measurements')
        .set('Cookie', cookies.athlete)
        .send({ ...body(), userId: athlete.id });
      expect(own.status, JSON.stringify(own.body)).toBe(201);
      const other = await request(app).post('/api/measurements').set('Cookie', cookies.athlete).send(body());
      expect(other.status).toBe(403);
      expect(await victimRows()).toHaveLength(0);
    });
  });

  describe('PUT/DELETE /api/measurements/:id', () => {
    it.each(['parent', 'guest'])('PUT is 403 for a %s session and the value is unchanged', async (role) => {
      const m = await seedCoachMeasurement();
      const res = await request(app).put(`/api/measurements/${m.id}`).set('Cookie', cookies[role]).send({ value: 99 });
      expect(res.status, JSON.stringify(res.body)).toBe(403);
      expect(Number((await victimRows())[0].value)).toBe(30);
    });

    it.each(['parent', 'guest'])('DELETE is 403 for a %s session and the row remains', async (role) => {
      const m = await seedCoachMeasurement();
      const res = await request(app).delete(`/api/measurements/${m.id}`).set('Cookie', cookies[role]);
      expect(res.status, JSON.stringify(res.body)).toBe(403);
      expect(await victimRows()).toHaveLength(1);
    });
  });

  describe('POST /api/import/measurements (#516)', () => {
    const importCsv = (role: string) =>
      request(app)
        .post('/api/import/measurements')
        .set('Cookie', cookies[role])
        .field('options', JSON.stringify({ organizationId: orgId, measurementMode: 'match_only' }))
        .attach(
          'file',
          Buffer.from(
            [
              'firstName,lastName,teamName,date,metric,value',
              `${victim.firstName},${victim.lastName},${teamName},2026-03-10,VERTICAL_JUMP,30`,
            ].join('\n')
          ),
          'measurements.csv'
        );

    it.each(['athlete', 'parent', 'guest'])('403 when a %s session imports measurements; nothing is written', async (role) => {
      const res = await importCsv(role);
      expect(res.status, JSON.stringify(res.body)).toBe(403);
      expect(res.body.message).toMatch(/your role cannot import measurement data/i);
      expect(await victimRows()).toHaveLength(0);
    });

    it.each(['coach', 'orgAdmin'])('a %s in the organization can still import measurements', async (role) => {
      const res = await importCsv(role);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(await victimRows()).toHaveLength(1);
    });
  });
});
