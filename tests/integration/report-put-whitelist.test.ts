/**
 * PUT /api/reports/:id writes only name, description, config and isTemplate.
 * Any other column (AI insight fields, organizationId, ...) must be rejected and left unchanged.
 */
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { organizations, users, userOrganizations, reports } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const stamp = Date.now();
const PASSWORD = 'TestAthlete123!';
const GENERATED_AT = new Date('2024-01-01T00:00:00.000Z');
let app: Express;
let org: any;
let otherOrg: any;
let athlete: any;
let report: any;
let cookie: string;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  await registerRoutes(app);

  [org] = await db.insert(organizations).values({ name: `PutWl Org ${stamp}`, isActive: true }).returning();
  [otherOrg] = await db.insert(organizations).values({ name: `PutWl Other ${stamp}`, isActive: true }).returning();
  [athlete] = await db.insert(users).values({
    username: `putwl_athlete_${stamp}`,
    emails: [`putwl_athlete_${stamp}@test.com`],
    password: await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS),
    firstName: 'Put',
    lastName: 'Athlete',
    fullName: 'Put Athlete',
    birthDate: '1990-01-01', // the profile-completeness gate blocks athletes without one
  }).returning();
  await db.insert(userOrganizations).values({ userId: athlete.id, organizationId: org.id, role: 'athlete' });

  [report] = await db.insert(reports).values({
    name: 'Original',
    description: 'Original description',
    organizationId: org.id,
    reportType: 'team',
    config: { timeframe: { type: 'preset', preset: 'all_time' }, metrics: ['FLY10_TIME'] },
    createdBy: athlete.id,
    coachingInsights: 'original insights',
    coachingInsightsGeneratedAt: GENERATED_AT,
    coachingInsightsModel: 'original-model',
  }).returning();

  const login = await request(app).post('/api/auth/login').send({ username: athlete.username, password: PASSWORD });
  if (login.status !== 200) throw new Error('login ' + login.status + JSON.stringify(login.body));
  cookie = login.headers['set-cookie'][0];
});

afterAll(async () => {
  await db.delete(reports).where(eq(reports.id, report.id));
  await db.delete(userOrganizations).where(eq(userOrganizations.userId, athlete.id));
  await db.delete(users).where(eq(users.id, athlete.id));
  await db.delete(organizations).where(eq(organizations.id, org.id));
  await db.delete(organizations).where(eq(organizations.id, otherOrg.id));
});

const BASE_CONFIG = { timeframe: { type: 'preset', preset: 'all_time' }, metrics: ['FLY10_TIME'] };

// Reset the fixture so a write that slips through cannot corrupt the next case
beforeEach(async () => {
  await db.update(reports).set({
    name: 'Original', description: 'Original description', organizationId: org.id, reportType: 'team',
    config: BASE_CONFIG, createdBy: athlete.id, isTemplate: false,
    coachingInsights: 'original insights', coachingInsightsGeneratedAt: GENERATED_AT,
    coachingInsightsModel: 'original-model', isPinned: false, archivedAt: GENERATED_AT, updatedAt: null,
  }).where(eq(reports.id, report.id));
});

const put = (body: object) => request(app).put(`/api/reports/${report.id}`).set('Cookie', cookie).send(body);
const reload = async () => (await db.select().from(reports).where(eq(reports.id, report.id)))[0];

describe('PUT /api/reports/:id field whitelist', () => {
  // Values are ones the old insertReportSchema.partial() accepted, so each case is red on the old code
  const forbidden: Array<[string, () => object]> = [
    ['coachingInsights', () => ({ coachingInsights: 'forged' })],
    ['coachingInsightsGeneratedAt', () => ({ coachingInsightsGeneratedAt: null })],
    ['coachingInsightsModel', () => ({ coachingInsightsModel: 'forged-model' })],
    ['organizationId', () => ({ organizationId: otherOrg.id })],
    ['reportType', () => ({ reportType: 'individual' })],
    ['createdBy', () => ({ createdBy: 'someone-else' })],
    ['isPinned', () => ({ isPinned: true })],
    ['archivedAt', () => ({ archivedAt: null })],
    ['bogusKey', () => ({ bogusKey: 1 })],
  ];

  it.each(forbidden)('rejects %s and leaves the row unchanged', async (key, body) => {
    const res = await put({ name: 'Sneaky', ...body() });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatchObject({ code: 'unrecognized_keys', keys: [key] });
    const row = await reload();
    expect(row.name).toBe('Original');
    expect(row.organizationId).toBe(org.id);
    expect(row.reportType).toBe('team');
    expect(row.createdBy).toBe(athlete.id);
    expect(row.coachingInsights).toBe('original insights');
    expect(row.coachingInsightsGeneratedAt?.toISOString()).toBe(GENERATED_AT.toISOString());
    expect(row.coachingInsightsModel).toBe('original-model');
    expect(row.isPinned).toBe(false);
    expect(row.archivedAt?.toISOString()).toBe(GENERATED_AT.toISOString());
  });

  it('allows name, description and config edits', async () => {
    const config = { timeframe: { type: 'preset', preset: 'season' }, metrics: ['VERTICAL_JUMP'] };
    const res = await put({ name: 'Renamed', description: 'New description', config });
    expect(res.status).toBe(200);
    const row = await reload();
    expect(row.name).toBe('Renamed');
    expect(row.description).toBe('New description');
    expect(row.config).toMatchObject(config);
    expect(row.coachingInsights).toBe('original insights');
  });

  it('allows isTemplate and persists it', async () => {
    const res = await put({ isTemplate: true });
    expect(res.status).toBe(200);
    expect((await reload()).isTemplate).toBe(true);
  });

  it('accepts an empty body and changes only updatedAt', async () => {
    const before = await reload();
    const res = await put({});
    expect(res.status).toBe(200);
    const { updatedAt: bu, ...b } = before;
    const { updatedAt: au, ...a } = await reload();
    expect(a).toEqual(b);
    expect(au).not.toBeNull();
  });

  it.each([
    ['no timeframe or metrics', { charts: {} }],
    ['no metrics', { timeframe: { type: 'preset', preset: 'season' } }],
    ['no timeframe', { metrics: ['FLY10_TIME'] }],
    ['empty metrics', { timeframe: { type: 'preset', preset: 'season' }, metrics: [] }],
  ])('rejects a config with %s and keeps the stored config', async (_n, config) => {
    const res = await put({ config });
    expect(res.status).toBe(400);
    expect((await reload()).config).toEqual(BASE_CONFIG);
  });
});
