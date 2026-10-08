/**
 * Compatibility of the am-data-generators repo (https://github.com/johnahull/am-data-generators)
 * with the real import paths. The generators are the source of demo/seed CSVs, so when the app
 * renames or retires a metric code (AM-FEAT-016 split AGILITY_505 by protocol; AM-FEAT-015 added
 * the MQ_* scores) their output silently stops importing.
 *
 * Runs only when GENERATORS_DIR points at a checkout of that repo; the generators repo's CI sets it.
 * Without it the suite is skipped, so the app's own CI is independent of the generators.
 *
 * Needs a production-like database: `npm run db:push` then `npm run db:migrate:manual`. The app's PR CI
 * database (db:push + seed-default-metrics) lacks the metrics added by migrations 0144-0149 (the 5-0-5
 * leg metrics, COD deficits, MQ_*), so do not set GENERATORS_DIR there.
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
import { measurements, organizations, siteMetrics, teams, userOrganizations, userTeams, users } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const GENERATORS_DIR = process.env.GENERATORS_DIR;
const PASSWORD = 'GenImport123!';
const DATES = ['2025-03-15', '2025-06-20'];
// A date the measurements CSV does not use, so the Dashr commit is not skipped as duplicates.
const DASHR_DATE = '2025-04-10';

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
    // Fail with the real cause up front: without these definitions nothing is derived and the assertions
    // below would fail far downstream. Other suites delete derived site_metrics rows from a shared database.
    const required = ['AGILITY_COD_DEFICIT_YD', 'MQI_TOTAL', 'MQ_TRANSITION_TOTAL'];
    const present = await db.select({ code: siteMetrics.code }).from(siteMetrics).where(inArray(siteMetrics.code, required));
    const missing = required.filter((c) => !present.some((p) => p.code === c));
    if (missing.length) {
      throw new Error(
        `Derived metric definitions missing from site_metrics: ${missing.join(', ')}. ` +
          'Use a database built with db:push + db:migrate:manual that has not been used by the unit suite.',
      );
    }

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
      })
      .returning();
    coachId = coach.id;
    await db.insert(userOrganizations).values({ userId: coachId, organizationId: orgId, role: 'coach' });
    const login = await request(app).post('/api/auth/login').send({ username: coach.username, password: PASSWORD });
    expect(login.status, 'coach login').toBe(200);
    const cookies = login.headers['set-cookie'];
    expect(cookies, 'login must set a session cookie').toBeDefined();
    coachCookie = cookies[0];
  });

  afterAll(async () => {
    // Re-query the team's members instead of trusting athleteIds alone: a roster import that fails partway
    // creates users before the test captures their ids, and those would otherwise leak into the database.
    // beforeAll can fail before the org, team or coach exist (e.g. a broken generators checkout), so each step
    // is guarded; an unguarded query on an undefined id throws a second error that buries the real one.
    const members = teamId
      ? await db.select({ id: userTeams.userId }).from(userTeams).where(eq(userTeams.teamId, teamId))
      : [];
    const ids = [...new Set([...athleteIds, ...members.map((m) => m.id)])];
    if (ids.length) {
      await db.delete(measurements).where(inArray(measurements.userId, ids));
      await db.delete(userTeams).where(inArray(userTeams.userId, ids));
      await db.delete(userOrganizations).where(inArray(userOrganizations.userId, ids));
      await db.delete(users).where(inArray(users.id, ids));
    }
    if (coachId) {
      await db.delete(userOrganizations).where(eq(userOrganizations.userId, coachId));
      await db.delete(users).where(eq(users.id, coachId));
    }
    if (teamId) await db.delete(teams).where(eq(teams.id, teamId));
    if (orgId) await db.delete(organizations).where(eq(organizations.id, orgId));
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
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
  }, 30_000);

  // These tests run in order and depend on the roster test above (it populates athleteIds): do not run them
  // alone or shuffled.
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
      // If the generators start emitting another metric that no migration seeds, add its code here.
      expect(Array.isArray(res.body.warnings), 'response must include a warnings array').toBe(true);
      const unexpected = (res.body.warnings as string[]).filter(
        (w) => !/Metric code '(HEIGHT_IN|WEIGHT_LBS|WINGSPAN|STANDING_REACH)' not found/.test(w),
      );
      expect(unexpected).toEqual([]);
      expect(res.body.summary.created).toBeGreaterThan(0);
    // ~600 rows, each with derived-metric recalculation: 3-7 s locally. 60 s is headroom for a slow CI runner
    // while still failing on a real slowdown (e.g. an N+1 insert loop).
    }, 60_000);

    it('stores yard 5-0-5 and no retired 5-0-5 codes', async () => {
      expect(athleteIds).toHaveLength(4);
      const metrics = new Set((await athleteRows()).map((r) => r.metric));
      for (const code of ['AGILITY_505_YD', 'AGILITY_505_YD_L', 'AGILITY_505_YD_R', 'DASH_10YD']) {
        expect(metrics.has(code), code).toBe(true);
      }
      for (const code of RETIRED_CODES) expect(metrics.has(code), code).toBe(false);
    });

    it('derives the yard COD deficit for every athlete and date', async () => {
      const rows = await athleteRows();
      expect(athleteIds).toHaveLength(4);
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
      expect(athleteIds).toHaveLength(4);
      // A missing metric must fail, not become NaN (expect(NaN).toBe(NaN) passes).
      const value = (userId: string, date: string, metric: string) => {
        const row = rows.find((r) => r.userId === userId && r.date === date && r.metric === metric);
        expect(row, `${metric} ${userId} ${date}`).toBeDefined();
        return Number(row!.value);
      };
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
      const parse = await request(app)
        .post('/api/import/device/parse')
        .set('Cookie', coachCookie)
        .field('source', 'dashr')
        .field('organizationId', orgId)
        // The import dialog sends the session the user picked; without it the commit dates rows "today".
        .field('sessionDate', DASHR_DATE)
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
      expect(commit.body.athletesImported).toBe(4);
      expect(commit.body.measurementsCreated).toBeGreaterThan(0);

      const onDashrDate = (await athleteRows()).filter((r) => r.date === DASHR_DATE);
      for (const userId of athleteIds) {
        const metrics = new Set(onDashrDate.filter((r) => r.userId === userId).map((r) => r.metric));
        expect(metrics.has('AGILITY_505_YD_L'), `YD_L ${userId}`).toBe(true);
        expect(metrics.has('AGILITY_505_YD_R'), `YD_R ${userId}`).toBe(true);
      }
    }, 30_000);
  });
});
