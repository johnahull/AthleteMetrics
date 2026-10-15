/**
 * mm:ss values on the storage-based import paths: the CSV import and the photo (OCR) import used
 * parseFloat, which saved "6:42.5" as 6. A value with a colon is now read as minutes:seconds and
 * stored as seconds; an invalid time is a per-row error and nothing is written.
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

const PASSWORD = 'DurImport123!';
const METRIC = 'DASH_40YD';
// Smallest valid PNG header; the OCR service is mocked so the bytes are never decoded.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

describe('mm:ss values on the import paths (CSV, OCR)', () => {
  let app: Express;
  let orgId: string;
  let teamId: string;
  let teamName: string;
  let athlete: any;
  let coach: any;
  let cookie: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    await registerRoutes(app);

    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [org] = await db.insert(organizations).values({ name: `Dur Import Org ${suffix}` }).returning();
    orgId = org.id;
    teamName = `Dur Import Team ${suffix}`;
    const [team] = await db.insert(teams).values({ name: teamName, organizationId: orgId, level: 'College' }).returning();
    teamId = team.id;
    const hashed = await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS);
    const mk = async (tag: string) =>
      (
        await db
          .insert(users)
          .values({
            username: `dur-imp-${tag}-${suffix}`,
            emails: [`dur-imp-${tag}-${suffix}@test.com`],
            password: hashed,
            firstName: 'Durimp',
            lastName: `Person${tag}${suffix.replace(/[^a-z]/g, '')}`,
            fullName: `Durimp Person${tag}`,
            birthDate: '2008-01-01',
            birthYear: 2008,
          } as any)
          .returning()
      )[0];
    athlete = await mk('athlete');
    coach = await mk('coach');
    await db.insert(userOrganizations).values([
      { userId: athlete.id, organizationId: orgId, role: 'athlete' },
      { userId: coach.id, organizationId: orgId, role: 'coach' },
    ] as any);
    await db.insert(userTeams).values({ userId: athlete.id, teamId, joinedAt: new Date('2020-01-01'), isActive: true });

    const login = await request(app).post('/api/auth/login').send({ username: coach.username, password: PASSWORD });
    cookie = login.headers['set-cookie'][0];
  });

  afterEach(async () => {
    vi.mocked(ocrService.extractTextFromImage).mockReset();
    await db.delete(measurements).where(eq(measurements.userId, athlete.id));
  });

  afterAll(async () => {
    await db.delete(measurements).where(eq(measurements.userId, athlete.id));
    await db.delete(userTeams).where(eq(userTeams.teamId, teamId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, orgId));
    await db.delete(teams).where(eq(teams.id, teamId));
    await db.delete(users).where(inArray(users.id, [athlete.id, coach.id]));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  const storedValues = async () =>
    (await db.select().from(measurements).where(eq(measurements.userId, athlete.id))).map((m) => Number(m.value));

  const importCsv = (value: string) =>
    request(app)
      .post('/api/import/measurements')
      .set('Cookie', cookie)
      .field('options', JSON.stringify({ organizationId: orgId, measurementMode: 'match_only' }))
      .attach(
        'file',
        Buffer.from(
          `firstName,lastName,teamName,date,metric,value\n${athlete.firstName},${athlete.lastName},${teamName},2026-03-10,${METRIC},${value}\n`
        ),
        'm.csv'
      );

  describe('CSV measurement import', () => {
    it.each([
      ['6:42.5', 402.5],
      ['402.5', 402.5],
    ])('stores "%s" as %s seconds', async (cell, seconds) => {
      const res = await importCsv(cell);
      expect(res.body.summary.created, JSON.stringify(res.body)).toBe(1);
      expect(await storedValues()).toEqual([seconds]);
    });

    it('rejects an invalid time as a row error and writes nothing', async () => {
      const res = await importCsv('6:60');
      expect(res.body.summary.created).toBe(0);
      expect(res.body.errors).toEqual([{ row: 2, error: expect.stringMatching(/invalid measurement value/i) }]);
      expect(await storedValues()).toEqual([]);
    });
  });

  describe('photo (OCR) import', () => {
    const upload = (value: string) => {
      vi.mocked(ocrService.extractTextFromImage).mockResolvedValue({
        text: 'mock',
        confidence: 90,
        extractedData: [
          {
            firstName: athlete.firstName,
            lastName: athlete.lastName,
            metric: METRIC,
            value,
            rawText: `${athlete.firstName} ${value}`,
            confidence: 75,
          },
        ],
        warnings: [],
      } as any);
      return request(app)
        .post('/api/import/photo')
        .set('Cookie', cookie)
        .field('options', JSON.stringify({ measurementMode: 'match_only', organizationId: orgId }))
        .attach('file', PNG, { filename: 'scores.png', contentType: 'image/png' });
    };

    it('stores 6:42.5 as 402.5 seconds, not 6', async () => {
      const res = await upload('6:42.5');
      expect(res.body.results.successful, JSON.stringify(res.body)).toBe(1);
      expect(await storedValues()).toEqual([402.5]);
    });

    it('rejects an invalid time and writes nothing', async () => {
      const res = await upload('6:60');
      expect(res.body.results.successful).toBe(0);
      expect(res.body.results.errors).toEqual([expect.objectContaining({ error: expect.stringMatching(/invalid measurement value/i) })]);
      expect(await storedValues()).toEqual([]);
    });
  });
});
