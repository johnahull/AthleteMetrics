/**
 * Integration tests: coach notes on individual reports (AI coach notes, PR 1 backend).
 *
 * PATCH /api/reports/:id/coach-notes is decided by the caller's role in the REPORT's organization
 * (getOrgRole), never the session role. coachNotes is coach-authored context about a child: it must never
 * reach a non-writer (GET, list, PUT response, shared view, snapshots, public links) and no generic route
 * may write it.
 *
 * Run: npm run test:run -- tests/integration/report-coach-notes.test.ts
 */
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { eq, like } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { users, organizations } from '@shared/schema/tables/core';
import { userOrganizations } from '@shared/schema/tables/membership';
import { reports, reportShares, reportSnapshots } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';
import { purgeTestRows } from '../helpers/purge-test-rows';

vi.mock('../../packages/api/vite.js', () => ({ setupVite: vi.fn().mockResolvedValue(undefined), serveStatic: vi.fn() }));
vi.mock('../../packages/api/services/email-service', () => ({
  emailService: {
    sendParentalConsentRequest: vi.fn().mockResolvedValue(true),
    sendConsentConfirmedNotification: vi.fn().mockResolvedValue(true),
    sendEmailVerification: vi.fn().mockResolvedValue(true),
    sendInvitation: vi.fn().mockResolvedValue(true),
    sendWelcome: vi.fn().mockResolvedValue(true),
    sendPasswordReset: vi.fn().mockResolvedValue(true),
    sendReportSharedNotification: vi.fn().mockResolvedValue(true),
  },
  EmailService: vi.fn().mockImplementation(() => ({})),
}));

import { registerRoutes } from '../../packages/api/routes';

const PREFIX = 'rcn_';
const PASSWORD = 'CoachPassword1!';
const SECRET = 'SECRET-COACH-NOTE-GOALS';
const NOTES = { goals: SECRET, seasonPhase: 'pre', sessionsPerWeek: 3 };
const uid = () => crypto.randomBytes(4).toString('hex');

let app: Express;
const orgIds: string[] = [];
const reportIds: string[] = [];
const userIds: string[] = [];
let orgA: string;
let orgB: string;
const u: Record<string, any> = {};
let adminOnly: any;

const mkUser = async (tag: string, extra: Record<string, unknown> = {}) => {
  const id = uid();
  const [row] = await db.insert(users).values({
    birthDate: '1990-01-01', username: `${PREFIX}${tag}_${id}`, firstName: 'Test', lastName: tag, fullName: `Test ${tag}`,
    emails: [`${PREFIX}${tag}_${id}@example.com`], password: await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS),
    isEmailVerified: true, isSiteAdmin: false, ...extra,
  } as any).returning();
  userIds.push(row.id);
  return row;
};
const join = (userId: string, organizationId: string, role: string) =>
  db.insert(userOrganizations).values({ userId, organizationId, role } as any);
