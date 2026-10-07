/**
 * Compatibility of the am-data-generators repo (https://github.com/johnahull/am-data-generators)
 * with the real import paths. The generators are the source of demo/seed CSVs, so when the app
 * renames or retires a metric code (AM-FEAT-016 split AGILITY_505 by protocol; AM-FEAT-015 added
 * the MQ_* scores) their output silently stops importing.
 *
 * Runs only when GENERATORS_DIR points at a checkout of that repo; the generators repo's CI sets it.
 * Without it the suite is skipped, so the app's own CI is independent of the generators.
 *
 * Flow: generate roster + measurements + Dashr CSVs -> import as a coach (roster, measurement CSV,
 * Dashr device import) -> assert nothing is rejected and the derived metrics (COD deficit, MQI totals)
 * are computed.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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

import { registerRoutes } from '../../packages/api/routes';

const GENERATORS_DIR = process.env.GENERATORS_DIR;
const PASSWORD = 'GenImport123!';
const DATES = ['2025-03-15', '2025-06-20'];
const DASHR_DATE = '2025-03-15';

const MQ_PATTERNS = [
  'MQ_LIN_ACCEL', 'MQ_MAX_VELO', 'MQ_DECEL', 'MQ_SHUFFLE',
  'MQ_LATRUN', 'MQ_HIPTURN', 'MQ_BACKPEDAL', 'MQ_JUMP',
];
const MQ_TRANSITIONS = ['MQ_TRANS_DECEL_CUT', 'MQ_TRANS_GAS_BRAKE', 'MQ_TRANS_BACKPEDAL_TURN', 'MQ_TRANS_LAT_LINEAR'];
const RETIRED_CODES = ['AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R', 'AGILITY_505_LSI'];

function generate(script: string, args: string[]) {
  const res = spawnSync('python3', [path.join(GENERATORS_DIR!, script), ...args], { encoding: 'utf-8' });
  if (res.status !== 0) throw new Error(`${script} failed: ${res.stderr || res.stdout}`);
}

describe.skipIf(!GENERATORS_DIR)('am-data-generators output imports into AthleteMetrics', () => {
  let app: Express;
  let orgId: string;
  let teamId: string;
  let coachId: string;
  let coachCookie: string;
  let tmp: string;
  let athleteIds: string[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const teamName = `Generators Team ${suffix}`;

  const athleteRows = () =>
    athleteIds.length ? db.select().from(measurements).where(inArray(measurements.userId, athleteIds)) : Promise.resolve([]);

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'am-generators-'));
    generate('generate_roster.py', [
      '--out', path.join(tmp, 'roster.csv'), '--num', '4', '--sport', 'Volleyball',
      '--age_group', 'college', '--team_name', teamName,
    ]);
    generate('generate_measurements.py', [
      '--roster', path.join(tmp, 'roster.csv'), '--out', path.join(tmp, 'measurements.csv'), '--dates', ...DATES,
    ]);
    generate('generate_dashr.py', [
      '--roster', path.join(tmp, 'roster.csv'), '--out', path.join(tmp, 'dashr.csv'), '--dates', DASHR_DATE,
    ]);

    app = express();
    app.use(express.json());
    await registerRoutes(app);

    const [org] = await db.insert(organizations).values({ name: `Generators Org ${suffix}` }).returning();
    orgId = org.id;
    const [team] = await db.insert(teams).values({ name: teamName, organizationId: orgId, level: 'College' }).returning();
    teamId = team.id;
    const [coach] = await db
      .insert(users)
      .values({
        username: `gen-coach-${suffix}`,
        emails: [`gen-coach-${suffix}@test.com`],
        password: await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS),
        firstName: 'Gen',
        lastName: 'Coach',
        fullName: 'Gen Coach',
        birthDate: '1985-01-01',
        birthYear: 1985,
      } as any)
      .returning();
    coachId = coach.id;
    await db.insert(userOrganizations).values({ userId: coachId, organizationId: orgId, role: 'coach' } as any);
    const login = await request(app).post('/api/auth/login').send({ username: coach.username, password: PASSWORD });
    coachCookie = login.headers['set-cookie'][0];
  });

  afterAll(async () => {
    if (athleteIds.length) {
      await db.delete(measurements).where(inArray(measurements.userId, athleteIds));
      await db.delete(userTeams).where(inArray(userTeams.userId, athleteIds));
      await db.delete(userOrganizations).where(inArray(userOrganizations.userId, athleteIds));
      await db.delete(users).where(inArray(users.id, athleteIds));
    }
    await db.delete(userTeams).where(eq(userTeams.teamId, teamId));
    await db.delete(userOrganizations).where(eq(userOrganizations.userId, coachId));
    await db.delete(users).where(eq(users.id, coachId));
    await db.delete(teams).where(eq(teams.id, teamId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('imports the generated roster', async () => {
    const res = await request(app)
      .post('/api/import/athletes')
      .set('Cookie', coachCookie)
      .field('options', JSON.stringify({ organizationId: orgId, athleteMode: 'smart_import', teamHandling: 'auto_create_confirm' }))
      .attach('file', path.join(tmp, 'roster.csv'));
    expect(res.status).toBe(200);
    expect(res.body.errors).toEqual([]);
    expect(res.body.summary.created).toBe(4);

    const members = await db.select({ id: userTeams.userId }).from(userTeams).where(eq(userTeams.teamId, teamId));
    athleteIds = members.map((m) => m.id);
    expect(athleteIds).toHaveLength(4);
  }, 60_000);

  describe('measurements CSV', () => {
    it('imports with no errors and no unknown-metric warnings', async () => {
      const res = await request(app)
        .post('/api/import/measurements')
        .set('Cookie', coachCookie)
        .field('options', JSON.stringify({ organizationId: orgId, measurementMode: 'match_only' }))
        .attach('file', path.join(tmp, 'measurements.csv'));
      expect(res.status).toBe(200);
      expect(res.body.errors).toEqual([]);
      // The anthropometric metrics are not seeded by any migration (they are created through the admin UI),
      // so a freshly built database warns about them; the importer treats unknown codes as warnings and
      // still stores the rows. Any other unknown code (e.g. a retired AGILITY_505) must fail this test.
      const unexpected = (res.body.warnings as string[]).filter(
        (w) => !/Metric code '(HEIGHT_IN|WEIGHT_LBS|WINGSPAN|STANDING_REACH)' not found/.test(w),
      );
      expect(unexpected).toEqual([]);
      expect(res.body.summary.created).toBeGreaterThan(0);
    }, 180_000);

    it('stores yard 5-0-5 and no retired 5-0-5 codes', async () => {
      const metrics = new Set((await athleteRows()).map((r) => r.metric));
      for (const code of ['AGILITY_505_YD', 'AGILITY_505_YD_L', 'AGILITY_505_YD_R', 'DASH_10YD']) {
        expect(metrics.has(code), code).toBe(true);
      }
      for (const code of RETIRED_CODES) expect(metrics.has(code), code).toBe(false);
    });

    it('derives the yard COD deficit for every athlete and date', async () => {
      const rows = await athleteRows();
      for (const userId of athleteIds) {
        for (const date of DATES) {
          const deficit = rows.filter((r) => r.userId === userId && r.date === date && r.metric === 'AGILITY_COD_DEFICIT_YD');
          expect(deficit.length, `${userId} ${date}`).toBeGreaterThan(0);
          for (const d of deficit) {
            expect(Number(d.value)).toBeGreaterThanOrEqual(0);
            expect(Number(d.value)).toBeLessThanOrEqual(2);
          }
        }
      }
      expect(rows.some((r) => r.metric === 'AGILITY_COD_DEFICIT_M')).toBe(false);
    });

    it('stores MQ scores and derives MQI_TOTAL / MQ_TRANSITION_TOTAL as the sums', async () => {
      const rows = await athleteRows();
      const value = (userId: string, date: string, metric: string) =>
        Number(rows.find((r) => r.userId === userId && r.date === date && r.metric === metric)?.value);
      for (const userId of athleteIds) {
        for (const date of DATES) {
          const patternSum = MQ_PATTERNS.reduce((s, m) => s + value(userId, date, m), 0);
          const transitionSum = MQ_TRANSITIONS.reduce((s, m) => s + value(userId, date, m), 0);
          expect(value(userId, date, 'MQI_TOTAL'), `MQI_TOTAL ${userId} ${date}`).toBe(patternSum);
          expect(value(userId, date, 'MQ_TRANSITION_TOTAL'), `MQ_TRANSITION_TOTAL ${userId} ${date}`).toBe(transitionSum);
        }
      }
    });
  });

  describe('Dashr device import', () => {
    it('parses, matches every athlete, and commits yard 5-0-5 legs', async () => {
      const before = await athleteRows();
      const parse = await request(app)
        .post('/api/import/device/parse')
        .set('Cookie', coachCookie)
        .field('source', 'dashr')
        .field('organizationId', orgId)
        .attach('file', path.join(tmp, 'dashr.csv'), { filename: 'dashr.csv', contentType: 'text/csv' });
      expect(parse.status).toBe(200);
      expect(parse.body.preview.summary.unmatched).toBe(0);

      const drills = parse.body.preview.athletes.flatMap((a: any) => a.drills.map((d: any) => d.metric));
      expect(drills).toContain('AGILITY_505_YD_L');
      expect(drills).toContain('AGILITY_505_YD_R');
      for (const code of RETIRED_CODES) expect(drills).not.toContain(code);

      const commit = await request(app)
        .post('/api/import/device/commit')
        .set('Cookie', coachCookie)
        .send({
          batchId: parse.body.batchId,
          organizationId: orgId,
          duplicateStrategy: 'skip',
          addMissingEventMetrics: false,
          athletes: parse.body.preview.athletes.map((a: any) => ({
            csvName: a.csvName,
            matchedAthleteId: a.matchedAthleteId,
            included: a.included,
          })),
        });
      expect(commit.status).toBe(200);
      expect((await athleteRows()).length).toBeGreaterThan(before.length);
    }, 120_000);
  });
});
