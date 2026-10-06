/**
 * AM-FEAT-015 D7: MQ_* / MQI_TOTAL / MQ_TRANSITION_TOTAL are ordinal coach
 * scores and are excluded from peer percentiles, benchmarks and leaderboards in v1.
 * Re-applies migration 0146 in beforeAll. Every exclusion test seeds MQ and a
 * non-MQ control (FLY10_TIME) so it fails if the exclusion filter is removed.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcrypt';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { storage } from '../../packages/api/storage';
import { PeerComparisonService } from '../../packages/api/services/peer-comparison-service';
import { BenchmarkService } from '../../packages/api/services/benchmark-service';
import { AnalyticsService } from '../../packages/api/services/analytics-service';
import { ReportService } from '../../packages/api/services/report-service';
import { measurements, organizations, teams, userTeams, users, userOrganizations, peerPercentileCache, siteBenchmarks, customBenchmarks } from '@shared/schema';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATE = '2026-03-10';
const EVENT_ID = `mqx-event-${Date.now()}`;

describe('MQ metrics are excluded from peer percentiles, benchmarks and leaderboards', () => {
  let orgId: string;
  let siteAdminId: string;
  let athleteId: string;
  let peerIds: string[];

  beforeAll(async () => {
    const upSql = fs.readFileSync(path.resolve(__dirname, '../../migrations/0146_seed_mqi_metrics.sql'), 'utf-8');
    await db.execute(sql.raw(upSql));
  });

  beforeEach(async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [org] = await db
      .insert(organizations)
      .values({ name: `MQ Excl Org ${suffix}`, benchmarksEnabled: true, allowCustomBenchmarks: true } as any)
      .returning();
    orgId = org.id;
    const mk = async (tag: string, extra: Record<string, unknown> = {}) =>
      (
        await db
          .insert(users)
          .values({
            username: `mqx-${tag}-${suffix}`,
            emails: [`mqx-${tag}-${suffix}@test.com`],
            password: 'x',
            firstName: 'M',
            lastName: tag,
            fullName: `M ${tag}`,
            ...extra,
          } as any)
          .returning()
      )[0].id;
    siteAdminId = await mk('admin', { isSiteAdmin: true });
    athleteId = await mk('ath', { showPeerComparisons: true });
    peerIds = [await mk('peer1'), await mk('peer2'), await mk('peer3')];

    // Athlete + peers each have an MQ score, an MQI total, and two FLY10_TIME (control) rows
    const all = [athleteId, ...peerIds];
    const [team] = await db.insert(teams).values({ name: 'MQ Excl Team', organizationId: orgId, level: 'Club' }).returning();
    for (const userId of all) {
      await db.insert(userOrganizations).values({ userId, organizationId: orgId, role: 'athlete' } as any);
      await db.insert(userTeams).values({ userId, teamId: team.id, joinedAt: new Date('2020-01-01'), isActive: true });
    }
    const rows: any[] = [];
    all.forEach((userId, i) => {
      const base = { userId, submittedBy: siteAdminId, date: DATE, age: 17, isVerified: true, organizationId: orgId, eventId: EVENT_ID };
      rows.push({ ...base, metric: 'MQ_JUMP', value: String(i % 4), units: 'score' });
      rows.push({ ...base, metric: 'MQI_TOTAL', value: String(10 + i), units: 'score' });
      rows.push({ ...base, metric: 'FLY10_TIME', value: (1.5 + i / 10).toFixed(2), units: 's' });
      rows.push({ ...base, metric: 'FLY10_TIME', value: (1.4 + i / 10).toFixed(2), units: 's', date: '2026-03-12' });
    });
    await db.insert(measurements).values(rows);
  });

  afterEach(async () => {
    const all = [siteAdminId, athleteId, ...peerIds];
    await db.delete(peerPercentileCache).where(inArray(peerPercentileCache.metricCode, ['MQ_JUMP', 'MQI_TOTAL']));
    await db.delete(measurements).where(inArray(measurements.userId, all));
    await db.delete(userTeams).where(inArray(userTeams.userId, all));
    await db.delete(teams).where(eq(teams.organizationId, orgId));
    await db.delete(userOrganizations).where(eq(userOrganizations.organizationId, orgId));
    await db.delete(users).where(inArray(users.id, all));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('peer distribution rejects MQ metrics', async () => {
    const svc = new PeerComparisonService(storage as any);
    await expect(svc.getDistribution('MQ_JUMP')).rejects.toThrow(/not available for peer comparison/i);
    await expect(svc.getDistribution('MQI_TOTAL')).rejects.toThrow(/not available for peer comparison/i);
  });

  it('peer percentiles omit MQ metrics and never cache a distribution for them', async () => {
    const svc = new PeerComparisonService(storage as any);
    const results = await svc.getAthletePercentiles(athleteId, ['MQ_JUMP', 'MQI_TOTAL', 'FLY10_TIME']);
    expect(results.map((r) => r.metric)).toContain('FLY10_TIME');
    expect(results.filter((r) => r.metric.startsWith('MQ'))).toEqual([]);
    const cached = await db
      .select()
      .from(peerPercentileCache)
      .where(inArray(peerPercentileCache.metricCode, ['MQ_JUMP', 'MQI_TOTAL']));
    expect(cached).toHaveLength(0);
  });

  it('site benchmark creation rejects MQ metrics', async () => {
    const svc = new BenchmarkService();
    await expect(
      svc.createSiteBenchmark(
        {
          metricCode: 'MQI_TOTAL',
          name: 'MQI bench',
          comparisonOperator: 'gte',
          benchmarkValue: 12,
          tierName: 'Competent',
        } as any,
        siteAdminId,
      ),
    ).rejects.toThrow(/not available for benchmarks/i);
  });

  it('tier group creation rejects MQ metrics', async () => {
    const svc = new BenchmarkService();
    await expect(
      svc.createTierGroup(
        {
          metricCode: 'MQ_JUMP',
          name: 'MQ tiers',
          comparisonOperator: 'range',
          tiers: [
            { tierName: 'Low', tierOrder: 1, minValue: 0, maxValue: 1.5 },
            { tierName: 'High', tierOrder: 2, minValue: 1.5, maxValue: 3 },
          ],
        } as any,
        siteAdminId,
      ),
    ).rejects.toThrow(/not available for benchmarks/i);
  });

  it('custom benchmark creation rejects MQ metrics', async () => {
    const svc = new BenchmarkService();
    await expect(
      svc.createCustomBenchmark(
        {
          organizationId: orgId,
          metricCode: 'MQ_JUMP',
          name: 'MQ custom',
          comparisonOperator: 'gte',
          benchmarkValue: 2,
          tierName: 'Functional',
        } as any,
        siteAdminId,
      ),
    ).rejects.toThrow(/not available for benchmarks/i);
  });

  it('leaderboard rejects MQ metrics', async () => {
    const svc = new AnalyticsService();
    await expect(svc.getLeaderboard(orgId, 'MQI_TOTAL')).rejects.toThrow(/not available for leaderboards/i);
    await expect(svc.getLeaderboard(orgId, 'FLY10_TIME')).resolves.toBeDefined();
  });

  it('most-improved rankings reject MQ metrics', async () => {
    const svc = new AnalyticsService();
    await expect(svc.getMostImproved(orgId, 'MQI_TOTAL')).rejects.toThrow(/not available/i);
    await expect(svc.getMostImproved(orgId, 'MQ_JUMP')).rejects.toThrow(/not available/i);
    const control = await svc.getMostImproved(orgId, 'FLY10_TIME');
    expect(control.improvements.length).toBeGreaterThan(0);
  });

  it('site benchmark update cannot retarget a benchmark to an MQ metric', async () => {
    const svc = new BenchmarkService();
    const created = await svc.createSiteBenchmark(
      {
        metricCode: 'FLY10_TIME',
        name: `MQ retarget ${Date.now()}`,
        comparisonOperator: 'lte',
        benchmarkValue: 1.6,
        tierName: 'Elite',
      } as any,
      siteAdminId,
    );
    try {
      await expect(
        svc.updateSiteBenchmark(created.id, { metricCode: 'MQI_TOTAL' } as any, siteAdminId),
      ).rejects.toThrow(/not available for benchmarks/i);
      const [row] = await db.select().from(siteBenchmarks).where(eq(siteBenchmarks.id, created.id));
      expect(row.metricCode).toBe('FLY10_TIME');
    } finally {
      await db.delete(siteBenchmarks).where(eq(siteBenchmarks.id, created.id));
    }
  });

  it('custom benchmark update cannot retarget a benchmark to an MQ metric', async () => {
    const svc = new BenchmarkService();
    const created = await svc.createCustomBenchmark(
      {
        organizationId: orgId,
        metricCode: 'FLY10_TIME',
        name: `MQ custom retarget ${Date.now()}`,
        comparisonOperator: 'lte',
        benchmarkValue: 1.6,
        tierName: 'Elite',
      } as any,
      siteAdminId,
    );
    try {
      await expect(
        svc.updateCustomBenchmark(orgId, created.id, { metricCode: 'MQ_JUMP' } as any, siteAdminId),
      ).rejects.toThrow(/not available for benchmarks/i);
      const [row] = await db.select().from(customBenchmarks).where(eq(customBenchmarks.id, created.id));
      expect(row.metricCode).toBe('FLY10_TIME');
    } finally {
      await db.delete(customBenchmarks).where(eq(customBenchmarks.id, created.id));
    }
  });

  describe('report percentiles', () => {
    const performances = { MQ_JUMP: 1, MQI_TOTAL: 10, FLY10_TIME: 1.5 };
    const metrics = Object.keys(performances);

    it('individual report percentiles / team averages omit MQ metrics', async () => {
      const svc = new ReportService();
      const { percentiles, teamAverages, peerValues } = await svc.calculatePercentilesAndAverages(
        athleteId, orgId, metrics, performances, '2026-03-01', '2026-03-31',
      );
      expect(Object.keys(percentiles)).toEqual(['FLY10_TIME']);
      expect(Object.keys(teamAverages)).toEqual(['FLY10_TIME']);
      expect(Object.keys(peerValues)).toEqual(['FLY10_TIME']);
    });

    it('event percentiles omit MQ metrics', async () => {
      const svc = new ReportService();
      const { percentiles } = await svc.calculateEventPercentiles(athleteId, EVENT_ID, metrics, performances);
      expect(Object.keys(percentiles)).toEqual(['FLY10_TIME']);
    });

    it('team report rankings omit MQ percentiles and composite weighting', async () => {
      const svc = new ReportService();
      const measurementData = await db
        .select({ measurement: measurements, user: users })
        .from(measurements)
        .leftJoin(users, eq(measurements.userId, users.id))
        .where(eq(measurements.organizationId, orgId));
      const rankings = await (svc as any).calculateAthleteRankings(
        measurementData,
        metrics,
        { enabled: true, weights: { MQI_TOTAL: 10, FLY10_TIME: 1 } },
        'report-test',
        undefined,
        true,
      );
      expect(rankings).toHaveLength(4);
      for (const athlete of rankings) {
        expect(Object.keys(athlete.percentiles)).toEqual(['FLY10_TIME']);
        expect(Object.keys(athlete.eventPercentiles)).toEqual(['FLY10_TIME']);
        expect(athlete.compositeIndex).toBe(athlete.percentiles.FLY10_TIME);
      }
    });

    it('composite index ignores MQ weights even when an MQ percentile is supplied', () => {
      const svc = new ReportService();
      expect(svc.calculateCompositeIndex({}, { MQI_TOTAL: 10, FLY10_TIME: 1 }, { MQI_TOTAL: 90, FLY10_TIME: 50 })).toBe(50);
    });
  });
});

describe('analytics routes answer 400 for MQ metrics', () => {
  const app = express();
  let orgId: string;
  let adminId: string;
  let cookie: string;

  beforeAll(async () => {
    app.use(express.json());
    await registerRoutes(app);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [org] = await db.insert(organizations).values({ name: `MQ Route Org ${suffix}` }).returning();
    orgId = org.id;
    const [admin] = await db
      .insert(users)
      .values({
        username: `mqx-route-${suffix}`,
        emails: [`mqx-route-${suffix}@test.com`],
        password: await bcrypt.hash('MqRoute123!', 10),
        firstName: 'M',
        lastName: 'Route',
        fullName: 'M Route',
        isSiteAdmin: true,
      } as any)
      .returning();
    adminId = admin.id;
    const login = await request(app).post('/api/auth/login').send({ username: admin.username, password: 'MqRoute123!' });
    cookie = login.headers['set-cookie'][0];
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, adminId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it.each(['leaderboard', 'most-improved'])('GET /api/analytics/%s?metric=MQI_TOTAL -> 400', async (route) => {
    const res = await request(app)
      .get(`/api/analytics/${route}`)
      .query({ organizationId: orgId, metric: 'MQI_TOTAL' })
      .set('Cookie', cookie);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/MQI_TOTAL is not available/);
  });

  it.each(['leaderboard', 'most-improved'])('GET /api/analytics/%s with a repeated ?metric -> 400, not 500', async (route) => {
    const res = await request(app)
      .get(`/api/analytics/${route}?organizationId=${orgId}&metric=FLY10_TIME&metric=MQI_TOTAL`)
      .set('Cookie', cookie);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe('metric parameter is required');
  });
});
