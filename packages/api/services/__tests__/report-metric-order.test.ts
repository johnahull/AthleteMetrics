import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { ReportService } from '../report-service';
import { db } from '../../db';
import { organizations, siteMetrics, customOrgMetrics } from '@shared/schema';
import { eq, inArray } from 'drizzle-orm';

describe('ReportService metric categories and ordering', () => {
  const service = new ReportService();
  const suffix = `${Date.now()}`;
  const siteCode = `ZZ_SITE_${suffix}`;
  const customCode = `ZZ_CUSTOM_${suffix}`;
  let orgId: string;

  beforeAll(async () => {
    const dbUrl = process.env.DATABASE_URL || '';
    if (!dbUrl.includes('test') && !dbUrl.includes('localhost') && process.env.ALLOW_TEST_DATABASE !== 'true') {
      throw new Error('DATABASE_URL must include "test" or "localhost" for safety.');
    }
    const [org] = await db.insert(organizations).values({ name: `Order Org ${suffix}` }).returning();
    orgId = org.id;
    await db.insert(siteMetrics).values({ code: siteCode, label: 'Site', category: 'Power', unit: 'in', metricType: 'higher_is_better' });
    await db.insert(customOrgMetrics).values({
      organizationId: orgId, code: customCode, label: 'Custom', category: 'strength', unit: 'kg', metricType: 'higher_is_better',
    });
  });

  afterAll(async () => {
    await db.delete(customOrgMetrics).where(eq(customOrgMetrics.organizationId, orgId));
    await db.delete(siteMetrics).where(eq(siteMetrics.code, siteCode));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('getMetricLabelsAndUnits returns categories for site and custom metrics', async () => {
    const { categories } = await service.getMetricLabelsAndUnits([siteCode, customCode, 'NOPE'], orgId);
    expect(categories[siteCode]).toBe('Power');
    expect(categories[customCode]).toBe('strength');
    expect(categories['NOPE']).toBeUndefined();
  });

  it('orderForResponse groups an individual report by category and fixed order', async () => {
    const data = {
      reportType: 'individual',
      athlete: {
        measurements: { [customCode]: { value: 1 }, ZZ_UNKNOWN: { value: 2 }, [siteCode]: { value: 3 }, DASH_10YD: { value: 4 } },
        percentiles: {},
      },
    };
    const out: any = await service.orderForResponse(data, orgId);
    expect(Object.keys(out.athlete.measurements)).toEqual(['DASH_10YD', siteCode, customCode, 'ZZ_UNKNOWN']);
    expect(out.metricGroups.map((g: any) => g.group)).toEqual(['speed', 'power', 'strength', 'other']);
  });

  it('orderManyForResponse orders each report with one category lookup', async () => {
    const mk = (codes: string[]) => ({
      reportType: 'individual',
      athlete: { measurements: Object.fromEntries(codes.map((c) => [c, { value: 1 }])), percentiles: {} },
    });
    const spy = vi.spyOn(service, 'getMetricLabelsAndUnits');
    const [a, b, e]: any[] = await service.orderManyForResponse(
      [mk([customCode, 'DASH_10YD']), mk([siteCode, 'ZZ_UNKNOWN']), { reportType: 'eval' }],
      orgId,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    expect(Object.keys(a.athlete.measurements)).toEqual(['DASH_10YD', customCode]);
    expect(Object.keys(b.athlete.measurements)).toEqual([siteCode, 'ZZ_UNKNOWN']);
    expect(e).toEqual({ reportType: 'eval' });
  });

  it('orderForResponse leaves eval and null data untouched', async () => {
    const eval_ = { reportType: 'eval', model: {} };
    expect(await service.orderForResponse(eval_, orgId)).toBe(eval_);
    expect(await service.orderForResponse(null, orgId)).toBeNull();
  });
});
