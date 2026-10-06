/**
 * AM-FEAT-015 D7: MQ_* / MQI_TOTAL / MQ_TRANSITION_TOTAL are ordinal coach
 * scores and are excluded from peer percentiles, benchmarks and leaderboards in v1.
 * Requires migration 0146 applied.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-key-for-integration-tests-only';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { storage } from '../../packages/api/storage';
import { PeerComparisonService } from '../../packages/api/services/peer-comparison-service';
import { BenchmarkService } from '../../packages/api/services/benchmark-service';
import { AnalyticsService } from '../../packages/api/services/analytics-service';
import { organizations, users, peerPercentileCache } from '@shared/schema';

describe('MQ metrics are excluded from peer percentiles, benchmarks and leaderboards', () => {
  let orgId: string;
  let siteAdminId: string;
  let athleteId: string;

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
  });

  afterEach(async () => {
    await db.delete(peerPercentileCache).where(inArray(peerPercentileCache.metricCode, ['MQ_JUMP', 'MQI_TOTAL']));
    await db.delete(users).where(inArray(users.id, [siteAdminId, athleteId]));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('peer distribution rejects MQ metrics', async () => {
    const svc = new PeerComparisonService(storage as any);
    await expect(svc.getDistribution('MQ_JUMP')).rejects.toThrow(/not available for peer comparison/i);
    await expect(svc.getDistribution('MQI_TOTAL')).rejects.toThrow(/not available for peer comparison/i);
  });

  it('peer percentiles omit MQ metrics and never cache a distribution for them', async () => {
    const svc = new PeerComparisonService(storage as any);
    const results = await svc.getAthletePercentiles(athleteId, ['MQ_JUMP', 'MQI_TOTAL']);
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
  });
});
