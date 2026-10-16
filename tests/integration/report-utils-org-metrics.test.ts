/**
 * Report ranking direction for custom org metrics. isLowerBetter used to read siteMetrics only, so a custom
 * org lower-is-better (e.g. duration) metric ranked slowest first in report PDFs and benchmark labels.
 * Custom codes are unique per organization only, so the same code can mean different directions in two orgs.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { customOrgMetrics, organizations, siteMetrics } from '@shared/schema';
import { isLowerBetter, sortAthletesByMetric, getBenchmarkLabel } from '../../packages/api/utils/report-utils';
import { getMetricType, getMetricTypes } from '../../packages/api/utils/metric-type';

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
const SITE_MILE = `RPTDIR_SITE_MILE_${suffix}`;
const ORG_MILE = `ORG_RPTDIR_MILE_${suffix}`;
// Lower is better in orgA, higher is better in orgB
const SHARED = `ORG_RPTDIR_SHARED_${suffix}`;
const ARCHIVED = `ORG_RPTDIR_ARCHIVED_${suffix}`;
const LATE = `ORG_RPTDIR_LATE_${suffix}`;

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
      // Archived custom metrics keep their direction: old measurements still need it
      { organizationId: orgA, code: ARCHIVED, label: 'Archived', unit: 's', metricType: 'lower_is_better', isActive: false, archivedAt: new Date() },
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
    // Again, in the other order: the answer depends on the organization only
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

  it('resolves an archived, inactive custom metric', async () => {
    expect(await getMetricType(ARCHIVED, orgA)).toBe('lower_is_better');
  });

  it('resolves site and custom codes of one organization in one call', async () => {
    expect(await getMetricTypes([SITE_MILE, ORG_MILE, SHARED], orgB)).toEqual({
      [SITE_MILE]: 'lower_is_better',
      [ORG_MILE]: 'higher_is_better', // orgA's metric is unknown in orgB
      [SHARED]: 'higher_is_better',
    });
  });

  it('does not remember an unknown code: a custom metric created later is used at once', async () => {
    expect(await getMetricType(LATE, orgA)).toBe('higher_is_better');
    await db.insert(customOrgMetrics).values({ organizationId: orgA, code: LATE, label: 'Late', unit: 's', metricType: 'lower_is_better' } as any);
    expect(await getMetricType(LATE, orgA)).toBe('lower_is_better');
  });

  it('uses an edited site metric type at once', async () => {
    try {
      await db.update(siteMetrics).set({ metricType: 'higher_is_better' }).where(eq(siteMetrics.code, SITE_MILE));
      expect(await isLowerBetter(SITE_MILE, orgA)).toBe(false);
    } finally {
      await db.update(siteMetrics).set({ metricType: 'lower_is_better' }).where(eq(siteMetrics.code, SITE_MILE));
    }
    expect(await isLowerBetter(SITE_MILE, orgA)).toBe(true);
  });

  it('keeps the seeded built-in directions', async () => {
    expect(await getMetricTypes(['FLY10_TIME', 'DASH_40YD', 'VERTICAL_JUMP', 'RSI', 'TOP_SPEED'], orgA)).toEqual({
      FLY10_TIME: 'lower_is_better',
      DASH_40YD: 'lower_is_better',
      VERTICAL_JUMP: 'higher_is_better',
      RSI: 'higher_is_better',
      TOP_SPEED: 'higher_is_better',
    });
  });
});
