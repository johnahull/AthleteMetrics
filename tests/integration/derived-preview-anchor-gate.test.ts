/**
 * Issue #579: GET /api/measurements/calculate-preview must apply the anchorMetric gate
 * that DerivedMetricCalculator.computeAndUpsertDerived enforces. An anchored derived
 * metric (MOMENTUM-like) only exists on a date with a verified, non-calculated anchor
 * row, so the preview returns no value on any other date.
 *
 * The CI database has only the default seeded metrics, so this file seeds its own
 * derived metric (TST_PV_MOMENTUM) and weight metric (TST_PV_WT); FLY10_TIME is seeded.
 */
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@test.com';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TestPassword123!';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { eq, inArray, sql } from 'drizzle-orm';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));
vi.mock('../../packages/api/services/measurement-notification-service', () => ({
  notifyNewMeasurement: vi.fn().mockResolvedValue(undefined),
}));

import { registerRoutes } from '../../packages/api/routes';
import { db } from '../../packages/api/db';
import { measurements, organizations, teams, userOrganizations, userTeams, users } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

const DERIVED = 'TST_PV_MOMENTUM';
const WEIGHT = 'TST_PV_WT';
const FLY = 'FLY10_TIME';
const PASSWORD = 'TestPass123!';

let app: Express;
let orgId: string;
let athleteId: string;
let coachId: string;
let coachCookie: string;
let nextIp = 1;
const ip = () => `10.5.79.${nextIp++}`;

const preview = (date: string) =>
  request(app)
    .get('/api/measurements/calculate-preview')
    .query({ athleteId, metricCode: DERIVED, date })
    .set('X-Forwarded-For', ip())
    .set('Cookie', coachCookie);

const insert = (metric: string, value: string, date: string, isVerified: boolean) =>
  db.insert(measurements).values({
    userId: athleteId,
    organizationId: orgId,
    submittedBy: coachId,
    isVerified,
    metric,
    value,
    units: metric === WEIGHT ? 'lb' : 's',
    age: 18,
    date,
  } as any);

beforeAll(async () => {
  await db.execute(sql`
    INSERT INTO site_metrics (code, label, category, unit, metric_type, is_system_default, is_active, display_order, decimal_precision)
    VALUES (${WEIGHT}, 'Test preview body weight', 'Anthropometrics', 'lb', 'tracking', false, true, 910, 1)
    ON CONFLICT (code) DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO site_metrics (
      code, label, category, unit, metric_type, is_system_default, is_active, display_order, decimal_precision,
      is_derived, formula, dependent_metrics, calculation_config
    ) VALUES (
      ${DERIVED}, 'Test preview momentum', 'Power', 'kg*m/s', 'tracking', false, true, 911, 1,
      true,
      ${`${WEIGHT.toLowerCase()} * 0.45359237 * 9.144 / fly10_time`},
      ARRAY[${FLY}, ${WEIGHT}],
      '{"dateMatchStrategy":"closest","maxDateDifference":45,"missingSourceBehavior":"skip","anchorMetric":"FLY10_TIME"}'::jsonb
    )
    ON CONFLICT (code) DO UPDATE SET
      is_derived = true, is_active = true, formula = EXCLUDED.formula,
      dependent_metrics = EXCLUDED.dependent_metrics, calculation_config = EXCLUDED.calculation_config
  `);
  app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await registerRoutes(app);
});

afterAll(async () => {
  await db.execute(sql`DELETE FROM site_metrics WHERE code IN (${DERIVED}, ${WEIGHT})`);
});

beforeEach(async () => {
  const ts = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const [org] = await db.insert(organizations).values({ name: `Preview Anchor Org ${ts}`, isActive: true } as any).returning();
  orgId = org.id;
  const [team] = await db.insert(teams).values({ name: 'Preview Anchor Team', organizationId: orgId, level: 'College' } as any).returning();
  const hashed = await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS);
  const mk = async (tag: string) =>
    (
      await db
        .insert(users)
        .values({
          username: `pva_${tag}_${ts}`,
          emails: [`pva_${tag}_${ts}@test.com`],
          password: hashed,
          firstName: tag,
          lastName: 'Pva',
          fullName: `${tag} Pva`,
          birthDate: '2008-01-01',
          birthYear: 2008,
        } as any)
        .returning()
    )[0];
  const athlete = await mk('ath');
  const coach = await mk('coach');
  athleteId = athlete.id;
  coachId = coach.id;
  await db.insert(userOrganizations).values([
    { userId: athleteId, organizationId: orgId, role: 'athlete' },
    { userId: coachId, organizationId: orgId, role: 'coach' },
  ] as any);
  await db.insert(userTeams).values({ userId: athleteId, teamId: team.id, joinedAt: new Date('2020-01-01'), isActive: true } as any);
  const login = await request(app).post('/api/auth/login').set('X-Forwarded-For', ip()).send({ username: coach.username, password: PASSWORD });
  coachCookie = login.headers['set-cookie'][0];
});

afterEach(async () => {
  const ids = [athleteId, coachId];
  await db.delete(measurements).where(inArray(measurements.userId, ids));
  await db.delete(userTeams).where(inArray(userTeams.userId, ids));
  await db.delete(userOrganizations).where(inArray(userOrganizations.userId, ids));
  await db.delete(teams).where(eq(teams.organizationId, orgId));
  await db.delete(users).where(inArray(users.id, ids));
  await db.delete(organizations).where(eq(organizations.id, orgId));
});

describe('GET /api/measurements/calculate-preview: anchorMetric gate (#579)', () => {
  it('is reachable (not swallowed by GET /api/measurements/:id)', async () => {
    const res = await request(app)
      .get('/api/measurements/calculate-preview')
      .query({ athleteId, metricCode: FLY, date: '2026-03-10' })
      .set('X-Forwarded-For', ip())
      .set('Cookie', coachCookie);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ calculatedValue: null, sourceMetrics: [], formula: null });
  });

  it('returns the value on a date with a verified anchor', async () => {
    await insert(FLY, '1.30', '2026-03-10', true);
    await insert(WEIGHT, '150', '2026-03-01', true);

    const res = await preview('2026-03-10');

    expect(res.status).toBe(200);
    expect(res.body.calculatedValue).toBeCloseTo((150 * 0.45359237 * 9.144) / 1.3, 6);
  });

  it('returns no value when the anchor on that date is unverified', async () => {
    // A verified fly 5 days away is a usable source, but the anchor on the preview date is unverified.
    await insert(FLY, '1.30', '2026-03-10', false);
    await insert(FLY, '1.35', '2026-03-15', true);
    await insert(WEIGHT, '150', '2026-03-10', true);

    const res = await preview('2026-03-10');

    expect(res.status).toBe(200);
    expect(res.body.calculatedValue).toBeNull();
    expect(res.body.sourceMetrics).toEqual([]);
    expect(res.body.missingMetrics).toEqual([FLY]);
  });

  it('returns no value on a date with no anchor (a weight-only date)', async () => {
    await insert(FLY, '1.30', '2026-03-10', true);
    await insert(WEIGHT, '150', '2026-03-01', true);

    const res = await preview('2026-03-01');

    expect(res.status).toBe(200);
    expect(res.body.calculatedValue).toBeNull();
    expect(res.body.sourceMetrics).toEqual([]);
    expect(res.body.missingMetrics).toEqual([FLY]);
    expect(res.body.formula).toBe(`${WEIGHT.toLowerCase()} * 0.45359237 * 9.144 / fly10_time`);
  });
});
