/**
 * Coaching insights reach readers (public link, athlete's shared report) as the coach's words, read LIVE from the
 * report row so a coach's edit shows on every link. The model name and coach notes never leave the coach side.
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
import { organizations, users, userOrganizations, reports, reportSnapshots, reportShares } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const stamp = Date.now();
const PASSWORD = 'TestPubInsights123!';
const CONFIG = { timeframe: { type: 'preset', preset: 'all_time' }, metrics: ['FLY10_TIME'] };
const MODEL = 'model-key-that-must-not-leak';
let app: Express;
let orgId: string;
let coach: { id: string; username: string };
let athlete: { id: string; username: string };
let coachCookie: string;
let athleteCookie: string;
const userIds: string[] = [];
const reportIds: string[] = [];

const mkUser = async (tag: string) => {
  const [row] = await db.insert(users).values({
    username: `pubins_${tag}_${stamp}`, emails: [`pubins_${tag}_${stamp}@test.com`],
    password: await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS), firstName: 'Pub', lastName: tag, fullName: `Pub ${tag}`,
    birthDate: '1990-01-01', isActive: true, isEmailVerified: true,
  } as any).returning();
  userIds.push(row.id);
  return row;
};
const login = async (username: string) => {
  const res = await request(app).post('/api/auth/login').send({ username, password: PASSWORD });
  if (res.status !== 200) throw new Error(`login ${res.status}`);
  return res.headers['set-cookie'][0] as string;
};
const mkReport = async (extra: Record<string, unknown> = {}) => {
  const [r] = await db.insert(reports).values({
    name: `pubins_${stamp}_${reportIds.length}`, organizationId: orgId, createdBy: coach.id, reportType: 'team', config: CONFIG,
    ...extra,
  } as any).returning();
  reportIds.push(r.id);
  return r;
};
const shareLink = async (reportId: string): Promise<string> => {
  const res = await request(app).post(`/api/reports/${reportId}/snapshots`).set('Cookie', coachCookie).send({});
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.publicToken as string;
};
const publicGet = (token: string) => request(app).get(`/api/public/reports/${token}`);

beforeAll(async () => {
  app = express();
  app.use(express.json());
  await registerRoutes(app);
  const [org] = await db.insert(organizations).values({ name: `pubins_${stamp}`, isActive: true } as any).returning();
  orgId = org.id;
  coach = await mkUser('coach');
  athlete = await mkUser('athlete');
  await db.insert(userOrganizations).values({ userId: coach.id, organizationId: orgId, role: 'coach' } as any);
  await db.insert(userOrganizations).values({ userId: athlete.id, organizationId: orgId, role: 'athlete' } as any);
  coachCookie = await login(coach.username);
  athleteCookie = await login(athlete.username);
});

afterAll(async () => {
  await db.delete(reportShares).where(inArray(reportShares.reportId, reportIds));
  await db.delete(reportSnapshots).where(inArray(reportSnapshots.reportId, reportIds));
  await db.delete(reports).where(inArray(reports.id, reportIds));
  await db.delete(userOrganizations).where(inArray(userOrganizations.userId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));
  await db.delete(organizations).where(eq(organizations.id, orgId));
});

describe('GET /api/public/reports/:token', () => {
  it('returns the coach insights and written date from the report row', async () => {
    const written = new Date('2026-11-02T12:00:00Z');
    const r = await mkReport({ coachingInsights: 'Strong block of work.', coachingInsightsGeneratedAt: written });
    const res = await publicGet(await shareLink(r.id));
    expect(res.status).toBe(200);
    expect(res.body.snapshotData.coachingInsights).toBe('Strong block of work.');
    expect(new Date(res.body.snapshotData.coachingInsightsGeneratedAt).toISOString()).toBe(written.toISOString());
  });

  it('is live: a coach edit after sharing shows on the same link', async () => {
    const r = await mkReport({ coachingInsights: 'Typo hree.', coachingInsightsGeneratedAt: new Date() });
    const token = await shareLink(r.id);
    await db.update(reports).set({ coachingInsights: 'Typo here, fixed.' }).where(eq(reports.id, r.id));
    expect((await publicGet(token)).body.snapshotData.coachingInsights).toBe('Typo here, fixed.');
  });

  it('never exposes the model key or coach notes', async () => {
    const r = await mkReport({ coachingInsights: 'Text.', coachingInsightsGeneratedAt: new Date(), coachingInsightsModel: MODEL });
    const res = await publicGet(await shareLink(r.id));
    expect(JSON.stringify(res.body)).not.toContain(MODEL);
    expect(JSON.stringify(res.body)).not.toContain('coachingInsightsModel');
    expect(JSON.stringify(res.body)).not.toContain('coachNotes');
  });

  it('has no insights (null) when the report has none', async () => {
    const r = await mkReport();
    const res = await publicGet(await shareLink(r.id));
    expect(res.status).toBe(200);
    expect(res.body.snapshotData.coachingInsights ?? null).toBeNull();
  });

  it('a deleted-on-COPPA-clear report (insights nulled) shows nothing on its old link', async () => {
    const r = await mkReport({ coachingInsights: 'Will be cleared.', coachingInsightsGeneratedAt: new Date() });
    const token = await shareLink(r.id);
    await db.update(reports).set({ coachingInsights: null, coachingInsightsGeneratedAt: null, coachingInsightsModel: null }).where(eq(reports.id, r.id));
    expect((await publicGet(token)).body.snapshotData.coachingInsights ?? null).toBeNull();
  });
});

describe('GET /api/my/reports/:shareId (athlete)', () => {
  it('returns the written date with the insights and never the model', async () => {
    const written = new Date('2026-11-02T12:00:00Z');
    const r = await mkReport({ coachingInsights: 'For the athlete.', coachingInsightsGeneratedAt: written, coachingInsightsModel: MODEL });
    const [share] = await db.insert(reportShares).values({ reportId: r.id, athleteId: athlete.id, sharedBy: coach.id, organizationId: orgId } as any).returning();
    const res = await request(app).get(`/api/my/reports/${share.id}`).set('Cookie', athleteCookie);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.report.coachingInsights).toBe('For the athlete.');
    expect(new Date(res.body.report.coachingInsightsGeneratedAt).toISOString()).toBe(written.toISOString());
    expect(JSON.stringify(res.body)).not.toContain(MODEL);
  });
});
