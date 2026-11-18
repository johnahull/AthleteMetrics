import { describe, it, expect, vi, beforeEach } from 'vitest';

// db.select().from().where() resolves the queued rows in call order: site_metrics, overrides, custom_org_metrics
const queue: any[][] = [];
vi.mock('../../db', () => ({
  db: { select: () => ({ from: () => ({ where: () => Promise.resolve(queue.shift() ?? []) }) }) },
}));

import { getMetricExplanationsMap, getMetricExplanationsAndMeanings } from '../metric-explanation-service';

const siteRow = (code: string, meaning: string | null) => ({
  code, label: code, unit: 's', metricType: 'lower_is_better',
  shortDescription: null, whatItMeasures: null, whyItMatters: null, meaning,
});
const customRow = (code: string, meaning: string | null) => ({
  code, label: code, description: null, shortDescription: null, whatItMeasures: null, whyItMatters: null,
  unit: 's', metricType: 'lower_is_better', meaning,
});

describe('getMetricExplanationsAndMeanings', () => {
  beforeEach(() => { queue.length = 0; });

  it('returns site meanings, omitting blank and missing ones', async () => {
    queue.push([siteRow('A', ' Start speed. '), siteRow('B', null), siteRow('C', '  ')], [], []);
    const { meaningMap } = await getMetricExplanationsAndMeanings(['A', 'B', 'C'], 'org1');
    expect(meaningMap).toEqual({ A: 'Start speed.' });
  });

  it('custom org meaning takes precedence over the site meaning for the same code', async () => {
    queue.push([siteRow('A', 'site text'), siteRow('B', 'site b')], [], [customRow('A', 'org text')]);
    const { meaningMap } = await getMetricExplanationsAndMeanings(['A', 'B'], 'org1');
    expect(meaningMap).toEqual({ A: 'org text', B: 'site b' });
  });

  it('a blank custom meaning does not wipe the site meaning', async () => {
    queue.push([siteRow('A', 'site text')], [], [customRow('A', null)]);
    expect((await getMetricExplanationsAndMeanings(['A'], 'org1')).meaningMap).toEqual({ A: 'site text' });
  });

  it('without an organization only site meanings apply', async () => {
    queue.push([siteRow('A', 'site text')], []);
    expect((await getMetricExplanationsAndMeanings(['A'])).meaningMap).toEqual({ A: 'site text' });
  });

  it('empty code list returns empty maps', async () => {
    expect(await getMetricExplanationsAndMeanings([])).toEqual({ explanations: {}, meaningMap: {} });
  });

  it('getMetricExplanationsMap keeps its old shape (explanations only)', async () => {
    queue.push([siteRow('A', 'site text')], [], []);
    const map = await getMetricExplanationsMap(['A'], 'org1');
    expect(Object.keys(map)).toEqual(['A']);
    expect(map.A).not.toHaveProperty('meaningMap');
  });
});
