/**
 * getMetricExplanationsMap for site metrics that have no built-in text: the title, unit, direction and description
 * come from the site_metrics row (never its admin-facing description), not from a generic default.
 */
process.env.NODE_ENV = 'test';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inArray } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { siteMetrics } from '@shared/schema';
import { getMetricExplanationsMap } from '../../packages/api/services/metric-explanation-service';

const CODES = ['ZZ_EXPL_TRACKING', 'ZZ_EXPL_LOWER', 'ZZ_EXPL_TEXT'];

beforeAll(async () => {
  await db.delete(siteMetrics).where(inArray(siteMetrics.code, CODES));
  await db.insert(siteMetrics).values([
    { code: 'ZZ_EXPL_TRACKING', label: 'Test Weight', unit: 'lbs', metricType: 'tracking', description: 'Body weight in pounds' },
    { code: 'ZZ_EXPL_LOWER', label: 'Test Sprint', unit: 's', metricType: 'lower_is_better' },
    {
      code: 'ZZ_EXPL_TEXT',
      label: 'Test Jump',
      unit: 'in',
      metricType: 'higher_is_better',
      shortDescription: 'short text',
      whatItMeasures: 'what text',
      whyItMatters: 'why text',
    },
  ]);
});

afterAll(async () => {
  await db.delete(siteMetrics).where(inArray(siteMetrics.code, CODES));
});

describe('getMetricExplanationsMap: site metrics without built-in text', () => {
  it('uses the site metric label, unit and direction instead of the generic defaults', async () => {
    const map = await getMetricExplanationsMap(CODES);
    expect(map.ZZ_EXPL_TRACKING.title).toBe('Test Weight');
    expect(map.ZZ_EXPL_TRACKING.directionOfBetter).toBe('tracking');
    expect(map.ZZ_EXPL_TRACKING.unitNote).toBe('Measured in lbs; tracked value, not judged as better or worse.');
    expect(map.ZZ_EXPL_LOWER.directionOfBetter).toBe('lower');
    expect(map.ZZ_EXPL_LOWER.unitNote).toBe('Measured in s; lower is better.');
  });

  it('does not show the admin-facing site description to athletes', async () => {
    const map = await getMetricExplanationsMap(CODES);
    expect(map.ZZ_EXPL_TRACKING.whatItMeasures).not.toContain('Body weight in pounds');
    expect(map.ZZ_EXPL_TRACKING.shortDescription).not.toContain('Body weight in pounds');
  });

  it('still prefers the explanation columns when they are set', async () => {
    const map = await getMetricExplanationsMap(CODES);
    expect(map.ZZ_EXPL_TEXT).toMatchObject({ shortDescription: 'short text', whatItMeasures: 'what text', whyItMatters: 'why text' });
  });
});
