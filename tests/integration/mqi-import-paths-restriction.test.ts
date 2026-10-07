/**
 * AM-FEAT-015 R2 on the storage-based import paths: the CSV import, the photo
 * (OCR) import and the import review queue write through storage.createMeasurement,
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
import { reviewQueue } from '../../packages/api/review-queue';
import { ocrService } from '../../packages/api/ocr/ocr-service';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MQ_DENIED = /only coaches and admins can enter movement quality/i;
const PASSWORD = 'MqImport123!';
// Smallest valid PNG header; the OCR service is mocked so the bytes are never decoded.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

describe('MQ role allowlist on the import paths (CSV, OCR, review queue)', () => {
  let app: Express;
  let orgId: string;
  let teamId: string;
  let teamName: string;
  let athlete: any;
  let coach: any;
  let parent: any;
  let guest: any;
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

    for (const [role, u] of Object.entries({ athlete, coach, parent, guest })) {
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
    await db.delete(users).where(inArray(users.id, [athlete.id, coach.id, parent.id, guest.id]));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  const athleteRows = () => db.select().from(measurements).where(eq(measurements.userId, athlete.id));

  describe('POST /api/import/review-decision', () => {
    // In the current registration order POST /api/import/:type is declared first
    // and shadows this route (it answers 400 "No file uploaded"). The handler is
    // still guarded so it stays safe if the order changes; promote its layer
    // ahead of /api/import/:type here so the tests reach it.
    beforeAll(() => {
      const stack: any[] = (app as any)._router.stack;
      const isRoute = (l: any, p: string) => l.route?.path === p && l.route.methods.post;
      const decision = stack.findIndex((l) => isRoute(l, '/api/import/review-decision'));
      const generic = stack.findIndex((l) => isRoute(l, '/api/import/:type'));
      expect(decision).toBeGreaterThan(generic);
      const [layer] = stack.splice(decision, 1);
      stack.splice(generic, 0, layer);
    });

    const queueMqItem = () =>
      reviewQueue.addItem({
        type: 'measurement',
        originalData: {
          firstName: athlete.firstName,
          lastName: athlete.lastName,
          teamName,
          date: '2026-03-10',
          metric: 'MQ_JUMP',
          value: '2',
        },
        matchingCriteria: {} as any,
        suggestedMatch: {
          id: athlete.id,
          firstName: athlete.firstName,
          lastName: athlete.lastName,
          confidence: 60,
          reason: 'test',
        },
        createdBy: coach.id,
      } as any);

    it.each(['athlete', 'parent', 'guest'])(
      '403 when a %s approves an MQ review item; nothing is written and the item stays pending',
      async (role) => {
        const item = queueMqItem();
        const res = await request(app)
          .post('/api/import/review-decision')
          .set('Cookie', cookies[role])
          .send({ itemId: item.id, action: 'approve' });
        expect(res.status, JSON.stringify(res.body)).toBe(403);
        expect(res.body.message).toMatch(MQ_DENIED);
        expect(await athleteRows()).toHaveLength(0);
        expect(reviewQueue.getItem(item.id)?.status).toBe('pending');
      }
    );

    it('a coach approving an MQ review item creates the score', async () => {
      const item = queueMqItem();
      const res = await request(app)
        .post('/api/import/review-decision')
        .set('Cookie', cookies.coach)
        .send({ itemId: item.id, action: 'approve' });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.measurement.metric).toBe('MQ_JUMP');
      const rows = await athleteRows();
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].value)).toBe(2);
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

    it.each(['parent', 'guest'])('a %s MQ row is rejected per row and nothing is written', async (role) => {
      ocrReturns('MQ_JUMP');
      const res = await request(app)
        .post('/api/import/photo')
        .set('Cookie', cookies[role])
        .field('options', JSON.stringify({ measurementMode: 'match_only' }))
        .attach('file', PNG, 'scores.png');
      expect(res.status).toBe(200);
      expect(res.body.results.successful).toBe(0);
      expect(res.body.results.errors).toEqual([expect.objectContaining({ row: 1, error: expect.stringMatching(MQ_DENIED) })]);
      expect(await athleteRows()).toHaveLength(0);
    });

    it('a denied MQ row carries the permission message, not a generic processing failure', async () => {
      ocrReturns('MQ_JUMP');
      const res = await request(app)
        .post('/api/import/photo')
        .set('Cookie', cookies.parent)
        .field('options', JSON.stringify({ measurementMode: 'match_only' }))
        .attach('file', PNG, 'scores.png');
      expect(res.status).toBe(200);
      expect(res.body.results.errors).toEqual([
        expect.objectContaining({ row: 1, error: expect.stringMatching(/^Only coaches and admins can enter Movement Quality scores \(MQ_JUMP\)/) }),
      ]);
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
  });

  describe('POST /api/import/measurements (CSV)', () => {
    const csvFor = () =>
      ['firstName,lastName,teamName,date,metric,value', `${athlete.firstName},${athlete.lastName},${teamName},2026-03-10,MQ_JUMP,2`].join('\n');

    it.each(['parent', 'guest'])('a %s MQ row is a per-row error (not a 403) and nothing is written', async (role) => {
      const res = await request(app)
        .post('/api/import/measurements')
        .set('Cookie', cookies[role])
        .field('options', JSON.stringify({ measurementMode: 'match_only' }))
        .attach('file', Buffer.from(csvFor()), 'measurements.csv');
      expect(res.status).toBe(200);
      expect(res.body.summary.created).toBe(0);
      expect(res.body.errors).toEqual([{ row: 2, error: expect.stringMatching(MQ_DENIED) }]);
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
  });
});
