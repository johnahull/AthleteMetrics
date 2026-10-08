/**
 * AM-FEAT-015 R2 on the storage-based import paths: the CSV import and the photo
 * (OCR) import write through storage.createMeasurement,
 * not MeasurementService, so each applies the MQ role allowlist itself.
 * Only coach, org_admin and site_admin may write a Movement Quality score;
 * athlete, parent and guest sessions are denied and nothing is written.
 * Re-applies migration 0146 in beforeAll.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq, inArray, sql } from 'drizzle-orm';
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

// The photo route's OCR step is replaced so a test can control the extracted rows.
vi.mock('../../packages/api/ocr/ocr-service', () => ({
  ocrService: { extractTextFromImage: vi.fn() },
}));

import { registerRoutes } from '../../packages/api/routes';
import { ocrService } from '../../packages/api/ocr/ocr-service';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MQ_DENIED = /only coaches and admins can enter movement quality/i;
const PASSWORD = 'MqImport123!';
// Smallest valid PNG header; the OCR service is mocked so the bytes are never decoded.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

describe('MQ role allowlist on the import paths (CSV, OCR)', () => {
  let app: Express;
  let orgId: string;
  let teamId: string;
  let teamName: string;
  let athlete: any;
  let coach: any;
  let parent: any;
  let guest: any;
  // A site admin with no organization membership: the role must still resolve to site_admin.
  let siteAdmin: any;
  const cookies: Record<string, string> = {};

  beforeAll(async () => {
    const upSql = fs.readFileSync(path.resolve(__dirname, '../../migrations/0146_seed_mqi_metrics.sql'), 'utf-8');
    await db.execute(sql.raw(upSql));

    app = express();
    app.use(express.json());
    await registerRoutes(app);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [org] = await db.insert(organizations).values({ name: `MQ Import Org ${suffix}` }).returning();
    orgId = org.id;
    teamName = `MQ Import Team ${suffix}`;
    const [team] = await db.insert(teams).values({ name: teamName, organizationId: orgId, level: 'College' }).returning();
    teamId = team.id;
    const hashed = await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS);
    const mk = async (tag: string) =>
      (
        await db
          .insert(users)
          .values({
            username: `mq-imp-${tag}-${suffix}`,
            emails: [`mq-imp-${tag}-${suffix}@test.com`],
            password: hashed,
            firstName: 'Mqimp',
            lastName: `Person${tag}${suffix.replace(/[^a-z]/g, '')}`,
            fullName: `Mqimp Person${tag}`,
            birthDate: '2008-01-01',
            birthYear: 2008,
          } as any)
          .returning()
      )[0];
    athlete = await mk('athlete');
    coach = await mk('coach');
    parent = await mk('parent');
    guest = await mk('guest');
    siteAdmin = await mk('siteadmin');
    await db.update(users).set({ isSiteAdmin: true }).where(eq(users.id, siteAdmin.id));
    await db.insert(userOrganizations).values([
      { userId: athlete.id, organizationId: orgId, role: 'athlete' },
      { userId: coach.id, organizationId: orgId, role: 'coach' },
      { userId: guest.id, organizationId: orgId, role: 'guest' },
    ] as any);
    await db.insert(userTeams).values({ userId: athlete.id, teamId, joinedAt: new Date('2020-01-01'), isActive: true });
    await db.insert(parentAthleteLinks).values({
      parentEmail: parent.emails[0],
      parentUserId: parent.id,
      athleteUserId: athlete.id,
      isActive: true,
    });

    for (const [role, u] of Object.entries({ athlete, coach, parent, guest, siteAdmin })) {
      const login = await request(app).post('/api/auth/login').send({ username: u.username, password: PASSWORD });
      cookies[role] = login.headers['set-cookie'][0];
    }
  });

  afterEach(async () => {
    await db.delete(measurements).where(eq(measurements.userId, athlete.id));
  });

  afterAll(async () => {
    await db.delete(measurements).where(eq(measurements.userId, athlete.id));
    await db.delete(parentAthleteLinks).where(eq(parentAthleteLinks.parentUserId, parent.id));
    await db.delete(userTeams).where(eq(userTeams.teamId, teamId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, orgId));
    await db.delete(teams).where(eq(teams.id, teamId));
    await db.delete(users).where(inArray(users.id, [athlete.id, coach.id, parent.id, guest.id, siteAdmin.id]));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  const athleteRows = () => db.select().from(measurements).where(eq(measurements.userId, athlete.id));

  describe('removed review queue (#517)', () => {
    it('registers no review-decision or review-queue route', () => {
      const paths = ((app as any)._router.stack as any[])
        .filter((l) => l.route)
        .map((l) => l.route.path);
      expect(paths).not.toContain('/api/import/review-decision');
      expect(paths).not.toContain('/api/import/review-queue');
    });

    it.each(['review_all', 'review_low_confidence'])(
      'CSV measurement import rejects the removed %s mode with 400 and writes nothing',
      async (mode) => {
        const csv = `firstName,lastName,teamName,date,metric,value\n${athlete.firstName},${athlete.lastName},${teamName},2026-03-10,VERTICAL_JUMP,30\n`;
        const res = await request(app)
          .post('/api/import/measurements')
          .set('Cookie', cookies.coach)
          .field('options', JSON.stringify({ organizationId: orgId, measurementMode: mode }))
          .attach('file', Buffer.from(csv), 'm.csv');
        expect(res.status, JSON.stringify(res.body)).toBe(400);
        expect(res.body.message).toMatch(/review.*no longer supported/i);
        expect(await athleteRows()).toHaveLength(0);
      }
    );
  });

  describe('Careful Import: holdAmbiguousMatches (CSV measurements)', () => {
    const importCsv = (first: string, mode: string, hold: boolean, team = teamName, last = athlete.lastName) =>
      request(app)
        .post('/api/import/measurements')
        .set('Cookie', cookies.coach)
        .field(
          'options',
          JSON.stringify({ organizationId: orgId, measurementMode: mode, ...(hold ? { holdAmbiguousMatches: true } : {}) })
        )
        .attach(
          'file',
          Buffer.from(
            `firstName,lastName,teamName,date,metric,value\n${first},${last},${team},2026-03-10,VERTICAL_JUMP,30\n`
          ),
          'm.csv'
        );
    const allRows = () => db.select().from(measurements).where(inArray(measurements.userId, [athlete.id, ...extraIds]));
    const extraIds: string[] = [];

    afterEach(async () => {
      if (extraIds.length) {
        await db.delete(measurements).where(inArray(measurements.userId, extraIds));
        await db.delete(userTeams).where(inArray(userTeams.userId, extraIds));
        await db.delete(userOrganizations).where(inArray(userOrganizations.userId, extraIds));
        await db.delete(users).where(inArray(users.id, extraIds));
        extraIds.length = 0;
      }
    });

    const addSameNameAthlete = async () => {
      const [dup] = await db
        .insert(users)
        .values({
          username: `dup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          emails: [`dup-${Date.now()}@test.com`],
          password: 'x',
          firstName: athlete.firstName,
          lastName: athlete.lastName,
          fullName: `${athlete.firstName} ${athlete.lastName}`,
          birthDate: '2008-01-01',
          birthYear: 2008,
        } as any)
        .returning();
      extraIds.push(dup.id);
      await db.insert(userOrganizations).values({ userId: dup.id, organizationId: orgId, role: 'athlete' } as any);
      await db.insert(userTeams).values({ userId: dup.id, teamId, joinedAt: new Date('2020-01-01'), isActive: true });
    };

    it('holds a same-name duplicate with a row error and writes nothing', async () => {
      await addSameNameAthlete();
      const res = await importCsv(athlete.firstName, 'match_only', true);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.errors[0].error).toMatch(/ambiguous athlete match/i);
      expect(await allRows()).toHaveLength(0);
    });

    it('holds a partial (below 75 percent) match with a row error and writes nothing', async () => {
      const res = await importCsv(athlete.firstName, 'match_only', true, 'Unrelated Squad', athlete.lastName.slice(0, -1));
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.errors).toHaveLength(1);
      expect(res.body.errors[0].error).toMatch(/ambiguous athlete match/i);
      expect(await allRows()).toHaveLength(0);
    });

    it('still imports a clear exact match when the flag is set', async () => {
      const res = await importCsv(athlete.firstName, 'match_only', true);
      expect(res.body.errors).toEqual([]);
      expect(await allRows()).toHaveLength(1);
    });

    it('plain match_only is unchanged: the same-name duplicate and the partial match are written', async () => {
      await addSameNameAthlete();
      const dupRes = await importCsv(athlete.firstName, 'match_only', false);
      expect(dupRes.body.errors, JSON.stringify(dupRes.body)).toEqual([]);
      const partialRes = await importCsv(athlete.firstName, 'match_only', false, 'Unrelated Squad', athlete.lastName.slice(0, -1));
      expect(partialRes.body.errors, JSON.stringify(partialRes.body)).toEqual([]);
      expect(await allRows()).toHaveLength(2);
    });
  });

  describe('POST /api/import/photo (OCR)', () => {
    const ocrReturns = (metric: string) =>
      vi.mocked(ocrService.extractTextFromImage).mockResolvedValue({
        text: 'raw',
        confidence: 90,
        warnings: [],
        extractedData: [
          {
            firstName: athlete.firstName,
            lastName: athlete.lastName,
            metric,
            value: '2',
            date: '2026-03-10',
            rawText: 'raw',
            confidence: 90,
          },
        ],
      } as any);

    it('a guest MQ row is rejected per row and nothing is written', async () => {
      ocrReturns('MQ_JUMP');
      const res = await request(app)
        .post('/api/import/photo')
        .set('Cookie', cookies.guest)
        .field('options', JSON.stringify({ measurementMode: 'match_only' }))
        .attach('file', PNG, 'scores.png');
      expect(res.status).toBe(200);
      expect(res.body.results.successful).toBe(0);
      expect(res.body.results.errors).toEqual([expect.objectContaining({ row: 1, error: expect.stringMatching(MQ_DENIED) })]);
      expect(await athleteRows()).toHaveLength(0);
    });

    // A parent session has no organization membership (the parent role is only
    // derived when there is none), so the org-scoped photo import rejects the
    // whole request before OCR runs: 400 without an organization, 403 when one
    // is supplied. Either way nothing is written.
    it('a parent photo import is rejected before OCR and nothing is written', async () => {
      ocrReturns('MQ_JUMP');
      vi.mocked(ocrService.extractTextFromImage).mockClear();
      const noOrg = await request(app)
        .post('/api/import/photo')
        .set('Cookie', cookies.parent)
        .field('options', JSON.stringify({ measurementMode: 'match_only' }))
        .attach('file', PNG, 'scores.png');
      expect(noOrg.status).toBe(400);
      expect(noOrg.body.message).toMatch(/organization is required/i);
      const withOrg = await request(app)
        .post('/api/import/photo')
        .set('Cookie', cookies.parent)
        .field('options', JSON.stringify({ organizationId: orgId, measurementMode: 'create_athletes' }))
        .attach('file', PNG, 'scores.png');
      expect(withOrg.status).toBe(403);
      expect(ocrService.extractTextFromImage).not.toHaveBeenCalled();
      expect(await athleteRows()).toHaveLength(0);
    });

    it('a denied MQ row in create-athletes mode is rejected before any athlete is created', async () => {
      const first = 'Mqocrnew';
      const last = `Nobody${Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 8)}`;
      vi.mocked(ocrService.extractTextFromImage).mockResolvedValue({
        text: 'raw',
        confidence: 90,
        warnings: [],
        extractedData: [{ firstName: first, lastName: last, metric: 'MQ_JUMP', value: '2', date: '2026-03-10', rawText: 'raw', confidence: 90 }],
      } as any);
      const res = await request(app)
        .post('/api/import/photo')
        .set('Cookie', cookies.guest)
        .field('options', JSON.stringify({ organizationId: orgId, measurementMode: 'create_athletes' }))
        .attach('file', PNG, 'scores.png');
      expect(res.status).toBe(200);
      expect(res.body.results.successful).toBe(0);
      expect(res.body.results.errors).toEqual([expect.objectContaining({ row: 1, error: expect.stringMatching(MQ_DENIED) })]);
      expect(res.body.results.createdAthletes ?? []).toHaveLength(0);
      expect(await db.select().from(users).where(eq(users.lastName, last))).toHaveLength(0);
    });

    it('a denied MQ row carries the permission message, not a generic processing failure', async () => {
      ocrReturns('MQ_JUMP');
      const res = await request(app)
        .post('/api/import/photo')
        .set('Cookie', cookies.guest)
        .field('options', JSON.stringify({ measurementMode: 'match_only' }))
        .attach('file', PNG, 'scores.png');
      expect(res.status).toBe(200);
      expect(res.body.results.errors).toEqual([
        expect.objectContaining({ row: 1, error: expect.stringMatching(/^Only coaches and admins can enter Movement Quality scores \(MQ_JUMP\)/) }),
      ]);
    });

    it('a coach OCR row for a manual MQI_TOTAL is rejected and nothing is written', async () => {
      ocrReturns('MQI_TOTAL');
      const res = await request(app)
        .post('/api/import/photo')
        .set('Cookie', cookies.coach)
        .field('options', JSON.stringify({ organizationId: orgId, measurementMode: 'match_only' }))
        .attach('file', PNG, 'scores.png');
      expect(res.status).toBe(200);
      expect(res.body.results.successful).toBe(0);
      expect(res.body.results.errors).toEqual([
        expect.objectContaining({ row: 1, error: expect.stringMatching(/calculated automatically/) }),
      ]);
      expect(await athleteRows()).toHaveLength(0);
    });

    it('a coach MQ row is still imported', async () => {
      ocrReturns('MQ_JUMP');
      const res = await request(app)
        .post('/api/import/photo')
        .set('Cookie', cookies.coach)
        .field('options', JSON.stringify({ organizationId: orgId, measurementMode: 'match_only' }))
        .attach('file', PNG, 'scores.png');
      expect(res.status).toBe(200);
      expect(res.body.results.errors).toEqual([]);
      expect(res.body.results.successful).toBe(1);
      expect(await athleteRows()).toHaveLength(1);
    });

    it('a site admin with no organization membership can import an MQ row', async () => {
      ocrReturns('MQ_JUMP');
      const res = await request(app)
        .post('/api/import/photo')
        .set('Cookie', cookies.siteAdmin)
        .field('options', JSON.stringify({ organizationId: orgId, measurementMode: 'match_only' }))
        .attach('file', PNG, 'scores.png');
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.results.errors).toEqual([]);
      expect(res.body.results.successful).toBe(1);
      expect(await athleteRows()).toHaveLength(1);
    });
  });

  describe('POST /api/import/measurements (CSV)', () => {
    const csvFor = () =>
      ['firstName,lastName,teamName,date,metric,value', `${athlete.firstName},${athlete.lastName},${teamName},2026-03-10,MQ_JUMP,2`].join('\n');

    it.each(['parent', 'guest'])('a %s measurement import is a 403 (#516) and nothing is written', async (role) => {
      const res = await request(app)
        .post('/api/import/measurements')
        .set('Cookie', cookies[role])
        .field('options', JSON.stringify({ measurementMode: 'match_only' }))
        .attach('file', Buffer.from(csvFor()), 'measurements.csv');
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/your role cannot import measurement data/i);
      expect(await athleteRows()).toHaveLength(0);
    });

    it('a coach CSV row for a manual MQI_TOTAL is a per-row error and nothing is written', async () => {
      const csv = ['firstName,lastName,teamName,date,metric,value', `${athlete.firstName},${athlete.lastName},${teamName},2026-03-10,MQI_TOTAL,12`].join('\n');
      const res = await request(app)
        .post('/api/import/measurements')
        .set('Cookie', cookies.coach)
        .field('options', JSON.stringify({ organizationId: orgId, measurementMode: 'match_only' }))
        .attach('file', Buffer.from(csv), 'measurements.csv');
      expect(res.body.summary.created).toBe(0);
      expect(res.body.errors).toEqual([{ row: 2, error: expect.stringMatching(/calculated automatically/) }]);
      expect(await athleteRows()).toHaveLength(0);
    });

    it("a coach's MQ CSV import still works", async () => {
      const res = await request(app)
        .post('/api/import/measurements')
        .set('Cookie', cookies.coach)
        .field('options', JSON.stringify({ organizationId: orgId, measurementMode: 'match_only' }))
        .attach('file', Buffer.from(csvFor()), 'measurements.csv');
      expect(res.body.errors).toEqual([]);
      expect(res.body.summary.created).toBe(1);
      const rows = await athleteRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].metric).toBe('MQ_JUMP');
      expect(Number(rows[0].value)).toBe(2);
    });

    it('a site admin with no organization membership can import an MQ CSV row', async () => {
      const res = await request(app)
        .post('/api/import/measurements')
        .set('Cookie', cookies.siteAdmin)
        .field('options', JSON.stringify({ organizationId: orgId, measurementMode: 'match_only' }))
        .attach('file', Buffer.from(csvFor()), 'measurements.csv');
      expect(res.body.errors).toEqual([]);
      expect(res.body.summary.created).toBe(1);
      const rows = await athleteRows();
      expect(rows).toHaveLength(1);
      expect(rows[0].metric).toBe('MQ_JUMP');
    });
  });
});
