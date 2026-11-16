/**
 * Sharing, public snapshots and bulk operations need a writer role (coach / org_admin / site admin) in the
 * report's OWN organization. Organization membership alone (an athlete), or a coach role in some OTHER primary
 * organization, is not enough. A snapshot mints a token served without login at /api/public/reports/:token.
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
import bcrypt from 'bcrypt';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { organizations, users, userOrganizations, reports, reportSnapshots } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const stamp = Date.now();
const PASSWORD = 'TestShareGate123!';
const CONFIG = { timeframe: { type: 'preset', preset: 'all_time' }, metrics: ['FLY10_TIME'] };
let app: Express;
let orgA: string; // sorts first: the session (primary) organization of "mixed"
let orgB: string; // the report organization
const u: Record<string, any> = {};
const cookies: Record<string, string> = {};
const userIds: string[] = [];
const reportIds: string[] = [];

const mkUser = async (tag: string, extra: Record<string, unknown> = {}) => {
  const [row] = await db.insert(users).values({
    username: `sharegate_${tag}_${stamp}`, emails: [`sharegate_${tag}_${stamp}@test.com`],
    password: await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS), firstName: 'Share', lastName: tag, fullName: `Share ${tag}`,
    birthDate: '1990-01-01', isActive: true, isEmailVerified: true, ...extra,
  } as any).returning();
  userIds.push(row.id);
  return row;
};
// Log in only after the memberships exist: the session's primary organization is read at login
const loginAll = async () => {
  for (const [tag, row] of Object.entries(u)) {
    const login = await request(app).post('/api/auth/login').send({ username: row.username, password: PASSWORD });
    if (login.status !== 200) throw new Error(`login ${tag} ${login.status}`);
    cookies[tag] = login.headers['set-cookie'][0];
  }
};
const join = (userId: string, organizationId: string, role: string) =>
  db.insert(userOrganizations).values({ userId, organizationId, role } as any);
const mkReport = async (reportType = 'team') => {
  const [r] = await db.insert(reports).values({
    name: `sharegate_${stamp}_${reportIds.length}`, organizationId: orgB, createdBy: u.coach.id, reportType,
    config: reportType === 'individual' ? { ...CONFIG, athleteId: u.athlete.id } : CONFIG,
  } as any).returning();
  reportIds.push(r.id);
  return r;
};
const exists = async (id: string) => (await db.select().from(reports).where(eq(reports.id, id))).length === 1;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  await registerRoutes(app);
  const mkOrg = async (label: string) =>
    (await db.insert(organizations).values({ name: `sharegate_${label}_${stamp}`, isActive: true } as any).returning())[0].id;
  orgA = await mkOrg('a');
  orgB = await mkOrg('b');
  for (const tag of ['coach', 'orgadmin', 'athlete', 'mixed']) u[tag] = await mkUser(tag);
  u.site = await mkUser('site', { isSiteAdmin: true });
  await join(u.coach.id, orgB, 'coach');
  await join(u.orgadmin.id, orgB, 'org_admin');
  await join(u.athlete.id, orgB, 'athlete');
  await join(u.mixed.id, orgA, 'coach'); // coach in the primary org ...
  await join(u.mixed.id, orgB, 'athlete'); // ... but an athlete in the report org
  await loginAll();
});

afterAll(async () => {
  await db.delete(reportSnapshots).where(inArray(reportSnapshots.reportId, reportIds));
  await db.delete(reports).where(inArray(reports.id, reportIds));
  await db.delete(userOrganizations).where(inArray(userOrganizations.userId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));
  await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
});

const call = (who: string, method: 'get' | 'post' | 'delete', path: string, body?: object) => {
  const r = request(app)[method](path).set('Cookie', cookies[who]);
  return body ? r.send(body) : r;
};

// every route a non-writer must be refused on, for a given report id
const calls = (id: string, snapshotId: string): Array<[string, string, (who: string) => request.Test]> => [
  ['POST share', 'share', (w) => call(w, 'post', `/api/reports/${id}/share`, { athleteId: u.athlete.id })],
  ['POST share-bulk', 'share-bulk', (w) => call(w, 'post', `/api/reports/${id}/share-bulk`, { athleteIds: [u.athlete.id] })],
  ['GET shares', 'shares', (w) => call(w, 'get', `/api/reports/${id}/shares`)],
  ['POST snapshots', 'snap-create', (w) => call(w, 'post', `/api/reports/${id}/snapshots`, {})],
  ['GET snapshots', 'snap-list', (w) => call(w, 'get', `/api/reports/${id}/snapshots`)],
  ['DELETE snapshot', 'snap-delete', (w) => call(w, 'delete', `/api/reports/${id}/snapshots/${snapshotId}`)],
  ['POST bulk-archive', 'bulk', (w) => call(w, 'post', '/api/reports/bulk-archive', { reportIds: [id] })],
  ['POST bulk-unarchive', 'bulk', (w) => call(w, 'post', '/api/reports/bulk-unarchive', { reportIds: [id] })],
  ['POST bulk-distribute', 'bulk', (w) => call(w, 'post', '/api/reports/bulk-distribute', { reportIds: [id] })],
  ['POST bulk-delete', 'bulk', (w) => call(w, 'post', '/api/reports/bulk-delete', { reportIds: [id] })],
];

describe('a member who is not a writer of the report organization', () => {
  it.each(['athlete', 'mixed'])('%s is refused (403) on every share, snapshot and bulk route, and nothing changes', async (who) => {
    const r = await mkReport();
    const snap = await call('coach', 'post', `/api/reports/${r.id}/snapshots`, {});
    expect(snap.status).toBe(201);
    const snapshotsBefore = (await db.select().from(reportSnapshots).where(eq(reportSnapshots.reportId, r.id))).length;
    for (const [label, , make] of calls(r.id, snap.body.id)) {
      const res = await make(who);
      expect(res.status, `${label} as ${who}: ${JSON.stringify(res.body)}`).toBe(403);
    }
    expect(await exists(r.id)).toBe(true);
    expect((await db.select().from(reportSnapshots).where(eq(reportSnapshots.reportId, r.id))).length).toBe(snapshotsBefore);
  });
});

describe('writers of the report organization', () => {
  it.each(['coach', 'orgadmin', 'site'])('%s can create, list and delete snapshots, share, and use the bulk routes', async (who) => {
    const r = await mkReport('individual');
    const created = await call(who, 'post', `/api/reports/${r.id}/snapshots`, {});
    expect(created.status, `snapshot as ${who}: ${JSON.stringify(created.body)}`).toBe(201);
    expect((await call(who, 'get', `/api/reports/${r.id}/snapshots`)).status).toBe(200);
    expect((await call(who, 'get', `/api/reports/${r.id}/shares`)).status).toBe(200);
    expect((await call(who, 'delete', `/api/reports/${r.id}/snapshots/${created.body.id}`)).status).toBe(200);
    for (const [label, kind, make] of calls(r.id, created.body.id)) {
      if (kind === 'share' || kind === 'share-bulk' || kind === 'bulk') {
        const res = await make(who);
        expect(res.status, `${label} as ${who}: ${JSON.stringify(res.body)}`).not.toBe(403);
      }
    }
  });
});
