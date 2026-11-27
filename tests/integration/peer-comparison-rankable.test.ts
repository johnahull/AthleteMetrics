/**
 * Peer comparison ranks only site metrics that have a direction (lower or higher is
 * better). Tracking metrics (such as body weight), custom organization metrics and
 * unknown codes get no percentile and no distribution.
 *
 * Creates its own metric rows with unique codes, so peer pools hold only these users.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcrypt';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { storage } from '../../packages/api/storage';
import { PeerComparisonService } from '../../packages/api/services/peer-comparison-service';
import { measurements, organizations, users, siteMetrics, customOrgMetrics, peerPercentileCache } from '@shared/schema';

vi.mock('../../packages/api/vite.js', () => ({
  setupVite: vi.fn().mockResolvedValue(undefined),
  serveStatic: vi.fn(),
}));

import { registerRoutes } from '../../packages/api/routes';
import { purgeTestRows } from '../helpers/purge-test-rows';

const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
const LOW = `PCR_LOW_${suffix}`;
const HIGH = `PCR_HIGH_${suffix}`;
const RETIRED = `PCR_OLD_${suffix}`;
const TRACK = `PCR_TRACK_${suffix}`;
const CUSTOM = `ORG_PCR_${suffix}`;
const UNKNOWN = `PCR_NONE_${suffix}`;
const SITE_CODES = [LOW, HIGH, RETIRED, TRACK];
const MEASURED = [...SITE_CODES, CUSTOM, UNKNOWN];
const UNRANKED = [TRACK, CUSTOM, UNKNOWN];
const PEERS = 11; // plus the athlete: above the minimum sample of 10

describe('peer comparison ranks only metrics with a direction', () => {
  const app = express();
  const service = new PeerComparisonService(storage as any);
  let orgId: string;
  let userIds: string[] = [];
  let athleteId: string;
  let cookie: string;

  beforeAll(async () => {
    app.use(express.json());
    await registerRoutes(app);

    const [org] = await db.insert(organizations).values({ name: `Peer Rank Org ${suffix}` }).returning();
    orgId = org.id;

    await db.insert(siteMetrics).values([
      { code: LOW, label: LOW, unit: 's', metricType: 'lower_is_better' },
      { code: HIGH, label: HIGH, unit: 'in', metricType: 'higher_is_better' },
      { code: RETIRED, label: RETIRED, unit: 's', metricType: 'lower_is_better', isActive: false },
      { code: TRACK, label: TRACK, unit: 'lbs', metricType: 'tracking' },
    ]);
    await db.insert(customOrgMetrics).values({
      organizationId: orgId, code: CUSTOM, label: CUSTOM, unit: 's', metricType: 'lower_is_better',
    });

    const password = await bcrypt.hash('PeerRank123!', 10);
    const rows = await db
      .insert(users)
      .values(Array.from({ length: PEERS + 1 }, (_, i) => ({
        username: `pcr-${i}-${suffix}`,
        emails: [`pcr-${i}-${suffix}@test.com`],
        password,
        firstName: 'Peer',
        lastName: `${i}`,
        fullName: `Peer ${i}`,
        isSiteAdmin: false,
        birthDate: '2008-01-01', // the profile gate blocks athletes without one
      })) as any)
      .returning();
    userIds = rows.map((r) => r.id);
    athleteId = userIds[0];

    // The athlete holds the lowest value of every metric: best when lower wins, worst when higher wins
    await db.insert(measurements).values(
      userIds.flatMap((userId, i) =>
        MEASURED.map((metric) => ({
          userId, submittedBy: userId, date: '2026-03-10', age: 17, isVerified: true,
          organizationId: orgId, metric, value: String(10 + i), units: 's',
        })),
      ),
    );

    const login = await request(app).post('/api/auth/login').send({ username: `pcr-0-${suffix}`, password: 'PeerRank123!' });
    cookie = login.headers['set-cookie'][0];
  });

  afterAll(async () => {
    await db.delete(peerPercentileCache).where(inArray(peerPercentileCache.metricCode, SITE_CODES));
    await purgeTestRows({ userIds, orgIds: [orgId] });
    await db.delete(siteMetrics).where(inArray(siteMetrics.code, SITE_CODES));
  });

  it('ranks by the metric direction, including retired site metrics', async () => {
    const results = await service.getAthletePercentiles(athleteId, [LOW, HIGH, RETIRED]);
    const percentile = Object.fromEntries(results.map((r) => [r.metric, r.percentile]));
    const rankOfLowest = 100 / (PEERS + 1); // quantile rank of the smallest of 12 values
    expect(percentile[LOW]).toBeCloseTo(100 - rankOfLowest);
    expect(percentile[HIGH]).toBeCloseTo(rankOfLowest);
    expect(percentile[RETIRED]).toBeCloseTo(100 - rankOfLowest);
  });

  it.each([
    ['tracking', TRACK],
    ['custom', CUSTOM],
    ['unknown', UNKNOWN],
  ])('returns no entry for a %s metric and still ranks the others', async (_kind, code) => {
    const results = await service.getAthletePercentiles(athleteId, [code, LOW]);
    expect(results.map((r) => r.metric)).toEqual([LOW]);
  });

  it('never caches a distribution for a tracking metric', async () => {
    await service.getAthletePercentiles(athleteId, [TRACK]);
    const cached = await db.select().from(peerPercentileCache).where(eq(peerPercentileCache.metricCode, TRACK));
    expect(cached).toHaveLength(0);
  });

  it.each(UNRANKED)('refuses a distribution for %s', async (code) => {
    await expect(service.getDistribution(code)).rejects.toThrow(/not available for peer comparison/i);
    await expect(service.getOrComputeDistribution(code, {})).rejects.toThrow(/not available for peer comparison/i);
  });

  it.each(UNRANKED)('GET /api/peer-distributions/%s -> 400', async (code) => {
    const res = await request(app).get(`/api/peer-distributions/${code}`).set('Cookie', cookie);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not available for peer comparison/i);
  });

  it('does not serve a distribution cached before the metric became unrankable', async () => {
    await db.insert(peerPercentileCache).values({
      metricCode: TRACK, filterCriteria: {}, sampleSize: 12, p50: '15',
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(service.getDistribution(TRACK)).rejects.toThrow(/not available for peer comparison/i);
    const res = await request(app).get(`/api/peer-distributions/${TRACK}`).set('Cookie', cookie);
    expect(res.status).toBe(400);
  });

  it('GET peer-percentiles answers 200 with only the ranked metrics', async () => {
    const res = await request(app)
      .get(`/api/athletes/${athleteId}/peer-percentiles?metrics=${MEASURED.join(',')}`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.percentiles.map((p: { metric: string }) => p.metric).sort()).toEqual([HIGH, LOW, RETIRED].sort());
  });
});
