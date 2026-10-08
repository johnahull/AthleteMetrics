/**
 * Issue #514: measurement writes are authorized by the role in the ROW's organization, not by the session role.
 *
 * session.user.role is the role in the user's FIRST organization (alphabetically by name). Several write paths
 * checked that the user is a member of the row's organization but used the session role to decide what they may
 * do there. For a user with different roles in different organizations that is wrong both ways:
 *   - coachA/athleteB  (coach in the first org, athlete in the second): could create, edit, delete and verify rows in
 *     org B, and enter MQ scores, as if they were a coach there (over-permissive);
 *   - athleteA/coachB  (athlete in the first org, coach in the second): was blocked from doing coach work in org B
 *     (over-restrictive).
 *
 * The org names start with "Aaa" and "Bbb" so organization A is always the "first" one.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../../packages/api/db';
import { measurements, userTeams } from '@shared/schema';
import { organizations, teams, userOrganizations, users } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));
// The photo route's OCR step is replaced so a test controls the extracted rows.
vi.mock('../../packages/api/ocr/ocr-service', () => ({
  ocrService: { extractTextFromImage: vi.fn() },
}));

import { registerRoutes } from '../../packages/api/routes';
import { ocrService } from '../../packages/api/ocr/ocr-service';

const PASSWORD = 'OrgRole123!';
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const MQ_DENIED = /only coaches and admins can enter movement quality/i;

describe('measurement writes use the role in the row\'s organization (#514)', () => {
  let app: Express;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tag = suffix.replace(/[^a-z0-9]/gi, '');
  let orgA: string;
  let orgB: string;
  let teamA: string;
  let teamA2: string;
  let teamB: string;
  const teamNameA = `AAA Team ${suffix}`;
  const teamNameB = `BBB Team ${suffix}`;
  // athlete in A, athlete in B, athlete on two teams of A, plain coach of B (seeds rows)
  let aA: any, aB: any, aTwo: any, coachB: any;
  // the two users with different roles in the two organizations
  let coachAathleteB: any;
  let athleteAcoachB: any;
  const cookies: Record<string, string> = {};

  const mk = async (name: string, hashed: string) =>
    (
      await db
        .insert(users)
        .values({
          username: `orgrole-${name}-${suffix}`,
          emails: [`orgrole-${name}-${suffix}@test.com`],
          password: hashed,
          firstName: 'Orgrole',
          lastName: `${name}${tag}`,
          fullName: `Orgrole ${name}`,
          birthDate: '2008-01-01',
          birthYear: 2008,
        })
        .returning()
    )[0];

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    await registerRoutes(app);

    const [a] = await db.insert(organizations).values({ name: `Aaa Org ${suffix}` }).returning();
    const [b] = await db.insert(organizations).values({ name: `Bbb Org ${suffix}` }).returning();
    orgA = a.id;
    orgB = b.id;
    const [ta] = await db.insert(teams).values({ name: teamNameA, organizationId: orgA, level: 'College' }).returning();
    const [ta2] = await db.insert(teams).values({ name: `AAA Second ${suffix}`, organizationId: orgA, level: 'College' }).returning();
    const [tb] = await db.insert(teams).values({ name: teamNameB, organizationId: orgB, level: 'College' }).returning();
    teamA = ta.id;
    teamA2 = ta2.id;
    teamB = tb.id;

    const hashed = await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS);
    [aA, aB, aTwo, coachB, coachAathleteB, athleteAcoachB] = await Promise.all(
      ['aA', 'aB', 'aTwo', 'coachB', 'coachAathleteB', 'athleteAcoachB'].map((n) => mk(n, hashed)),
    );
    await db.insert(userOrganizations).values([
      { userId: aA.id, organizationId: orgA, role: 'athlete' },
      { userId: aTwo.id, organizationId: orgA, role: 'athlete' },
      { userId: aB.id, organizationId: orgB, role: 'athlete' },
      { userId: coachB.id, organizationId: orgB, role: 'coach' },
      { userId: coachAathleteB.id, organizationId: orgA, role: 'coach' },
      { userId: coachAathleteB.id, organizationId: orgB, role: 'athlete' },
      { userId: athleteAcoachB.id, organizationId: orgA, role: 'athlete' },
      { userId: athleteAcoachB.id, organizationId: orgB, role: 'coach' },
    ]);
    const joinedAt = new Date('2020-01-01');
    await db.insert(userTeams).values([
      { userId: aA.id, teamId: teamA, joinedAt, isActive: true },
      { userId: aTwo.id, teamId: teamA, joinedAt, isActive: true },
      { userId: aTwo.id, teamId: teamA2, joinedAt, isActive: true },
      { userId: aB.id, teamId: teamB, joinedAt, isActive: true },
      { userId: coachAathleteB.id, teamId: teamB, joinedAt, isActive: true },
    ]);

    for (const [name, u] of Object.entries({ coachAathleteB, athleteAcoachB })) {
      const login = await request(app).post('/api/auth/login').send({ username: u.username, password: PASSWORD });
      expect(login.status, `${name} login`).toBe(200);
      cookies[name] = login.headers['set-cookie'][0];
    }
  });

  afterEach(async () => {
    await db.delete(measurements).where(inArray(measurements.userId, [aA.id, aB.id, aTwo.id, coachAathleteB.id]));
  });

  afterAll(async () => {
    await db.delete(measurements).where(inArray(measurements.userId, [aA.id, aB.id, aTwo.id, coachAathleteB.id]));
    const userIds = [aA, aB, aTwo, coachB, coachAathleteB, athleteAcoachB].map((u) => u.id);
    await db.delete(userTeams).where(inArray(userTeams.teamId, [teamA, teamA2, teamB]));
    await db.delete(userOrganizations).where(inArray(userOrganizations.organizationId, [orgA, orgB]));
    await db.delete(teams).where(inArray(teams.id, [teamA, teamA2, teamB]));
    await db.delete(users).where(inArray(users.id, userIds));
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
  });

  const rowsOf = (userId: string) => db.select().from(measurements).where(eq(measurements.userId, userId));

  /** A row in org B for aB, submitted by B's coach (the caller is never its submitter) */
  const seedRowB = async (extra: Record<string, unknown> = {}) =>
    (
      await db
        .insert(measurements)
        .values({
          userId: aB.id,
          submittedBy: coachB.id,
          organizationId: orgB,
          teamId: teamB,
          metric: 'VERTICAL_JUMP',
          value: '30',
          units: 'in',
          date: '2026-03-10',
          age: 17,
          ...extra,
        } as any)
        .returning()
    )[0];

  const body = (userId: string, extra: Record<string, unknown> = {}) => ({
    userId,
    metric: 'VERTICAL_JUMP',
    value: 30,
    date: '2026-03-10',
    ...extra,
  });

  describe('the fixture matches the bug report', () => {
    it('gives each mixed user the role of their alphabetically first organization in the session', async () => {
      const a = await request(app).get('/api/auth/me').set('Cookie', cookies.coachAathleteB);
      const b = await request(app).get('/api/auth/me').set('Cookie', cookies.athleteAcoachB);
      const roleOf = (r: any) => r.body?.user?.role ?? r.body?.role;
      expect(roleOf(a), JSON.stringify(a.body).slice(0, 200)).toBe('coach');
      expect(roleOf(b), JSON.stringify(b.body).slice(0, 200)).toBe('athlete');
    });
  });

  describe('POST /api/measurements', () => {
    it('coach in A / athlete in B cannot create a row for an athlete of org B (teamId given)', async () => {
      const res = await request(app).post('/api/measurements').set('Cookie', cookies.coachAathleteB).send(body(aB.id, { teamId: teamB }));
      expect(res.status, JSON.stringify(res.body)).toBe(403);
      expect(await rowsOf(aB.id)).toHaveLength(0);
    });

    it('coach in A / athlete in B cannot create a row for an athlete of org B (organization resolved from the athlete\'s team)', async () => {
      const res = await request(app).post('/api/measurements').set('Cookie', cookies.coachAathleteB).send(body(aB.id));
      expect(res.status, JSON.stringify(res.body)).toBe(403);
      expect(await rowsOf(aB.id)).toHaveLength(0);
    });

    it('coach in A / athlete in B cannot enter their own MQ score in org B (an athlete there)', async () => {
      const res = await request(app)
        .post('/api/measurements')
        .set('Cookie', cookies.coachAathleteB)
        .send(body(coachAathleteB.id, { teamId: teamB, metric: 'MQ_JUMP', value: 2, units: 'score' }));
      expect(res.status, JSON.stringify(res.body)).toBe(403);
      expect(res.body.message).toMatch(MQ_DENIED);
      expect(await rowsOf(coachAathleteB.id)).toHaveLength(0);
    });

    it('coach in A / athlete in B can still create a verified row for an athlete of org A', async () => {
      const res = await request(app).post('/api/measurements').set('Cookie', cookies.coachAathleteB).send(body(aA.id, { teamId: teamA }));
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      const [row] = await rowsOf(aA.id);
      expect(row.organizationId).toBe(orgA);
      expect(row.isVerified).toBe(true);
    });

    it('athlete in A / coach in B can create a verified row, and an MQ score, for an athlete of org B', async () => {
      const plain = await request(app).post('/api/measurements').set('Cookie', cookies.athleteAcoachB).send(body(aB.id, { teamId: teamB }));
      expect(plain.status, JSON.stringify(plain.body)).toBe(201);
      const mq = await request(app)
        .post('/api/measurements')
        .set('Cookie', cookies.athleteAcoachB)
        .send(body(aB.id, { teamId: teamB, metric: 'MQ_JUMP', value: 2, units: 'score' }));
      expect(mq.status, JSON.stringify(mq.body)).toBe(201);
      const rows = await rowsOf(aB.id);
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.organizationId === orgB && r.isVerified === true)).toBe(true);
    });

    it('athlete in A / coach in B still cannot write for another athlete in org A', async () => {
      const res = await request(app).post('/api/measurements').set('Cookie', cookies.athleteAcoachB).send(body(aA.id, { teamId: teamA }));
      expect(res.status, JSON.stringify(res.body)).toBe(403);
      expect(await rowsOf(aA.id)).toHaveLength(0);
    });

    it('asks for a teamId instead of silently creating an unowned row when the athlete is on several teams', async () => {
      const res = await request(app).post('/api/measurements').set('Cookie', cookies.coachAathleteB).send(body(aTwo.id));
      expect(res.status, JSON.stringify(res.body)).toBe(400);
      expect(res.body.message).toMatch(/team/i);
      expect(await rowsOf(aTwo.id)).toHaveLength(0);
    });

    it('still lets a user enter their own personal (no team) measurement', async () => {
      const res = await request(app).post('/api/measurements').set('Cookie', cookies.athleteAcoachB).send(body(athleteAcoachB.id));
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      const [row] = await rowsOf(athleteAcoachB.id);
      expect(row.organizationId).toBeNull();
      expect(row.isVerified).toBe(false);
      await db.delete(measurements).where(eq(measurements.userId, athleteAcoachB.id));
    });
  });

  describe('PUT / DELETE / verify on a row in org B', () => {
    it('coach in A / athlete in B cannot edit it', async () => {
      const row = await seedRowB();
      const res = await request(app).put(`/api/measurements/${row.id}`).set('Cookie', cookies.coachAathleteB).send({ value: 31 });
      expect(res.status, JSON.stringify(res.body)).toBe(403);
      expect((await rowsOf(aB.id))[0].value).toBe('30.000');
    });

    it('coach in A / athlete in B cannot delete it', async () => {
      const row = await seedRowB();
      const res = await request(app).delete(`/api/measurements/${row.id}`).set('Cookie', cookies.coachAathleteB);
      expect(res.status, JSON.stringify(res.body)).toBe(403);
      expect(await rowsOf(aB.id)).toHaveLength(1);
    });

    it('coach in A / athlete in B cannot verify it', async () => {
      const row = await seedRowB({ isVerified: false });
      const res = await request(app).post(`/api/measurements/${row.id}/verify`).set('Cookie', cookies.coachAathleteB);
      expect(res.status, JSON.stringify(res.body)).toBe(403);
      expect((await rowsOf(aB.id))[0].isVerified).toBe(false);
    });

    it('athlete in A / coach in B can edit, verify and delete it', async () => {
      const row = await seedRowB({ isVerified: false });
      const put = await request(app).put(`/api/measurements/${row.id}`).set('Cookie', cookies.athleteAcoachB).send({ value: 31 });
      expect(put.status, JSON.stringify(put.body)).toBe(200);
      const verify = await request(app).post(`/api/measurements/${row.id}/verify`).set('Cookie', cookies.athleteAcoachB);
      expect(verify.status, JSON.stringify(verify.body)).toBe(200);
      const del = await request(app).delete(`/api/measurements/${row.id}`).set('Cookie', cookies.athleteAcoachB);
      expect(del.status, JSON.stringify(del.body)).toBe(200);
      expect(await rowsOf(aB.id)).toHaveLength(0);
    });
  });

  describe('POST /api/import/measurements (CSV)', () => {
    const csv = (first: string, last: string, team: string) =>
      ['firstName,lastName,teamName,date,metric,value', `${first},${last},${team},2026-03-10,VERTICAL_JUMP,30`].join('\n');
    const importCsv = (who: string, team: string, athlete: any) =>
      request(app)
        .post('/api/import/measurements')
        .set('Cookie', cookies[who])
        .field('options', JSON.stringify({ measurementMode: 'match_only' }))
        .attach('file', Buffer.from(csv(athlete.firstName, athlete.lastName, team)), 'measurements.csv');

    it('coach in A / athlete in B cannot import into a team of org B', async () => {
      const res = await importCsv('coachAathleteB', teamNameB, aB);
      expect(res.body.summary?.created, JSON.stringify(res.body).slice(0, 300)).toBe(0);
      expect(await rowsOf(aB.id)).toHaveLength(0);
    });

    it('athlete in A / coach in B can import into a team of org B', async () => {
      const res = await importCsv('athleteAcoachB', teamNameB, aB);
      expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
      expect(res.body.errors).toEqual([]);
      const [row] = await rowsOf(aB.id);
      expect(row.isVerified).toBe(true);
    });

    it('coach in A / athlete in B can still import into a team of org A', async () => {
      const res = await importCsv('coachAathleteB', teamNameA, aA);
      expect(res.body.errors, JSON.stringify(res.body).slice(0, 300)).toEqual([]);
      expect((await rowsOf(aA.id))[0].isVerified).toBe(true);
    });
  });

  describe('POST /api/import/photo (OCR)', () => {
    const photo = (who: string, athlete: any, organizationId: string) => {
      vi.mocked(ocrService.extractTextFromImage).mockResolvedValue({
        text: 'raw',
        confidence: 90,
        warnings: [],
        extractedData: [
          { firstName: athlete.firstName, lastName: athlete.lastName, metric: 'VERTICAL_JUMP', value: '30', date: '2026-03-10', rawText: 'raw', confidence: 90 },
        ],
      } as any);
      return request(app)
        .post('/api/import/photo')
        .set('Cookie', cookies[who])
        .field('options', JSON.stringify({ organizationId, measurementMode: 'match_only' }))
        .attach('file', PNG, 'scores.png');
    };

    it('coach in A / athlete in B cannot import a photo into org B', async () => {
      const res = await photo('coachAathleteB', aB, orgB);
      expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(403);
      expect(await rowsOf(aB.id)).toHaveLength(0);
    });

    it('athlete in A / coach in B can import a photo into org B', async () => {
      const res = await photo('athleteAcoachB', aB, orgB);
      expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
      expect(res.body.results.errors).toEqual([]);
      expect(await rowsOf(aB.id)).toHaveLength(1);
    });
  });
});
