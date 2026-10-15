/**
 * Exports of duration (mm:ss) metrics. The measurements CSV keeps `value` as numeric seconds and adds a
 * `display_value` column (mm:ss for duration metrics, otherwise the same as value). The COPPA data export
 * stays raw: seconds with units 's'.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import express, { type Express } from 'express';
import bcrypt from 'bcrypt';
import { db } from '../../packages/api/db';
import { customOrgMetrics, measurements, organizations, siteMetrics, userOrganizations, users } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';
import { CoppaExportService } from '../../packages/api/services/coppa-export-service';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const PASSWORD = 'DurExport123!';
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
const MILE = `DUREXP_MILE_${suffix}`;
const JUMP = `DUREXP_JUMP_${suffix}`;
const ROW = `ORG_DUREXP_ROW_${suffix}`;

describe('duration metrics in exports', () => {
  let app: Express;
  let orgId: string;
  let athlete: any;
  let coach: any;
  let cookie: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    await registerRoutes(app);

    const [org] = await db.insert(organizations).values({ name: `Dur Export Org ${suffix}` }).returning();
    orgId = org.id;
    const hashed = await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS);
    const mk = async (tag: string) =>
      (
        await db
          .insert(users)
          .values({
            username: `dur-exp-${tag}-${suffix}`.toLowerCase(),
            emails: [`dur-exp-${tag}-${suffix}@test.com`.toLowerCase()],
            password: hashed,
            firstName: 'Durexp',
            lastName: `Person${tag}`,
            fullName: `Durexp Person${tag}`,
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

    await db.insert(siteMetrics).values([
      { code: MILE, label: 'Mile', unit: 's', displayFormat: 'duration', decimalPrecision: 1 },
      { code: JUMP, label: 'Jump', unit: 'in', decimalPrecision: 1 },
    ] as any);
    await db.insert(customOrgMetrics).values({
      organizationId: orgId, code: ROW, label: 'Row 2k', unit: 's', displayFormat: 'duration', decimalPrecision: 1, createdBy: coach.id,
    } as any);

    const row = (metric: string, value: string, units: string) => ({
      userId: athlete.id, submittedBy: coach.id, organizationId: orgId, date: '2026-03-10', age: 18, metric, value, units, isVerified: true,
    });
    await db.insert(measurements).values([row(MILE, '402.500', 's'), row(JUMP, '24.500', 'in'), row(ROW, '435.000', 's')] as any);

    const login = await request(app).post('/api/auth/login').send({ username: coach.username, password: PASSWORD });
    cookie = login.headers['set-cookie'][0];
  });

  afterAll(async () => {
    await db.delete(measurements).where(eq(measurements.userId, athlete.id));
    await db.delete(customOrgMetrics).where(eq(customOrgMetrics.organizationId, orgId));
    await db.delete(siteMetrics).where(inArray(siteMetrics.code, [MILE, JUMP]));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, orgId));
    await db.delete(users).where(inArray(users.id, [athlete.id, coach.id]));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('CSV export keeps value in seconds and adds display_value (mm:ss for duration metrics)', async () => {
    const res = await request(app).get(`/api/export/measurements?organizationId=${orgId}`).set('Cookie', cookie);
    expect(res.status, res.text).toBe(200);
    const [header, ...lines] = res.text.split('\n');
    const cols = header.split(',');
    expect(cols).toContain('display_value');
    const byMetric = Object.fromEntries(
      lines.map((l) => l.split(',')).map((c) => [c[cols.indexOf('metric')], { value: c[cols.indexOf('value')], display: c[cols.indexOf('display_value')] }]),
    );
    expect(byMetric[MILE]).toEqual({ value: '402.500', display: '6:42.5' });
    expect(byMetric[ROW]).toEqual({ value: '435.000', display: '7:15.0' });
    expect(byMetric[JUMP]).toEqual({ value: '24.500', display: '24.500' });
  });

  it('COPPA data export stays raw seconds with units s', async () => {
    const bundle = await (new CoppaExportService() as any).buildExportBundle(athlete.id);
    const mile = bundle.measurements.find((m: any) => m.metric === MILE);
    expect(mile).toMatchObject({ value: '402.500', units: 's' });
  });
});
