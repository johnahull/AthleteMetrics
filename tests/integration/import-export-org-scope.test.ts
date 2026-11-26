/**
 * Import/export and the athlete list are scoped to ONE organization in which the caller is staff.
 *
 *  - exports (athletes, measurements, teams) need an organization the caller belongs to and a coach/org_admin role
 *    in it; site admins may still export without one (all organizations).
 *  - the measurements export holds only rows whose measurements.organization_id is that organization.
 *  - the athlete CSV import (and its preview) needs a coach/org_admin role in the import organization and matches
 *    and assigns teams only within it.
 *  - GET /api/athletes gives a plain member names but not teammates' contact, age or body details.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../../packages/api/db';
import { measurements, organizations, teams, userOrganizations, userTeams, users } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';
import { purgeTestRows } from '../helpers/purge-test-rows';

const PASSWORD = 'OrgScope123!';

describe('import/export and athlete list organization scope', () => {
  let app: Express;
  const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  // Letters only: the import derives usernames from first+last name, so created rows share the "iescope" prefix
  const tag = suffix.replace(/[^a-z]/gi, '') + 'x';
  let orgA: string, orgB: string, teamA: string, teamB: string;
  const teamNameA = `Scope Team A ${suffix}`;
  const teamNameB = `Scope Team B ${suffix}`;
  let coachA: any, athleteA: any, mateA: any, coachB: any, noOrg: any, multi: any, victimB: any, siteAdmin: any;
  // athlete in the first organization by name (A), coach in the second (B)
  let mixed: any;
  const cookies: Record<string, string> = {};

  const mk = async (name: string, hashed: string, extra: Record<string, unknown> = {}) =>
    (
      await db
        .insert(users)
        .values({
          username: `iescope${name.toLowerCase()}${suffix}`,
          emails: [`iescope-${name}-${suffix}@test.com`],
          phoneNumbers: ['5551234567'],
          password: hashed,
          firstName: `Iescope${tag}`,
          lastName: name,
          fullName: `Iescope${tag} ${name}`,
          birthDate: '2010-05-05',
          birthYear: 2010,
          school: 'Scope High',
          ...extra,
        })
        .returning()
    )[0];

  const csv = (rows: string[]) => Buffer.from(['firstName,lastName,birthDate,teamName', ...rows].join('\n'));

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set.');
    app = express();
    app.use(express.json());
    await registerRoutes(app);

    orgA = (await db.insert(organizations).values({ name: `Aaa Scope ${suffix}` }).returning())[0].id;
    orgB = (await db.insert(organizations).values({ name: `Bbb Scope ${suffix}` }).returning())[0].id;
    teamA = (await db.insert(teams).values({ name: teamNameA, organizationId: orgA, level: 'Club' }).returning())[0].id;
    teamB = (await db.insert(teams).values({ name: teamNameB, organizationId: orgB, level: 'Club' }).returning())[0].id;

    const hashed = await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS);
    coachA = await mk('CoachA', hashed);
    athleteA = await mk('AthleteA', hashed);
    mateA = await mk('MateA', hashed);
    coachB = await mk('CoachB', hashed);
    noOrg = await mk('NoOrg', hashed);
    multi = await mk('Multi', hashed);
    victimB = await mk('VictimB', hashed);
    siteAdmin = await mk('SiteAdmin', hashed, { isSiteAdmin: true });
    mixed = await mk('Mixed', hashed);

    await db.insert(userOrganizations).values([
      { userId: coachA.id, organizationId: orgA, role: 'coach' },
      { userId: athleteA.id, organizationId: orgA, role: 'athlete' },
      { userId: mateA.id, organizationId: orgA, role: 'athlete' },
      { userId: coachB.id, organizationId: orgB, role: 'coach' },
      { userId: multi.id, organizationId: orgA, role: 'athlete' },
      { userId: multi.id, organizationId: orgB, role: 'athlete' },
      { userId: victimB.id, organizationId: orgB, role: 'athlete' },
      { userId: mixed.id, organizationId: orgA, role: 'athlete' },
      { userId: mixed.id, organizationId: orgB, role: 'coach' },
    ]);
    const joinedAt = new Date('2020-01-01');
    await db.insert(userTeams).values([
      { userId: athleteA.id, teamId: teamA, joinedAt, isActive: true },
      { userId: mateA.id, teamId: teamA, joinedAt, isActive: true },
      { userId: multi.id, teamId: teamB, joinedAt, isActive: true },
      { userId: victimB.id, teamId: teamB, joinedAt, isActive: true },
    ]);
    const row = (organizationId: string | null, value: string) => ({
      userId: multi.id, organizationId, metric: 'VERTICAL_JUMP', value, units: 'in', age: 15, date: '2025-03-01',
      submittedBy: coachA.id, isVerified: true,
    });
    await db.insert(measurements).values([row(orgA, '21.11'), row(orgB, '22.22'), row(null, '23.33')]);

    for (const [name, u] of Object.entries({ coachA, athleteA, coachB, noOrg, siteAdmin, mixed })) {
      const login = await request(app).post('/api/auth/login').send({ username: u.username, password: PASSWORD });
      expect(login.status, `${name} login`).toBe(200);
      cookies[name] = login.headers['set-cookie'][0];
    }
  });

  afterAll(async () => {
    await purgeTestRows({ usernameLike: [`iescope%`], orgIds: [orgA, orgB] });
  });

  const victimBirthDate = async () =>
    (await db.select({ birthDate: users.birthDate }).from(users).where(eq(users.id, victimB.id)))[0].birthDate;

  describe('GET /api/export/athletes', () => {
    it('refuses a user with no organization', async () => {
      const res = await request(app).get('/api/export/athletes').set('Cookie', cookies.noOrg);
      expect(res.status).toBe(403);
      expect(res.text).not.toContain('VictimB');
    });

    it('refuses an athlete member', async () => {
      const res = await request(app).get('/api/export/athletes').set('Cookie', cookies.athleteA);
      expect(res.status).toBe(403);
    });

    it('refuses a coach of another organization', async () => {
      const res = await request(app).get('/api/export/athletes').query({ organizationId: orgA }).set('Cookie', cookies.coachB);
      expect(res.status).toBe(403);
    });

    it('exports the athletes of the coach\'s own organization only', async () => {
      const res = await request(app).get('/api/export/athletes').query({ organizationId: orgA }).set('Cookie', cookies.coachA);
      expect(res.status).toBe(200);
      expect(res.text).toContain('AthleteA');
      expect(res.text).not.toContain('VictimB');
    });

    it('lets a site admin export without an organization', async () => {
      const res = await request(app).get('/api/export/athletes').set('Cookie', cookies.siteAdmin);
      expect(res.status).toBe(200);
      expect(res.text).toContain('AthleteA');
      expect(res.text).toContain('VictimB');
    });
  });

  describe('GET /api/export/measurements', () => {
    it('refuses a user with no organization', async () => {
      const res = await request(app).get('/api/export/measurements').set('Cookie', cookies.noOrg);
      expect(res.status).toBe(403);
      expect(res.text).not.toContain('22.22');
    });

    it('refuses an athlete member', async () => {
      const res = await request(app).get('/api/export/measurements').set('Cookie', cookies.athleteA);
      expect(res.status).toBe(403);
    });

    it('holds only rows of the organization, not a multi-org athlete\'s other-organization or personal rows', async () => {
      const res = await request(app).get('/api/export/measurements').query({ organizationId: orgA }).set('Cookie', cookies.coachA);
      expect(res.status).toBe(200);
      expect(res.text).toContain('21.11');
      expect(res.text).not.toContain('22.22');
      expect(res.text).not.toContain('23.33');
      expect(res.text).not.toContain(teamNameB);
    });

    it('refuses team ids of another organization', async () => {
      const res = await request(app)
        .get('/api/export/measurements')
        .query({ organizationId: orgA, teamIds: teamB })
        .set('Cookie', cookies.coachA);
      expect(res.status).toBe(403);
    });

    it('lets a site admin export without an organization', async () => {
      const res = await request(app).get('/api/export/measurements').set('Cookie', cookies.siteAdmin);
      expect(res.status).toBe(200);
      expect(res.text).toContain('21.11');
      expect(res.text).toContain('22.22');
    });
  });

  describe('GET /api/export/teams', () => {
    it('refuses a user with no organization', async () => {
      const res = await request(app).get('/api/export/teams').set('Cookie', cookies.noOrg);
      expect(res.status).toBe(403);
    });

    it('refuses an athlete member', async () => {
      const res = await request(app).get('/api/export/teams').set('Cookie', cookies.athleteA);
      expect(res.status).toBe(403);
    });

    it('exports the coach\'s teams', async () => {
      const res = await request(app).get('/api/export/teams').set('Cookie', cookies.coachA);
      expect(res.status).toBe(200);
      expect(res.text).toContain(teamA);
      expect(res.text).not.toContain(teamB);
    });
  });

  describe('POST /api/import/athletes', () => {
    it('refuses a user with no organization and leaves other organizations\' athletes untouched', async () => {
      const res = await request(app)
        .post('/api/import/athletes')
        .set('Cookie', cookies.noOrg)
        .attach('file', csv([`Iescope${tag},VictimB,2001-01-01,${teamNameB}`]), 'athletes.csv');
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).not.toContain(victimB.id);
      expect(await victimBirthDate()).toBe('2010-05-05');
    });

    it('refuses an athlete member, preview included', async () => {
      const preview = await request(app)
        .post('/api/import/athletes')
        .set('Cookie', cookies.athleteA)
        .field('preview', 'true')
        .attach('file', csv([`Iescope${tag},MateA,2001-01-01,${teamNameA}`]), 'athletes.csv');
      expect(preview.status).toBe(403);

      const res = await request(app)
        .post('/api/import/athletes')
        .set('Cookie', cookies.athleteA)
        .attach('file', csv([`Iescope${tag},MateA,2001-01-01,${teamNameA}`]), 'athletes.csv');
      expect(res.status).toBe(403);
      const [mate] = await db.select({ birthDate: users.birthDate }).from(users).where(eq(users.id, mateA.id));
      expect(mate.birthDate).toBe('2010-05-05');
    });

    it('a coach matches only athletes of the organization and not a team of another organization by name', async () => {
      const res = await request(app)
        .post('/api/import/athletes')
        .set('Cookie', cookies.coachA)
        .field('options', JSON.stringify({ organizationId: orgA, athleteMode: 'smart_import', teamHandling: 'leave_teamless' }))
        .attach('file', csv([`Iescope${tag},VictimB,2001-01-01,${teamNameB}`]), 'athletes.csv');
      expect(res.status).toBe(200);
      expect(res.body.results).toHaveLength(1);
      expect(res.body.results[0].action).toBe('created');
      expect(res.body.results[0].athlete.id).not.toBe(victimB.id);
      expect(await victimBirthDate()).toBe('2010-05-05');
      const createdTeams = await db.select().from(userTeams).where(eq(userTeams.userId, res.body.results[0].athlete.id));
      expect(createdTeams.map((t) => t.teamId)).not.toContain(teamB);
    });

    it('a coach updates an athlete of the organization', async () => {
      const res = await request(app)
        .post('/api/import/athletes')
        .set('Cookie', cookies.coachA)
        .field('options', JSON.stringify({ organizationId: orgA, athleteMode: 'smart_import', teamHandling: 'require_existing' }))
        .attach('file', csv([`Iescope${tag},AthleteA,2010-06-06,${teamNameA}`]), 'athletes.csv');
      expect(res.status).toBe(200);
      expect(res.body.results[0]).toMatchObject({ action: 'updated', athlete: { id: athleteA.id } });
    });

    it('a coach of another organization cannot target this organization', async () => {
      const res = await request(app)
        .post('/api/import/athletes')
        .set('Cookie', cookies.coachB)
        .field('options', JSON.stringify({ organizationId: orgA }))
        .attach('file', csv([`Iescope${tag},MateA,2001-01-01,${teamNameA}`]), 'athletes.csv');
      expect(res.status).toBe(403);
    });

    it('a site admin without an organization must name one', async () => {
      const res = await request(app)
        .post('/api/import/athletes')
        .set('Cookie', cookies.siteAdmin)
        .attach('file', csv([`Iescope${tag},VictimB,2001-01-01,${teamNameB}`]), 'athletes.csv');
      expect(res.status).toBe(403);
      expect(await victimBirthDate()).toBe('2010-05-05');
    });
  });


  describe('a user who is an athlete in the first organization and a coach in the second', () => {
    for (const path of ['/api/export/athletes', '/api/export/measurements']) {
      it(`${path}: refused without an organization (first one), allowed for the second`, async () => {
        expect((await request(app).get(path).set('Cookie', cookies.mixed)).status).toBe(403);
        expect((await request(app).get(path).query({ organizationId: orgA }).set('Cookie', cookies.mixed)).status).toBe(403);
        expect((await request(app).get(path).query({ organizationId: orgB }).set('Cookie', cookies.mixed)).status).toBe(200);
      });
    }

    it('/api/export/teams: only the organization where they are staff', async () => {
      const none = await request(app).get('/api/export/teams').set('Cookie', cookies.mixed);
      expect(none.status).toBe(200);
      expect(none.text).toContain(teamB);
      expect(none.text).not.toContain(teamA);
      expect((await request(app).get('/api/export/teams').query({ organizationId: orgA }).set('Cookie', cookies.mixed)).status).toBe(403);
      expect((await request(app).get('/api/export/teams').query({ organizationId: orgB }).set('Cookie', cookies.mixed)).status).toBe(200);
    });

    it('athlete import: refused without an organization (first one), allowed for the second', async () => {
      const none = await request(app)
        .post('/api/import/athletes')
        .set('Cookie', cookies.mixed)
        .field('preview', 'true')
        .attach('file', csv([`Iescope${tag},MateA,2001-01-01,${teamNameA}`]), 'athletes.csv');
      expect(none.status).toBe(403);
      const second = await request(app)
        .post('/api/import/athletes')
        .set('Cookie', cookies.mixed)
        .field('preview', 'true')
        .field('options', JSON.stringify({ organizationId: orgB }))
        .attach('file', csv([`Iescope${tag},VictimB,2010-05-05,${teamNameB}`]), 'athletes.csv');
      expect(second.status).toBe(200);
    });
  });

  describe('other request shapes', () => {
    it('a repeated organizationId param falls back to the caller\'s own organization', async () => {
      const res = await request(app)
        .get('/api/export/athletes')
        .query({ organizationId: [orgB, orgB] })
        .set('Cookie', cookies.coachA);
      expect(res.status).toBe(200);
      expect(res.text).toContain('AthleteA');
      expect(res.text).not.toContain(victimB.emails[0]);
    });

    it('a coach preview lists only teams missing from the organization', async () => {
      const res = await request(app)
        .post('/api/import/athletes')
        .set('Cookie', cookies.coachA)
        .field('preview', 'true')
        .field('options', JSON.stringify({ organizationId: orgA }))
        .attach('file', csv([`Iescope${tag},AthleteA,2010-05-05,${teamNameA}`, `Iescope${tag},MateA,2010-05-05,${teamNameB}`]), 'athletes.csv');
      expect(res.status).toBe(200);
      expect(res.body.missingTeams.map((t: any) => t.teamName)).toEqual([teamNameB]);
    });

    it('the teams export with an organization where the caller is not staff is refused', async () => {
      const res = await request(app).get('/api/export/teams').query({ organizationId: orgA }).set('Cookie', cookies.athleteA);
      expect(res.status).toBe(403);
    });

    it('a legacy teamId of another organization is refused before anything is written', async () => {
      const res = await request(app)
        .post('/api/import/athletes')
        .set('Cookie', cookies.coachA)
        .field('teamId', teamB)
        .field('options', JSON.stringify({ organizationId: orgA, athleteMode: 'smart_import', teamHandling: 'leave_teamless' }))
        .attach('file', csv([`Iescope${tag},Legacy,2001-01-01,No Such Team ${suffix}`]), 'athletes.csv');
      expect(res.status).toBe(403);
      const rows = await db.select({ id: users.id }).from(users)
        .where(and(eq(users.firstName, `Iescope${tag}`), eq(users.lastName, 'Legacy')));
      expect(rows).toHaveLength(0);
    });
  });

  describe('GET /api/athletes', () => {
    it('gives an athlete member teammates\' names only, and their own record in full', async () => {
      const res = await request(app).get('/api/athletes').query({ organizationId: orgA }).set('Cookie', cookies.athleteA);
      expect(res.status).toBe(200);
      const mate = res.body.find((a: any) => a.id === mateA.id);
      expect(mate.firstName).toBe(`Iescope${tag}`);
      for (const key of ['emails', 'phoneNumbers', 'birthDate', 'birthYear', 'height', 'weight']) {
        expect(mate, key).not.toHaveProperty(key);
      }
      const self = res.body.find((a: any) => a.id === athleteA.id);
      expect(self.emails).toEqual([athleteA.emails[0]]);
      expect(self.birthDate).toBeTruthy();
    });

    it('ignores birth year filters for an athlete member, so they reveal nothing', async () => {
      const res = await request(app)
        .get('/api/athletes')
        .query({ organizationId: orgA, birthYearFrom: 2000, birthYearTo: 2001 })
        .set('Cookie', cookies.athleteA);
      expect(res.status).toBe(200);
      expect(res.body.map((a: any) => a.id)).toContain(mateA.id);
    });

    it('applies birth year filters for a coach', async () => {
      const res = await request(app)
        .get('/api/athletes')
        .query({ organizationId: orgA, birthYearFrom: 2000, birthYearTo: 2001 })
        .set('Cookie', cookies.coachA);
      expect(res.status).toBe(200);
      expect(res.body.map((a: any) => a.id)).not.toContain(mateA.id);
    });

    it('gives a coach the full records', async () => {
      const res = await request(app).get('/api/athletes').query({ organizationId: orgA }).set('Cookie', cookies.coachA);
      expect(res.status).toBe(200);
      const mate = res.body.find((a: any) => a.id === mateA.id);
      expect(mate.emails).toEqual([mateA.emails[0]]);
      expect(mate.birthDate).toBe('2010-05-05');
    });
  });
});
