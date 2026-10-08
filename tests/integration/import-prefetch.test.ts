/**
 * Issue #527: a bulk import must not repeat per-row lookups that are the same for every row.
 *
 * storage.createMeasurement used to look up the metric's site_metrics row (validation range, unit, auxiliary
 * config) and the submitting user on every call, and the CSV loop looked up the caller's primary organization
 * for every row whose team name did not match. A 10,000-row import therefore ran tens of thousands of
 * identical queries. The metric configs are now fetched once per import (one query for all distinct
 * metrics) and passed down, the submitter once, and the primary organization once.
 *
 * The assertions are about counts that must NOT grow with the number of rows, plus unchanged behavior.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../../packages/api/db';
import { storage } from '../../packages/api/storage';
import { measurements, organizations, teams, userOrganizations, userTeams, users } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const PASSWORD = 'Prefetch123!';

describe('bulk import does not repeat per-row lookups (#527)', () => {
  let app: Express;
  let orgId: string;
  let teamId: string;
  let coach: any;
  let cookie: string;
  let athletes: any[] = [];
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tag = suffix.replace(/[^a-z0-9]/gi, '');
  const teamName = `Prefetch Team ${suffix}`;

  const importRows = (rows: string[]) =>
    request(app)
      .post('/api/import/measurements')
      .set('Cookie', cookie)
      .field('options', JSON.stringify({ organizationId: orgId, measurementMode: 'match_only' }))
      .attach('file', Buffer.from(['firstName,lastName,teamName,date,metric,value', ...rows].join('\n')), 'm.csv');

  /** `n` rows spread over the athletes and over two metrics; `team` is the team name written on every row */
  const rowsFor = (n: number, team = teamName) =>
    Array.from({ length: n }, (_, i) => {
      const a = athletes[i % athletes.length];
      const metric = i % 2 === 0 ? 'VERTICAL_JUMP' : 'T_TEST';
      return `${a.firstName},${a.lastName},${team},2026-03-${String(10 + i).padStart(2, '0')},${metric},${metric === 'T_TEST' ? 9.8 : 30}`;
    });

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    await registerRoutes(app);

    const [org] = await db.insert(organizations).values({ name: `Prefetch Org ${suffix}` }).returning();
    orgId = org.id;
    const [team] = await db.insert(teams).values({ name: teamName, organizationId: orgId, level: 'College' }).returning();
    teamId = team.id;
    const hashed = await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS);
    const mk = async (name: string) =>
      (
        await db
          .insert(users)
          .values({
            username: `prefetch-${name}-${suffix}`,
            emails: [`prefetch-${name}-${suffix}@test.com`],
            password: hashed,
            firstName: 'Prefetch',
            lastName: `${name}${tag}`,
            fullName: `Prefetch ${name}`,
            birthDate: '2008-01-01',
            birthYear: 2008,
          })
          .returning()
      )[0];
    coach = await mk('coach');
    athletes = await Promise.all(['one', 'two', 'three'].map(mk));
    await db.insert(userOrganizations).values([
      { userId: coach.id, organizationId: orgId, role: 'coach' },
      ...athletes.map((a) => ({ userId: a.id, organizationId: orgId, role: 'athlete' })),
    ]);
    await db.insert(userTeams).values(athletes.map((a) => ({ userId: a.id, teamId, joinedAt: new Date('2020-01-01'), isActive: true })));
    const login = await request(app).post('/api/auth/login').send({ username: coach.username, password: PASSWORD });
    expect(login.status, 'coach login').toBe(200);
    cookie = login.headers['set-cookie'][0];
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.delete(measurements).where(inArray(measurements.userId, athletes.map((a) => a.id)));
  });

  afterAll(async () => {
    const ids = [coach.id, ...athletes.map((a) => a.id)];
    await db.delete(measurements).where(inArray(measurements.userId, ids));
    await db.delete(userTeams).where(eq(userTeams.teamId, teamId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, orgId));
    await db.delete(teams).where(eq(teams.id, teamId));
    await db.delete(users).where(inArray(users.id, ids));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('fetches the metric configs once for the whole file and never per row', async () => {
    const single = vi.spyOn(storage, 'getMetricWriteConfig');
    const batch = vi.spyOn(storage, 'getMetricWriteConfigs');

    const res = await importRows(rowsFor(6));

    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBe(200);
    expect(res.body.errors).toEqual([]);
    expect(res.body.summary.created).toBe(6);
    expect(single).not.toHaveBeenCalled();
    expect(batch).toHaveBeenCalledTimes(1);
    expect([...(batch.mock.calls[0][0] as string[])].sort()).toEqual(['T_TEST', 'VERTICAL_JUMP']);
  });

  it('looks the submitting user up once, however many rows there are', async () => {
    const spy = vi.spyOn(storage, 'getActiveUserById');
    await importRows(rowsFor(6));
    // the route's one lookup; before the change every createMeasurement call did its own
    expect(spy.mock.calls.filter(([id]) => id === coach.id).length).toBeLessThanOrEqual(1);
  });

  it("looks the caller's organizations up the same number of times for 2 rows and for 6 (no per-row fallback query)", async () => {
    // A team name that matches none of the caller's teams sends every row down the primary-organization fallback
    const noTeam = `No Such Team ${suffix}`;
    const spy = vi.spyOn(storage, 'getUserOrganizations');

    await importRows(rowsFor(2, noTeam));
    const forTwo = spy.mock.calls.length;
    spy.mockClear();
    await db.delete(measurements).where(inArray(measurements.userId, athletes.map((a) => a.id)));
    await importRows(rowsFor(6, noTeam));
    const forSix = spy.mock.calls.length;

    expect(forSix).toBe(forTwo);
  });

  it('behaves as before: units, values, verification and the Movement Quality range rule are unchanged', async () => {
    const ok = await importRows(rowsFor(2));
    expect(ok.body.errors).toEqual([]);
    const rows = await db.select().from(measurements).where(inArray(measurements.userId, athletes.map((a) => a.id)));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.isVerified === true && r.organizationId === orgId)).toBe(true);
    expect(rows.find((r) => r.metric === 'T_TEST')?.units).toBe('s');
    expect(rows.find((r) => r.metric === 'VERTICAL_JUMP')?.units).toBe('in');

    // an out-of-range MQ score is still rejected per row, and an unknown metric code is still written (permissive import)
    const a = athletes[0];
    const bad = await importRows([`${a.firstName},${a.lastName},${teamName},2026-04-01,MQ_JUMP,9`]);
    expect(bad.body.errors).toHaveLength(1);
    const unknown = await importRows([`${a.firstName},${a.lastName},${teamName},2026-04-02,NOT_A_REAL_METRIC,5`]);
    expect(unknown.body.summary.created).toBe(1);
  });
});
