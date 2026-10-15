/**
 * Individual and team report PDFs print duration (mm:ss) metrics as mm:ss; decimal metrics are unchanged.
 */
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-for-integration-tests-only-at-least-32-characters-long';
process.env.BYPASS_GENERAL_RATE_LIMIT = 'true';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express, { type Express } from 'express';
import { eq, inArray } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { db } from '../../packages/api/db';
import { measurements, organizations, reports, siteMetrics, teams, userOrganizations, users, userTeams } from '@shared/schema';
import { BCRYPT_SALT_ROUNDS } from '@shared/constants';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const PASSWORD = 'DurPdf123!';
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
const MILE = `DURPDF_MILE_${suffix}`;
const JUMP = `DURPDF_JUMP_${suffix}`;

describe('report PDFs: duration metrics', () => {
  let app: Express;
  let orgId: string;
  let teamId: string;
  let athlete: any;
  let coach: any;
  let cookie: string;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    await registerRoutes(app);

    const [org] = await db.insert(organizations).values({ name: `Dur Pdf Org ${suffix}` }).returning();
    orgId = org.id;
    const [team] = await db.insert(teams).values({ name: `Dur Pdf Team ${suffix}`, organizationId: orgId }).returning();
    teamId = team.id;
    const hashed = await bcrypt.hash(PASSWORD, BCRYPT_SALT_ROUNDS);
    const mk = async (tag: string) =>
      (
        await db
          .insert(users)
          .values({
            username: `dur-pdf-${tag}-${suffix}`.toLowerCase(),
            emails: [`dur-pdf-${tag}-${suffix}@test.com`.toLowerCase()],
            password: hashed,
            firstName: 'Durpdf',
            lastName: `Person${tag}`,
            fullName: `Durpdf Person${tag}`,
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

    await db.insert(siteMetrics).values([
      { code: MILE, label: 'Mile', unit: 's', displayFormat: 'duration', decimalPrecision: 1 },
      { code: JUMP, label: 'Jump', unit: 'in', metricType: 'higher_is_better' },
    ] as any);
    const row = (metric: string, value: string, units: string) => ({
      userId: athlete.id, submittedBy: coach.id, organizationId: orgId, teamId, date: '2024-03-10', age: 16, metric, value, units, isVerified: true,
    });
    await db.insert(measurements).values([row(MILE, '402.500', 's'), row(JUMP, '24.500', 'in')] as any);

    const login = await request(app).post('/api/auth/login').send({ username: coach.username, password: PASSWORD });
    cookie = login.headers['set-cookie'][0];
  });

  afterAll(async () => {
    await db.delete(reports).where(eq(reports.organizationId, orgId));
    await db.delete(measurements).where(eq(measurements.userId, athlete.id));
    await db.delete(siteMetrics).where(inArray(siteMetrics.code, [MILE, JUMP]));
    await db.delete(userTeams).where(eq(userTeams.teamId, teamId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, orgId));
    await db.delete(users).where(inArray(users.id, [athlete.id, coach.id]));
    await db.delete(teams).where(eq(teams.id, teamId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  const binary = (res: any, cb: (err: Error | null, body: Buffer) => void) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  };

  const pdfText = async (reportType: 'individual' | 'team') => {
    const [report] = await db
      .insert(reports)
      .values({
        name: `Duration ${reportType}`,
        organizationId: orgId,
        reportType,
        config: { timeframe: { type: 'preset', preset: 'all_time' }, metrics: [MILE, JUMP], filters: { teamIds: [teamId] } },
        createdBy: coach.id,
      } as any)
      .returning();
    const query = reportType === 'individual' ? `?athleteId=${athlete.id}` : '';
    const res = await request(app).get(`/api/reports/${report.id}/pdf${query}`).set('Cookie', cookie).buffer(true).parse(binary);
    expect(res.status, (res.body as Buffer).toString()).toBe(200);
    return (res.body as Buffer).toString('latin1');
  };

  it('individual PDF prints the duration value as mm:ss and the decimal one as before', async () => {
    const text = await pdfText('individual');
    expect(text).toContain('6:42.5');
    expect(text).not.toContain('402.50 s');
    expect(text).toContain('24.50 in');
  });

  it('team PDF prints the duration statistics and ranking as mm:ss', async () => {
    const text = await pdfText('team');
    expect(text).toContain('6:42.5');
    expect(text).not.toContain('402.50');
    expect(text).toContain('24.50');
  });
});
