/**
 * Report ranking direction for custom org metrics. isLowerBetter used to read siteMetrics only, so a custom
 * org lower-is-better (e.g. duration) metric ranked slowest first in report PDFs and benchmark labels.
 * Custom codes are unique per organization only, so the same code can mean different directions in two orgs.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { customOrgMetrics, organizations, siteMetrics } from '@shared/schema';
import { isLowerBetter, sortAthletesByMetric, getBenchmarkLabel } from '../../packages/api/utils/report-utils';

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
const SITE_MILE = `RPTDIR_SITE_MILE_${suffix}`;
const ORG_MILE = `ORG_RPTDIR_MILE_${suffix}`;
// Lower is better in orgA, higher is better in orgB
const SHARED = `ORG_RPTDIR_SHARED_${suffix}`;

describe('report-utils: direction of custom org metrics', () => {
  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    const [a] = await db.insert(organizations).values({ name: `Report Dir A ${suffix}` }).returning();
    const [b] = await db.insert(organizations).values({ name: `Report Dir B ${suffix}` }).returning();
    orgA = a.id;
    orgB = b.id;
    await db.insert(siteMetrics).values([
      { code: SITE_MILE, label: 'Site Mile', unit: 's', metricType: 'lower_is_better' },
    ] as any);
    await db.insert(customOrgMetrics).values([
      { organizationId: orgA, code: ORG_MILE, label: 'Org Mile', unit: 's', metricType: 'lower_is_better' },
      { organizationId: orgA, code: SHARED, label: 'Shared A', unit: 's', metricType: 'lower_is_better' },
      { organizationId: orgB, code: SHARED, label: 'Shared B', unit: 'in', metricType: 'higher_is_better' },
    ] as any);
  });

  afterAll(async () => {
    await db.delete(siteMetrics).where(inArray(siteMetrics.code, [SITE_MILE]));
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
  });

  it('ranks a custom org lower-is-better metric fastest first', async () => {
    const athletes = [
      { userId: 'slow', measurements: { [ORG_MILE]: 400 } },
      { userId: 'fast', measurements: { [ORG_MILE]: 360 } },
    ];
    const sorted = await sortAthletesByMetric(athletes, ORG_MILE, orgA);
    expect(sorted.map((a) => a.userId)).toEqual(['fast', 'slow']);
  });

  it('labels the fastest benchmark tier met for a custom org lower-is-better metric', async () => {
    const athlete = {
      benchmarkComparisons: {
        [ORG_MILE]: [
          { benchmarkName: 'Good', benchmarkValue: 420, meetsOrExceeds: true },
          { benchmarkName: 'Elite', benchmarkValue: 380, meetsOrExceeds: true },
        ],
      },
    };
    expect(await getBenchmarkLabel(athlete, ORG_MILE, orgA)).toBe('Elite');
  });

  it('keeps the same code in two organizations apart', async () => {
    expect(await isLowerBetter(SHARED, orgA)).toBe(true);
    expect(await isLowerBetter(SHARED, orgB)).toBe(false);
    // Again, now from the cache
    expect(await isLowerBetter(SHARED, orgA)).toBe(true);
    expect(await isLowerBetter(SHARED, orgB)).toBe(false);
  });

  it('does not use another organization\'s custom metric', async () => {
    expect(await isLowerBetter(ORG_MILE, orgB)).toBe(false);
    expect(await isLowerBetter(ORG_MILE)).toBe(false);
  });

  it('keeps site metrics as before, with or without an organization', async () => {
    expect(await isLowerBetter(SITE_MILE)).toBe(true);
    expect(await isLowerBetter(SITE_MILE, orgA)).toBe(true);
  });
});
