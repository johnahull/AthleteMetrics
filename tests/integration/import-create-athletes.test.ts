/**
 * Issue #536: CSV measurement import with measurementMode `create_athletes` (the "Quick Import" preset).
 *
 * Before the fix the route created the athlete for an unknown name and then overwrote it with the (always
 * undefined) match candidate, so every such row failed with "No valid athlete match found" and the athlete was
 * left behind. Also covered: one athlete per name across rows, no orphan when the row fails afterwards, tenant
 * isolation of the team lookup, and org membership for an auto-created team.
 *
 * Needs a database built with db:push + db:migrate:manual (MQ_JUMP is seeded by migration 0146).
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { and, eq, inArray, like } from 'drizzle-orm';
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

// The photo route's OCR step is replaced so a test controls the extracted rows.
vi.mock('../../packages/api/ocr/ocr-service', () => ({
  ocrService: { extractTextFromImage: vi.fn() },
}));

import { registerRoutes } from '../../packages/api/routes';
import { ocrService } from '../../packages/api/ocr/ocr-service';

// Smallest valid PNG header; the OCR service is mocked so the bytes are never decoded.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const PASSWORD = 'CreateAthletes123!';
const HEADER = 'firstName,lastName,teamName,date,metric,value';

describe('CSV import with create_athletes (issue #536)', () => {
  let app: Express;
  let orgId: string;
  let otherOrgId: string;
  let teamId: string;
  let otherTeamId: string;
  let coachId: string;
  let cookie: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const teamName = `CA Team ${suffix}`;
  const otherTeamName = `CA Other Team ${suffix}`;
  // Every athlete this suite creates has a last name ending in the suffix, so cleanup can find them all.
  const lastName = (tag: string) => `${tag}${suffix.replace(/[^a-z0-9]/gi, '')}`;

  const importCsv = (rows: string[], options: Record<string, unknown> = {}) =>
    request(app)
      .post('/api/import/measurements')
      .set('Cookie', cookie)
      .field('options', JSON.stringify({ organizationId: orgId, measurementMode: 'create_athletes', ...options }))
      .attach('file', Buffer.from([HEADER, ...rows].join('\n')), 'measurements.csv');

  const athletesNamed = (last: string) => db.select().from(users).where(eq(users.lastName, last));
  const measurementsOf = async (userId: string) => db.select().from(measurements).where(eq(measurements.userId, userId));

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    await registerRoutes(app);

    const [org] = await db.insert(organizations).values({ name: `CA Org ${suffix}` }).returning();
    const [otherOrg] = await db.insert(organizations).values({ name: `CA Other Org ${suffix}` }).returning();
    orgId = org.id;
    otherOrgId = otherOrg.id;
    [{ id: teamId }] = await db.insert(teams).values({ name: teamName, organizationId: orgId, level: 'College' }).returning();
    [{ id: otherTeamId }] = await db
      .insert(teams)
      .values({ name: otherTeamName, organizationId: otherOrgId, level: 'College' })
      .returning();

    const [coach] = await db
      .insert(users)
      .values({
        username: `ca-coach-${suffix}`,
        emails: [`ca-coach-${suffix}@test.com`],
        password: await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS),
        firstName: 'Create',
        lastName: 'Coach',
        fullName: 'Create Coach',
        birthDate: '1985-01-01',
        birthYear: 1985,
      })
      .returning();
    coachId = coach.id;
    await db.insert(userOrganizations).values({ userId: coachId, organizationId: orgId, role: 'coach' });
    const login = await request(app).post('/api/auth/login').send({ username: coach.username, password: PASSWORD });
    expect(login.status, 'coach login').toBe(200);
    cookie = login.headers['set-cookie'][0];
  });

  afterAll(async () => {
    const created = await db.select({ id: users.id }).from(users).where(like(users.lastName, `%${suffix.replace(/[^a-z0-9]/gi, '')}`));
    const ids = created.map((u) => u.id);
    if (ids.length) {
      await db.delete(measurements).where(inArray(measurements.userId, ids));
      await db.delete(userTeams).where(inArray(userTeams.userId, ids));
      await db.delete(userOrganizations).where(inArray(userOrganizations.userId, ids));
      await db.delete(users).where(inArray(users.id, ids));
    }
    const autoTeams = await db.select({ id: teams.id }).from(teams).where(like(teams.name, `%${suffix}`));
    if (autoTeams.length) {
      const teamIds = autoTeams.map((t) => t.id);
      await db.delete(userTeams).where(inArray(userTeams.teamId, teamIds));
      await db.delete(teams).where(inArray(teams.id, teamIds));
    }
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, coachId));
    await db.delete(users).where(eq(users.id, coachId));
    await db.delete(organizations).where(inArray(organizations.id, [orgId, otherOrgId]));
  });

  it('creates the athlete and writes the measurement for an unknown name', async () => {
    const last = lastName('Single');
    const res = await importCsv([`Zed,${last},${teamName},2026-03-10,VERTICAL_JUMP,30`]);

    expect(res.status).toBe(200);
    expect(res.body.errors).toEqual([]);
    expect(res.body.summary.created).toBe(1);

    const found = await athletesNamed(last);
    expect(found).toHaveLength(1);
    expect(await measurementsOf(found[0].id)).toHaveLength(1);
    const membership = await db.select().from(userTeams).where(and(eq(userTeams.userId, found[0].id), eq(userTeams.teamId, teamId)));
    expect(membership).toHaveLength(1);
  });

  it('creates one athlete for several rows with the same unknown name', async () => {
    const last = lastName('Multi');
    const res = await importCsv([
      `Mia,${last},${teamName},2026-03-10,VERTICAL_JUMP,30`,
      `Mia,${last},${teamName},2026-03-10,T_TEST,9.8`,
      `Mia,${last},${teamName},2026-03-10,FLY10_TIME,1.4`,
    ]);

    expect(res.body.errors).toEqual([]);
    expect(res.body.summary.created).toBe(3);
    const found = await athletesNamed(last);
    expect(found).toHaveLength(1);
    expect(await measurementsOf(found[0].id)).toHaveLength(3);
  });

  it('leaves no athlete behind when the row fails after the athlete would be created', async () => {
    const last = lastName('Orphan');
    // 9 is outside the 0-3 range of a Movement Quality score, so the measurement write is rejected.
    const res = await importCsv([`Ora,${last},${teamName},2026-03-10,MQ_JUMP,9`]);

    expect(res.body.summary.created).toBe(0);
    expect(res.body.errors).toHaveLength(1);
    expect(await athletesNamed(last)).toHaveLength(0);
  });

  it('does not report a rolled-back athlete in the auto-created team count', async () => {
    const last = lastName('Count');
    const newTeamName = `CA Count Team ${suffix}`;
    // The row auto-creates its team, then fails (9 is outside the 0-3 Movement Quality range)
    const res = await importCsv([`Cora,${last},${newTeamName},2026-03-10,MQ_JUMP,9`], { teamHandling: 'auto_create_silent' });

    expect(res.body.errors).toHaveLength(1);
    expect(await athletesNamed(last)).toHaveLength(0);
    const reported = (res.body.createdTeams ?? []).find((t: { name: string }) => t.name === newTeamName);
    expect(reported?.athleteCount ?? 0).toBe(0);
  });

  it("does not attach a new athlete to another organization's team", async () => {
    const last = lastName('Cross');
    await importCsv([`Cal,${last},${otherTeamName},2026-03-10,VERTICAL_JUMP,30`]);

    for (const athlete of await athletesNamed(last)) {
      const inOtherTeam = await db.select().from(userTeams).where(and(eq(userTeams.userId, athlete.id), eq(userTeams.teamId, otherTeamId)));
      const inOtherOrg = await db
        .select()
        .from(userOrganizations)
        .where(and(eq(userOrganizations.userId, athlete.id), eq(userOrganizations.organizationId, otherOrgId)));
      expect(inOtherTeam, 'team of another organization').toHaveLength(0);
      expect(inOtherOrg, 'another organization').toHaveLength(0);
    }
  });

  it('adds the athlete to the organization when the team is auto-created', async () => {
    const last = lastName('Auto');
    const newTeamName = `CA Auto Team ${suffix}`;
    const res = await importCsv([`Ava,${last},${newTeamName},2026-03-10,VERTICAL_JUMP,30`], { teamHandling: 'auto_create_silent' });

    expect(res.body.errors).toEqual([]);
    const [athlete] = await athletesNamed(last);
    expect(athlete).toBeDefined();
    const membership = await db
      .select()
      .from(userOrganizations)
      .where(and(eq(userOrganizations.userId, athlete.id), eq(userOrganizations.organizationId, orgId)));
    expect(membership).toHaveLength(1);
  });

  describe('photo import (OCR) with create_athletes', () => {
    const importPhoto = (first: string, last: string, metric: string, value: string) => {
      vi.mocked(ocrService.extractTextFromImage).mockResolvedValue({
        text: 'raw',
        confidence: 90,
        warnings: [],
        extractedData: [{ firstName: first, lastName: last, metric, value, date: '2026-03-10', rawText: 'raw', confidence: 90 }],
      } as any);
      return request(app)
        .post('/api/import/photo')
        .set('Cookie', cookie)
        .field('options', JSON.stringify({ organizationId: orgId, measurementMode: 'create_athletes' }))
        .attach('file', PNG, 'scores.png');
    };

    it('creates the athlete, saves the measurement and reports the athlete', async () => {
      const last = lastName('PhotoOk');
      const res = await importPhoto('Pia', last, 'VERTICAL_JUMP', '30');

      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.results.errors).toEqual([]);
      expect(res.body.results.createdAthletes).toHaveLength(1);
      const [athlete] = await athletesNamed(last);
      expect(athlete).toBeDefined();
      expect(await measurementsOf(athlete.id)).toHaveLength(1);
    });

    it('leaves no athlete behind when the measurement is rejected', async () => {
      const last = lastName('PhotoBad');
      // 9 is outside the 0-3 range of a Movement Quality score
      const res = await importPhoto('Pat', last, 'MQ_JUMP', '9');

      expect(res.body.results.errors).toHaveLength(1);
      expect(res.body.results.createdAthletes).toBeUndefined();
      expect(await athletesNamed(last)).toHaveLength(0);
    });
  });

  it('keeps POST /api/import/templates/wizard reachable (it is not captured by /api/import/:type)', async () => {
    const res = await request(app).post('/api/import/templates/wizard').set('Cookie', cookie).send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid type. Must be 'athletes' or 'measurements'");
  });
});