const login = async (username: string) => {
  const res = await request(app).post('/api/auth/login').send({ username, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login failed (${res.status})`);
  return res.headers['set-cookie'][0] as string;
};
const mkReport = async (organizationId: string, reportType: string, athleteId: string, coachNotes: unknown = NOTES) => {
  const [r] = await db.insert(reports).values({
    name: `${PREFIX}report_${uid()}`, organizationId, createdBy: u.coach.id, reportType,
    config: { athleteId, timeframe: { type: 'preset', preset: 'all_time' }, metrics: ['FLY10_TIME'] }, coachNotes,
  } as any).returning();
  reportIds.push(r.id);
  return r;
};
const patch = async (who: any, id: string, body: unknown) =>
  request(app).patch(`/api/reports/${id}/coach-notes`).set('Cookie', await login(who.username)).send(body as any);
const stored = async (id: string) => (await db.select().from(reports).where(eq(reports.id, id)))[0].coachNotes;

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set to run integration tests.');
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);

  const ts = Date.now();
  const mkOrg = async (label: string) =>
    (await db.insert(organizations).values({ name: `${PREFIX}${label}_${ts}`, isActive: true } as any).returning({ id: organizations.id }))[0].id;
  // "a" sorts first: it is the session (primary) organization of mixed
  orgA = await mkOrg('a_org');
  orgB = await mkOrg('b_org');
  orgIds.push(orgA, orgB);
  for (const tag of ['coach', 'orgadmin', 'athlete', 'otherCoach', 'mixed']) u[tag] = await mkUser(tag);
  adminOnly = await mkUser('siteadmin', { isSiteAdmin: true });
  await join(u.coach.id, orgB, 'coach');
  await join(u.orgadmin.id, orgB, 'org_admin');
  await join(u.athlete.id, orgB, 'athlete');
  await join(u.otherCoach.id, orgA, 'coach');
  await join(u.mixed.id, orgA, 'coach'); // coach in the primary org ...
  await join(u.mixed.id, orgB, 'athlete'); // ... but an athlete in the report org
});

afterAll(async () => {
  await purgeTestRows({ usernameLike: [`${PREFIX}%`], userIds, orgIds });
  await db.delete(reports).where(like(reports.name, `${PREFIX}%`)).catch(() => {});
});

describe('PATCH /api/reports/:id/coach-notes', () => {
  it('coach of the report org saves validated notes; org admin and site admin may too', async () => {
    const r = await mkReport(orgB, 'individual', u.athlete.id, null);
    const res = await patch(u.coach, r.id, { goals: 'Sub 5.0 40', seasonPhase: 'in' });
    expect(res.status).toBe(200);
    expect(res.body.coachNotes).toEqual({ goals: 'Sub 5.0 40', seasonPhase: 'in' });
    expect(await stored(r.id)).toEqual({ goals: 'Sub 5.0 40', seasonPhase: 'in' });
    expect((await patch(u.orgadmin, r.id, { goals: 'b' })).status).toBe(200);
    expect((await patch(adminOnly, r.id, { goals: 'c' })).status).toBe(200);
    expect(await stored(r.id)).toEqual({ goals: 'c' });
  });

  it('an empty object clears the notes (express.json strict rejects a literal null body)', async () => {
    const r = await mkReport(orgB, 'individual', u.athlete.id);
    expect((await patch(u.coach, r.id, {})).status).toBe(200);
    expect(await stored(r.id)).toBeNull();
  });

  it('400 and notes untouched when the request has no JSON body', async () => {
    const r = await mkReport(orgB, 'individual', u.athlete.id);
    const res = await request(app).patch(`/api/reports/${r.id}/coach-notes`).set('Cookie', await login(u.coach.username));
    expect(res.status).toBe(400);
    expect(await stored(r.id)).toEqual(NOTES);
  });

  it('404 and notes untouched once the athlete is soft-deleted (COPPA)', async () => {
    const gone = await mkUser('gone');
    const r = await mkReport(orgB, 'individual', gone.id);
    await db.update(users).set({ deletedAt: new Date() } as any).where(eq(users.id, gone.id));
    expect((await patch(u.coach, r.id, { goals: 'back again' })).status).toBe(404);
    expect(await stored(r.id)).toEqual(NOTES);
  });

  it('403 for an athlete', async () => {
    const r = await mkReport(orgB, 'individual', u.athlete.id, null);
    expect((await patch(u.athlete, r.id, { goals: 'x' })).status).toBe(403);
    expect(await stored(r.id)).toBeNull();
  });

  it('403 for a coach of a different organization', async () => {
    const r = await mkReport(orgB, 'individual', u.athlete.id, null);
    expect((await patch(u.otherCoach, r.id, { goals: 'x' })).status).toBe(403);
    expect(await stored(r.id)).toBeNull();
  });

  it('403 for a user who is coach in their primary org but athlete in the report org', async () => {
    const r = await mkReport(orgB, 'individual', u.athlete.id, null);
    expect((await patch(u.mixed, r.id, { goals: 'x' })).status).toBe(403);
    expect(await stored(r.id)).toBeNull();
  });

  it('400 for a team report; 404 for an unknown id; 401 without a session', async () => {
    const t = await mkReport(orgB, 'team', u.athlete.id, null);
    expect((await patch(u.coach, t.id, { goals: 'x' })).status).toBe(400);
    expect((await patch(u.coach, crypto.randomUUID(), { goals: 'x' })).status).toBe(404);
    expect((await request(app).patch(`/api/reports/${t.id}/coach-notes`).send({})).status).toBe(401);
  });

  it('eval rows: 400 for a writer of the org, 404 for a non-writer', async () => {
    const e = await mkReport(orgB, 'eval', u.athlete.id, null);
    expect((await patch(u.coach, e.id, { goals: 'x' })).status).toBe(400);
    expect((await patch(u.athlete, e.id, { goals: 'x' })).status).toBe(404);
    expect((await patch(u.otherCoach, e.id, { goals: 'x' })).status).toBe(404);
    expect(await stored(e.id)).toBeNull();
  });

  it.each([
    ['unknown key', { nope: 1 }],
    ['goals too long', { goals: 'x'.repeat(1001) }],
    ['bad enum', { seasonPhase: 'summer' }],
    ['bad date', { nextRetestDate: 'soon' }],
  ])('400 for an invalid body (%s), nothing stored', async (_n, body) => {
    const r = await mkReport(orgB, 'individual', u.athlete.id, null);
    expect((await patch(u.coach, r.id, body)).status).toBe(400);
    expect(await stored(r.id)).toBeNull();
  });
});

describe('generic report routes cannot write coachNotes', () => {
  it('PUT /api/reports/:id ignores coachNotes', async () => {
    const r = await mkReport(orgB, 'individual', u.athlete.id, null);
    const res = await request(app).put(`/api/reports/${r.id}`).set('Cookie', await login(u.coach.username))
      .send({ name: 'renamed', coachNotes: { goals: 'injected' } });
    expect(res.status).toBe(200);
    expect(await stored(r.id)).toBeNull();
  });

  it('POST /api/reports ignores coachNotes', async () => {
    const res = await request(app).post('/api/reports').set('Cookie', await login(u.coach.username)).send({
      organizationId: orgB, name: `${PREFIX}created_${uid()}`, reportType: 'individual',
      config: { athleteId: u.athlete.id, timeframe: { type: 'preset', preset: 'all_time' }, metrics: ['FLY10_TIME'] },
      coachNotes: { goals: 'injected' },
    });
    expect(res.status).toBe(201);
    const id = (res.body.id ?? res.body.reports?.[0]?.id) as string;
    reportIds.push(id);
    expect(await stored(id)).toBeNull();
  });
});

describe('coachNotes read strip', () => {
  it('GET /api/reports/:id: writers keep coachNotes, an athlete of the same org never gets the key', async () => {
    const r = await mkReport(orgB, 'individual', u.athlete.id);
    const coach = await request(app).get(`/api/reports/${r.id}`).set('Cookie', await login(u.coach.username));
    expect(coach.status).toBe(200);
    expect(coach.body.coachNotes).toEqual(NOTES);
    const site = await request(app).get(`/api/reports/${r.id}`).set('Cookie', await login(adminOnly.username));
    expect(site.body.coachNotes).toEqual(NOTES);
    const ath = await request(app).get(`/api/reports/${r.id}`).set('Cookie', await login(u.athlete.username));
    expect(ath.status).toBe(200);
    expect(JSON.stringify(ath.body)).not.toContain(SECRET);
    expect(ath.body).not.toHaveProperty('coachNotes');
    const mixed = await request(app).get(`/api/reports/${r.id}`).set('Cookie', await login(u.mixed.username));
    expect(mixed.status).toBe(200);
    expect(mixed.body).not.toHaveProperty('coachNotes');
  });

  it('GET /api/reports list: writers keep coachNotes, an athlete never gets the key', async () => {
    const r = await mkReport(orgB, 'individual', u.athlete.id);
    const find = (body: any) => body.reports.find((x: any) => x.id === r.id);
    const coach = await request(app).get(`/api/reports?organizationId=${orgB}&limit=100`).set('Cookie', await login(u.coach.username));
    expect(find(coach.body)?.coachNotes).toEqual(NOTES);
    const ath = await request(app).get(`/api/reports?organizationId=${orgB}&limit=100`).set('Cookie', await login(u.athlete.username));
    expect(ath.status).toBe(200);
    expect(JSON.stringify(ath.body)).not.toContain(SECRET);
    const mixed = await request(app).get(`/api/reports?organizationId=${orgB}&limit=100`).set('Cookie', await login(u.mixed.username));
    expect(mixed.status).toBe(200);
    expect(find(mixed.body)).toBeTruthy(); // the row is listed ...
    expect(JSON.stringify(mixed.body)).not.toContain(SECRET); // ... without the notes
  });

  it('PUT response is stripped for a non-writer', async () => {
    const r = await mkReport(orgB, 'individual', u.athlete.id);
    const res = await request(app).put(`/api/reports/${r.id}`).set('Cookie', await login(u.athlete.username)).send({ description: 'd' });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
  });

  it('shared-with-athlete view and snapshots/public links never contain the notes', async () => {
    const r = await mkReport(orgB, 'individual', u.athlete.id);
    const [share] = await db.insert(reportShares).values({
      reportId: r.id, athleteId: u.athlete.id, sharedBy: u.coach.id, organizationId: orgB,
    } as any).returning();
    const shared = await request(app).get(`/api/my/reports/${share.id}`).set('Cookie', await login(u.athlete.username));
    expect(shared.status).toBe(200);
    expect(JSON.stringify(shared.body)).not.toContain(SECRET);
    const list = await request(app).get('/api/my/reports').set('Cookie', await login(u.athlete.username));
    expect(JSON.stringify(list.body)).not.toContain(SECRET);

    const coachCookie = await login(u.coach.username);
    const snap = await request(app).post(`/api/reports/${r.id}/snapshots`).set('Cookie', coachCookie).send({});
    expect(snap.status).toBe(201);
    expect(JSON.stringify(snap.body)).not.toContain(SECRET);
    const snaps = await request(app).get(`/api/reports/${r.id}/snapshots`).set('Cookie', coachCookie);
    expect(snaps.status).toBe(200);
    expect(JSON.stringify(snaps.body)).not.toContain(SECRET);
    const pub = await request(app).get(`/api/public/reports/${snap.body.publicToken}`);
    expect(pub.status).toBe(200);
    expect(JSON.stringify(pub.body)).not.toContain(SECRET);
    const [row] = await db.select().from(reportSnapshots).where(eq(reportSnapshots.reportId, r.id));
    expect(JSON.stringify(row.snapshotData)).not.toContain(SECRET);
  });
});
